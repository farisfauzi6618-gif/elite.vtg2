'use client';

const CONDITIONS = [
  'Brand New With Tag',
  'Brand new',
  'Excellent',
  'Very Good Condition',
  'Good Condition',
];

export function AdminConditionField({label,value,onChange,required=false,emptyLabel='Pilih kondisi barang'}:{
  label:string;
  value:string|null;
  onChange:(value:string)=>void;
  required?:boolean;
  emptyLabel?:string;
}) {
  const current=value??'';
  const missing=required&&!current;
  return <label className="field-label">
    {label}{required&&<span className="sr-only"> wajib</span>}
    <select className={'input '+(missing?'needs-review':'')} value={current} required={required} onChange={e=>onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {current&&!CONDITIONS.includes(current)&&<option value={current}>{current}</option>}
      {CONDITIONS.map(condition=><option key={condition} value={condition}>{condition}</option>)}
    </select>
    {missing&&<span className="missing-hint">Belum diisi</span>}
  </label>;
}
