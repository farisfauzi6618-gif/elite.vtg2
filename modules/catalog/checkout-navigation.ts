export function checkoutDestination(value:unknown,origin:string,basket:string):URL{
 const message='Tautan pembayaran belum dapat dibuka. Silakan coba lagi.';
 if(typeof value!=='string')throw new Error(message);
 let target:URL;
 try{target=new URL(value,origin)}catch{throw new Error(message)}
 if(target.origin!==origin||target.pathname!=='/order'||!/^([a-f0-9]{64})$/.test(target.searchParams.get('catalog')??''))throw new Error(message);
 target.searchParams.set('basket',basket);
 return target;
}
