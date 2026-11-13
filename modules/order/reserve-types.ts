export const RESERVE_DAY_MS=24*60*60*1000;
export const RESERVE_DAYS=7;
export const RESERVE_MAX_DAYS=14;
export const RESERVE_POLICY_VERSION=2;
export const RESERVE_TERMS='DP mengurangi tagihan barang. Jika tidak lunas hingga batas yang berlaku, seluruh DP hangus dan barang kembali dijual.';
export type ReserveExtensionState='available'|'requested'|'approved'|'rejected'|'closed';
export type ReserveExtension={state:ReserveExtensionState;requiredTopUp:number;latestDeadline:number};
export type ReserveStatus='AWAITING_DEPOSIT'|'RESERVED'|'PARTIALLY_PAID'|'PAID'|'EXPIRED'|'CANCELLED';
export type ReservePayment={id:string;amount:number;paymentMethod:'bca_transfer'|'qris_dana';state:'awaiting_proof'|'submitted'|'confirmed'|'rejected';createdAt:number;submittedAt:number|null;confirmedAt:number|null;hasProof:boolean;source:string;note:string|null};
export type ReserveSummary={id:string;status:ReserveStatus;itemCount:number;orderValue:number;total:number;shippingAmount:number;shippingPayment?:'prepaid'|'collect';shippingEstimate?:number;depositMinimum:number;depositPaid:number;totalPaid:number;remaining:number;startedAt:number|null;deadline:number|null;payments:ReservePayment[];policy:string;policyVersion:1|2;extension:ReserveExtension|null;reviewAfterDeadline:boolean;forfeitedAmount:number};
export function minimumReserveDeposit(value:number){if(!Number.isSafeInteger(value)||value<50000||value>10000000)throw new Error('Reserve tersedia untuk nilai barang Rp50.000 sampai Rp10.000.000.');return Math.max(50000,Math.ceil(value/4));}
export function validReserveDeposit(value:number,amount:number){return Number.isSafeInteger(amount)&&amount>=minimumReserveDeposit(value)&&amount<=value;}
// A guest's first deposit uses the existing order session. Invoice-link access
// deliberately requires submitted proof; member/bearer recovery keeps that path.
export function reserveRequestPath(order:{id:string;status:string;proof_received_at?:number|null},authorization='',member=false){return '/api/reserve'+(!authorization&&!member&&order.status==='awaiting_proof'&&!order.proof_received_at?'':'?invoice='+encodeURIComponent(order.id));}
export const reserveLabels:Record<ReserveStatus,string>={AWAITING_DEPOSIT:'Menunggu konfirmasi DP',RESERVED:'Di-reserve',PARTIALLY_PAID:'Dibayar sebagian',PAID:'Lunas',EXPIRED:'Reserve berakhir',CANCELLED:'Reserve dibatalkan'};

export function reserveDurationLabel(version:number){return version===RESERVE_POLICY_VERSION?`${RESERVE_DAYS} hari`:'48 jam';}
export function reserveExtensionDeadline(startedAt:number,deadline:number){
 return Math.min(startedAt+RESERVE_MAX_DAYS*RESERVE_DAY_MS,deadline+RESERVE_DAYS*RESERVE_DAY_MS);
}
export function reserveTopUp(merchandise:number,totalConfirmed:number){return Math.max(0,Math.ceil(merchandise/2)-totalConfirmed);}
