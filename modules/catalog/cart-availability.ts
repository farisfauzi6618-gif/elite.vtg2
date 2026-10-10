import {orderingLocked} from './product-schedule';
import {choiceLabel,money,type Product} from './catalog-types';
export type CartLine={productId:string;groupId:string;quantity:number;name:string;label:string};
export function cartAvailability(cart:CartLine[],products:Product[],catalogLoaded:boolean,now=Date.now()){
 return cart.map(line=>{
  const product=products.find(p=>p.id===line.productId),group=product?.groups.find(g=>g.id===line.groupId);
  const pending=!product&&!catalogLoaded;
  return {...line,label:group?choiceLabel(group):line.label,pending,scheduled:!!product&&orderingLocked(product,now),orderableAt:product?.orderableAt??null,available:!!group&&group.qty!=null&&group.qty>=line.quantity,stock:group?.qty??0,photoKey:product?.photoKey??null,price:group?.price??product?.price??null};
 });
}
export type CartRow=ReturnType<typeof cartAvailability>[number];
export function cartSummary(rows:CartRow[]){
 const pending=rows.some(row=>row.pending),priceKnown=rows.every(row=>row.price!=null);
 return {canCheckout:rows.length>0&&rows.every(row=>!row.pending&&!row.scheduled&&row.available&&row.price!=null),label:pending?'Memuat harga…':priceKnown?money(rows.reduce((sum,row)=>sum+(row.price??0)*row.quantity,0)):'Harga belum tersedia'};
}
