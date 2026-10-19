import type { SizeGroup } from '@/modules/catalog/catalog-types';
import { fitValue } from '@/modules/catalog/catalog-types';
export function SizeInfo({group,showStock=true,compact=false}:{group:SizeGroup;showStock?:boolean;compact?:boolean}){
  return <div className="size-info">
    {showStock&&<p className="size-stock">Stok: <strong>{group.qty??'—'} pcs</strong></p>}
    <dl className="size-spec-row">
      {(!compact||group.tagSize?.trim())&&<div><dt>Size on tag</dt><dd>{group.tagSize?.trim() || 'Belum tercantum'}</dd></div>}
      <div><dt>Size fit to</dt><dd>{fitValue(group)}</dd></div>
      {(!compact||group.lengthCm!=null||group.widthCm!=null)&&<div className="size-measurements"><dt>Details size</dt><dd>
        {(!compact||group.lengthCm!=null)&&<span>Panjang: {group.lengthCm==null?'Belum diukur':group.lengthCm+' cm'}</span>}
        {(!compact||group.widthCm!=null)&&<span>Lebar: {group.widthCm==null?'Belum diukur':group.widthCm+' cm'}</span>}
      </dd></div>}
    </dl>
  </div>;
}
