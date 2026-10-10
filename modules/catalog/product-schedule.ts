export function orderingLocked(product:{orderableAt?:string|null},now=Date.now()) {
 return !!product.orderableAt && Date.parse(product.orderableAt)>now;
}
export function scheduleLabel(value:string) {
 return new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value))+' WIB';
}
export function scheduleInput(value?:string|null) {
 return value?new Date(Date.parse(value)+7*3600000).toISOString().slice(0,16):'';
}
export function scheduleFromInput(value:string) {
 if(!value)return null;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Jadwal tidak valid.');
 const parsed=new Date(value+':00+07:00');
 if(!Number.isFinite(parsed.getTime())||scheduleInput(parsed.toISOString())!==value)throw new Error('Jadwal tidak valid.');
 return parsed.toISOString();
}
export function normalizeSchedule(value:unknown):string|null {
 if(value===null||value==='')return null;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))throw new Error('Pilih tanggal dan jam pemesanan yang valid (WIB).');
 const parsed=new Date(value);
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().replace('.000Z','Z')!==value.replace('.000Z','Z')||parsed.getUTCFullYear()<2020||parsed.getUTCFullYear()>2100)throw new Error('Jadwal pemesanan tidak valid.');
 return parsed.toISOString();
}
