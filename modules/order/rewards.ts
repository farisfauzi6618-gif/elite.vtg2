// One rule evaluator for both the existing first-purchase reward and additional vouchers.
export const FIRST_REWARD_ID='first-purchase-5';
export type RewardRule={id:string;label:string;ownerUserId:string|null;type:'percentage'|'fixed';percentage:number|null;fixedAmount:number|null;minimumOrder:number;maximumDiscount:number|null;validFrom:number;validUntil:number|null;usageLimit:number|null;usageCount:number;reservedCount:number;categories:string[];products:string[];firstOrderOnly:boolean;active:boolean};
export type RewardLine={productId:string|null;category:string|null;amount:number};
export type RewardOption={id:string;label:string;discount:number;applicable:boolean;requirement:string|null};
export type RewardQuote={subtotal:number;discount:number;net:number;selected:RewardOption|null;options:RewardOption[];loggedIn:boolean;personalPrice:number|null};
export function rewardChoice(value:unknown){if(value===undefined)return 'auto';if(typeof value!=='string'||!(/^[a-zA-Z0-9_-]{1,100}$/.test(value)))throw Error('Pilihan reward tidak valid.');return value;}
export function ruleAvailable(rule:RewardRule,customerId:string,hasConfirmed:boolean,now:number){return rule.active&&(!rule.ownerUserId||rule.ownerUserId===customerId)&&rule.validFrom<=now&&(rule.validUntil==null||now<rule.validUntil)&&(!rule.firstOrderOnly||!hasConfirmed)&&(rule.usageLimit==null||rule.usageCount+rule.reservedCount<rule.usageLimit);}
export function evaluateReward(rule:RewardRule,lines:RewardLine[]):RewardOption {
 const subtotal=lines.reduce((sum,l)=>sum+l.amount,0),eligible=lines.filter(l=>(!rule.products.length||!!l.productId&&rule.products.includes(l.productId))&&(!rule.categories.length||!!l.category&&rule.categories.includes(l.category))).reduce((sum,l)=>sum+l.amount,0);
 let requirement:string|null=null,discount=0;
 if(!eligible)requirement='Reward berlaku untuk pilihan produk lain.';
 else if(subtotal<rule.minimumOrder)requirement=`Tambah Rp${new Intl.NumberFormat('id-ID').format(rule.minimumOrder-subtotal)} lagi untuk menggunakan reward ini.`;
 else {const raw=rule.type==='percentage'?Math.floor(eligible*(rule.percentage??0)/100):(rule.fixedAmount??0);discount=Math.max(0,Math.min(eligible,raw,rule.maximumDiscount??eligible));}
 return {id:rule.id,label:rule.label,discount,applicable:discount>0,requirement};
}
export function exactProductReward(rule:RewardRule){return rule.type==='percentage'&&rule.minimumOrder===0&&rule.maximumDiscount==null;}
