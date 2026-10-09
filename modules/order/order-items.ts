export const MAX_ORDER_ITEMS=20;
export function orderShippingGrams(quantity:unknown){
 if(typeof quantity!=="number"||!Number.isSafeInteger(quantity)||quantity<1||quantity>MAX_ORDER_ITEMS)throw new Error(`Jumlah barang harus 1 sampai ${MAX_ORDER_ITEMS}.`);
 return Math.ceil(quantity/3)*1000;
}
export type ItemOrder={item:string;quantity?:number;items?:string[];items_json?:string|null};
export function normalizeOrderItems(value:Record<string,unknown>){
 const list=value.items===undefined?[value.item]:value.items;
 if(!Array.isArray(list)||list.length<1||list.length>MAX_ORDER_ITEMS)throw new Error(`Jumlah barang harus 1 sampai ${MAX_ORDER_ITEMS}.`);
 const quantity=value.quantity===undefined?list.length:value.quantity;
 if(typeof quantity!=="number"||!Number.isSafeInteger(quantity)||quantity!==list.length)throw new Error("Jumlah barang harus sesuai dengan jumlah nama barang yang diisi.");
 const items=list.map((value,index)=>{if(typeof value!=="string"||value.trim().length<2||value.trim().length>300||/[\x00-\x1f]/.test(value))throw new Error(`Isi nama barang ${index+1} dengan 2 sampai 300 karakter.`);return value.trim();});
 const item=items.length===1?items[0]:items.map((name,index)=>`${index+1}. ${name}`).join("\n");
 if(item.length>1800)throw new Error("Daftar nama barang terlalu panjang. Ringkas menggunakan nama atau kode barang.");
 return {quantity,items,item};
}
export function orderItems(order:ItemOrder):string[]{
 let items:unknown=order.items;
 if(!items&&order.items_json){try{items=JSON.parse(order.items_json);}catch{}}
 if(Array.isArray(items)&&items.length>0&&items.length<=MAX_ORDER_ITEMS&&items.every(x=>typeof x==="string"&&x.trim().length>0))return items as string[];
 return [order.item];
}
