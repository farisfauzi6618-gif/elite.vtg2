import {availableGroups,isSold,isReserved,money,displayPrice,type Product,type SizeGroup} from '@/modules/catalog/catalog-types';
import {groupPricing,parentPricing} from '@/modules/catalog/sale-price';
export function ProductPrice({product,group,detail=false,className}:{product:Product;group?:SizeGroup;detail?:boolean;className?:string}){
 const groups=group?[group]:isSold(product)||isReserved(product)?product.groups:availableGroups(product),values=groups.map(g=>groupPricing(product,g));
 const uniform=values.length>0&&values.every(v=>v.regular===values[0].regular&&v.sale===values[0].sale),pricing=uniform?values[0]:values.length?null:parentPricing(product);
 const active=pricing?.sale!=null;
 return <div className={(className??(detail?'detail-price':'product-card-price'))+(active?' has-sale-price':'')}>
  {detail&&active&&pricing.title&&values.every(v=>v.title===pricing.title)&&<span className="discount-title">{pricing.title}</span>}
  {active&&<del className="regular-price"><span className="sr-only">Harga normal </span>{money(pricing.regular)}</del>}
  <span className="actual-price">{group?money(pricing?.price):active?money(pricing.price):displayPrice(product)}</span>
 </div>;
}
