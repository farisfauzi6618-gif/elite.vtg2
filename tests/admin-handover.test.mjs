import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';import {build} from 'esbuild';import sharp from 'sharp';
import {migrate} from '../scripts/migration-core.mjs';import {hashPassword} from '../lib/auth/password.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'elite-handover-'));
const ownerPassword='SIMULATED_PRIMARY_PASSWORD_123',delegatePassword='SIMULATED_DELEGATE_PASSWORD_123';
const rootHash=await hashPassword(ownerPassword);
Object.assign(process.env,{TURSO_DATABASE_URL:'file::memory:',TURSO_AUTH_TOKEN:'',SITE_ORIGIN:'https://elite.test',ADMIN_EMAIL:'owner@elite.test',ADMIN_PASSWORD_HASH:rootHash,AUTH_SECRET:'a'.repeat(64),CONFIG_SECRET:'b'.repeat(64),TEAM_ACCESS_SECRET:'c'.repeat(64),ADMIN_HANDOVER_ENABLED:'1',PAYMENT_DESTINATION_OVERRIDE_ENABLED:'1',STORAGE_DRIVER:'local',LOCAL_STORAGE_PATH:path.join(dir,'files'),PAYMENT_BCA_ACCOUNT_NUMBER:'1234567890',PAYMENT_BCA_ACCOUNT_HOLDER:'SIMULATED ORIGINAL',PAYMENT_QRIS_KEY:'',BLOB_READ_WRITE_TOKEN:'',BLOB_STORE_ID:''});delete process.env.VERCEL;delete process.env.VERCEL_ENV;
const entry=`export * from './lib/auth/owner';export * from './lib/auth/delegated-admin';export * from './lib/auth/admin-security';export * from './modules/order/payment-destination';export * from './modules/order/payment-destination-write';export {getSqlClient} from './lib/database';export {requireOwner as catalogOwner} from './modules/catalog/server';export {owner as orderOwner} from './modules/order/order-server';export {listTeam,startTeamSession} from './modules/catalog/team-access';export {paymentConfig} from './modules/order/payment-config';export {storage} from './lib/storage';export {GET as securityGet,POST as securityPost} from './app/api/admin/security/route';export {POST as invitationPost} from './app/api/auth/admin-invitation/route';export {POST as paymentPost} from './app/api/admin/payment-destination/route';export {POST as oldQrisPost} from './app/api/admin/order/qris/route';export {GET as qrisGet} from './app/api/qris/route';`;
await mkdir('.test-runtime/tests',{recursive:true});const output=path.resolve('.test-runtime/tests/admin-handover.mjs');
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'node',packages:'external',outfile:output,banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'next',setup(b){b.onResolve({filter:/^next\/(headers|navigation)$/},a=>({path:a.path+'.js',external:true}));}}]});
const m=await import(pathToFileURL(output)),client=m.getSqlClient();await migrate(client,new URL('../migrations/',import.meta.url));
const png=await sharp({create:{width:64,height:64,channels:3,background:'white'}}).png().toBuffer();
const req=(route,body,cookie='',origin='https://elite.test')=>new Request('https://elite.test'+route,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
const get=(route,cookie='')=>new Request('https://elite.test'+route,{headers:{Cookie:cookie}});
const tokenFrom=url=>new URLSearchParams(new URL(url).hash.slice(1)).get('token');
const hash=token=>createHash('sha256').update(token).digest('hex');
let rootCookie;
async function security(action,extra={},cookie=rootCookie){return m.securityPost(req('/api/admin/security',{action,password:ownerPassword,...extra},cookie));}
async function invite(){const r=await security('invite',{name:'Simulated Delegate',email:'delegate@elite.test'});assert.equal(r.status,200);const v=await r.json();return {...v,token:tokenFrom(v.url)};}
async function accept(token,extra={}){return m.invitationPost(req('/api/auth/admin-invitation',{token,email:'delegate@elite.test',password:delegatePassword,confirmPassword:delegatePassword,...extra}));}
async function activate(){const link=await invite();assert.equal((await accept(link.token)).status,200);const r=req('/api/auth/owner',{});const token=await m.loginOwner(r,{email:'delegate@elite.test',password:delegatePassword});return m.ownerCookie(r,token).split(';')[0];}
async function paymentLink(){const r=await security('payment');assert.equal(r.status,200);return tokenFrom((await r.json()).url);}
function form(token,extra={}){const f=new FormData();for(const[k,v]of Object.entries({token,accountNumber:'0987654321',accountHolder:'SIMULATED NEW OWNER',merchant:'SIMULATED NEW MERCHANT',confirmed:'true',...extra}))f.set(k,v);f.set('file',new File([png],'simulated-qris.png',{type:'image/png'}));return f;}
function paymentRequest(f,cookie=rootCookie,origin='https://elite.test'){return new Request('https://elite.test/api/admin/payment-destination',{method:'POST',headers:{Cookie:cookie,Origin:origin},body:f});}
beforeEach(async()=>{Object.assign(process.env,{ADMIN_HANDOVER_ENABLED:'1',PAYMENT_DESTINATION_OVERRIDE_ENABLED:'1',ADMIN_PASSWORD_HASH:rootHash,AUTH_SECRET:'a'.repeat(64),CONFIG_SECRET:'b'.repeat(64)});delete process.env.VERCEL_ENV;for(const table of ['delegated_admin_sessions','delegated_admin','admin_handover_links','payment_destination_override','admin_security_audit','owner_sessions','admin_access','settings','request_limits','team_sessions','team_access'])await client.execute('DELETE FROM '+table);const r=req('/api/auth/owner',{});rootCookie=m.ownerCookie(r,await m.loginOwner(r,{email:'owner@elite.test',password:ownerPassword})).split(';')[0];});
after(async()=>{client.close();assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elite-handover-'));await rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:200});});
test('security controls require a primary session, same origin and fresh primary password',async()=>{
 assert.equal((await m.securityGet(get('/api/admin/security'))).status,401);
 assert.equal((await security('invite',{},'')).status,401);
 assert.equal((await m.securityPost(req('/api/admin/security',{action:'payment',password:ownerPassword},rootCookie,'https://evil.test'))).status,403);
 assert.equal((await security('payment',{password:'incorrect'})).status,401);
 assert.equal((await security('invite',{name:'Simulated',email:'owner@elite.test'})).status,400);
 assert.equal((await security('invite',{name:'Simulated',email:'bad'})).status,400);
 assert.equal((await client.execute('SELECT COUNT(*) n FROM admin_handover_links')).rows[0].n,0);
});
test('invite verifier is hashed and signed, expires in 15 minutes, and replacement revokes the old link',async()=>{
 const first=await invite(),row=(await client.execute('SELECT * FROM admin_handover_links')).rows[0];
 assert.equal(new URL(first.url).search,'');assert.match(first.url,/\/undangan-admin#token=/);assert.equal(row.hash,hash(first.token));assert.ok(!JSON.stringify(row).includes(first.token));assert.equal(row.expires_at-row.created_at,15*60000);
 const second=await invite();assert.equal((await accept(first.token)).status,400);assert.equal((await accept(second.token,{email:'wrong@elite.test'})).status,400);assert.equal((await accept(second.token,{confirmPassword:'different'})).status,400);assert.equal((await accept(second.token,{password:'short',confirmPassword:'short'})).status,400);
 assert.equal((await accept(second.token)).status,200);assert.equal((await accept(second.token)).status,400);assert.equal((await security('invite',{name:'Another',email:'another@elite.test'})).status,409);
});
test('delegated login has full catalog/order identity with a separate audit actor; original owner remains usable',async()=>{
 const cookie=await activate(),request=get('/admin',cookie),user=await m.getOwnerUser(request);
 assert.equal(user.email,'delegate@elite.test');assert.equal(user.displayName,'Simulated Delegate');assert.equal(user.delegated,true);assert.notEqual(user.userId,m.ownerIdentityId());
 assert.equal((await m.catalogOwner(request)).userId,user.userId);assert.equal((await m.orderOwner(request)).userId,user.userId);
 assert.equal((await client.execute('SELECT user_id FROM admin_access')).rows[0].user_id,m.ownerIdentityId());assert.equal((await client.execute('SELECT owner_id FROM settings')).rows[0].owner_id,m.ownerIdentityId());
 assert.ok(await m.getOwnerUser(get('/admin',rootCookie)));assert.ok(await m.loginOwner(req('/',{}),{email:'owner@elite.test',password:ownerPassword}));
 assert.equal((await m.securityGet(get('/api/admin/security',cookie))).status,403);assert.equal((await security('payment',{},cookie)).status,403);
 assert.equal((await m.paymentPost(paymentRequest(form(await paymentLink()),cookie))).status,403);
});
test('team catalog links cannot mint full-admin or payment access',async()=>{
 const [access]=await m.listTeam('https://elite.test'),token=new URL(access.link).hash.slice(1),session=await m.startTeamSession(token),cookie='elite_team='+session.session;
 assert.equal((await security('payment',{},cookie)).status,401);assert.equal((await m.securityGet(get('/api/admin/security',cookie))).status,401);assert.equal((await m.paymentPost(paymentRequest(form('0'.repeat(64)),cookie))).status,401);
});
test('revocation invalidates all delegated sessions and logins without touching root sessions',async()=>{
 const cookie=await activate(),account=await m.readDelegate();
 assert.equal((await security('revoke',{id:account.id,confirmed:false})).status,400);assert.ok(await m.getOwnerUser(get('/',cookie)));
 assert.equal((await security('revoke',{id:'stale-id',confirmed:true})).status,409);assert.ok(await m.getOwnerUser(get('/',cookie)));
 assert.equal((await security('revoke',{id:account.id,confirmed:true})).status,200);assert.equal(await m.getOwnerUser(get('/',cookie)),null);
 await assert.rejects(m.loginOwner(req('/',{}),{email:account.email,password:delegatePassword}),e=>e.status===401);assert.ok(await m.getOwnerUser(get('/',rootCookie)));assert.equal((await client.execute('SELECT COUNT(*) n FROM delegated_admin_sessions')).rows[0].n,0);
 const next=await invite();assert.equal((await accept(next.token)).status,200);
});
test('database edits, old root credentials, logout and session expiration cannot preserve delegated access',async()=>{
 const cookie=await activate(),a=await m.readDelegate();
 await client.execute("UPDATE delegated_admin SET email='tampered@elite.test'");assert.equal(await m.getOwnerUser(get('/',cookie)),null);await client.execute({sql:'UPDATE delegated_admin SET email=?',args:[a.email]});
 process.env.AUTH_SECRET='z'.repeat(64);assert.equal(await m.getOwnerUser(get('/',cookie)),null);process.env.AUTH_SECRET='a'.repeat(64);
 await client.execute('UPDATE delegated_admin_sessions SET expires_at=0');assert.equal(await m.getOwnerUser(get('/',cookie)),null);
 const newToken=await m.loginOwner(req('/',{}),{email:a.email,password:delegatePassword}),newCookie=m.ownerCookie(req('/',{}),newToken).split(';')[0];assert.ok(await m.getOwnerUser(get('/',newCookie)));await m.logoutOwner(get('/',newCookie));assert.equal(await m.getOwnerUser(get('/',newCookie)),null);assert.ok(await m.getOwnerUser(get('/',rootCookie)));
});
test('expired or modified invitations fail, and failed account insertion rolls back link consumption',async()=>{
 const link=await invite();await client.execute("UPDATE admin_handover_links SET payload='{}'");assert.equal((await accept(link.token)).status,400);
 const fresh=await invite();await client.execute('UPDATE admin_handover_links SET expires_at=0');assert.equal((await accept(fresh.token)).status,400);
 const usable=await invite();await client.execute("CREATE TRIGGER fail_delegate_insert BEFORE INSERT ON delegated_admin BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
 try{assert.equal((await accept(usable.token)).status,503);assert.equal((await client.execute({sql:'SELECT used_at FROM admin_handover_links WHERE hash=?',args:[hash(usable.token)]})).rows[0].used_at,null);assert.equal((await client.execute('SELECT COUNT(*) n FROM delegated_admin')).rows[0].n,0);}finally{await client.execute('DROP TRIGGER fail_delegate_insert');}
 assert.equal((await accept(usable.token)).status,200);
});
test('a payment link authorizes exactly one atomic replacement and the original QRIS bytes stay unchanged',async()=>{
 const oldKey='qris/original';await m.storage.put(oldKey,png,{httpMetadata:{contentType:'image/png'}});
 const token=await paymentLink();const before=await m.paymentConfig();assert.equal(before.bca.accountNumber,'1234567890');
 const response=await m.paymentPost(paymentRequest(form(token)));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 const payment=await m.paymentConfig();assert.equal(payment.bca.accountNumber,'0987654321');assert.equal(payment.qris.merchant,'SIMULATED NEW MERCHANT');
 const qris=await m.qrisGet();assert.equal(qris.status,200);assert.deepEqual(Buffer.from(await qris.arrayBuffer()),png);assert.deepEqual(Buffer.from(await(await m.storage.get(oldKey)).arrayBuffer()),png);
 assert.equal((await m.paymentPost(paymentRequest(form(token)))).status,400);assert.equal((await m.oldQrisPost(req('/api/admin/order/qris',{},rootCookie))).status,403);
 assert.equal((await client.execute("SELECT COUNT(*) n FROM admin_security_audit WHERE action='payment_destination_changed'")).rows[0].n,1);
});
test('payment validation, CSRF, expiry, and mismatched owner leave the active destination unchanged',async()=>{
 const token=await paymentLink();assert.equal((await m.paymentPost(paymentRequest(form(token),'', 'https://elite.test'))).status,401);assert.equal((await m.paymentPost(paymentRequest(form(token),rootCookie,'https://evil.test'))).status,403);
 assert.equal((await m.paymentPost(paymentRequest(form(token,{accountNumber:'123'})))).status,400);assert.equal((await m.paymentPost(paymentRequest(form(token,{confirmed:'false'})))).status,400);
 const invalid=form(token);invalid.set('file',new File(['not an image'.repeat(4)],'fake.png',{type:'image/png'}));assert.equal((await m.paymentPost(paymentRequest(invalid))).status,400);
 assert.equal((await client.execute('SELECT COUNT(*) n FROM payment_destination_override')).rows[0].n,0);assert.equal((await client.execute({sql:'SELECT used_at FROM admin_handover_links WHERE hash=?',args:[hash(token)]})).rows[0].used_at,null);
 await client.execute('UPDATE admin_handover_links SET expires_at=0');assert.equal((await m.paymentPost(paymentRequest(form(token)))).status,400);
 const other=await m.mintAdminLink('payment',{actor:'different-owner',revision:await m.paymentDestinationRevision()});await assert.rejects(m.replacePaymentDestination(m.ownerIdentityId(),form(other.token)),e=>e.status===403);
});
test('payment transaction failure rolls back consumption; signed destination tampering fails closed',async()=>{
 const token=await paymentLink();await client.execute("CREATE TRIGGER fail_payment BEFORE INSERT ON payment_destination_override BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
 try{assert.equal((await m.paymentPost(paymentRequest(form(token)))).status,503);assert.equal((await client.execute('SELECT used_at FROM admin_handover_links')).rows[0].used_at,null);assert.equal((await m.paymentConfig()).bca.accountNumber,'1234567890');}finally{await client.execute('DROP TRIGGER fail_payment');}
 assert.equal((await m.paymentPost(paymentRequest(form(token)))).status,200);
 await client.execute("UPDATE payment_destination_override SET payload='{}'");await assert.rejects(m.paymentConfig(),/integrity/);assert.equal((await m.qrisGet()).status,503);
});
test('replaced payment grants cannot be reused and stale revisions do not overwrite newer destinations',async()=>{
 const first=await paymentLink(),second=await paymentLink();assert.equal((await m.paymentPost(paymentRequest(form(first)))).status,400);assert.equal((await m.paymentPost(paymentRequest(form(second)))).status,200);
 const third=await paymentLink();process.env.PAYMENT_BCA_ACCOUNT_HOLDER='CHANGED ENV';assert.equal((await m.paymentPost(paymentRequest(form(third)))).status,200);process.env.PAYMENT_BCA_ACCOUNT_HOLDER='SIMULATED ORIGINAL';
 const fourth=await paymentLink();const row=(await client.execute('SELECT payload,signature FROM payment_destination_override')).rows[0],d=JSON.parse(row.payload);d.version=crypto.randomUUID();const payload=JSON.stringify(d);const {createHmac}=await import('node:crypto');await client.execute({sql:'UPDATE payment_destination_override SET payload=?,signature=?',args:[payload,createHmac('sha256',process.env.CONFIG_SECRET).update('elite-payment-destination:'+payload).digest('hex')]});assert.equal((await m.paymentPost(paymentRequest(form(fourth)))).status,409);
});
test('disabled and preview environments reject new access while default payment configuration and root login work',async()=>{
 const cookie=await activate(),link=await paymentLink();process.env.ADMIN_HANDOVER_ENABLED='0';assert.equal(await m.getOwnerUser(get('/',cookie)),null);assert.equal((await security('payment')).status,503);assert.equal((await m.paymentPost(paymentRequest(form(link)))).status,503);assert.equal((await m.paymentConfig()).bca.accountNumber,'1234567890');assert.ok(await m.getOwnerUser(get('/',rootCookie)));
 process.env.ADMIN_HANDOVER_ENABLED='1';process.env.VERCEL_ENV='preview';assert.equal((await security('payment')).status,503);assert.equal(await m.getOwnerUser(get('/',cookie)),null);assert.equal((await accept('0'.repeat(64))).status,503);
});
test('simultaneous invitation and payment submissions can commit only once',async()=>{
 const invitation=await invite(),input={token:invitation.token,email:'delegate@elite.test',password:delegatePassword,confirmPassword:delegatePassword};
 const accepted=await Promise.allSettled([m.acceptDelegateInvite(input),m.acceptDelegateInvite(input)]);assert.equal(accepted.filter(r=>r.status==='fulfilled').length,1);assert.equal((await client.execute('SELECT COUNT(*) n FROM delegated_admin')).rows[0].n,1);
 const token=await paymentLink(),payments=await Promise.allSettled([m.replacePaymentDestination(m.ownerIdentityId(),form(token)),m.replacePaymentDestination(m.ownerIdentityId(),form(token))]);assert.equal(payments.filter(r=>r.status==='fulfilled').length,1);assert.equal((await client.execute("SELECT COUNT(*) n FROM admin_security_audit WHERE action='payment_destination_changed'")).rows[0].n,1);
});
test('failed session revocation rolls back the whole account change, and a revoke racing login prevents session insertion',async()=>{
 const cookie=await activate(),account=await m.readDelegate();await client.execute("CREATE TRIGGER fail_delegate_revoke BEFORE DELETE ON delegated_admin_sessions BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
 try{await assert.rejects(m.revokeDelegate(m.ownerIdentityId(),account.id));assert.ok(await m.getOwnerUser(get('/',cookie)));assert.equal((await m.readDelegate()).active,1);}finally{await client.execute('DROP TRIGGER fail_delegate_revoke');}
 const execute=client.execute.bind(client);let intercepted=false;
 client.execute=async input=>{if(!intercepted&&input.sql?.startsWith('INSERT INTO delegated_admin_sessions')){intercepted=true;await execute('UPDATE delegated_admin SET active=0,version=version+1');}return execute(input);};
 try{await assert.rejects(m.loginDelegate(account.email,delegatePassword),e=>e.status===401);assert.equal(intercepted,true);}finally{client.execute=execute;}
});
test('disabling invitations and delegated access never reverts an already saved payment destination',async()=>{
 const token=await paymentLink();assert.equal((await m.paymentPost(paymentRequest(form(token)))).status,200);process.env.ADMIN_HANDOVER_ENABLED='0';assert.equal((await m.paymentConfig()).bca.accountNumber,'0987654321');assert.equal((await m.qrisGet()).status,200);
 process.env.ADMIN_HANDOVER_ENABLED='1';process.env.PAYMENT_DESTINATION_OVERRIDE_ENABLED='0';assert.equal((await security('payment')).status,503);assert.equal((await m.paymentPost(paymentRequest(form(token)))).status,503);
});
