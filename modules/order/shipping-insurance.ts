// Komship Shipping Delivery: J&T premium = 0.2% of total product price.
// Official policy: https://www.rajaongkir.com/docs/delivery-order-api/Store_order/about_insurance
export const JNT_INSURANCE_MINIMUM = 300_000;
export function jntInsuranceQuote(value: number) {
  const valid = Number.isSafeInteger(value) && value > 0;
  return {eligible:valid && value >= JNT_INSURANCE_MINIMUM,declaredValue:value,premium:valid?Math.round(value / 5) / 100:0};
}

export function insuranceMatches(detail: Record<string,unknown>,expected: ReturnType<typeof jntInsuranceQuote>) {
  if (!expected.eligible || detail.insurance_value == null || !Number.isFinite(Number(detail.insurance_value)) || Math.abs(Number(detail.insurance_value) - expected.premium) > 0.005 || !Array.isArray(detail.order_details) || !detail.order_details.length) return false;
  let total = 0;
  for (const raw of detail.order_details) {
    const row = raw as Record<string,unknown>;
    if (!row || typeof row !== "object") return false;
    const price = Number(row.product_price),qty = Number(row.qty),subtotal = Number(row.subtotal);
    if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(qty) || qty <= 0 || !Number.isSafeInteger(subtotal) || subtotal !== price * qty) return false;
    total += subtotal;
  }
  return total === expected.declaredValue;
}

export function kiriminInsuranceEstimate(value:number){return {eligible:Number.isSafeInteger(value)&&value>0,declaredValue:value,premium:Number.isSafeInteger(value)&&value>0?Math.ceil(value*.002/100)*100:0};}
