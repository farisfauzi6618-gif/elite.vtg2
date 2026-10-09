import {suggestTaxonomy,hasFeatureText,DEFAULT_FEATURES,type Feature} from '@/modules/catalog/taxonomy';
import { FITS, type Product, type SizeGroup } from '@/modules/catalog/catalog-types';
export function normalizeInstagramUrl(raw:string){
 let url:URL;try{url=new URL(raw.trim())}catch{throw new Error('Tempel URL Instagram lengkap (https://www.instagram.com/p/…).')}
 if(!['instagram.com','www.instagram.com'].includes(url.hostname.toLowerCase())||url.protocol!=='https:'||url.username||url.password||url.port)throw new Error('Gunakan link postingan Instagram yang valid.');
 const m=url.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)\/?$/);if(!m)throw new Error('Gunakan link satu postingan atau reel, bukan profil atau story.');
 return {shortcode:m[2],url:`https://www.instagram.com/${m[1]}/${m[2]}/`};
}
function valueFromLabel(text:string,labels:string){const matches=[...text.matchAll(new RegExp(`(?:^|\\n|[,;])\\s*(?:${labels})\\s*[:=]\\s*([^\\n,;]+)`,'gim'))].map(m=>m[1].trim());const unique=[...new Set(matches)];return unique.length===1?unique[0]:null}
function amount(v:string){const m=v.match(/^(\d+(?:[.,]\d+)*)(?:\s*(k|rb|ribu))?$/i);if(!m)return null;let n=m[2]?Number(m[1].replace(',','.'))*1000:Number(m[1].replace(/[.,]/g,''));return Number.isSafeInteger(n)&&n>=0&&n<=1e9?n:null}
function extractPrice(text:string):number|null{
 const cleaned=text.split('\n').filter(l=>!/(shopee|admin|ongkir|shipping|diskon|discount)/i.test(l)).join('\n');
 const found=[...cleaned.matchAll(/\b(?:idr|rp\.?|harga|price)\s*[:=]?\s*(\d+(?:[.,]\d+)*(?:\s*(?:ribu|rb|k)\b)?)/gi)].map(m=>amount(m[1]));
 if(/(?:idr|rp|harga|price)[^\n]*(?:\d\s*[-–]\s*\d|\d[\d.,]*\s*(?:atau|or|\/|[-–])\s*(?:rp|idr)?\s*\d)/i.test(cleaned))return null;
 const unique=[...new Set(found.filter((n):n is number=>n!=null))];return unique.length===1?unique[0]:null;
}
export function parseFit(raw:string){
 const tokens=raw.toUpperCase().match(/\b(?:XXS|XS|S|M|L|XL|XXL|3XL|4XL)\b/g)??[];
 const unique=[...new Set(tokens)];if(/one\s*size|all\s*size/i.test(raw))return ['One size'];
 if(unique.length===2&&/[-–—]|\b(?:sampai|to)\b/i.test(raw)){const a=FITS.indexOf(unique[0]),b=FITS.indexOf(unique[1]);if(a>=0&&b>=a)return FITS.slice(a,b+1)}
 return FITS.filter(f=>unique.includes(f));
}
function groupFromText(t:string,index:number):SizeGroup{
 const fitMatch=t.match(/\bfit\s*[:=]?\s*((?:xxs|xxl|xs|xl|3xl|4xl|s|m|l)\b(?:\s*(?:[-–—\/,]|to|sampai)\s*(?:xxs|xxl|xs|xl|3xl|4xl|s|m|l)\b)*|one\s*size|all\s*size)/i);
 const tag=t.match(/\b(?:size\s*tag|tag\s*size|tag|size)\s*[:=]?\s*(xxs|xs|s|m|l|xl|xxl|3xl|4xl|\d{2,3})\b/i);
 const qtyValues=[...t.matchAll(/\b(\d+)\s*(?:pcs?|pieces?|unit|buah)\b/gi)].map(m=>Number(m[1]));
 const qtyLabel=t.match(/\b(?:jumlah|qty|quantity|stok)\s*[:=]\s*(\d+)\b/i);if(qtyLabel)qtyValues.push(Number(qtyLabel[1]));
 const q=[...new Set(qtyValues)];const qty=q.length===1&&q[0]<=100000&&!/\d+\s*[-–—]\s*\d+\s*(?:pcs?|unit|buah)|(?:sekitar|about|kurang|lebih|sisa\s*\?)|\d+\s*pcs?\s*(?:per|masing)/i.test(t)?q[0]:null;
 const lengthMatches=[...t.matchAll(/\b(?:panjang|length|p)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*cm\b/gi)];
 const widthMatches=[...t.matchAll(/\b(?:lebar|width|l)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*cm\b/gi)];
 const length=lengthMatches.length&&new Set(lengthMatches.map(m=>m[1])).size===1?lengthMatches[0]:null;
 const width=widthMatches.length&&new Set(widthMatches.map(m=>m[1])).size===1?widthMatches[0]:null;
 const pair=t.match(/\b(?:p\s*[x×/]\s*l|length\s*[x×/]\s*width)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*[x×/]\s*(\d+(?:[.,]\d+)?)/i);
 const condition=valueFromLabel(t,'kondisi|condition');const defects=valueFromLabel(t,'minus|defects?|flaws?');
 const fits=fitMatch?parseFit(fitMatch[1]):[];
 return {id:'',label:fitMatch?`Fit ${fitMatch[1].trim().toUpperCase().replace(/\s*[-–—]\s*/g,'–')}`:`Kelompok ${index+1}`,tagSize:tag?.[1]?.toUpperCase()??'',fits,lengthCm:length?Number(length[1].replace(',','.')):pair&&/cm\b/i.test(t)?Number(pair[1].replace(',','.')):null,widthCm:width?Number(width[1].replace(',','.')):pair&&/cm\b/i.test(t)?Number(pair[2].replace(',','.')):null,qty,price:extractPrice(t),condition,defects,revision:0,sortOrder:index};
}
export function parseCaption(caption:string,features:Feature[]=DEFAULT_FEATURES){
 const c=caption.replace(/\r\n?/g,'\n').trim().slice(0,20000);
 const warnings:string[]=[];
 const lines=c.split('\n').map(l=>l.trim());
 // An explicit Stock/Size/Fit block is a single inventory group, even when Fit S–M spans two filters.
 let starts:number[]=[];
 lines.forEach((l,i)=>{if(/^(?:stok|stock)\s*\d*\s*[:.)-]/i.test(l))starts.push(i)});
 if(!starts.length)lines.forEach((l,i)=>{if(/^\d+\s*(?:pcs?|unit|buah)\b.*\bfit\b/i.test(l)||/^fit\s*[:=]?\s*(?:xxs|xs|s|m|l|xl|xxl|3xl|4xl|one\s*size)\b/i.test(l))starts.push(i)});
 if(!starts.length)lines.forEach((l,i)=>{if(/^\s*(?:size\s*tag|tag\s*size|size)\s*[:=]?\s*(?:xxs|xs|s|m|l|xl|xxl|3xl|4xl|\d{2,3})\b/i.test(l))starts.push(i)});
 starts=starts.map(i=>i>0&&/^(?:size\s*tag|tag\s*size|tag)\s*[:=]?/i.test(lines[i-1])?i-1:i);
 const hasSizes=/\b(?:fit|size|panjang|lebar|pcs|unit|stok|stock)\b/i.test(c);
 const global=starts.length?lines.slice(0,starts[0]).join('\n'):c;
 const groups=starts.length?starts.map((start,i)=>groupFromText(lines.slice(start,starts[i+1]??lines.length).join('\n'),i)):hasSizes?[groupFromText(c,0)]:[];
 const name=valueFromLabel(global,'nama(?: barang)?|name|produk')??lines.find(l=>l&&!/^(?:idr|rp|harga|price|fit|size|stok|stock|kondisi|condition|minus|shopee|#|available|sold)/i.test(l)&&!/very\s+good\s+condition/i.test(l))??'';
 const brand=valueFromLabel(global,'brand|merek')??(/\b(?:PRL|Polo Ralph Lauren|Ralph Lauren)\b/i.test(name)?'PRL':/\bBurberry\b/i.test(name)?'Burberry':/\bLacoste\b/i.test(name)?'Lacoste':/\bTommy(?: Hilfiger)?\b/i.test(name)?'Tommy Hilfiger':/\bBrooks(?: Brothers)?\b/i.test(name)?'Brooks Brothers':'');
 const taxonomy=suggestTaxonomy(name,valueFromLabel(global,'kategori|category')??'',global.split('\n').filter(l=>/^(?:bahan|material|fabric|ciri|features?)\s*[:=]/i.test(l)).join(' '),features);const category=taxonomy.category;
 const featureIds=features.filter(f=>hasFeatureText(global,f)).map(f=>f.id);
 const color=valueFromLabel(global,'warna|color|colour')??name.match(/(?:[-–—]\s*)(white|black|navy|blue|green|red|brown|beige|grey|gray|cream|pink|yellow|putih|hitam|biru|hijau|cokelat|abu[ -]?abu)\b/i)?.[1]??'';
 const price=extractPrice(global);
 const conditionPhrases=[...new Set([...global.matchAll(/\b(?:very good|good|excellent|fair|new|like new)\s+condition\.?/gi)].map(m=>m[0]))];
 const condition=/(?:^|\n|[,;])\s*(?:kondisi|condition)\s*[:=]/i.test(global)?valueFromLabel(global,'kondisi|condition'):conditionPhrases.length===1?conditionPhrases[0]:null;
 const defects=valueFromLabel(global,'minus|defects?|flaws?');
 if(!name)warnings.push('Nama barang belum ditemukan.');if(!brand)warnings.push('Brand belum ditemukan.');if(!category)warnings.push('Kategori utama belum jelas; periksa jenis barang, bukan hanya bukaan atau kerahnya.');if(!color)warnings.push('Warna belum ditemukan.');
 if(price==null&&!groups.length)warnings.push('Harga belum ditemukan atau ambigu.');
 if(condition==null)warnings.push('Kondisi belum ditemukan.');if(defects==null)warnings.push('Minus belum ditemukan; isi “Tidak ada” hanya setelah diperiksa.');
 if(!groups.length)warnings.push('Kelompok ukuran dan jumlah stok belum ditemukan.');
 groups.forEach((g,i)=>{if(g.qty==null)warnings.push(`Kelompok ${i+1}: jumlah stok belum jelas.`);if(!g.fits.length)warnings.push(`Kelompok ${i+1}: fit belum jelas; size tag tidak otomatis menjadi fit.`);if(g.lengthCm==null||g.widthCm==null)warnings.push(`Kelompok ${i+1}: ukuran aktual belum lengkap.`);if(g.price==null&&price==null)warnings.push(`Kelompok ${i+1}: harga belum jelas.`)});
 if(/\b(?:sold|habis|available|tersedia)\b/i.test(c))warnings.push('Caption dapat memuat informasi stok lama; pastikan stok fisik saat ini.');
 warnings.push('Jumlah stok hasil caption belum dikonfirmasi sebagai stok terkini.');
 return {name,brand,category,features:featureIds,color,price,condition,defects,groups,warnings};
}
