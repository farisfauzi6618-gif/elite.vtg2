import {db} from './order-server';
import type {Order} from './order-types';
import {choiceLabel,type Product} from '@/modules/catalog/catalog-types';
import {productShareUrl} from '@/modules/catalog/product-share';

type SoldLine={productId?:string;groupId?:string;name?:string;label?:string;quantity:number;brand?:string;color?:string;size?:string;sku?:string;productCode?:string;colorVariantId?:string};
type Metadata={id:string;name:string;brand:string;color:string;shortcode:string;status:string;deleted_at:string|null;variants:string;group_id:string|null;fits:string|null;length_cm:number|null;width_cm:number|null;color_variant_id:string|null};
const identifier=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
function text(value:unknown){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').trim():'';}
function optional(value:unknown){const result=text(value);return /^(?:-|—|unknown|not specified|belum ditentukan|none|null|n\/a)$/i.test(result)?'':result;}
function array(value:unknown):unknown[]{try{const parsed=typeof value==='string'?JSON.parse(value):value;return Array.isArray(parsed)?parsed:[]}catch{return []}}
function lines(value:unknown):SoldLine[]{return array(value).flatMap(raw=>{
 if(!raw||typeof raw!=='object')return [];
 const row=raw as Record<string,unknown>;
 if(!Number.isSafeInteger(row.quantity)||Number(row.quantity)<1)return [];
 return [{productId:identifier(row.productId)?row.productId:undefined,groupId:identifier(row.groupId)?row.groupId:undefined,quantity:Number(row.quantity),name:text(row.name),label:text(row.label),brand:optional(row.brand),color:optional(row.color),size:optional(row.size),sku:optional(row.sku),productCode:optional(row.productCode),colorVariantId:identifier(row.colorVariantId)?row.colorVariantId:undefined}];
});}
const words=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function contains(value:string,part:string){return (' '+words(value)+' ').includes(' '+words(part)+' ');}

export function soldProductDetails(snapshot:SoldLine[],metadata:Metadata[]){
 const blocks=snapshot.flatMap(line=>{
  const product=metadata.find(row=>row.id===line.productId),group=metadata.find(row=>row.id===line.productId&&row.group_id===line.groupId);
  const variants=array(product?.variants).filter((v):v is {id:string;name:string;active:boolean|number}=>!!v&&typeof v==='object'&&identifier((v as any).id)&&typeof (v as any).name==='string');
  const candidate=variants.find(v=>v.id===(line.colorVariantId||group?.color_variant_id));
  const fits=array(group?.fits).filter((fit):fit is string=>typeof fit==='string');
  const sameGroup=!!group&&!!line.label&&line.label===choiceLabel({fits,lengthCm:group.length_cm,widthCm:group.width_cm,colorName:candidate?.name});
  // Legacy snapshots have product/group IDs plus a historical choice label, but
  // no color ID. Verify that label against the relation before selecting a color.
  const variant=candidate&&(line.colorVariantId||sameGroup)?candidate:null;
  const needsVariant=variants.length>0||!!group?.color_variant_id||!!line.colorVariantId;
  const name=line.name||text(product?.name);if(!name)return [];
  const brand=line.brand||optional(product?.brand),color=line.color||optional(variant?.name)||(!needsVariant?optional(product?.color):'');
  const title=[brand,name,...(color&&!contains(name,color)?[color]:[])].filter(Boolean).join(' — ');
  const size=line.size||(sameGroup?fits.join(' / '):optional(line.label));
  // shortcode is the existing imported product/post code; local_* only identifies
  // draft creation and is not a SKU. Never display that internal placeholder.
  const code=line.sku||line.productCode||(product&&!/^local_/i.test(product.shortcode)?optional(product.shortcode):'');
  let url='';
  if(product?.status==='published'&&!product.deleted_at&&(!needsVariant||variant?.active===true||variant?.active===1)){
   try{url=productShareUrl({id:product.id,status:'published',...(variant?{selectedColorVariantId:variant.id}:{})} as Product)}catch{/* Preserve verified text when the public reference cannot be generated. */}
  }
  return [[title,...(size?['Size: '+size]:[]),...(code?['Code: '+code]:[]),...(line.quantity>1?['Quantity: '+line.quantity]:[]),...(url?['View Product: '+url]:[])].join('\n')];
 });
 return blocks.length?'PRODUCT DETAILS\n\n'+blocks.map((block,index)=>(index+1)+'. '+block).join('\n\n'):'';
}

export function appendSoldDetails(original:string,details:string,limit=4096){
 if(!details)return [original];
 const combined=original+'\n\n'+details;if(combined.length<=limit)return [combined];
 const messages:string[]=[];let remaining=combined,first=true;
 while(remaining.length){
  if(remaining.length<=limit){messages.push(remaining);break;}
  let end=remaining.lastIndexOf('\n\n',limit);
  if(end<=0||first&&end<original.length)end=remaining.lastIndexOf('\n',limit);
  if(end<=0||first&&end<original.length)end=limit;
  // A maximal existing message stays intact; only the addition moves to a fallback.
  if(first&&original.length>=limit)end=original.length;
  if(end<remaining.length&&/[\uD800-\uDBFF]/.test(remaining[end-1])&&/[\uDC00-\uDFFF]/.test(remaining[end]))end--;
  messages.push(remaining.slice(0,end));remaining=remaining.slice(end);first=false;
 }
 return messages;
}

export async function catalogSoldTexts(order:Order,original:string){
 let snapshot=lines(order.catalog_items_json);
 if(!snapshot.length&&order.catalog_checkout_id){try{const row=await db().prepare('SELECT lines_json FROM catalog_checkouts WHERE id=?').bind(order.catalog_checkout_id).first<{lines_json:string}>();snapshot=lines(row?.lines_json)}catch{/* Original notification remains available. */}}
 if(!snapshot.length)return [original];
 const ids=[...new Set(snapshot.map(line=>line.productId).filter(identifier))],groups=[...new Set(snapshot.map(line=>line.groupId).filter(identifier))];
 let metadata:Metadata[]=[];
 if(ids.length)try{
  const query=`SELECT p.id,p.name,p.brand,p.color,p.shortcode,p.status,p.deleted_at,
   (SELECT json_group_array(json_object('id',json_extract(v.value,'$.id'),'name',json_extract(v.value,'$.name'),'active',json_extract(v.value,'$.active'))) FROM json_each(p.color_variants) v) AS variants,
   g.id AS group_id,g.fits,g.length_cm,g.width_cm,g.color_variant_id
   FROM products p LEFT JOIN size_groups g ON g.product_id=p.id AND ${groups.length?'g.id IN ('+groups.map(()=>'?').join(',')+')':'0'}
   WHERE p.id IN (${ids.map(()=>'?').join(',')})`;
  metadata=(await db().prepare(query).bind(...groups,...ids).all<Metadata>()).results;
 }catch{/* Missing metadata must not prevent the existing SOLD notification. */}
 return appendSoldDetails(original,soldProductDetails(snapshot,metadata));
}
