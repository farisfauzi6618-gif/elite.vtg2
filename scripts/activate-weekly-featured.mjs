// One-off release runner: execute inside the approved Vercel production build.
// Credentials stay in Vercel. This is intentionally not the default build command.
import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createClient} from '@libsql/client';
import {migrate} from './migration-core.mjs';

const migrationName='release_0027_weekly_featured.sql';
export class MigrationGuardError extends Error {}
export function verifyWeeklyFeaturedLedger(manifest,rows){
  if(manifest.size!==51||!manifest.has(migrationName))throw new MigrationGuardError('Expected exactly the reviewed 51-file migration manifest.');
  const applied=new Map();
  for(const row of rows){
    if(applied.has(row.name)||!manifest.has(row.name))throw new MigrationGuardError('Unexpected migration ledger entry.');
    if(manifest.get(row.name)!==row.checksum)throw new MigrationGuardError('Applied migration checksum mismatch: '+row.name);
    applied.set(row.name,row.checksum);
  }
  const pending=[...manifest.keys()].filter(name=>!applied.has(name));
  if(pending.some(name=>name!==migrationName))throw new MigrationGuardError('An older migration is missing; refusing to replay it.');
  if(applied.size!==50&&applied.size!==51)throw new MigrationGuardError('Unexpected migration ledger size.');
  return pending;
}
export function requireProductionMigrationTarget(env){
  if(env.VERCEL!=='1'||env.VERCEL_ENV!=='production')throw new MigrationGuardError('Apply is allowed only inside Vercel production.');
  if(env.VERCEL_PROJECT_ID&&env.VERCEL_PROJECT_ID!=='prj_4XLgFbyMk1CN0ZI8Y9wiPMOLBVM9')throw new MigrationGuardError('Unexpected Vercel project.');
  let url;try{url=new URL(env.TURSO_DATABASE_URL);}catch{throw new MigrationGuardError('Production database is not configured.');}
  if(!['libsql:','https:'].includes(url.protocol)||!url.hostname.startsWith('elite-vtg2-production-')||!url.hostname.endsWith('.turso.io')||url.username||url.password||url.search||url.hash)throw new MigrationGuardError('Unexpected production database target.');
  if(!env.TURSO_AUTH_TOKEN)throw new MigrationGuardError('Production database authentication is missing.');
}
async function main(){
  const apply=process.argv.includes('--apply');
  if(apply)requireProductionMigrationTarget(process.env);
  if(!process.env.TURSO_DATABASE_URL)throw new MigrationGuardError('Database is not configured.');
  const directory=new URL('../migrations/',import.meta.url),manifest=new Map();
  for(const name of(await readdir(directory)).filter(name=>name.endsWith('.sql')).sort())manifest.set(name,createHash('sha256').update(await readFile(new URL(name,directory))).digest('hex'));
  const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN,intMode:'number'});
  try{
    const pending=verifyWeeklyFeaturedLedger(manifest,(await client.execute('SELECT name,checksum FROM elite_migrations')).rows);
    console.log('Weekly Featured: verified all 50 existing migration checksums; pending release_0027: '+pending.length);
    if(!apply)return;
    // Official runner commits each migration and its checksum in one write batch.
    const result=await migrate(client,directory);
    if(result.pending.some(name=>name!==migrationName))throw new MigrationGuardError('Unexpected migration was applied.');
    if(verifyWeeklyFeaturedLedger(manifest,(await client.execute('SELECT name,checksum FROM elite_migrations')).rows).length)throw new MigrationGuardError('Migration remains pending.');
    console.log('Weekly Featured: release_0027 verified; migration ledger 51/51; no pending migrations.');
  }finally{client.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{console.error('Weekly Featured migration halted:',error instanceof MigrationGuardError?error.message:'Database preflight/migration failed; credentials and driver details withheld.');process.exitCode=1;});
}
