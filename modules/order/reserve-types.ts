export const RESERVE_HOURS=48,RESERVE_MAX_DAYS=7;
export type ReserveStatus='AWAITING_DEPOSIT'|'RESERVED'|'PARTIALLY_PAID'|'PAID'|'EXPIRED'|'CANCELLED';
export type ReservePayment={id:string;amount:number;paymentMethod:'bca_transfer'|'qris_dana';state:'awaiting_proof'|'submitted'|'confirmed'|'rejected';createdAt:number;confirmedAt:number|null;hasProof:boolean;source:string;note:string|null};
export type ReserveSummary={id:string;status:ReserveStatus;itemCount:number;orderValue:number;total:number;shippingAmount:number;shippingPayment?:'prepaid'|'collect';shippingEstimate?:number;depositMinimum:number;depositPaid:number;totalPaid:number;remaining:number;startedAt:number|null;deadline:number|null;payments:ReservePayment[];policy:string};
export function minimumReserveDeposit(value:number){if(!Number.isSafeInteger(value)||value<50000||value>10000000)throw new Error('Reserve tersedia untuk nilai barang Rp50.000 sampai Rp10.000.000.');return Math.max(50000,Math.ceil(value/4));}
export function validReserveDeposit(value:number,amount:number){return Number.isSafeInteger(amount)&&amount>=minimumReserveDeposit(value)&&amount<=value;}
export const reserveLabels:Record<ReserveStatus,string>={AWAITING_DEPOSIT:'Menunggu konfirmasi DP',RESERVED:'Di-reserve',PARTIALLY_PAID:'Dibayar sebagian',PAID:'Lunas',EXPIRED:'Reserve berakhir',CANCELLED:'Reserve dibatalkan'};
