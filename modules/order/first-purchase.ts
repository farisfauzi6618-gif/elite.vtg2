export const FIRST_PURCHASE_PERCENT=5;
export const FIRST_PURCHASE_MAX_DISCOUNT=50000;
export type PurchasePromotion={state:'guest'|'available'|'reserved'|'redeemed';percent:5;orderId?:string};
export function firstPurchaseDiscount(subtotal:number) {
 return Number.isSafeInteger(subtotal)&&subtotal>=1000&&subtotal<=10000000?Math.min(FIRST_PURCHASE_MAX_DISCOUNT,Math.floor(subtotal*FIRST_PURCHASE_PERCENT/100)):0;
}
