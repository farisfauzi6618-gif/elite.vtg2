import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';import {migrate} from '../scripts/migration-core.mjs';import {hashPassword} from '../lib/auth/password.mjs';

const dir=await mkdtemp(path.join(os.tmpdir(),'elite-customers-'));
Object.assign(process.env,{TURSO_DATABASE_URL:'file:'+path.join(dir,'test.db'),TURSO_AUTH_TOKEN:'',ADMIN_EMAIL:'owner@elite.test',AUTH_SECRET:'a'.repeat(64),CONFIG_SECRET:'b'.repeat(64),TEAM_ACCESS_SECRET:'c'.repeat(64),SITE_ORIGIN:'https://elite.test',STORAGE_DRIVER:'local',LOCAL_STORAGE_PATH:path.join(dir,'files'),ADMIN_PASSWORD_HASH:await hashPassword('SIMULATED_CUSTOMER_OWNER_PASSWORD_123')});delete process.env.VERCEL;
const compiled=await build({stdin:{contents:`export * from './modules/catalog/customer-directory';export {getSqlClient,getDatabase} from './lib/database';export {registerCustomer,loginCustomer,currentCustomer,logoutCustomer} from './modules/catalog/customers';export {loginOwner,ownerCookie,logoutOwner} from './lib/auth/owner';export {GET as listGet} from './app/api/admin/customers/route';export {GET as exportGet} from './app/api/admin/customers/export/route';export {POST as managePost} from './app/api/admin/customers/manage/route';export {GET as customerGet} from './app/api/customer/route';export {listTeam,editTeam,startTeamSession,sessionCookie} from './modules/catalog/team-access';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',write:false,banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'next',setup(b){b.onResolve({filter:/^next\/(headers|navigation)$/},a=>({path:a.path+'.js',external:true}))}}]});
await mkdir('.test-runtime/tests',{recursive:true});const file=path.resolve('.test-runtime/tests/customer-directory.mjs');await writeFile(file,compiled.outputFiles[0].contents);const m=await import(pathToFileURL(file)),client=m.getSqlClient();
const oldMigrations=path.join(dir,'old-migrations');await mkdir(oldMigrations);
for(const name of await readdir(new URL('../migrations/',import.meta.url)))if(name.endsWith('.sql')&&name!=='release_0007_customer_trash.sql')await copyFile(new URL('../migrations/'+name,import.meta.url),path.join(oldMigrations,name));
await migrate(client,pathToFileURL(oldMigrations+path.sep));
await client.execute("INSERT INTO customers(id,name,identity,email,password_hash,created_at) VALUES('legacy','Existing Buyer','existing@example.test','existing@example.test','PRIVATE_HASH_SENTINEL',1)");
await client.execute("INSERT INTO customer_giveaway_entries VALUES('legacy','legacy-promo','legacy.user',NULL,1,'owner:test',1)");
const existing=(await client.execute("SELECT * FROM customers WHERE id='legacy'")).rows[0],legacyEntry=(await client.execute('SELECT * FROM customer_giveaway_entries')).rows[0];
const migration=await migrate(client,new URL('../migrations/',import.meta.url));
const existingAfterMigration=(await client.execute("SELECT * FROM customers WHERE id='legacy'")).rows[0],entryAfterMigration=(await client.execute('SELECT * FROM customer_giveaway_entries')).rows[0];
const req=(url='/api/admin/customers',cookie='',body,origin='https://elite.test')=>new Request('https://elite.test'+url,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function owner(){const token=await m.loginOwner(req(),{email:'owner@elite.test',password:'SIMULATED_CUSTOMER_OWNER_PASSWORD_123'});return m.ownerCookie(req(),token).split(';')[0]}
async function seed(id,createdAt=Date.now()-1000,name='Buyer '+id){await client.execute({sql:'INSERT INTO customers(id,name,identity,email,phone,birthday,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?)',args:[id,name,id+'@example.test',id+'@example.test',null,'2000-05-06','PRIVATE_HASH_SENTINEL',createdAt]})}
const remove=id=>({customerId:id,action:'trash',deletedAt:null});
beforeEach(async()=>{for(const table of ['first_purchase_discounts','purchase_voucher_claims','purchase_vouchers','orders','customer_trash','customer_giveaway_entries','customer_sessions','customers','owner_sessions','admin_access','team_sessions','team_access'])await client.execute('DELETE FROM '+table)});
after(async()=>{client.close();assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elite-customers-'));await rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:200});await rm(file,{force:true})});

test('additive trash migration preserves customer and old giveaway rows',async()=>{
 assert.deepEqual(migration.pending,['release_0007_customer_trash.sql']);
 const sql=await readFile(new URL('../migrations/release_0007_customer_trash.sql',import.meta.url),'utf8');assert.ok(!/\b(?:DELETE|DROP|ALTER|UPDATE)\b/i.test(sql));
 assert.deepEqual(existingAfterMigration,existing);assert.deepEqual(entryAfterMigration,legacyEntry);
});
test('anonymous and customer sessions cannot list, export or manage customer data',async()=>{
 const account=await m.registerCustomer({name:'Simulated Buyer',identity:'buyer@example.test',password:'SIMULATED_BUYER_PASSWORD_123',consent:true},null),cookie='elite_customer='+account.token;
 for(const session of ['',cookie]){assert.equal((await m.listGet(req('/api/admin/customers',session))).status,401);assert.equal((await m.exportGet(req('/api/admin/customers/export',session))).status,401);assert.equal((await m.managePost(req('/api/admin/customers/manage',session,remove('missing')))).status,401)}
 assert.equal((await client.execute('SELECT COUNT(*) n FROM customer_trash')).rows[0].n,0);
});
test('owner whitelist excludes credentials and giveaway data; responses stay private',async()=>{
 await seed('one');await client.execute("INSERT INTO customer_giveaway_entries VALUES('one','legacy','private.ig',NULL,1,'owner:test',1)");
 const cookie=await owner(),reply=await m.listGet(req('/api/admin/customers',cookie)),value=await reply.json();assert.equal(reply.status,200);assert.equal(reply.headers.get('Cache-Control'),'private, no-store');assert.equal(reply.headers.get('Vary'),'Cookie');assert.equal(value.total,1);assert.deepEqual(Object.keys(value.customers[0]).sort(),['birthday','createdAt','deletedAt','email','id','name','phone']);assert.ok(!/PRIVATE_HASH_SENTINEL|giveaway|private\.ig/.test(JSON.stringify(value)));
 await m.logoutOwner(req('/admin/logout',cookie));assert.equal((await m.exportGet(req('/api/admin/customers/export',cookie))).status,401);
});
test('analytics-enabled team cannot read or delete customer data; cross-site owner writes denied',async()=>{
 await seed('one');const team=(await m.listTeam('https://elite.test'))[0];await m.editTeam({id:team.id,action:'analytics',allowed:true});const session=await m.startTeamSession(new URL(team.link).hash.slice(1)),cookie=m.sessionCookie(req(),session.session,session.expires).split(';')[0];
 assert.equal((await m.listGet(req('/api/admin/customers',cookie))).status,401);assert.equal((await m.exportGet(req('/api/admin/customers/export',cookie))).status,401);assert.equal((await m.managePost(req('/api/admin/customers/manage',cookie,remove('one')))).status,401);
 assert.equal((await m.managePost(req('/api/admin/customers/manage',await owner(),remove('one'),'https://foreign.test'))).status,403);assert.equal((await client.execute('SELECT COUNT(*) n FROM customer_trash')).rows[0].n,0);
});
test('inclusive WIB dates and strict view/cursor/time validation',async()=>{
 await seed('before',Date.parse('2026-10-10T16:59:59.999Z'));await seed('inside',Date.parse('2026-10-10T17:00:00Z'));await seed('after',Date.parse('2026-10-11T17:00:00Z'));
 assert.deepEqual((await m.customerDirectory(new URLSearchParams({start:'2026-10-11',end:'2026-10-11'}))).customers.map(c=>c.id),['inside']);
 for(const params of [{start:'2026-02-30'},{start:'2026-10-11',end:'2026-10-10'},{cursor:'bad!!'},{q:'a'.repeat(121)},{asOf:'Infinity'},{asOf:''},{view:'all'}])assert.throws(()=>m.customerSelection(new URLSearchParams(params)));
});
test('search escapes wildcards, parameterizes injection and ignores legacy Instagram filters',async()=>{
 await seed('literal',Date.now()-1000,"Buyer %_\\ ' OR 1=1 --");await seed('normal');await client.execute("INSERT INTO customer_giveaway_entries VALUES('normal','legacy','private.ig',1,1,'owner:test',1)");
 for(const q of ['%_\\',"' OR 1=1 --"]){const result=await m.customerDirectory(new URLSearchParams({q}));assert.deepEqual(result.customers.map(c=>c.id),['literal']);assert.equal(result.matched,1)}
 assert.equal((await m.customerDirectory(new URLSearchParams({q:'private.ig'}))).matched,0);
 assert.equal((await m.customerDirectory(new URLSearchParams({campaign:'legacy',status:'verified'}))).matched,2);
});
test('keyset pagination handles 151 tied timestamps and excludes later signups',async()=>{
 const timestamp=Date.now()-1000;await client.batch(Array.from({length:151},(_,i)=>({sql:'INSERT INTO customers(id,name,identity,password_hash,created_at) VALUES(?,?,?,?,?)',args:['id'+String(i).padStart(4,'0'),'Buyer '+i,'identity'+i,'PRIVATE_HASH_SENTINEL',timestamp]})),'write');
 const seen=[],params=new URLSearchParams();let first;
 do{const data=await m.customerDirectory(params);first??=data;assert.ok(data.customers.length<=50);seen.push(...data.customers.map(c=>c.id));if(!data.nextCursor)break;params.set('cursor',data.nextCursor);params.set('asOf',String(first.asOf));if(seen.length===50)await seed('late',first.asOf+1)}while(seen.length<1000);
 assert.equal(seen.length,151);assert.equal(new Set(seen).size,151);assert.ok(!seen.includes('late'));
});
test('trash separates lists and exports, preserves account rows and supports restoration',async()=>{
 await seed('one');await seed('two');const before=(await client.execute("SELECT * FROM customers WHERE id='one'")).rows[0],removed=await m.manageCustomer(remove('one'),'owner:test');
 const active=await m.customerDirectory(new URLSearchParams()),trash=await m.customerDirectory(new URLSearchParams({view:'trash'}));assert.equal(active.total,1);assert.equal(active.trashed,1);assert.deepEqual(active.customers.map(c=>c.id),['two']);assert.deepEqual(trash.customers.map(c=>c.id),['one']);assert.equal(trash.customers[0].deletedAt,removed.deletedAt);
 const archive=await (await m.exportCustomers(new URLSearchParams({format:'json'}))).json(),removedArchive=await (await m.exportCustomers(new URLSearchParams({format:'json',view:'trash'}))).json();assert.deepEqual(archive.customers.map(c=>c.id),['two']);assert.deepEqual(removedArchive.customers.map(c=>c.id),['one']);assert.equal(removedArchive.filters.view,'trash');
 await m.manageCustomer({customerId:'one',action:'restore',deletedAt:removed.deletedAt},'owner:test');assert.deepEqual((await client.execute("SELECT * FROM customers WHERE id='one'")).rows[0],before);assert.equal((await m.customerDirectory(new URLSearchParams())).total,2);
});
test('trash immediately revokes login and sessions; restore requires fresh login',async()=>{
 const input={name:'Simulated Buyer',identity:'buyer@example.test',password:'SIMULATED_BUYER_PASSWORD_123',consent:true},a=await m.registerCustomer(input,null),cookie='elite_customer='+a.token,id=(await m.currentCustomer(cookie)).id;
 const removed=await m.manageCustomer(remove(id),'owner:test');assert.equal(await m.currentCustomer(cookie),null);assert.equal((await m.customerGet(req('/api/customer',cookie))).status,200);assert.equal((await client.execute('SELECT COUNT(*) n FROM customer_sessions')).rows[0].n,0);
 await assert.rejects(m.loginCustomer(input,null),e=>e.status===401);await assert.rejects(m.registerCustomer(input,null),e=>e.status===409);
 await m.manageCustomer({customerId:id,action:'restore',deletedAt:removed.deletedAt},'owner:test');assert.equal(await m.currentCustomer(cookie),null);const logged=await m.loginCustomer(input,null);assert.equal((await m.currentCustomer('elite_customer='+logged.token)).id,id);
});
test('trash preserves orders, catalog stock and redeemed discount/voucher histories',async()=>{
 await seed('one');
 await client.execute("INSERT INTO orders(id,session_hash,created_at,name,phone,address,postcode,item,total,customer_id,confirmed_at) VALUES('old-order','hash',1,'Buyer','08123','Address','12345','Item',100000,'one',1)");
 await client.execute("INSERT INTO first_purchase_discounts VALUES('one','old-order',1)");
 await client.execute("INSERT INTO purchase_vouchers(id,label,type,percentage,valid_from,owner_user_id) VALUES('voucher','Existing','percentage',5,0,'one')");
 await client.execute("INSERT INTO purchase_voucher_claims VALUES('voucher','old-order','one',1,1)");
 const tables=['orders','first_purchase_discounts','purchase_vouchers','purchase_voucher_claims','products','size_groups','stock_history'],before=await client.batch(tables.map(t=>'SELECT * FROM '+t));
 const removed=await m.manageCustomer(remove('one'),'owner:test');await m.manageCustomer({customerId:'one',action:'restore',deletedAt:removed.deletedAt},'owner:test');assert.deepEqual((await client.batch(tables.map(t=>'SELECT * FROM '+t))).map(r=>r.rows),before.map(r=>r.rows));assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length,0);
});
test('invalid/stale requests fail; concurrent deletes cannot overwrite state; writes roll back atomically',async()=>{
 await seed('one');for(const input of [{...remove('one'),action:'purge'},{...remove('one'),deletedAt:undefined},{...remove('one'),deletedAt:-1},{...remove('one'),customerId:"one' OR 1=1 --"}])await assert.rejects(m.manageCustomer(input,'owner:test'),e=>[400,404].includes(e.status));
 const results=await Promise.allSettled([m.manageCustomer(remove('one'),'owner:first'),m.manageCustomer(remove('one'),'owner:second')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1,results.filter(r=>r.status==='rejected').map(r=>String(r.reason)).join(';'));
 const removed=results.find(r=>r.status==='fulfilled').value;await assert.rejects(m.manageCustomer({...remove('one'),action:'restore'},'owner:test'),e=>e.status===409);await m.manageCustomer({customerId:'one',action:'restore',deletedAt:removed.deletedAt},'owner:test');
 await client.execute("INSERT INTO customer_sessions VALUES('session','one',1,9999999999999)");await client.execute("CREATE TRIGGER fail_customer_revoke BEFORE DELETE ON customer_sessions BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
 try{await assert.rejects(m.manageCustomer(remove('one'),'owner:test'));assert.equal((await client.execute('SELECT COUNT(*) n FROM customer_trash')).rows[0].n,0);assert.equal((await client.execute('SELECT COUNT(*) n FROM customer_sessions')).rows[0].n,1)}finally{await client.execute('DROP TRIGGER fail_customer_revoke')}
});
test('CSV protects formula cells and multi-batch 1505-account archives contain only customer data',async()=>{
 for(const value of ['=1+2',' +123','-1','@SUM(A1)','＝1+2','\r=1'])assert.ok(m.customerCsvCell(value).startsWith('"\t'));assert.equal(m.customerCsvCell('Buyer, "Elite"'),'"Buyer, ""Elite"""');assert.equal(m.customerCsvCell(null),'""');
 const timestamp=Date.now()-1000;await client.batch(Array.from({length:1505},(_,i)=>({sql:'INSERT INTO customers(id,name,identity,email,password_hash,created_at) VALUES(?,?,?,?,?,?)',args:['id'+String(i).padStart(4,'0'),'Buyer '+i,'identity'+i,'buyer'+i+'@example.test','PRIVATE_HASH_SENTINEL',timestamp]})),'write');
 await client.execute("INSERT INTO customer_giveaway_entries VALUES('id0001','old','private.ig',1,1,'owner:test',1)");
 const text=await (await m.exportCustomers(new URLSearchParams())).text();assert.equal(text.trim().split('\r\n').length,1506);assert.ok(!/Giveaway|Instagram|PRIVATE_HASH_SENTINEL/.test(text));
 const json=await (await m.exportCustomers(new URLSearchParams({format:'json'}))).json();assert.equal(json.complete,true);assert.equal(json.version,2);assert.equal(json.count,1505);assert.equal(new Set(json.customers.map(c=>c.id)).size,1505);assert.ok(!/giveaway|private\.ig|PRIVATE_HASH_SENTINEL/.test(JSON.stringify(json)));
});
test('empty archives are valid and interrupted or changed exports fail closed',async()=>{
 const empty=await (await m.exportCustomers(new URLSearchParams({format:'json'}))).json();assert.deepEqual(empty.customers,[]);assert.equal(empty.complete,true);
 await seed('one');const abort=new AbortController(),reply=await m.exportCustomers(new URLSearchParams({format:'json'}),abort.signal);abort.abort();await assert.rejects(reply.text());
 const changed=await m.exportCustomers(new URLSearchParams({format:'json'}));await m.manageCustomer(remove('one'),'owner:test');await assert.rejects(changed.text());
});
test('logout and expired sessions retain accounts; active authentication remains normal',async()=>{
 const a=await m.registerCustomer({name:'Simulated Buyer',identity:'081234567890',password:'SIMULATED_BUYER_PASSWORD_123',consent:true},null);await client.execute('UPDATE customer_sessions SET expires_at=1');assert.equal(await m.currentCustomer('elite_customer='+a.token),null);
 const second=await m.registerCustomer({name:'Second Buyer',identity:'second@example.test',password:'SIMULATED_BUYER_PASSWORD_123',consent:true},null);await m.logoutCustomer('elite_customer='+second.token);assert.equal((await m.customerDirectory(new URLSearchParams())).total,2);
 await assert.rejects(m.registerCustomer({name:'Other Buyer',identity:'+6281234567890',password:'SIMULATED_BUYER_PASSWORD_123',consent:true},null),e=>e.status===409);
});
