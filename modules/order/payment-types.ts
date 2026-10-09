export type PaymentMethod = "bca_transfer" | "qris_dana";
export type PaymentConfig = {
  bca: { bank: "BCA"; accountNumber: string; accountHolder: string } | null;
  qris: { merchant: string; imageUrl: "/api/qris" } | null;
  defaultMethod: PaymentMethod | null;
};
export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === "bca_transfer" || value === "qris_dana";
}
// Orders created before the migration were paid using the existing QRIS.
export function storedPaymentMethod(value?: string | null): PaymentMethod {
  return value === "bca_transfer" ? value : "qris_dana";
}
export const paymentMethodLabel = (value?: string | null) =>
  storedPaymentMethod(value) === "bca_transfer" ? "Transfer Bank BCA" : "QRIS DANA";
export const paymentStatusLabel = (order: { payment_state?: string; status: string }) =>
  order.payment_state === "payment_confirmed" ? "Dikonfirmasi pemilik" :
  order.status === "awaiting_proof" ? "Menunggu bukti pembayaran" : "Menunggu verifikasi";
