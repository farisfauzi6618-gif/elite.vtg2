import type {Product,SizeGroup} from './catalog-types';
export type ColorVariant={id:string;name:string;hex:string;swatchType:'COLOR'|'IMAGE';swatchImage:string|null;active:boolean;price:number|null;salePrice?:number|null;discountTitle?:string|null;condition:string|null;defects:string|null;photoKey:string|null;photoKeys:string[]};
export function activeColors(p:Product){return (p.colorVariants??[]).filter(v=>v.active)}
export function groupColor(p:Product,g:SizeGroup){return (p.colorVariants??[]).find(v=>v.id===g.colorVariantId)}
export function colorAvailable(p:Product,g:SizeGroup){return !g.colorVariantId||groupColor(p,g)?.active===true}
export function selectedColorProduct(p:Product,id?:string|null):Product{
 const colors=activeColors(p);if(!colors.length)return p;
 const v=colors.find(v=>v.id===id)??colors.find(v=>v.id===p.defaultColorVariantId)??colors[0];
 return {...p,selectedColorVariantId:v.id,color:v.name,regularPrice:v.price??p.regularPrice??p.price,price:v.price??p.regularPrice??p.price,salePrice:v.salePrice??(p.saleColorsShared?p.salePrice:null),discountTitle:v.salePrice!=null?v.discountTitle:(p.saleColorsShared?p.discountTitle:null),condition:v.condition??p.condition,defects:v.defects??p.defects??'None',photoKey:v.photoKey,photoKeys:v.photoKeys,groups:p.groups.filter(g=>g.colorVariantId===v.id)};
}
export function resolveColorGroups(p:Product):Product{
 return {...p,groups:p.groups.map(g=>{const v=groupColor(p,g);return v?{...g,colorPriceInherited:g.price==null,colorConditionInherited:g.condition==null,colorDefectsInherited:g.defects==null,colorName:v.name,colorActive:v.active,price:g.price??v.price??p.price,condition:g.condition??v.condition??p.condition,defects:g.defects??v.defects??p.defects}:g})};
}
export function colorPhoto(p:Product,g:SizeGroup){return groupColor(p,g)?.photoKey??p.photoKey}
// Used by stock-confirmation gates too: unpublished colors cannot be sold through an old checkout.
export function activeColorSql(g='g',p='p'){return `(${g}.color_variant_id IS NULL OR EXISTS (SELECT 1 FROM json_each(${p}.color_variants) c WHERE json_extract(c.value,'$.id')=${g}.color_variant_id AND json_extract(c.value,'$.active')=1))`}

export function regularColorPriceSql(g='g',p='p'){return `COALESCE(${g}.price,(SELECT json_extract(c.value,'$.price') FROM json_each(${p}.color_variants) c WHERE json_extract(c.value,'$.id')=${g}.color_variant_id LIMIT 1),${p}.price)`;}

// The same server formula is used by reward preview and transaction price rechecks.
export function colorSaleSql(g='g',p='p'){const v=`(SELECT json_extract(c.value,'$.salePrice') FROM json_each(${p}.color_variants) c WHERE json_extract(c.value,'$.id')=${g}.color_variant_id LIMIT 1)`;return `CASE WHEN ${g}.sale_price IS NOT NULL THEN ${g}.sale_price WHEN ${g}.price IS NOT NULL AND ${g}.price!=COALESCE((SELECT json_extract(c.value,'$.price') FROM json_each(${p}.color_variants) c WHERE json_extract(c.value,'$.id')=${g}.color_variant_id LIMIT 1),${p}.price) THEN NULL WHEN ${g}.color_variant_id IS NULL THEN ${p}.sale_price WHEN ${v} IS NOT NULL THEN ${v} WHEN ${p}.sale_colors_shared=1 THEN ${p}.sale_price ELSE NULL END`;}
export function colorPriceSql(g='g',p='p'){const regular=regularColorPriceSql(g,p),sale=colorSaleSql(g,p);return `CASE WHEN (${sale})>0 AND (${sale})<${regular} THEN (${sale}) ELSE ${regular} END`;}
