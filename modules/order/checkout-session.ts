import type { Order } from '@/modules/order/order-types';

export type CatalogSelection = {
  lines: { name: string; label: string; quantity: number }[];
  amount: number;
  customer?: { name: string; phone: string | null };
};

type CheckoutRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export async function resumeCatalogSelection(token: string, existing: Order | null, request: CheckoutRequest) {
  // Validate the new selection before releasing the previous invoice's cookie.
  const selection = await request<CatalogSelection>('/api/order/catalog?token=' + encodeURIComponent(token));
  if (existing && existing.status !== 'awaiting_proof' && existing.catalog_token !== token) {
    // This endpoint expires only the browser cookie; the saved invoice remains.
    await request('/api/order', { method: 'DELETE' });
  }
  return selection;
}

export function catalogReturnHref(order: Order, search: string) {
  const base = '/';
  const params = new URLSearchParams(search), basket = params.get('basket') || '';
  return order.catalog_token && order.catalog_token === params.get('catalog') && /^[a-f0-9-]{36}$/.test(basket)
    ? base + '#belanja-lagi=' + basket : base;
}

export async function recoverSubmittedOrder(id: string, request: CheckoutRequest) {
  try {
    const saved = await request<Order>('/api/order');
    return saved.id === id && saved.status === 'submitted' ? saved : null;
  } catch { return null; }
}
