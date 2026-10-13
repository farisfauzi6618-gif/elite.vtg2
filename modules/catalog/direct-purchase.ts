import {isSold,type Product} from './catalog-types';
import {orderingLocked} from './product-schedule';
export type CheckoutLine={productId:string;groupId:string;quantity:number};
export function directPurchaseLines(product:Product,groupId:string,now:number):CheckoutLine[]{
 const group=product.groups.find(g=>g.id===groupId);
 if(product.status!=='published'||isSold(product)||orderingLocked(product,now)||!group||group.qty==null||group.qty<1)throw new Error('Barang atau ukuran ini belum tersedia untuk dibeli.');
 return [{productId:product.id,groupId:group.id,quantity:1}];
}
// Direct purchase is independent of the existing basket, even for the same size.
// An empty handoff keeps every old basket line on the return from its invoice.
export function checkoutHandoffLines(lines:CheckoutLine[],direct:boolean){return direct?[]:lines.map(line=>({...line}))}
