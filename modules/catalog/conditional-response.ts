import {createHash} from 'node:crypto';

// Validate against freshly read data on every request. No server/CDN data cache.
export function conditionalResponse(request:Request,data:Record<string,unknown>){
 const {asOf,...content}=data;
 const scope=new URL(request.url);
 const etag='W/"'+createHash('sha256').update(scope.pathname+scope.search+'\n'+JSON.stringify(content)).digest('hex')+'"';
 const headers:Record<string,string>={'Cache-Control':'private, no-store','Vary':'Cookie','ETag':etag,'X-Content-Type-Options':'nosniff'};
 if(typeof asOf==='string')headers['X-ELITE-Server-Time']=asOf;
 if(request.headers.get('if-none-match')?.split(',').map(v=>v.trim()).includes(etag))return new Response(null,{status:304,headers});
 return Response.json(data,{headers});
}
