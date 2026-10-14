// Total stock remains size_groups.qty. Only active, unexpired holds reduce availability.
export function reservedQuantitySql(alias='g'){
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias))throw new Error('Invalid inventory alias');
 return `COALESCE((SELECT SUM(ri.quantity) FROM reserve_items ri JOIN orders ro ON ro.id=ri.order_id WHERE ri.group_id=${alias}.id AND ri.state='active' AND ro.reservation_status IN ('RESERVED','PARTIALLY_PAID') AND ro.reservation_deadline>unixepoch('subsec')*1000),0)`;
}
