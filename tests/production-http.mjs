import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createClient} from '@libsql/client';
import {hashPassword} from '../lib/auth/password.mjs';
import {migrate} from '../scripts/migration-core.mjs';

const temporary=await mkdtemp(path.join(os.tmpdir(),'elite-vtg-http-'));
const databaseUrl='file:'+path.join(temporary,'test.db');
const client=createClient({url:databaseUrl});
const portServer=net.createServer();await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
// NextRequest normalizes loopback hosts to localhost; match the browser origin.
const origin='http://localhost:'+port,png=new Uint8Array(80);png.set([137,80,78,71,13,10,26,10]);
const storageRoot=path.join(temporary,'files');let server;let log='';let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++};
try{
  await migrate(client,new URL('../migrations/',import.meta.url));
  await mkdir(path.join(storageRoot,'qris'),{recursive:true});
  await writeFile(path.join(storageRoot,'qris/original'),png);
  await writeFile(path.join(storageRoot,'qris/original.meta.json'),JSON.stringify({contentType:'image/png'}));
  const environment={...process.env,NODE_ENV:'production',SITE_ORIGIN:origin,TURSO_DATABASE_URL:databaseUrl,LOCAL_STORAGE_PATH:storageRoot,STORAGE_DRIVER:'local',ADMIN_EMAIL:'owner@example.test',ADMIN_PASSWORD_HASH:await hashPassword('SIMULATED_HTTP_PASSWORD_123'),AUTH_SECRET:'a'.repeat(64),CONFIG_SECRET:'b'.repeat(64),TEAM_ACCESS_SECRET:'c'.repeat(64),RAJAONGKIR_CONFIG_SECRET:'d'.repeat(64),PAYMENT_BCA_ACCOUNT_NUMBER:'1234567890',PAYMENT_BCA_ACCOUNT_HOLDER:'PEMILIK SIMULASI',PAYMENT_QRIS_KEY:'qris/original',PAYMENT_QRIS_MIME:'image/png',PAYMENT_QRIS_MERCHANT:'MERCHANT SIMULASI',PAYMENT_QRIS_SHA256:createHash('sha256').update(png).digest('hex'),BLOB_READ_WRITE_TOKEN:'',BLOB_STORE_ID:'',TURSO_AUTH_TOKEN:'',RAJAONGKIR_API_KEY:''};
  delete environment.VERCEL;
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',data=>{log+=data});server.stderr.on('data',data=>{log+=data});
  let started=false;
  for(let attempt=0;attempt<120;attempt++){
    if(server.exitCode!==null)throw Error('Production server exited before startup');
    try{if((await fetch(origin,{signal:AbortSignal.timeout(1000)})).status===200){started=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  check(started,'Production server starts');
  for(const route of ['/','/order','/lacak','/admin/login']){
    const response=await fetch(origin+route);check(response.status===200,route+' returns 200');
    check(response.headers.get('x-frame-options')==='DENY','Anti-frame header on '+route);
    check(response.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"),'CSP on '+route);
  }
  const html=await(await fetch(origin+'/')).text();
  const assets=[...new Set([...html.matchAll(/(?:src|href)="([^"?#]*\/_next\/static\/[^"?#]+)"/g)].map(match=>match[1]))];
  check(assets.length>0,'Production page links built assets');
  for(const asset of assets)check((await fetch(origin+asset)).status===200,'Built asset is available');
  const publicConfig=await(await fetch(origin+'/api/config')).json();check(publicConfig.payment.bca.accountNumber==='1234567890','BCA comes from server config');
  check(publicConfig.payment.qris.merchant==='MERCHANT SIMULASI','QRIS comes from server config');
  check(!/sha256|AUTH_SECRET|CONFIG_SECRET|bot_cipher/.test(JSON.stringify(publicConfig)),'Public config excludes private configuration');
  check((await fetch(origin+'/api/admin/order')).status===401,'Anonymous admin API denied');
  check((await fetch(origin+'/api/admin/order',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'}})).status===401,'Forged hosting identity denied');
  const mutate=(pathname,data,cookie='',requestOrigin=origin)=>fetch(origin+pathname,{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
  const login=await mutate('/api/auth/owner',{email:'owner@example.test',password:'SIMULATED_HTTP_PASSWORD_123'});check(login.status===200,'Standalone owner login succeeds: '+login.status+' '+(login.status===200?'':await login.text()));
  const cookie=login.headers.get('set-cookie').split(';')[0];
  check((await fetch(origin+'/api/admin/order',{headers:{Cookie:cookie}})).status===200,'Owner can read payment dashboard');
  check((await mutate('/api/admin/order/qris',{merchant:'ATTACKER'},cookie)).status===403,'Owner dashboard cannot replace QRIS');
  check((await mutate('/api/admin/order/qris',{merchant:'ATTACKER'},cookie,'https://evil.test')).status===403,'Cross-origin QRIS replacement denied');
  const image=await fetch(origin+'/api/qris');check(image.status===200,'Original QRIS available');check(Buffer.from(await image.arrayBuffer()).equals(Buffer.from(png)),'Original QRIS bytes preserved');
  const replacement=png.slice();replacement[79]^=1;await writeFile(path.join(storageRoot,'qris/original'),replacement);
  check((await fetch(origin+'/api/qris')).status===503,'Changed QRIS rejected by production server');
  const logout=await mutate('/api/auth/owner',{action:'logout'},cookie);check(logout.status===200,'Owner logout succeeds');
  check((await fetch(origin+'/api/admin/order',{headers:{Cookie:cookie}})).status===401,'Logged-out owner session revoked');
  console.log('PASS '+checks+' HTTP checks on isolated production build; no live database, bot, payment, courier, or deployment used.');
}catch(error){console.error(log.slice(-3500));throw error}
finally{
  if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>{server.once('exit',resolve);setTimeout(resolve,5000)})}
  client.close();
  if(path.dirname(path.resolve(temporary))!==path.resolve(os.tmpdir())||!path.basename(temporary).startsWith('elite-vtg-http-'))throw Error('Unexpected temporary cleanup target');
  await rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
