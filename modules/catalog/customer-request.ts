import type {CustomerProfile} from './customer-types';
import type {PurchasePromotion} from '../order/first-purchase';
type CustomerReply={customer:CustomerProfile|null;promotion:PurchasePromotion;rewardCount?:number};

// Share only an outstanding request, never a completed account response.
export function createCustomerReader(fetcher:typeof fetch=fetch){
 let epoch=0,pending:Promise<CustomerReply>|null=null;
 function invalidate(){epoch++;pending=null;}
 function read():Promise<CustomerReply>{
  if(pending)return pending;
  const started=epoch;
  const current=fetcher('/api/customer',{cache:'no-store'}).then(async reply=>{
   if(!reply.ok)throw Error('Akun belum dapat dimuat.');return await reply.json() as CustomerReply;
  }).then(value=>started===epoch?value:read(),error=>{if(started!==epoch)return read();throw error})
   .finally(()=>{if(pending===current)pending=null});
  pending=current;return current;
 }
 return {read,invalidate};
}
const customerReader=createCustomerReader();
export const readCustomer=customerReader.read;
export const invalidateCustomer=customerReader.invalidate;
