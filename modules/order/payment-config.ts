import { env } from '@/lib/env';
import type { PaymentConfig, PaymentMethod } from "@/modules/order/payment-types";

const supportedMimes = ["image/png", "image/jpeg", "image/webp"];
function validName(value?: string) {
  const name = value?.trim();
  return name && name.length >= 2 && name.length <= 100 && !/[\x00-\x1f\x7f]/.test(name) ? name : null;
}
// Payment destinations deliberately never read mutable dashboard settings.
export function trustedQris() {
  const key = env.PAYMENT_QRIS_KEY, mime = env.PAYMENT_QRIS_MIME;
  const merchant = validName(env.PAYMENT_QRIS_MERCHANT);
  const sha256 = env.PAYMENT_QRIS_SHA256;
  return key && /^qris\/[a-zA-Z0-9_-]+$/.test(key) && mime && supportedMimes.includes(mime) && merchant && sha256 && /^[a-f0-9]{64}$/.test(sha256)
    ? { key, mime, merchant, sha256 } : null;
}
export async function paymentConfig(): Promise<PaymentConfig> {
  const accountNumber = env.PAYMENT_BCA_ACCOUNT_NUMBER?.trim();
  const accountHolder = validName(env.PAYMENT_BCA_ACCOUNT_HOLDER);
  const bca = accountNumber && /^\d{10}$/.test(accountNumber) && accountHolder
    ? { bank: "BCA" as const, accountNumber, accountHolder } : null;
  const asset = trustedQris();
  let qris: PaymentConfig["qris"] = null;
  if (asset && env.BUCKET) {
    try {
      const object = await env.BUCKET.head(asset.key);
      if (object && object.size >= 32 && object.size <= 4 * 1024 * 1024 &&
          (!object.httpMetadata?.contentType || object.httpMetadata.contentType === asset.mime)) {
        qris = { merchant: asset.merchant, imageUrl: "/api/qris" };
      }
    } catch { console.error("Payment QRIS asset unavailable"); }
  }
  return { bca, qris, defaultMethod: bca ? "bca_transfer" : qris ? "qris_dana" : null };
}
export const paymentAvailable = (config: PaymentConfig, method: PaymentMethod) =>
  method === "bca_transfer" ? !!config.bca : !!config.qris;
