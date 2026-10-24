import {availableGroups,type Product} from '@/modules/catalog/catalog-types';
import {groupColor} from '@/modules/catalog/color-variants';
import {transactionPrice} from '@/modules/catalog/sale-price';
import {orderingLocked} from '@/modules/catalog/product-schedule';
import type {Lead,WantedRequest,Match} from './types';
import {ACTIVE_STATUSES} from './types';
export const DAY=86400000;
export function terms(value:string){return value.normalize('NFKC').toLowerCase().replace(/\bprl\b/g,'polo ralph lauren').replace(/\bqz\b/g,'quarter zip').replace(/quarterzip|quarter-zip/g,'quarter zip').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ')}
export function containsTerm(haystack:string,needle:string){const source=new Set(terms(haystack).split(' '));return terms(needle).split(' ').filter(Boolean).every(word=>source.has(word))}
export function contactBlock(lead:Lead,cooldownDays:number,now=Date.now()){
 if(lead.doNotContact||lead.contactPreference==='NONE')return 'Do not contact aktif.';
 if(lead.customerArchived)return 'Akun terkait diarsipkan; tinjau izin kontak.';
 if(lead.lastOutreachAt&&['SENT','NO_RESPONSE','NOT_INTERESTED'].includes(lead.lastOutcome??'')&&now-lead.lastOutreachAt<cooldownDays*DAY)return 'Masih dalam jeda kontak; tunggu respons atau akhir cooldown.';
 return null;
}
export function matchingProducts(product:Product,request:WantedRequest,lead:Lead,cooldownDays=3,now=Date.now()):Match[]{
 if(contactBlock(lead,cooldownDays,now)||!ACTIVE_STATUSES.includes(request.status)||product.status!=='published'||product.deletedAt||orderingLocked(product,now))return [];
 const pref=request.preferences;
 return availableGroups(product).flatMap(group=>{
  const variant=groupColor(product,group),color=variant?.name??product.color,price=transactionPrice(product,group);
  if(price==null||price<=0)return [];
  const reasons:string[]=[],missing:string[]=[];let score=0,possible=0,evidence=0,conflict=false;
  function compare(asked:unknown,known:boolean,match:boolean,weight:number,reason:string,unknown:string){if(!asked)return;possible+=weight;if(!known)missing.push(unknown);else if(match){score+=weight;evidence++;reasons.push(reason)}else conflict=true}
  compare(pref.brand,!!product.brand,terms(pref.brand??'')===terms(product.brand),20,'Brand sesuai: '+product.brand,'Brand produk belum tercantum.');
  compare(pref.category,!!product.category,containsTerm([product.category,product.name,...product.features??[]].join(' '),pref.category??''),25,'Kategori/model sesuai: '+pref.category,'Kategori produk belum tercantum.');
  compare(pref.size,group.fits.length>0,group.fits.includes(pref.size??''),25,'Size fit to sesuai: '+pref.size,'Size fit to produk belum diketahui.');
  if(!pref.size)missing.push('Preferensi size belum diketahui.');
  for(const [min,max,value,label] of [[pref.widthMin,pref.widthMax,group.widthCm,'Lebar'],[pref.lengthMin,pref.lengthMax,group.lengthCm,'Panjang']] as const){
   if(min!=null||max!=null){possible+=25;if(value==null)missing.push(label+' aktual produk belum tercantum.');else if((min==null||value>=min)&&(max==null||value<=max)){score+=25;evidence++;reasons.push(label+' aktual '+value+' cm sesuai rentang permintaan.')}else conflict=true}
  }
  compare(pref.colors?.length,!!color,(pref.colors??[]).some(value=>terms(value)===terms(color)),10,'Warna sesuai: '+color,'Warna produk belum tercantum.');
  if(pref.budgetMin!=null||pref.budgetMax!=null){possible+=15;if((pref.budgetMin!=null&&price<pref.budgetMin)||(pref.budgetMax!=null&&price>pref.budgetMax))conflict=true;else{score+=15;evidence++;reasons.push('Harga varian berada dalam budget yang dicatat.')}}else missing.push('Budget belum diketahui.');
  const wantedWords=terms(request.wanted).split(' ').filter(word=>word&&!['cari','ingin','mau','barang','ukuran','warna','yang','untuk','dan','atau','size','fit'].includes(word));
  if(wantedWords.length){possible+=20;const haystack=[product.name,product.brand,product.category,color,...product.features??[]].join(' ');if(wantedWords.every(word=>containsTerm(haystack,word))){score+=20;evidence++;reasons.push('Deskripsi barang yang dicari cocok dengan metadata produk.')}else missing.push('Sebagian detail wanted item perlu diverifikasi manual.');}
  if(conflict||evidence===0)return [];
  const value=possible?Math.round(score/possible*100):0,hasMissingRequired=missing.some(s=>s.includes('produk belum')||s.includes('perlu diverifikasi'));
  const fitEvidence=!!pref.size||((pref.widthMin!=null||pref.widthMax!=null)&&(pref.lengthMin!=null||pref.lengthMax!=null));
  const priority=value>=80&&evidence>=3&&fitEvidence&&!hasMissingRequired?'HIGH':value>=50&&evidence>=2?'MEDIUM':'LOW';
  return [{leadId:lead.id,requestId:request.id,productId:product.id,groupId:group.id,colorId:variant?.id??null,productName:product.name,brand:product.brand,category:product.category,color,size:group.fits.join(' / ')||'Belum diketahui',lengthCm:group.lengthCm,widthCm:group.widthCm,price,priority,score:value,reasons,missing,nextAction:priority==='LOW'||hasMissingRequired?'Lengkapi informasi atau konfirmasi ukuran sebelum membuat penawaran.':'Siapkan draft, periksa stok lagi, lalu tinjau pesan sebelum dikirim manual.',url:'/produk/'+encodeURIComponent(product.id)+(variant?'?color='+encodeURIComponent(variant.id):'')} satisfies Match];
 }).sort((a,b)=>b.score-a.score||a.groupId.localeCompare(b.groupId));
}

export function outreachDraft(lead:Lead,request:WantedRequest,match:Match){
 // Familiarity is never inferred from a purchase, view, or matching score.
 const greeting='Halo kak,',interest=request.wanted?'berdasarkan permintaan yang dicatat untuk '+request.wanted+', ':'';
 const facts=[match.brand,match.productName,match.color?'warna '+match.color:'',match.size!=='Belum diketahui'?'Size fit to '+match.size:'',match.lengthCm!=null?'panjang '+match.lengthCm+' cm':'',match.widthCm!=null?'lebar '+match.widthCm+' cm':''].filter(Boolean).join(' · ');
 const price=new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(match.price);
 return `${greeting} ${interest}ada pilihan ${facts}. Harga ${price}. Detail foto, kondisi, dan ukuran: ${new URL(match.url,process.env.SITE_ORIGIN||'https://elitevtg.com').href}\n\nSilakan dicek jika sesuai. Stok mengikuti ketersediaan saat pemesanan.`;
}
