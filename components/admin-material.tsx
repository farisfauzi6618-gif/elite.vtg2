'use client';

import {MATERIAL_OPTIONS,MATERIAL_DETAILS_MAX,COMPOSITION_LIMIT,materialLabel,materialWarning,type ProductMaterial,type PrimaryMaterial,type MaterialSource} from '@/modules/catalog/material';

export function AdminMaterial({product,disabled,onChange}:{product:ProductMaterial;disabled:boolean;onChange:(value:ProductMaterial)=>void}){
 const rows=product.materialComposition??[],primary=product.primaryMaterial??null,known=primary!==null&&primary!=='unknown',warning=materialWarning(rows);
 const options=MATERIAL_OPTIONS.filter(option=>option.value!=='unknown');
 const patch=(values:ProductMaterial)=>onChange({...product,...values});
 const add=()=>{const material=options.find(option=>option.value===primary&&!rows.some(row=>row.material===option.value))??options.find(option=>!rows.some(row=>row.material===option.value));if(material)patch({materialComposition:[...rows,{material:material.value,percentage:null}]})};
 return <fieldset className="admin-material" disabled={disabled}>
  <legend>Material</legend>
  <div className="form-grid"><label>Primary Material<select value={primary??''} onChange={event=>{const value=event.target.value as PrimaryMaterial|'';patch({primaryMaterial:value||null,...(!value||value==='unknown'?{materialComposition:[]}:{} )})}}><option value="">Belum diisi</option>{MATERIAL_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  <label>Source — internal<select value={product.materialSource??''} onChange={event=>patch({materialSource:(event.target.value||null) as MaterialSource|null})}><option value="">Belum dicatat</option><option value="LABEL">Label</option><option value="ESTIMATED">Estimated</option><option value="UNKNOWN">Unknown</option></select></label></div>
  {known&&<details className="material-composition-editor" open={rows.length>0||!!product.materialDetails}><summary>Composition & detail (opsional)</summary>
   {rows.map((row,index)=><div className="material-composition-row" key={index}><select aria-label={'Bahan komposisi '+(index+1)} value={row.material} onChange={event=>patch({materialComposition:rows.map((current,i)=>i===index?{...current,material:event.target.value as typeof row.material}:current)})}>{options.map(option=><option key={option.value} value={option.value} disabled={option.value!==row.material&&rows.some(current=>current.material===option.value)}>{option.label}</option>)}</select><label><span className="sr-only">Persentase komposisi {index+1}</span><input type="number" min="0" max="100" step="any" inputMode="decimal" value={row.percentage??''} onChange={event=>patch({materialComposition:rows.map((current,i)=>i===index?{...current,percentage:event.target.value===''?null:Number(event.target.value)}:current)})}/><span>%</span></label><button type="button" className="text-button" aria-label={'Hapus komposisi '+(index+1)} onClick={()=>patch({materialComposition:rows.filter((_,i)=>i!==index)})}>Hapus</button></div>)}
   {warning&&<p className="help-text material-warning" role="status">{warning}</p>}
   <div className="material-quick-actions"><button type="button" className="text-button" disabled={rows.length>=COMPOSITION_LIMIT} onClick={add}>+ Add Material</button>{!rows.length&&<button type="button" className="text-button" onClick={()=>patch({materialComposition:[{material:primary,percentage:100}]})}>Set as 100% {materialLabel(primary)}</button>}</div>
   <label className="material-details-field">Detail tambahan (opsional)<textarea rows={2} maxLength={MATERIAL_DETAILS_MAX} value={product.materialDetails??''} placeholder="Contoh: Lining: 100% Polyester" onChange={event=>patch({materialDetails:event.target.value||null})}/></label>
  </details>}
  <p className="help-text">Isi sesuai label jika tersedia. Pilih Unknown / Not Specified jika bahan tidak diketahui.</p>
 </fieldset>;
}
