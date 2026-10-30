import type { Order } from '@/modules/order/order-types';

export type CatalogSelection = {
  id?:string;
  preview?:import('./checkout-ux').CheckoutPreview[];
  orderType?: string;
  lines: { name: string; label: string; quantity: number }[];
  amount: number;
  customer?: { name: string; phone: string | null };
};

type CheckoutRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export function invoiceResumeInput(search:string,hash:string){
 const token=hash.replace(/^#/,''),params=new URLSearchParams(search),invoice=params.get('invoice');
 if(!/^[a-f0-9]{64}$/.test(token)||invoice!==null&&(!/^EV-\d{6}-[A-F0-9]{8}$/.test(invoice)||params.getAll('invoice').length!==1))throw Error('Tautan pembayaran tidak lengkap. Buka kembali tautan yang Anda simpan.');
 const next=new URLSearchParams();
 if(invoice===null)for(const name of ['catalog','basket']){const value=params.get(name);if(value&&/^[a-f0-9-]{36,64}$/.test(value))next.set(name,value)}
 return {body:invoice===null?{token}:{token,invoice},fallback:'/order'+(next.size?'?'+next:'')};
}

export function invoiceResumeDestination(value:unknown,fallback:string){
 const url=value&&typeof value==='object'&&'url' in value?(value as {url:unknown}).url:undefined;
 if(url===undefined)return fallback;
 if(url==='/order'||typeof url==='string'&&/^\/lacak#[a-f0-9]{64}$/.test(url))return url;
 throw Error('Tujuan pembayaran tidak valid. Buka kembali tautan pembayaran Anda.');
}

export function resumeMemberInvoice(invoice:string,request:CheckoutRequest){
 return request<Order>('/api/customer/orders/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invoice})});
}

type SelectionPreview = Promise<{value:CatalogSelection;error?:never}|{error:unknown;value?:never}>;

// Request-local only: do not share selections across accounts or mount lifetimes.
// Capture failure immediately; an existing invoice may make this preview unnecessary.
export function prefetchCatalogSelection(token:string,request:CheckoutRequest,signal?:AbortSignal):SelectionPreview {
  return request<CatalogSelection>('/api/order/catalog?token='+encodeURIComponent(token),{signal})
    .then(value=>({value}),error=>({error}));
}

export async function resumeCatalogSelection(token: string, existing: Order | null, request: CheckoutRequest, preview?:SelectionPreview) {
  // Validate the new selection before releasing the previous invoice's cookie.
  const result = preview ? await preview : {value:await request<CatalogSelection>('/api/order/catalog?token=' + encodeURIComponent(token))};
  if ('error' in result) throw result.error;
  const selection = result.value;
  if (existing && (existing.status !== 'awaiting_proof'||existing.order_type==='reserve') && existing.catalog_token !== token) {
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
