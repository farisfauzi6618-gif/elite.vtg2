import type {Transaction} from '@libsql/client';
import {db,AppError} from './order-server';
import {currentCustomer} from '@/modules/catalog/customers';
import {FIRST_REWARD_ID,ruleAvailable,evaluateReward,exactProductReward,rewardChoice,type RewardRule,type RewardLine,type RewardQuote} from './rewards';
import type {PurchasePromotion} from './first-purchase';
import {purchasePromotion} from './first-purchase-server';
import {orderingLocked} from '@/modules/catalog/product-schedule';
import type {CheckoutLine} from '@/modules/catalog/checkout';
import {catalogQuote} from './catalog-bridge';
type SqlReader=Pick<Transaction,'execute'>;
const ids=(value:unknown)=>{try{const v=JSON.parse(String(value));return Array.isArray(v)&&v.every(x=>typeof x==='string')?v:null;}catch{return null;}};
export async function rewardRules(tx:SqlReader,customerId:string,state:PurchasePromotion,orderId?:string):Promise<RewardRule[]> {
 const confirmed=!!(await tx.execute({sql:"SELECT id FROM orders WHERE customer_id=? AND (confirmed_at IS NOT NULL OR payment_state='payment_confirmed') LIMIT 1",args:[customerId]})).rows[0];
 const firstReserved=state.state==='reserved'&&state.orderId!==orderId||!!(await tx.execute({sql:"SELECT c.order_id FROM purchase_voucher_claims c JOIN purchase_vouchers v ON v.id=c.voucher_id JOIN orders o ON o.id=c.order_id WHERE c.customer_id=? AND c.order_id!=? AND c.redeemed_at IS NULL AND v.first_order_only=1 AND o.status NOT IN ('cancelled','expired') AND (o.proof_key IS NOT NULL OR o.created_at>=?) LIMIT 1",args:[customerId,orderId??'',Date.now()-7*86400000]})).rows[0];
 const rows=(await tx.execute({sql:"SELECT v.*,(SELECT COUNT(*) FROM purchase_voucher_claims c JOIN orders o ON o.id=c.order_id WHERE c.voucher_id=v.id AND c.redeemed_at IS NULL AND c.order_id!=? AND o.status NOT IN ('cancelled','expired') AND (o.proof_key IS NOT NULL OR o.created_at>=?)) AS reserved_count FROM purchase_vouchers v WHERE owner_user_id IS NULL OR owner_user_id=?",args:[orderId??'',Date.now()-7*86400000,customerId]})).rows;
 const rules:RewardRule[]=[];
 for(const row of rows){const categories=ids(row.applicable_categories),products=ids(row.applicable_products);if(!categories||!products)continue;const rule:RewardRule={id:String(row.id),label:String(row.label),ownerUserId:row.owner_user_id==null?null:String(row.owner_user_id),type:row.type as RewardRule['type'],percentage:row.percentage==null?null:Number(row.percentage),fixedAmount:row.fixed_amount==null?null:Number(row.fixed_amount),minimumOrder:Number(row.minimum_order),maximumDiscount:row.maximum_discount==null?null:Number(row.maximum_discount),validFrom:Number(row.valid_from),validUntil:row.valid_until==null?null:Number(row.valid_until),usageLimit:row.usage_limit==null?null:Number(row.usage_limit),usageCount:Number(row.usage_count),reservedCount:Number(row.reserved_count),categories,products,firstOrderOnly:!!row.first_order_only,active:!!row.active};if(ruleAvailable(rule,customerId,confirmed,Date.now()))rules.push(rule);}
 if(!confirmed&&!firstReserved&&(state.state==='available'||state.state==='reserved'&&state.orderId===orderId))rules.unshift({id:FIRST_REWARD_ID,label:'ELITE Reward · Pembelian pertama 5%',ownerUserId:customerId,type:'percentage',percentage:5,fixedAmount:null,minimumOrder:0,maximumDiscount:null,validFrom:0,validUntil:null,usageLimit:1,usageCount:0,reservedCount:0,categories:[],products:[],firstOrderOnly:true,active:true});
 return firstReserved?rules.filter(r=>!r.firstOrderOnly):rules;
}
export function priceRewards(lines:RewardLine[],rules:RewardRule[],choice='auto',loggedIn=true):RewardQuote {
 const subtotal=lines.reduce((sum,l)=>sum+l.amount,0),options=rules.map(r=>evaluateReward(r,lines));
 if(choice!=='auto'&&choice!=='none'&&!options.some(o=>o.id===choice))throw new AppError(409,'Reward sudah tidak berlaku untuk akun ini. Pilih ulang reward.');
 const selected=choice==='none'?null:choice==='auto'?[...options].filter(o=>o.applicable).sort((a,b)=>b.discount-a.discount||a.id.localeCompare(b.id))[0]??null:options.find(o=>o.id===choice)??null;
 if(choice!=='auto'&&choice!=='none'&&!selected?.applicable)throw new AppError(409,selected?.requirement??'Syarat reward belum terpenuhi.');
 const discount=selected?.discount??0;return {subtotal,discount,net:subtotal-discount,selected,options,loggedIn,personalPrice:null};
}
export async function rewardLines(tx:SqlReader,lines:CheckoutLine[]):Promise<RewardLine[]> {
 const result:RewardLine[]=[];for(const line of lines){const p=(await tx.execute({sql:'SELECT category FROM products WHERE id=?',args:[line.productId]})).rows[0];result.push({productId:line.productId,category:p?String(p.category):null,amount:line.unitPrice*line.quantity});}return result;
}
export async function availableRewardCount(cookie:string|null,state:PurchasePromotion){const customer=await currentCustomer(cookie);return customer?(await rewardRules(db().client,customer.id,state)).length:0;}
export async function previewRewards(request:Request,input:any):Promise<RewardQuote> {
 if(!input||typeof input!=='object'||Array.isArray(input)||!['cart','product','checkout','manual'].includes(input.context)||Object.keys(input).some(k=>!['context','lines','productId','catalogToken','itemAmount','choice'].includes(k)))throw new AppError(400,'Permintaan reward tidak valid.');
 let choice:string;try{choice=rewardChoice(input.choice)}catch{throw new AppError(400,'Pilihan reward tidak valid.')}
 const cookie=request.headers.get('cookie'),state=await purchasePromotion(cookie),customer=await currentCustomer(cookie);
 // Only the capability-protected current invoice can reuse its own reservation.
 let orderId:string|undefined;
 const {myOrder}=await import('./order-server');try{const o=await myOrder(request);if(o.status==='awaiting_proof'&&o.customer_id===customer?.id&&(input.context==='manual'&&!o.catalog_checkout_id||input.context==='checkout'&&o.catalog_token===input.catalogToken))orderId=o.id;}catch(e){if(!(e instanceof AppError)||e.status!==404)throw e;}
 const tx=await db().client.transaction('read');
 try{
  let lines:RewardLine[],uniform=true,orderable=true;
  if(input.context==='manual'){const n=input.itemAmount;if(!Number.isSafeInteger(n)||n<1000||n>10000000)throw new AppError(400,'Harga barang belum valid.');lines=[{productId:null,category:null,amount:n}];}
  else if(input.context==='checkout'){const q=await catalogQuote(input.catalogToken);lines=await rewardLines(tx,q.lines);}
  else if(input.context==='product'){
   if(typeof input.productId!=='string'||input.productId.length>100)throw new AppError(400,'Produk tidak valid.');
   const p=(await tx.execute({sql:"SELECT * FROM products WHERE id=? AND status='published'",args:[input.productId]})).rows[0];if(!p)throw new AppError(404,'Produk belum tersedia.');
   const groups=(await tx.execute({sql:'SELECT qty,price FROM size_groups WHERE product_id=?',args:[input.productId]})).rows,prices=groups.filter(g=>Number(g.qty)>0).map(g=>Number(g.price??p.price));orderable=prices.length>0&&!p.sold_at&&!orderingLocked({orderableAt:p.orderable_at as string|null});uniform=new Set(prices).size===1;const amount=prices[0]??Number(p.price??0);lines=[{productId:String(p.id),category:String(p.category),amount:Number.isSafeInteger(amount)?amount:0}];
  }else{
   if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>20)throw new AppError(400,'Pilih 1 sampai 20 barang.');
   const grouped=new Map<string,{productId:string;groupId:string;quantity:number}>();
   for(const l of input.lines){if(typeof l?.productId!=='string'||l.productId.length>100||typeof l.groupId!=='string'||l.groupId.length>100||!Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>20)throw new AppError(400,'Pilihan barang tidak valid.');const previous=grouped.get(l.groupId);if(previous&&previous.productId!==l.productId)throw new AppError(400,'Ukuran tidak cocok.');grouped.set(l.groupId,{...l,quantity:l.quantity+(previous?.quantity??0)});}
   lines=[];let quantity=0;for(const l of grouped.values()){const p=(await tx.execute({sql:"SELECT p.category,p.price,p.status,p.sold_at,p.orderable_at,g.price AS group_price,g.qty FROM products p JOIN size_groups g ON g.product_id=p.id WHERE p.id=? AND g.id=?",args:[l.productId,l.groupId]})).rows[0];if(!p||p.status!=='published'||p.sold_at||Number(p.qty)<l.quantity||orderingLocked({orderableAt:p.orderable_at as string|null}))throw new AppError(409,'Stok pilihan berubah atau belum bisa dipesan.');const price=Number(p.group_price??p.price);if(!Number.isSafeInteger(price)||price<1000)throw new AppError(409,'Harga barang belum tersedia.');quantity+=l.quantity;lines.push({productId:l.productId,category:String(p.category),amount:price*l.quantity});}if(quantity>20)throw new AppError(400,'Maksimal 20 unit.');
  }
  if(lines.reduce((sum,l)=>sum+l.amount,0)>10000000)throw new AppError(400,'Harga barang maksimal Rp10.000.000.');
  const rules=customer?await rewardRules(tx,customer.id,state,orderId):[],quote=priceRewards(lines,rules,choice,!!customer);
  if(input.context==='product') {const rule=rules.find(r=>r.id===quote.selected?.id);quote.personalPrice=orderable&&uniform&&rule&&exactProductReward(rule)?quote.net:null;if(!orderable)quote.selected=null;}
  await tx.commit();return quote;
 }finally{tx.close();}
}
