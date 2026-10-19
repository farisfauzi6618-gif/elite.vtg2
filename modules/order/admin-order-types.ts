import type {Order} from './order-types';
import type {ShipmentSummary} from './fulfilment-types';

export const ADMIN_ORDER_FILTERS=[['all','Semua status'],['received','Menunggu verifikasi'],['confirmed','Lunas'],['preparing','Diproses'],['shipped','Dikirim']] as const;
export type AdminOrderStatus=typeof ADMIN_ORDER_FILTERS[number][0];
export type AdminOrderRow=Order&{has_proof:number;shipment?:ShipmentSummary|null};
export type AdminOrderPage={orders:AdminOrderRow[];page:number;pageCount:number;pageSize:number;total:number;reserveCount:number};
