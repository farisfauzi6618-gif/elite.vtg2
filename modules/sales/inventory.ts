import {db,productFromRow,groupFromRow} from '@/modules/catalog/server';
import {reservedQuantitySql} from '@/modules/catalog/reserve-inventory';
import type {Product} from '@/modules/catalog/catalog-types';
import {leadsByIds,requestRow} from './leads';
import {contactBlock,matchingProducts} from './matching';
import type {Lead,WantedRequest,Match} from './types';
export async function salesConfig(){return await db().prepare('SELECT cooldown_days FROM sales_config WHERE id=1').first<{cooldown_days:number}>()??{cooldown_days:3}}
export async function salesInventory(){
 const d=db(),rows=await d.prepare(`SELECT id,name,brand,category,color,price,sale_price,sale_colors_shared,condition,defects,photo_key,'[]' AS photo_keys,feature_ids,'' AS shortcode,'' AS instagram_url,'' AS caption,'' AS description,'[]' AS warnings,reviewed,status,created_at,updated_at,published_at,orderable_at,sold_at,sold_hidden,version,default_color_variant_id,COALESCE((SELECT json_group_array(json_remove(value,'$.photoKeys','$.swatchImage')) FROM json_each(products.color_variants)),'[]') AS color_variants FROM products WHERE deleted_at IS NULL AND status='published' AND (orderable_at IS NULL OR julianday(orderable_at)<=julianday('now')) AND EXISTS(SELECT 1 FROM size_groups g WHERE g.product_id=products.id AND g.qty>0) ORDER BY published_at DESC,id LIMIT 301`).all<any>();
 const capped=rows.results.length>300,products=rows.results.slice(0,300);if(!products.length)return {products:[] as Product[],capped};
 const groups=await d.prepare(`SELECT g.*,${reservedQuantitySql('g')} AS reserved_qty FROM size_groups g WHERE g.product_id IN (${products.map(()=>'?').join(',')}) ORDER BY g.product_id,g.sort_order,g.id LIMIT 3001`).bind(...products.map(p=>p.id)).all<any>();
 const byProduct=new Map<string,ReturnType<typeof groupFromRow>[]>();for(const row of groups.results.slice(0,3000)){const list=byProduct.get(row.product_id)??[];list.push(groupFromRow(row));byProduct.set(row.product_id,list)}
 return {products:products.map(p=>productFromRow(p,byProduct.get(p.id)??[])),capped:capped||groups.results.length>3000};
}
export async function wantedCandidates(leadId?:string){
 const rows=await db().prepare(`SELECT r.* FROM sales_requests r JOIN sales_leads l ON l.id=r.lead_id WHERE r.status IN ('OPEN','MATCHED','CONTACTED','INTERESTED') AND l.do_not_contact=0 AND l.contact_preference!='NONE' AND (?='' OR r.lead_id=?) ORDER BY r.updated_at DESC,r.id LIMIT 201`).bind(leadId??'',leadId??'').all();
 const requests=rows.results.slice(0,200).map(requestRow),leads=new Map<string,Lead>();
 // One bounded batch avoids a customer lookup for every possible product pair.
 const ids=[...new Set(requests.map(r=>r.leadId))];for(const lead of await leadsByIds(ids))leads.set(lead.id,lead);
 return {requests,leads,capped:rows.results.length>200};
}
export function matchInventory(products:Product[],requests:WantedRequest[],leads:Map<string,Lead>,cooldownDays:number,now=Date.now()){
 const matches:Match[]=[];for(const request of requests){const lead=leads.get(request.leadId);if(!lead)continue;for(const product of products){const best=matchingProducts(product,request,lead,cooldownDays,now)[0];if(best)matches.push(best)}}
 const weights={HIGH:3,MEDIUM:2,LOW:1};return matches.sort((a,b)=>weights[b.priority]-weights[a.priority]||b.score-a.score||a.productId.localeCompare(b.productId));
}
export async function recommendations(leadId?:string){
 const [inventory,wanted,config]=await Promise.all([salesInventory(),wantedCandidates(leadId),salesConfig()]);
 const matches=matchInventory(inventory.products,wanted.requests,wanted.leads,config.cooldown_days);
 return {generatedAt:Date.now(),matches:matches.slice(0,100).map(({score,...match})=>({...match,leadName:wanted.leads.get(match.leadId)?.name||wanted.leads.get(match.leadId)?.instagram||'Prospek'})),capped:inventory.capped||wanted.capped||matches.length>100,analyzed:{products:inventory.products.length,requests:wanted.requests.length},cooldownDays:config.cooldown_days,blocks:[...wanted.leads.values()].map(lead=>({leadId:lead.id,reason:contactBlock(lead,config.cooldown_days)})).filter(row=>row.reason)};
}
