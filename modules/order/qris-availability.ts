type Asset = {key:string;mime:string;sha256:string};
type Bucket = {head(key:string):Promise<{size:number;httpMetadata?:{contentType?:string}}|null>};

// Bounded to one trusted deployment asset per warm instance. This caches only
// readiness metadata; /api/qris still verifies the actual bytes on every read.
export function createQrisAvailabilityProbe(now:()=>number=Date.now){
 let memo:{bucket:Bucket;identity:string;expires:number;pending:Promise<boolean>}|undefined;
 return (bucket:Bucket,asset:Asset):Promise<boolean>=>{
  const identity=JSON.stringify([asset.key,asset.mime,asset.sha256]);
  if(memo&&memo.bucket===bucket&&memo.identity===identity&&now()<memo.expires)return memo.pending;
  const entry={bucket,identity,expires:Infinity,pending:Promise.resolve(false)};
  entry.pending=(async()=>{
   let available=false;
   try{
    const object=await bucket.head(asset.key);
    available=!!object&&object.size>=32&&object.size<=4*1024*1024&&(!object.httpMetadata?.contentType||object.httpMetadata.contentType===asset.mime);
   }catch{console.error('Payment QRIS asset unavailable');}
   entry.expires=now()+(available?60000:5000);
   return available;
  })();
  memo=entry;return entry.pending;
 };
}
