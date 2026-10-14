import type {Product,SizeGroup} from './catalog-types';
export type ColorVariant={id:string;name:string;hex:string;swatchType:'COLOR'|'IMAGE';swatchImage:string|null;active:boolean;price:number|null;condition:string|null;defects:string|null;photoKey:string|null;photoKeys:string[]};
export function activeColors(p:Product){return (p.colorVariants??[]).filter(v=>v.active)}
export function groupColor(p:Product,g:SizeGroup){return (p.colorVariants??[]).find(v=>v.id===g.colorVariantId)}
export function colorAvailable(p:Product,g:SizeGroup){return !g.colorVariantId||groupColor(p,g)?.active===true}
export function selectedColorProduct(p:Product,id?:string|null):Product{
 const colors=activeColors(p);if(!colors.length)return p;
 const v=colors.find(v=>v.id===id)??colors.find(v=>v.id===p.defaultColorVariantId)??colors[0];
 return {...p,selectedColorVariantId:v.id,color:v.name,price:v.price??p.price,condition:v.condition??p.condition,defects:v.defects??p.defects??'None',photoKey:v.photoKey,photoKeys:v.photoKeys,groups:p.groups.filter(g=>g.colorVariantId===v.id)};
}
export function resolveColorGroups(p:Product):Product{
 return {...p,groups:p.groups.map(g=>{const v=groupColor(p,g);return v?{...g,colorPriceInherited:g.price==null,colorConditionInherited:g.condition==null,colorDefectsInherited:g.defects==null,colorName:v.name,colorActive:v.active,price:g.price??v.price??p.price,condition:g.condition??v.condition??p.condition,defects:g.defects??v.defects??p.defects}:g})};
}
export function colorPhoto(p:Product,g:SizeGroup){return groupColor(p,g)?.photoKey??p.photoKey}
// Used by stock-confirmation gates too: unpublished colors cannot be sold through an old checkout.
export function activeColorSql(g='g',p='p'){return `(${g}.color_variant_id IS NULL OR EXISTS (SELECT 1 FROM json_each(${p}.color_variants) c WHERE json_extract(c.value,'$.id')=${g}.color_variant_id AND json_extract(c.value,'$.active')=1))`}

export function colorPriceSql(g='g',p='p'){return `COALESCE(${g}.price,(SELECT json_extract(c.value,'$.price') FROM json_each(${p}.color_variants) c WHERE json_extract(c.value,'$.id')=${g}.color_variant_id LIMIT 1),${p}.price)`;}
