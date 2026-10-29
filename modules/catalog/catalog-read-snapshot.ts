import {createHash} from 'node:crypto';
import {db,readProducts} from './server';
import {readTaxonomy} from './taxonomy-service';

// Every request checks a database revision and an indexed time boundary first.
// No TTL can hide stock changes, scheduled releases or Reserve/SOLD transitions.
export async function catalogStamp(now=Date.now()){
 const row=await db().prepare('SELECT revision,(SELECT MAX(at) FROM catalog_time_events WHERE at<=?) AS clock FROM catalog_revision WHERE id=1').bind(now).first<{revision:number;clock:number|null}>();
 if(!row)throw Error('Catalog revision unavailable');
 return `${row.revision}:${row.clock??0}`;
}
type Snapshot={products:Awaited<ReturnType<typeof readProducts>>;taxonomy:Awaited<ReturnType<typeof readTaxonomy>>};
let cached:{key:string;promise:Promise<Snapshot>}|undefined;
export function clearCatalogSnapshot(){cached=undefined}
function loadSnapshot(key:string){
 if(cached?.key===key)return cached.promise;
 const entry={key,promise:Promise.all([readProducts(false,true),readTaxonomy()]).then(([products,taxonomy])=>({products,taxonomy}))};cached=entry;
 void entry.promise.then(value=>{if(JSON.stringify(value).length>3*1024*1024&&cached===entry)cached=undefined},()=>{if(cached===entry)cached=undefined});
 return entry.promise;
}
export async function versionedCatalogResponse(request:Request,render:(snapshot:Snapshot)=>Record<string,unknown>){
 const before=await catalogStamp(),url=new URL(request.url),etag='W/"catalog-rev-'+createHash('sha256').update((process.env.VERCEL_GIT_COMMIT_SHA??'local-v1')+'\n'+url.pathname+url.search+'\n'+before).digest('hex')+'"';
 const headers=new Headers({'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','X-ELITE-Server-Time':new Date().toISOString()});
 if(request.headers.get('if-none-match')?.split(',').some(value=>value.trim()===etag)){headers.set('ETag',etag);return new Response(null,{status:304,headers})}
 const value=await loadSnapshot(before),data=render(value),after=await catalogStamp();
 if(before===after)headers.set('ETag',etag);else if(cached?.key===before)cached=undefined;
 return Response.json(data,{headers});
}
