import type { SizeGroup } from '@/modules/catalog/catalog-types';
import { fitValue } from '@/modules/catalog/catalog-types';
export function SizeInfo({group}:{group:SizeGroup}){
  return <div className="size-info">
    <p className="size-stock">Stok: <strong>{group.qty??'—'} pcs</strong></p>
    <dl className="size-spec-row">
      <div><dt>Size on tag</dt><dd>{group.tagSize?.trim() || 'Belum tercantum'}</dd></div>
      <div><dt>Size fit to</dt><dd>{fitValue(group)}</dd></div>
      <div className="size-measurements"><dt>Details size</dt><dd>
        <span>Panjang: {group.lengthCm==null?'Belum diukur':group.lengthCm+' cm'}</span>
        <span>Lebar: {group.widthCm==null?'Belum diukur':group.widthCm+' cm'}</span>
      </dd></div>
    </dl>
  </div>;
}
