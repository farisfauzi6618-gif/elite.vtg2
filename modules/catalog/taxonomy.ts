export const CATEGORIES=['Polo','Kemeja','Sweater & Knitwear','Sweatshirt & Hoodie','Kaos','Jaket & Outerwear'];
export const FEATURE_GROUPS=[{id:'opening',label:'Bukaan'},{id:'knit',label:'Rajutan'},{id:'sleeve',label:'Lengan'},{id:'style',label:'Model/kerah'}];
export type Feature={id:string;label:string;groupId:string;aliases:string[]};
export const DEFAULT_FEATURES:Feature[]=[
 {id:'quarter-zip',label:'Quarter Zip',groupId:'opening',aliases:['Quarterzip']},
 {id:'half-zip',label:'Half Zip',groupId:'opening',aliases:['Halfzip']},
 {id:'full-zip',label:'Full Zip',groupId:'opening',aliases:['Fullzip']},
 {id:'half-button',label:'Half Button',groupId:'opening',aliases:['Halfbutton']},
 {id:'cable-knit',label:'Cable Knit',groupId:'knit',aliases:['Cableknit','Cable Knits']},
 {id:'long-sleeve',label:'Long Sleeve',groupId:'sleeve',aliases:['Longsleeve','Long Sleeves','Lengan panjang']},
 {id:'short-sleeve',label:'Short Sleeve',groupId:'sleeve',aliases:['Shortsleeve','Short Sleeves','Lengan pendek']},
 {id:'crewneck',label:'Crewneck',groupId:'style',aliases:['Crew Neck']},
 {id:'hoodie',label:'Hoodie',groupId:'style',aliases:['Hooded']},
];
export type Taxonomy={categories:string[];groups:typeof FEATURE_GROUPS;features:Feature[]};
export const QUICK_FILTERS=[{id:'quarter-zip',label:'Quarter Zip',features:['quarter-zip']},{id:'half-zip',label:'Half Zip',features:['half-zip']},{id:'cable-knit',label:'Cable Knit',features:['cable-knit']},{id:'polo-long-sleeve',label:'Polo Long Sleeve',features:['long-sleeve'],category:'Polo'}];
export function plainText(s:string){return s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ')}
export function termKey(s:string){return plainText(s).replace(/ /g,'')}
function escaped(s:string){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function aliasPattern(s:string){return new RegExp('(?:^| )'+[...termKey(s)].map(escaped).join(' *')+'(?= |$)','g')}
export function hasFeatureText(s:string,f:Feature){const text=plainText(s);return [f.label,...f.aliases].some(a=>aliasPattern(a).test(text))}
export function normalizeSearch(s:string,features:Feature[]=DEFAULT_FEATURES){let text=plainText(s);const replacements=features.flatMap(f=>[f.label,...f.aliases].map(a=>({a,label:plainText(f.label)}))).sort((a,b)=>b.a.length-a.a.length);for(const {a,label} of replacements)text=text.replace(aliasPattern(a),match=>(match.startsWith(' ')?' ':'')+label);return text}
export function mainCategory(s:string){const key=termKey(s);const direct=CATEGORIES.find(c=>termKey(c)===key);if(direct)return direct;const legacy:Record<string,string>={shirt:'Kemeja',shirts:'Kemeja',kemeja:'Kemeja',polo:'Polo',tshirt:'Kaos',tshirts:'Kaos',kaos:'Kaos',knitwear:'Sweater & Knitwear',sweater:'Sweater & Knitwear',sweaters:'Sweater & Knitwear',sweatshirt:'Sweatshirt & Hoodie',sweatshirts:'Sweatshirt & Hoodie',jaket:'Jaket & Outerwear',jacket:'Jaket & Outerwear',jackets:'Jaket & Outerwear',outerwear:'Jaket & Outerwear'};return legacy[key]??''}
export function suggestTaxonomy(name:string,explicitCategory='',extra='',features:Feature[]=DEFAULT_FEATURES){
 const text=normalizeSearch(name+' '+extra,features).replace(/\bpolo ralph lauren\b|\bralph lauren\b/g,'');
 const candidates=new Set<string>();
 if(/\b(?:knit|knits|knitwear|knitted|sweater|rajut)\b/.test(text))candidates.add('Sweater & Knitwear');
 if(/\b(?:sweatshirt|sweat shirt|fleece)\b/.test(text))candidates.add('Sweatshirt & Hoodie');
 const polo=/\bpolo\b/.test(text),tee=/\b(?:t shirt|tshirt|tee|kaos)\b/.test(text);
 if(polo)candidates.add('Polo');if(tee)candidates.add('Kaos');
 if(!polo&&!tee&&/\b(?:shirt|shirts|kemeja)\b/.test(text))candidates.add('Kemeja');
 if(/\b(?:jacket|jaket|outerwear|coat|windbreaker)\b/.test(text))candidates.add('Jaket & Outerwear');
 const category=mainCategory(explicitCategory)||(candidates.size===1?[...candidates][0]:'');
 const selected=features.filter(f=>hasFeatureText(name+' '+extra+' '+explicitCategory,f)).map(f=>f.id);
 return {category,features:selected,categoryNeedsReview:!category};
}
export function selectedValues(v:string|string[]|undefined){return [...new Set((Array.isArray(v)?v:(v??'').split('|')).filter(x=>x&&x!=='all'))]}
export function matchesFeatures(ids:string[],selection:string|string[]|undefined,features:Feature[]){
 const chosen=selectedValues(selection);if(!chosen.length)return true;
 const groups=new Map<string,string[]>();for(const id of chosen){const f=features.find(f=>f.id===id);if(!f)return false;groups.set(f.groupId,[...(groups.get(f.groupId)??[]),id])}
 return [...groups.values()].every(alternatives=>alternatives.some(id=>ids.includes(id)));
}
