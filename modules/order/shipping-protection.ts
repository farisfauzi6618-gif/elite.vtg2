import {db,AppError,myOrder} from './order-server';
import {kiriminRatesReady,kiriminSettings,kiriminClient} from './shipping-settings';
import {selectedKiriminRate,validKiriminOrigin} from './kiriminaja';
import type {ShippingQuote} from './shipping-types';
import type {Order} from './order-types';
import {legacyProtection,type ProtectionConfig,type ProtectionFields,type ProtectionQuote} from './shipping-protection-types';

export async function protectionConfig():Promise<ProtectionConfig>{
 const row=await db().prepare('SELECT * FROM shipping_protection_config WHERE id=1').first<{enabled:number;mode:'courier_api'|'jnt_counter';rate_bps:number;rounding_unit:number;version:number}>();
 if(!row)throw new AppError(503,'Pengaturan Shipping Protection belum tersedia. Coba lagi.');
 return {enabled:row.enabled===1,mode:row.mode,rateBps:row.rate_bps,roundingUnit:row.rounding_unit,version:row.version};
}
export async function saveProtectionConfig(value:Record<string,unknown>,actor:string){
 if(Object.keys(value).some(k=>!['enabled','mode','manualAcknowledged'].includes(k))||typeof value.enabled!=='boolean'||!['courier_api','jnt_counter'].includes(String(value.mode)))throw new AppError(400,'Pengaturan Shipping Protection tidak valid.');
 if(value.enabled&&value.mode==='courier_api'&&!await kiriminRatesReady())throw new AppError(409,'Hubungkan API KiriminAja produksi dan wilayah asal terlebih dahulu.');
 if(value.enabled&&value.mode==='jnt_counter'&&value.manualAcknowledged!==true)throw new AppError(400,'Konfirmasikan pembelian perlindungan J&T untuk setiap kiriman.');
 await db().prepare('UPDATE shipping_protection_config SET enabled=?,mode=?,version=version+1,updated_at=?,updated_by=? WHERE id=1').bind(value.enabled,value.mode,Date.now(),actor).run();
 return protectionConfig();
}

export async function checkoutProtectionConfig(request:Request){
 const config=await protectionConfig();
 try{const existing=await myOrder(request);if(!existing.proof_key&&(existing.status==='awaiting_proof'||existing.reservation_status==='AWAITING_DEPOSIT'))return {...config,enabled:existing.shipping_protection_fee==null?false:true};}
 catch(e){if(!(e instanceof AppError)||e.status!==404)throw e;}
 return config;
}

export function configuredJntProtection(value:number,config:ProtectionConfig):ProtectionQuote{
 if(!Number.isSafeInteger(value)||value<=0||value>10000000)throw new AppError(400,'Nilai barang untuk Shipping Protection belum valid.');
 // J&T EZ public tariff: 0.2% of declared goods value. The central database
 // configuration records the rate; integer rupiah round up to avoid underpayment.
 const fee=Math.ceil(value*config.rateBps/(10000*config.roundingUnit))*config.roundingUnit;
 return {fee,declaredValue:value,source:'jnt_counter',policyVersion:config.version,quotedAt:Date.now()};
}

export async function protectShippingQuotes(quotes:ShippingQuote[],value:number,config:ProtectionConfig){
 if(!config.enabled)return quotes;
 if(!Number.isSafeInteger(value)||value<=0||value>10000000)throw new AppError(400,'Isi harga barang sebelum menghitung pengiriman terlindungi.');
 const first=quotes[0];if(!first||first.courier==='jne')throw new AppError(409,'Shipping Protection memerlukan layanan J&T yang didukung.');
 let protectedQuotes:ShippingQuote[];
 if(await kiriminRatesReady()){
  if(quotes.every(q=>q.protection?.source==='kiriminaja'&&q.protection.declaredValue===value&&q.protection.policyVersion===config.version&&q.protection.fee>0))return quotes;
  const {config:sender}=await kiriminSettings();if(!validKiriminOrigin(sender.origin))throw new AppError(409,'Wilayah asal untuk Shipping Protection belum tersedia.');
  const client=await kiriminClient(),destination=await client.destination(first.destination);
  let rates;try{rates=await client.rates(sender.origin,destination,first.grams,value,true,sender)}catch{throw new AppError(503,'Total pengiriman terlindungi belum dapat dihitung. Coba lagi.');}
  protectedQuotes=quotes.map(q=>{
   const rate=selectedKiriminRate(rates,q.service);
   if(!Number.isSafeInteger(rate.insurance)||rate.insurance<=0)throw new AppError(503,'Shipping Protection belum tersedia dari kurir. Coba lagi atau hubungi ELITE.VTG.');
   return {...q,protection:{fee:rate.insurance,declaredValue:value,source:'kiriminaja' as const,policyVersion:config.version,quotedAt:Date.now()}};
  });
 }else{
  if(config.mode!=='jnt_counter')throw new AppError(503,'Layanan Shipping Protection belum terhubung. Coba lagi atau hubungi ELITE.VTG.');
  const protection=configuredJntProtection(value,config);
  // The counter tariff is published for EZ/ECO/HBO. Do not invent Super/DOC fees.
  protectedQuotes=quotes.filter(q=>['EZ','REG','REGULAR','REGULER','ECO','HBO'].includes(q.service.toUpperCase())).map(q=>({...q,protection}));
  if(!protectedQuotes.length)throw new AppError(409,'Shipping Protection belum tersedia untuk layanan ini. Pilih J&T Regular.');
 }
 await db().batch(protectedQuotes.map(q=>db().prepare('UPDATE shipping_quotes SET payload=? WHERE id=?').bind(JSON.stringify(q),q.id)));
 return protectedQuotes;
}

export function protectionFields(quote:ShippingQuote,value:number,config:ProtectionConfig,existing?:Order|null):ProtectionFields{
 // Saved invoices keep their accounting when the program is activated later.
 if(existing&&existing.shipping_protection_fee==null)return {...legacyProtection};
 const required=config.enabled||existing?.shipping_protection_fee!=null,p=quote.protection;
 if(!required){if(p)throw new AppError(409,'Pengaturan Shipping Protection berubah. Cek ulang ongkir sebelum melanjutkan.');return {...legacyProtection};}
 if(!p||p.policyVersion!==config.version||p.declaredValue!==value||!Number.isSafeInteger(p.fee)||p.fee<=0||!['kiriminaja','jnt_counter'].includes(p.source))throw new AppError(409,'Harga barang atau reward berubah. Perbarui Shipping Protection sebelum melanjutkan.');
 return {shipping_protection_fee:p.fee,declared_shipping_value:value,shipping_protection_source:p.source};
}

export function protectedOrderTotal(goods:number,shipping:number,fee:number|null){
 const total=goods+shipping+(fee??0);
 if(!Number.isSafeInteger(total)||total<1||total>10000000)throw new AppError(400,'Total pembayaran termasuk Shipping Protection maksimal Rp10.000.000.');
 return total;
}
