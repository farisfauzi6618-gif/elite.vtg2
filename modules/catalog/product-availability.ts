// Presentation only: actual inventory remains unchanged.
export function availabilityLabel(stock:number|null){
 if(stock==null)return 'AVAILABILITY UNCONFIRMED';
 if(stock<=0)return 'SOLD';
 if(stock===1)return 'ONE PIECE AVAILABLE';
 if(stock<=3)return 'ONLY '+stock+' PIECES AVAILABLE';
 return 'AVAILABLE';
}
// Preserve the existing maximum of 20 units per checkout.
export function quantityLimit(stock:number|null){return Math.max(0,Math.min(stock??0,20))}
export function selectedQuantity(stock:number|null,requested=1){return Math.min(quantityLimit(stock),Math.max(1,Math.floor(Number.isFinite(requested)?requested:1)))}
export function canAddQuantity(stock:number|null,inCart:number,cartTotal:number,quantity:number){return Number.isInteger(quantity)&&quantity>0&&quantity+inCart<=(stock??0)&&quantity+cartTotal<=20}
