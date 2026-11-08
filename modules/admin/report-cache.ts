// Process-local, bounded read cache. Callers must authenticate before every read.
// Never use this for checkout pricing, stock validation, or customer sessions.
export function reportCache<T>(ttlMs:number,maxEntries=32,clock=Date.now){
 type Entry={promise:Promise<T>;expires:number};
 const entries=new Map<string,Entry>();
 return {
  clear(){entries.clear()},
  read(key:string,load:()=>Promise<T>,now=clock()):Promise<T>{
   const hit=entries.get(key);if(hit&&hit.expires>now)return hit.promise;
   if(hit)entries.delete(key);
   for(const [id,entry] of entries)if(entry.expires<=now)entries.delete(id);
   while(entries.size>=maxEntries)entries.delete(entries.keys().next().value!);
   const entry:Entry={promise:Promise.resolve().then(load),expires:now+120_000};
   entries.set(key,entry);
   void entry.promise.then(()=>{entry.expires=clock()+ttlMs},()=>{});
   void entry.promise.catch(()=>{if(entries.get(key)===entry)entries.delete(key)});
   return entry.promise;
  }
 };
}
