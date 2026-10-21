import {rupiah,type Order} from '@/modules/order/order-types';
import {shippingDescription} from '@/modules/order/shipping-types';
import {orderQuote} from '@/modules/order/order-types';
export function ShippingProtectionDetail({order:o,admin=false}:{order:Order;admin?:boolean}){
 if(o.shipping_protection_fee==null)return null;
 const active=!!o.shipping_protection_confirmed_at&&o.shipping_protection_reference===o.tracking_number;
 return <section className="protection-order-detail" aria-label="Rincian Shipping Protection"><dl><div><dt>Subtotal barang</dt><dd>{rupiah(o.item_subtotal??o.item_amount??0)}</dd></div>{!!o.discount_amount&&<div><dt>Diskon</dt><dd>−{rupiah(o.discount_amount)}</dd></div>}<div><dt>Ongkir</dt><dd>{shippingDescription(orderQuote(o),o.shipping_amount??0)}</dd></div><div><dt>Shipping Protection</dt><dd>{rupiah(o.shipping_protection_fee)}</dd></div><div><dt>Total pembayaran</dt><dd>{rupiah(o.total)}</dd></div>{admin&&<><div><dt>Declared Shipment Value</dt><dd>{rupiah(o.declared_shipping_value??o.item_amount??0)}</dd></div><div><dt>Shipping Protection</dt><dd>{active?'Active':'Wajib · konfirmasi sebelum kirim'}</dd></div></>}</dl></section>;
}
