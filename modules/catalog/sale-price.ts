import type {Product,SizeGroup} from './catalog-types';
export function validSalePrice(sale:number|null|undefined,regular:number|null|undefined){return Number.isSafeInteger(sale)&&Number(sale)>0&&regular!=null&&Number(sale)<regular?Number(sale):null;}
export function groupPricing(p:Product,g:SizeGroup){
 const color=(p.colorVariants??[]).find(v=>v.id===g.colorVariantId),regular=g.regularPrice??g.price??color?.price??p.regularPrice??p.price;
 // Public snapshots already carry resolved prices; never inherit another color's sale.
 if(g.regularPrice!==undefined){const sale=validSalePrice(g.salePrice,regular);return {regular,sale,price:sale??regular,title:sale?g.discountTitle??'':''};}
 const own=g.salePrice!=null,override=g.price!=null&&g.colorPriceInherited!==true&&g.price!==(color?.price??p.regularPrice??p.price);
 const colorSale=color?.salePrice!=null,inherit=!override&&(!color||p.saleColorsShared);
 const raw=own?g.salePrice:override?null:colorSale?color!.salePrice:inherit?p.salePrice:null;
 const sale=validSalePrice(raw,regular),title=own?g.discountTitle:colorSale?color!.discountTitle:inherit?p.discountTitle:null;
 return {regular,sale,price:sale??regular,title:sale?title??'':''};
}
export const transactionPrice=(p:Product,g:SizeGroup)=>groupPricing(p,g).price;
export function groupPriceDiffers(p:Product,g:SizeGroup){const a=groupPricing(p,g);return p.groups.filter(x=>x.colorActive!==false).some(x=>{const b=groupPricing(p,x);return a.regular!==b.regular||a.sale!==b.sale||a.title!==b.title;});}
export function parentPricing(p:Product){const regular=p.regularPrice??p.price,sale=validSalePrice(p.salePrice,regular);return {regular,sale,price:sale??regular,title:sale?p.discountTitle??'':''};}
export function salePriceIssue(sale:number|null|undefined,regular:number|null|undefined){if(sale==null)return null;if(!Number.isSafeInteger(sale)||Number(sale)<=0)return 'Sale price must be greater than zero.';return validSalePrice(sale,regular)==null?'Sale price must be lower than regular price.':null;}
