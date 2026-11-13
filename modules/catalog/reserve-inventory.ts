// Matches the stock triggers in release_0028_reserve_dp_policy.sql.
export function timelyReserveProofSql(orderAlias:'o'|'ro'){
 return `EXISTS(SELECT 1 FROM reserve_payments p WHERE p.order_id=${orderAlias}.id AND p.state='submitted' AND p.submitted_at<=${orderAlias}.reservation_deadline AND (p.proof_key IS NOT NULL OR p.source='owner'))`;
}

export function reservedQuantitySql(alias='g'){
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias))throw new Error('Invalid inventory alias');
 return `COALESCE((SELECT SUM(ri.quantity) FROM reserve_items ri JOIN orders ro ON ro.id=ri.order_id WHERE ri.group_id=${alias}.id AND ri.state='active' AND ro.reservation_status IN ('RESERVED','PARTIALLY_PAID') AND (ro.reservation_deadline>unixepoch('subsec')*1000 OR ${timelyReserveProofSql('ro')})),0)`;
}
