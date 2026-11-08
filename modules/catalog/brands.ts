// Display/search aliases only. Historical product and order values stay intact.
const known:Record<string,string>={'polo ralph lauren':'Polo Ralph Lauren','unknown':'Brand belum diketahui','uknown':'Brand belum diketahui','unknow':'Brand belum diketahui','-':'Brand belum diketahui','brand belum diketahui':'Brand belum diketahui'};
export function brandLabel(value:string|null|undefined){const clean=(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');return known[clean.toLowerCase()]??clean;}
export function brandKey(value:string){return brandLabel(value).toLowerCase();}
export function catalogBrands(values:string[]){const labels=new Map<string,string>();for(const value of values){const label=brandLabel(value);if(label&&!labels.has(brandKey(label)))labels.set(brandKey(label),label);}return [...labels.values()].sort((a,b)=>a.localeCompare(b,'id'));}
