import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';import {migrate} from '../scripts/migration-core.mjs';import {hashPassword} from '../lib/auth/password.mjs';

const dir=await mkdtemp(path.join(os.tmpdir(),'elite-customers-'));
Object.assign(process.env,{TURSO_DATABASE_URL:'file:'+path.join(dir,'test.db'),TURSO_AUTH_TOKEN:'',ADMIN_EMAIL:'owner@elite.test',AUTH_SECRET:'a'.repeat(64),CONFIG_SECRET:'b'.repeat(64),TEAM_ACCESS_SECRET:'c'.repeat(64),SITE_ORIGIN:'https://elite.test',STORAGE_DRIVER:'local',LOCAL_STORAGE_PATH:path.join(dir,'files'),ADMIN_PASSWORD_HASH:await hashPassword('SIMULATED_CUSTOMER_OWNER_PASSWORD_123')});delete process.env.VERCEL;
const compiled=await build({stdin:{contents:`export * from './modules/catalog/customer-directory';export {getSqlClient,getDatabase} from './lib/database';export {registerCustomer,currentCustomer,logoutCustomer} from './modules/catalog/customers';export {loginOwner,ownerCookie,logoutOwner} from './lib/auth/owner';export {GET as listGet} from './app/api/admin/customers/route';export {GET as exportGet} from './app/api/admin/customers/export/route';export {PUT as giveawayPut} from './app/api/admin/customers/giveaway/route';export {GET as customerGet} from './app/api/customer/route';export {listTeam,editTeam,startTeamSession,sessionCookie} from './modules/catalog/team-access';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',write:false,banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'next',setup(b){b.onResolve({filter:/^next\/(headers|navigation)$/},a=>({path:a.path+'.js',external:true}))}}]});
await mkdir('.test-runtime/tests',{recursive:true});const file=path.resolve('.test-runtime/tests/customer-directory.mjs');await writeFile(file,compiled.outputFiles[0].contents);const m=await import(pathToFileURL(file)),client=m.getSqlClient();
const oldMigrations=path.join(dir,'old-migrations');await mkdir(oldMigrations);
for(const name of await readdir(new URL('../migrations/',import.meta.url)))if(name.endsWith('.sql')&&name!=='release_0006_customer_directory.sql')await copyFile(new URL('../migrations/'+name,import.meta.url),path.join(oldMigrations,name));
await migrate(client,pathToFileURL(oldMigrations+path.sep));
await client.execute("INSERT INTO customers(id,name,identity,email,password_hash,created_at) VALUES('legacy','Existing Buyer','existing@example.test','existing@example.test','PRIVATE_HASH_SENTINEL',1)");
const existing=(await client.execute("SELECT * FROM customers WHERE id='legacy'")).rows[0];const migration=await migrate(client,new URL('../migrations/',import.meta.url));
const existingAfterMigration=(await client.execute("SELECT * FROM customers WHERE id='legacy'")).rows[0];
const req=(url='/api/admin/customers',cookie='',body,origin='https://elite.test')=>new Request('https://elite.test'+url,{method:body===undefined?'GET':'PUT',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function owner(){const token=await m.loginOwner(req(),{email:'owner@elite.test',password:'SIMULATED_CUSTOMER_OWNER_PASSWORD_123'});return m.ownerCookie(req(),token).split(';')[0]}
async function seed(id,createdAt=Date.now()-1000,name='Buyer '+id){await client.execute({sql:'INSERT INTO customers(id,name,identity,email,phone,birthday,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?)',args:[id,name,id+'@example.test',id+'@example.test',null,'2000-05-06','PRIVATE_HASH_SENTINEL',createdAt]})}
const entry=(id,extra={})=>({customerId:id,campaign:'october-2026',instagramUsername:'buyer_'+id,commentVerified:false,version:0,...extra});
beforeEach(async()=>{for(const table of ['customer_giveaway_entries','customer_sessions','customers','owner_sessions','admin_access','team_sessions','team_access'])await client.execute('DELETE FROM '+table)});
after(async()=>{client.close();assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elite-customers-'));await rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:200});await rm(file,{force:true})});

test('additive migration preserves existing account values and creates indexes',async()=>{
 assert.deepEqual(migration.pending,['release_0006_customer_directory.sql']);
 const baseline=await readFile(new URL('../migrations/release_0006_customer_directory.sql',import.meta.url),'utf8');assert.ok(!/\b(?:DELETE|DROP|ALTER|UPDATE)\b/i.test(baseline));
 // The legacy row was captured immediately after upgrading, before per-test cleanup.
 assert.deepEqual(existingAfterMigration,existing);assert.equal(existing.password_hash,'PRIVATE_HASH_SENTINEL');assert.equal((await client.execute("SELECT name FROM sqlite_master WHERE name='idx_customer_created_id'")).rows.length,1);
});
test('anonymous and customer sessions cannot list, export, or edit giveaway data',async()=>{
 const account=await m.registerCustomer({name:'Simulated Buyer',identity:'buyer@example.test',password:'SIMULATED_BUYER_PASSWORD_123',consent:true},null),cookie='elite_customer='+account.token;
 for(const session of ['',cookie]){assert.equal((await m.listGet(req('/api/admin/customers',session))).status,401);assert.equal((await m.exportGet(req('/api/admin/customers/export',session))).status,401);assert.equal((await m.giveawayPut(req('/api/admin/customers/giveaway',session,entry('missing')))).status,401)}
 assert.equal((await client.execute('SELECT COUNT(*) n FROM customer_giveaway_entries')).rows[0].n,0);
});
test('owner-only responses exclude credentials and are private; logout revokes access',async()=>{
 await seed('one');const cookie=await owner(),reply=await m.listGet(req('/api/admin/customers',cookie)),value=await reply.json();assert.equal(reply.status,200);assert.equal(reply.headers.get('Cache-Control'),'private, no-store');assert.equal(reply.headers.get('Vary'),'Cookie');assert.equal(value.total,1);assert.deepEqual(Object.keys(value.customers[0]).sort(),['birthday','createdAt','email','giveaway','id','name','phone']);assert.ok(!JSON.stringify(value).includes('PRIVATE_HASH_SENTINEL'));
 await m.logoutOwner(req('/admin/logout',cookie));assert.equal((await m.exportGet(req('/api/admin/customers/export',cookie))).status,401);
});
test('team accounts with analytics permission still cannot access customer identities',async()=>{
 await seed('one');const team=(await m.listTeam('https://elite.test'))[0];await m.editTeam({id:team.id,action:'analytics',allowed:true});const session=await m.startTeamSession(new URL(team.link).hash.slice(1)),cookie=m.sessionCookie(req(),session.session,session.expires).split(';')[0];
 assert.equal((await m.listGet(req('/api/admin/customers',cookie))).status,401);assert.equal((await m.exportGet(req('/api/admin/customers/export',cookie))).status,401);assert.equal((await m.giveawayPut(req('/api/admin/customers/giveaway',cookie,entry('one')))).status,401);
});
test('foreign origin cannot write an authenticated owner giveaway record',async()=>{
 await seed('one');assert.equal((await m.giveawayPut(req('/api/admin/customers/giveaway',await owner(),entry('one'),'https://foreign.test'))).status,403);assert.equal((await client.execute('SELECT COUNT(*) n FROM customer_giveaway_entries')).rows[0].n,0);
});
test('dates use inclusive WIB calendar days and invalid query inputs fail closed',async()=>{
 await seed('before',Date.parse('2026-10-10T16:59:59.999Z'));await seed('inside',Date.parse('2026-10-10T17:00:00Z'));await seed('after',Date.parse('2026-10-11T17:00:00Z'));
 const result=await m.customerDirectory(new URLSearchParams({start:'2026-10-11',end:'2026-10-11'}));assert.deepEqual(result.customers.map(c=>c.id),['inside']);
 for(const params of [{start:'2026-02-30'},{start:'2026-10-11',end:'2026-10-10'},{cursor:'bad!!'},{q:'a'.repeat(121)},{asOf:'Infinity'},{asOf:''},{status:'unknown'},{campaign:'../../bad'}])assert.throws(()=>m.customerSelection(new URLSearchParams(params)));
});
test('search escapes LIKE wildcards and parameterizes SQL injection strings',async()=>{
 await seed('literal',Date.now()-1000,"Buyer %_\\ ' OR 1=1 --");await seed('normal');
 for(const term of ['%_\\',"' OR 1=1 --"]){const result=await m.customerDirectory(new URLSearchParams({q:term}));assert.deepEqual(result.customers.map(c=>c.id),['literal']);assert.equal(result.matched,1)}
 assert.equal((await m.customerDirectory(new URLSearchParams({q:'literal@example.test'}))).matched,1);
});
test('pagination remains bounded and does not duplicate tied timestamps or include later signups',async()=>{
 const timestamp=Date.now()-1000;await client.batch(Array.from({length:151},(_,i)=>({sql:'INSERT INTO customers(id,name,identity,password_hash,created_at) VALUES(?,?,?,?,?)',args:['id'+String(i).padStart(4,'0'),'Buyer '+i,'identity'+i,'PRIVATE_HASH_SENTINEL',timestamp]})),'write');
 const seen=[],params=new URLSearchParams();let first;
 do{const data=await m.customerDirectory(params);first??=data;assert.ok(data.customers.length<=50);seen.push(...data.customers.map(c=>c.id));if(!data.nextCursor)break;params.set('cursor',data.nextCursor);params.set('asOf',String(first.asOf));if(seen.length===50)await seed('late',first.asOf+1)}while(seen.length<1000);
 assert.equal(seen.length,151);assert.equal(new Set(seen).size,151);assert.ok(!seen.includes('late'));
});
test('giveaway records are separate per campaign and verified status is manual',async()=>{
 await seed('one');let saved=await m.saveGiveaway(entry('one',{instagramUsername:' @Buyer.One '}),'owner:test');assert.equal(saved.instagramUsername,'buyer.one');assert.equal(saved.commentVerifiedAt,null);
 saved=await m.saveGiveaway(entry('one',{instagramUsername:'buyer.one',commentVerified:true,version:saved.version}),'owner:test');assert.ok(saved.commentVerifiedAt>0);
 assert.equal((await m.customerDirectory(new URLSearchParams({campaign:'october-2026',q:'@buyer.one'}))).matched,1);
 await m.saveGiveaway(entry('one',{campaign:'november-2026',instagramUsername:'buyer.one'}),'owner:test');
 const oct=await m.customerDirectory(new URLSearchParams({campaign:'october-2026',status:'verified'})),nov=await m.customerDirectory(new URLSearchParams({campaign:'november-2026',status:'pending'}));assert.equal(oct.matched,1);assert.equal(oct.verified,1);assert.equal(nov.matched,1);assert.equal(nov.customers[0].giveaway.commentVerifiedAt,null);
 saved=await m.saveGiveaway(entry('one',{instagramUsername:'new.user',version:saved.version}),'owner:test');assert.equal(saved.commentVerifiedAt,null);assert.equal((await client.execute("SELECT updated_by FROM customer_giveaway_entries WHERE campaign='october-2026'")).rows[0].updated_by,'owner:test');
});
test('stale saves and duplicated Instagram usernames cannot overwrite another entry',async()=>{
 await seed('one');await seed('two');const original=await m.saveGiveaway(entry('one',{instagramUsername:'same.user'}),'owner:test');
 await assert.rejects(m.saveGiveaway(entry('one',{instagramUsername:'changed'}),'owner:test'),error=>error.status===409);
 await assert.rejects(m.saveGiveaway(entry('two',{instagramUsername:'same.user'}),'owner:test'),error=>error.status===409);
 assert.equal((await m.customerDirectory(new URLSearchParams({campaign:'october-2026',q:'same.user'}))).customers[0].giveaway.version,original.version);
 const results=await Promise.allSettled([m.saveGiveaway(entry('one',{instagramUsername:'race.user',version:original.version}),'owner:test'),m.saveGiveaway(entry('two',{instagramUsername:'race.user'}),'owner:test')]);assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.status===409).length,1);
});
test('CSV neutralizes formulas, preserves field boundaries and keeps phone numbers as text',()=>{
 for(const value of ['=1+2',' +123','-1','@SUM(A1)','＝1+2','\r=1'])assert.ok(m.customerCsvCell(value).startsWith('"\t'));
 assert.equal(m.customerCsvCell('Buyer, "Elite"'),'"Buyer, ""Elite"""');assert.equal(m.customerCsvCell('+628123456789'),'"\t+628123456789"');assert.equal(m.customerCsvCell(null),'""');
});
test('multi-batch exports contain every matching account and JSON includes all giveaway histories',async()=>{
 const timestamp=Date.now()-1000;await client.batch(Array.from({length:1505},(_,i)=>({sql:'INSERT INTO customers(id,name,identity,email,password_hash,created_at) VALUES(?,?,?,?,?,?)',args:['id'+String(i).padStart(4,'0'),'Buyer '+i,'identity'+i,'buyer'+i+'@example.test','PRIVATE_HASH_SENTINEL',timestamp]})),'write');
 await m.saveGiveaway(entry('id0001',{instagramUsername:'archive.user',commentVerified:true}),'owner:test');await m.saveGiveaway(entry('id0001',{campaign:'november-2026',instagramUsername:'archive.user'}),'owner:test');
 const csv=await m.exportCustomers(new URLSearchParams({campaign:'october-2026'})),text=await csv.text();assert.equal(Number(csv.headers.get('X-ELITE-Export-Count')),1505);assert.equal(text.trim().split('\r\n').length,1506);assert.ok(!text.includes('PRIVATE_HASH_SENTINEL'));
 const json=await (await m.exportCustomers(new URLSearchParams({format:'json'}))).json();assert.equal(json.complete,true);assert.equal(json.count,1505);assert.equal(new Set(json.customers.map(c=>c.id)).size,1505);assert.equal(json.customers.find(c=>c.id==='id0001').giveaways.length,2);assert.ok(!JSON.stringify(json).includes('PRIVATE_HASH_SENTINEL'));
 const filtered=await (await m.exportCustomers(new URLSearchParams({format:'json',campaign:'october-2026',status:'verified'}))).json();assert.equal(filtered.count,1);assert.equal(filtered.customers[0].id,'id0001');
});
test('empty archive is valid and interrupted export fails rather than downloading partial data',async()=>{
 const empty=await (await m.exportCustomers(new URLSearchParams({format:'json'}))).json();assert.deepEqual(empty.customers,[]);assert.equal(empty.complete,true);
 await seed('one');const abort=new AbortController(),reply=await m.exportCustomers(new URLSearchParams({format:'json'}),abort.signal);abort.abort();await assert.rejects(reply.text());
});
test('account information survives logout and expired login sessions',async()=>{
 const account=await m.registerCustomer({name:'Simulated Buyer',identity:'081234567890',password:'SIMULATED_BUYER_PASSWORD_123',consent:true},null);const cookie='elite_customer='+account.token;await client.execute('UPDATE customer_sessions SET expires_at=1');assert.equal(await m.currentCustomer(cookie),null);
 const second=await m.registerCustomer({name:'Second Buyer',identity:'second@example.test',password:'SIMULATED_BUYER_PASSWORD_123',consent:true},null);await m.logoutCustomer('elite_customer='+second.token);assert.equal((await m.customerDirectory(new URLSearchParams())).total,2);assert.equal((await client.execute('SELECT COUNT(*) n FROM customer_sessions')).rows[0].n,0);
 const same=await Promise.allSettled([m.registerCustomer({name:'Other Buyer',identity:'+6281234567890',password:'SIMULATED_BUYER_PASSWORD_123',consent:true},null)]);assert.equal(same[0].status,'rejected');assert.equal(same[0].reason.status,409);
});
