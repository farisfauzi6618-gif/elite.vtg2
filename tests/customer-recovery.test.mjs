import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';import {build} from 'esbuild';
import {migrate} from '../scripts/migration-core.mjs';import {hashPassword} from '../lib/auth/password.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'elite-recovery-'));
Object.assign(process.env,{TURSO_DATABASE_URL:'file::memory:',TURSO_AUTH_TOKEN:'',SITE_ORIGIN:'https://elite.test',ADMIN_EMAIL:'owner@elite.test',ADMIN_PASSWORD_HASH:await hashPassword('SIMULATED_OWNER_PASSWORD_123'),AUTH_SECRET:'a'.repeat(64),CONFIG_SECRET:'b'.repeat(64),RESEND_API_KEY:'SIMULATED_NOT_A_REAL_KEY',CUSTOMER_RECOVERY_FROM:'account@elite.test'});delete process.env.VERCEL;delete process.env.VERCEL_ENV;
const entry=`export * from './modules/catalog/customer-recovery';export * from './modules/catalog/customer-recovery-email';export * from './modules/catalog/customers';export {manageCustomer} from './modules/catalog/customer-directory';export {getSqlClient} from './lib/database';export {loginOwner,ownerCookie} from './lib/auth/owner';export {POST as requestReset,PUT as resetPut} from './app/api/customer/password-reset/route';export {POST as ownerReset} from './app/api/admin/customers/recovery/route';export {queue} from 'next/server.js';`;
await mkdir('.test-runtime/tests',{recursive:true});const output=path.resolve('.test-runtime/tests/customer-recovery.mjs');
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'node',packages:'external',outfile:output,banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'next',setup(b){b.onResolve({filter:/^next\/server(?:\.js)?$/},()=>({path:'after-stub',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const queue=[];export function after(fn){queue.push(fn)}',loader:'js'}));b.onResolve({filter:/^next\/(headers|navigation)$/},a=>({path:a.path+'.js',external:true}))}}]});
const m=await import(pathToFileURL(output)),client=m.getSqlClient();await migrate(client,new URL('../migrations/',import.meta.url));
const oldPassword='SIMULATED_CUSTOMER_OLD_PASSWORD',newPassword='SIMULATED_CUSTOMER_NEW_PASSWORD';let ownerCookie;
const req=(route,method='POST',body={},cookie='',origin='https://elite.test')=>new Request('https://elite.test'+route,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
const seed=(identity='buyer@example.test')=>m.registerCustomer({name:'Simulated Buyer',identity,password:oldPassword,consent:true},null);
const complete=(token,password=newPassword)=>m.completeCustomerRecovery({token,password,confirmPassword:password});
const tokenFrom=url=>new URLSearchParams(new URL(url).hash.slice(1)).get('token');
async function emailToken(identity='buyer@example.test',options={}){let payload;await m.emailCustomerRecovery(identity,async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');payload=JSON.parse(init.body);return Response.json(options.failure?{error:'SIMULATED'}:{id:'simulated-email'}, {status:options.failure?503:200})});return {payload,token:payload?tokenFrom(payload.text.match(/https:\/\/elite\.test\/akun\/reset-kata-sandi#token=[a-f0-9]+/)[0]):null};}
beforeEach(async()=>{m.queue.length=0;for(const table of ['customer_password_resets','customer_trash','customer_sessions','customers','request_limits','owner_sessions','admin_access'])await client.execute('DELETE FROM '+table);Object.assign(process.env,{RESEND_API_KEY:'SIMULATED_NOT_A_REAL_KEY',CUSTOMER_RECOVERY_FROM:'account@elite.test'});delete process.env.VERCEL_ENV;const r=req('/');ownerCookie=m.ownerCookie(r,await m.loginOwner(r,{email:'owner@elite.test',password:'SIMULATED_OWNER_PASSWORD_123'})).split(';')[0];});
after(async()=>{client.close();assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elite-recovery-'));await rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:200});});
test('email reset stores only a verifier; old password and session work until atomic completion',async()=>{
 const account=await seed(),before=(await client.execute('SELECT id,identity,created_at,password_hash FROM customers')).rows[0],{token,payload}=await emailToken();assert.ok(token);assert.deepEqual(payload.to,['buyer@example.test']);assert.ok(!payload.text.includes(oldPassword));
 const row=(await client.execute('SELECT * FROM customer_password_resets')).rows[0];assert.equal(row.token_hash,createHash('sha256').update(token).digest('hex'));assert.ok(!JSON.stringify(row).includes(token));assert.equal(row.ready,1);assert.equal(row.expires_at-row.created_at,15*60000);
 assert.ok(await m.currentCustomer('elite_customer='+account.token));await m.loginCustomer({identity:'buyer@example.test',password:oldPassword},null);
 await complete(token);assert.equal(await m.currentCustomer('elite_customer='+account.token),null);assert.equal((await client.execute('SELECT COUNT(*) n FROM customer_sessions')).rows[0].n,0);
 await assert.rejects(m.loginCustomer({identity:'buyer@example.test',password:oldPassword},null),e=>e.status===401);assert.ok((await m.loginCustomer({identity:'buyer@example.test',password:newPassword},null)).customer);
 const now=(await client.execute('SELECT id,identity,created_at,password_hash FROM customers')).rows[0];for(const key of ['id','identity','created_at'])assert.equal(now[key],before[key]);assert.notEqual(now.password_hash,before.password_hash);await assert.rejects(complete(token),e=>e.status===400);
});
test('invalid, expired, pending and mismatched confirmation never change a password',async()=>{
 await seed();const {token}=await emailToken(),hash=createHash('sha256').update(token).digest('hex'),original=(await client.execute('SELECT password_hash FROM customers')).rows[0].password_hash;
 for(const value of ['',null,'x'.repeat(64),'1'.repeat(64)])await assert.rejects(complete(value),e=>e.status===400);
 await assert.rejects(m.completeCustomerRecovery({token,password:newPassword,confirmPassword:'different'}),e=>e.status===400);await assert.rejects(complete(token,'short'),e=>e.status===400);
 await client.execute('UPDATE customer_password_resets SET ready=0');await assert.rejects(complete(token),e=>e.status===400);await client.execute({sql:'UPDATE customer_password_resets SET ready=1,expires_at=? WHERE token_hash=?',args:[Date.now()-1,hash]});await assert.rejects(complete(token),e=>e.status===400);assert.equal((await client.execute('SELECT password_hash FROM customers')).rows[0].password_hash,original);
});
test('simultaneous use of one link can succeed only once',async()=>{await seed();const {token}=await emailToken();const results=await Promise.allSettled([complete(token),complete(token)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);});
test('a login verified against the old password cannot create a session after a concurrent reset',async()=>{
 await seed();await client.execute('DELETE FROM customer_sessions');const changed=await m.hashCustomerPassword(newPassword),batch=client.batch.bind(client);let intercepted=false;
 client.batch=async(statements,mode)=>{if(!intercepted&&statements.some(statement=>statement.sql?.startsWith('INSERT INTO customer_sessions'))){intercepted=true;await client.execute({sql:'UPDATE customers SET password_hash=?',args:[changed]});}return batch(statements,mode)};
 try{await assert.rejects(m.loginCustomer({identity:'buyer@example.test',password:oldPassword},null),e=>e.status===401);assert.equal(intercepted,true);assert.equal((await client.execute('SELECT COUNT(*) n FROM customer_sessions')).rows[0].n,0);}finally{client.batch=batch;}
});
test('a failure while revoking sessions rolls back password and token consumption together',async()=>{
 const account=await seed(),{token}=await emailToken(),before=(await client.execute('SELECT password_hash FROM customers')).rows[0].password_hash;
 await client.execute("CREATE TRIGGER fail_reset_revoke BEFORE DELETE ON customer_sessions BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
 try{await assert.rejects(complete(token));assert.equal((await client.execute('SELECT password_hash FROM customers')).rows[0].password_hash,before);assert.equal((await client.execute('SELECT used_at FROM customer_password_resets')).rows[0].used_at,null);assert.ok(await m.currentCustomer('elite_customer='+account.token));}finally{await client.execute('DROP TRIGGER fail_reset_revoke');}
 await complete(token);
});
test('completing one link revokes other reset links and deleted/restored accounts cannot reuse prior links',async()=>{
 const account=await seed();const first=await emailToken();await client.execute('UPDATE customer_password_resets SET created_at=created_at-61000');const second=await emailToken();await complete(second.token);await assert.rejects(complete(first.token),e=>e.status===400);
 await client.execute('DELETE FROM customer_password_resets');const third=await emailToken();await m.manageCustomer({customerId:(await m.currentCustomer('elite_customer='+account.token))?.id??(await client.execute('SELECT id FROM customers')).rows[0].id,action:'trash',deletedAt:null},'owner');assert.equal((await client.execute('SELECT COUNT(*) n FROM customer_password_resets')).rows[0].n,0);await assert.rejects(complete(third.token),e=>e.status===400);assert.equal((await emailToken()).payload,undefined);
});
test('owner phone recovery requires explicit verification, active phone account, owner auth and same origin',async()=>{
 const phone=await seed('081234567890'),customer=(await client.execute('SELECT id FROM customers')).rows[0];
 const body={customerId:customer.id,verifiedRegisteredPhone:true};
 assert.equal((await m.ownerReset(req('/api/admin/customers/recovery','POST',body))).status,401);assert.equal((await m.ownerReset(req('/api/admin/customers/recovery','POST',body,'elite_customer='+phone.token))).status,401);assert.equal((await m.ownerReset(req('/api/admin/customers/recovery','POST',body,ownerCookie,'https://evil.test'))).status,403);
 assert.equal((await m.ownerReset(req('/api/admin/customers/recovery','POST',{customerId:customer.id},ownerCookie))).status,400);
 const response=await m.ownerReset(req('/api/admin/customers/recovery','POST',body,ownerCookie)),value=await response.json();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(value.phone,'+6281234567890');assert.ok(value.url.startsWith('https://elite.test/akun/reset-kata-sandi#token='));await complete(tokenFrom(value.url));assert.ok((await m.loginCustomer({identity:'081234567890',password:newPassword},null)).customer);
 await seed('email@example.test');const email=(await client.execute("SELECT id FROM customers WHERE email='email@example.test'")).rows[0];await assert.rejects(m.ownerCustomerRecovery({customerId:email.id,verifiedRegisteredPhone:true},'owner'),e=>e.status===409);
});
test('request endpoint responds identically for known/unknown email and lookup runs after response; rate limits both',async()=>{
 await seed();const known=await m.requestReset(req('/api/customer/password-reset','POST',{identity:'buyer@example.test'})),unknown=await m.requestReset(req('/api/customer/password-reset','POST',{identity:'unknown@example.test'}));assert.equal(known.status,200);assert.equal(unknown.status,200);assert.deepEqual(await known.json(),await unknown.json());assert.equal(m.queue.length,2);assert.equal((await client.execute('SELECT COUNT(*) n FROM customer_password_resets')).rows[0].n,0);
 for(let i=0;i<2;i++)assert.equal((await m.requestReset(req('/api/customer/password-reset','POST',{identity:'buyer@example.test'}))).status,200);assert.equal((await m.requestReset(req('/api/customer/password-reset','POST',{identity:'buyer@example.test'}))).status,429);
 assert.equal((await m.requestReset(req('/api/customer/password-reset','POST',{identity:'buyer@example.test'},'','https://evil.test'))).status,403);
});
test('email failures, missing configuration and provider quota fail safely without password changes',async()=>{
 await seed();const {token}=await emailToken('buyer@example.test',{failure:true});assert.ok(token);assert.equal((await client.execute('SELECT COUNT(*) n FROM customer_password_resets')).rows[0].n,0);assert.ok((await m.loginCustomer({identity:'buyer@example.test',password:oldPassword},null)).customer);
 delete process.env.RESEND_API_KEY;assert.equal((await m.requestReset(req('/api/customer/password-reset','POST',{identity:'buyer@example.test'}))).status,503);process.env.RESEND_API_KEY='SIMULATED_NOT_A_REAL_KEY';let sent=0;for(let i=0;i<95;i++)await m.sendRecoveryEmail('buyer@example.test','changed','quota-'+i,undefined,async()=>{sent++;return Response.json({id:'simulated'})});assert.ok(sent<=90);
});
test('reset HTTP clears customer cookie and schedules a notification without automatic login',async()=>{
 await seed();const {token}=await emailToken(),reply=await m.resetPut(req('/api/customer/password-reset','PUT',{token,password:newPassword,confirmPassword:newPassword}));assert.equal(reply.status,200);assert.match(reply.headers.get('Set-Cookie'),/Max-Age=0/);assert.deepEqual(await reply.json(),{ok:true});assert.equal(m.queue.length,1);assert.equal((await client.execute('SELECT COUNT(*) n FROM customer_sessions')).rows[0].n,0);
});
test('preview deployments cannot mint recovery URLs and a changed password invalidates outstanding verifiers',async()=>{
 await seed();const {token}=await emailToken();await client.execute("UPDATE customers SET password_hash='changed-outside-recovery'");await assert.rejects(complete(token),e=>e.status===400);process.env.VERCEL_ENV='preview';await assert.rejects(m.ownerCustomerRecovery({customerId:'missing',verifiedRegisteredPhone:true},'owner'));assert.equal((await m.requestReset(req('/api/customer/password-reset','POST',{identity:'buyer@example.test'}))).status,503);
});
