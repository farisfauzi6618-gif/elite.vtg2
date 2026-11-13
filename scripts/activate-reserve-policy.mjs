// One-off release runner. Production credentials stay in the Vercel build.
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createClient} from '@libsql/client';
import {migrate} from './migration-core.mjs';
import {requireProductionMigrationTarget} from './activate-weekly-featured.mjs';

const migrationName='release_0028_reserve_dp_policy.sql';
class MigrationGuardError extends Error {}

export function verifyReservePolicyLedger(manifest,rows){
  if(manifest.size!==52||!manifest.has(migrationName))throw new MigrationGuardError('Expected the reviewed 52-file migration manifest.');
  const applied=new Set();
  for(const row of rows){
    if(applied.has(row.name)||!manifest.has(row.name))throw new MigrationGuardError('Unexpected migration ledger entry.');
    if(manifest.get(row.name)!==row.checksum)throw new MigrationGuardError('Applied migration checksum mismatch: '+row.name);
    applied.add(row.name);
  }
  const pending=[...manifest.keys()].filter(name=>!applied.has(name));
  if(pending.some(name=>name!==migrationName))throw new MigrationGuardError('An older migration is missing; refusing to replay it.');
  return pending;
}

async function main(){
  const apply=process.argv.includes('--apply');
  if(apply)requireProductionMigrationTarget(process.env);
  if(!process.env.TURSO_DATABASE_URL)throw new MigrationGuardError('Database is not configured.');
  const directory=new URL('../migrations/',import.meta.url),manifest=new Map();
  for(const name of(await readdir(directory)).filter(name=>name.endsWith('.sql')).sort()){
    manifest.set(name,createHash('sha256').update(await readFile(new URL(name,directory))).digest('hex'));
  }
  const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN,intMode:'number'});
  try{
    const ledger=()=>client.execute('SELECT name,checksum FROM elite_migrations');
    const pending=verifyReservePolicyLedger(manifest,(await ledger()).rows);
    console.log('Reserve DP: verified all 51 prior migration checksums; pending release_0028: '+pending.length);
    if(!apply)return;
    if(pending.length){
      const result=await migrate(client,directory);
      if(result.pending.some(name=>name!==migrationName))throw new MigrationGuardError('Unexpected migration was applied.');
    }
    if(verifyReservePolicyLedger(manifest,(await ledger()).rows).length)throw new MigrationGuardError('Migration remains pending.');
    console.log('Reserve DP: release_0028 verified; migration ledger 52/52; no pending migrations.');
  }finally{client.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{
    console.error('Reserve DP migration halted:',error instanceof MigrationGuardError?error.message:'Production target or database preflight/migration failed; credentials and driver details withheld.');
    process.exitCode=1;
  });
}
