export const MATERIAL_OPTIONS=[
 {value:'cotton',label:'Cotton'},{value:'wool',label:'Wool'},{value:'linen',label:'Linen'},
 {value:'polyester',label:'Polyester'},{value:'nylon',label:'Nylon'},{value:'cashmere',label:'Cashmere'},
 {value:'silk',label:'Silk'},{value:'leather',label:'Leather'},{value:'suede',label:'Suede'},
 {value:'denim',label:'Denim'},{value:'fleece',label:'Fleece'},{value:'viscose',label:'Viscose'},
 {value:'acrylic',label:'Acrylic'},{value:'other',label:'Other'},{value:'unknown',label:'Unknown / Not Specified'},
] as const;
export type PrimaryMaterial=typeof MATERIAL_OPTIONS[number]['value'];
export type MaterialSource='LABEL'|'ESTIMATED'|'UNKNOWN';
export type MaterialComposition={material:Exclude<PrimaryMaterial,'unknown'>;percentage:number|null};
export type ProductMaterial={primaryMaterial?:PrimaryMaterial|null;materialComposition?:MaterialComposition[];materialSource?:MaterialSource|null;materialDetails?:string|null};
export const MATERIAL_DETAILS_MAX=500;
export const COMPOSITION_LIMIT=MATERIAL_OPTIONS.length-1;
export const materialLabel=(value:PrimaryMaterial)=>MATERIAL_OPTIONS.find(option=>option.value===value)?.label??'Not specified';

// Optional fields preserve existing values when older clients save unrelated data.
export function validateMaterial(input:Record<string,unknown>,current:ProductMaterial):Required<ProductMaterial>{
 const pick=(field:keyof ProductMaterial)=>Object.hasOwn(input,field)?input[field]:current[field];
 const primary=pick('primaryMaterial')??null,source=pick('materialSource')??null,composition=pick('materialComposition')??[],details=pick('materialDetails')??null;
 if(primary!==null&&(typeof primary!=='string'||!MATERIAL_OPTIONS.some(option=>option.value===primary)))throw Error('Pilih Material utama dari daftar yang tersedia.');
 if(source!==null&&!['LABEL','ESTIMATED','UNKNOWN'].includes(source as string))throw Error('Sumber Material tidak valid.');
 if(!Array.isArray(composition)||composition.length>COMPOSITION_LIMIT)throw Error('Komposisi Material tidak valid.');
 const seen=new Set<string>();
 const rows:MaterialComposition[]=composition.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||!MATERIAL_OPTIONS.some(option=>option.value===row.material&&option.value!=='unknown'))throw Error('Pilih bahan komposisi dari daftar yang tersedia.');
  if(seen.has(row.material))throw Error('Bahan komposisi tidak boleh berulang.');seen.add(row.material);
  if(row.percentage!==null&&(typeof row.percentage!=='number'||!Number.isFinite(row.percentage)||row.percentage<0||row.percentage>100))throw Error('Persentase Material harus angka 0–100, atau kosong.');
  return {material:row.material,percentage:row.percentage};
 });
 if(rows.length&&(primary===null||primary==='unknown'))throw Error('Pilih Material utama yang diketahui sebelum mengisi komposisi.');
 if(details!==null&&(typeof details!=='string'||details.length>MATERIAL_DETAILS_MAX))throw Error(`Detail Material maksimal ${MATERIAL_DETAILS_MAX} karakter.`);
 return {primaryMaterial:primary as PrimaryMaterial|null,materialComposition:rows,materialSource:source as MaterialSource|null,materialDetails:typeof details==='string'?details.trim()||null:null};
}

export function materialFromRow(row:Record<string,any>):ProductMaterial{
 if(!Object.hasOwn(row,'primary_material'))return {};
 return {primaryMaterial:row.primary_material??null,materialComposition:JSON.parse(row.material_composition??'[]'),materialSource:row.material_source??null,materialDetails:row.material_details??null};
}
export function publicMaterial(product:ProductMaterial){
 return {primaryMaterial:product.primaryMaterial??null,materialComposition:product.materialComposition??[],materialDetails:product.materialDetails??null};
}
export function materialWarning(rows:MaterialComposition[]){
 const filled=rows.filter(row=>row.percentage!==null);if(!filled.length)return null;
 const total=Math.round(filled.reduce((sum,row)=>sum+row.percentage!,0)*1000000)/1000000;
 return total===100?null:`Total komposisi ${total}%. Tetap bisa disimpan jika label hanya mencantumkan sebagian bahan.`;
}
export function materialPresentation(product:ProductMaterial){
 const primary=product.primaryMaterial;if(!primary)return null;
 const details=product.materialDetails?.trim()||null;
 if(primary==='unknown')return {title:'Not specified',composition:null,details};
 const rows=(product.materialComposition??[]).filter(row=>row.percentage!==0);
 const description=rows.map(row=>(row.percentage===null?'':row.percentage+'% ')+materialLabel(row.material)).join(' · ');
 return {title:rows.length>1?materialLabel(primary)+' Blend':description||materialLabel(primary),composition:rows.length>1?description:null,details};
}
