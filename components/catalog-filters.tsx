'use client';

import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {Search,SlidersHorizontal,X} from 'lucide-react';
import {FilterChoices} from '@/components/filter-choices';
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle,SheetTrigger} from '@/components/ui/sheet';
import {plainText,selectedValues} from '@/modules/catalog/taxonomy';

type FilterKey='size'|'category'|'brand'|'min'|'max';
type Filters=Record<FilterKey,string>;

function BrandSelector({brands,value,onChange}:{brands:string[];value:string;onChange:(value:string)=>void}){
 const id=useId(),input=useRef<HTMLInputElement>(null),container=useRef<HTMLDivElement>(null),list=useRef<HTMLDivElement>(null);
 const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[highlight,setHighlight]=useState(-1);
 const selected=selectedValues(value);
 const suggestions=useMemo(()=>{
  const words=plainText(query).split(' ').filter(Boolean);
  return words.length?brands.filter(brand=>words.every(word=>plainText(brand).includes(word))).slice(0,8):[];
 },[brands,query]);
 useEffect(()=>{
  const popup=list.current,option=popup?.children[highlight] as HTMLElement|undefined;
  if(!open||!popup||!option)return;
  const top=option.offsetTop,bottom=top+option.offsetHeight;
  if(top<popup.scrollTop)popup.scrollTop=top;
  else if(bottom>popup.scrollTop+popup.clientHeight)popup.scrollTop=bottom-popup.clientHeight;
 },[open,highlight,suggestions]);
 function choose(brand:string){
  const next=selected.includes(brand)?selected.filter(item=>item!==brand):[...selected,brand];
  onChange(next.join('|')||'all');setQuery('');setOpen(false);setHighlight(-1);input.current?.focus();
 }
 return <div className="brand-filter" ref={container}>
  <label className="catalog-filter-label" htmlFor={id}>Brand</label>
  <div className="brand-search">
   <Search size={17} aria-hidden="true"/>
   <input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id+'-options'} aria-activedescendant={open&&highlight>=0&&suggestions[highlight]?id+'-option-'+highlight:undefined} autoComplete="off" spellCheck={false} placeholder="Cari brand..." value={query}
    onChange={event=>{setQuery(event.target.value);setOpen(!!event.target.value.trim());setHighlight(-1)}}
    onFocus={()=>{if(query.trim())setOpen(true)}}
    onBlur={event=>{if(!container.current?.contains(event.relatedTarget as Node|null))setOpen(false)}}
    onKeyDown={event=>{
     if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);return}
     if((event.key==='ArrowDown'||event.key==='ArrowUp')&&suggestions.length){event.preventDefault();setOpen(true);setHighlight(current=>current<0?(event.key==='ArrowDown'?0:suggestions.length-1):(current+(event.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length)}
     if(event.key==='Enter'&&open){event.preventDefault();const brand=suggestions[highlight]??(suggestions.length===1?suggestions[0]:undefined);if(brand)choose(brand)}
    }}/>
   {open&&<div ref={list} className="brand-suggestions" id={id+'-options'} role="listbox" aria-label="Pilihan brand" aria-multiselectable="true">
    {suggestions.length?suggestions.map((brand,index)=><button type="button" role="option" id={id+'-option-'+index} key={brand} tabIndex={-1} aria-selected={selected.includes(brand)} data-highlighted={highlight===index||undefined} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setHighlight(index)} onClick={()=>choose(brand)}>{brand}</button>):<p role="status">Brand belum ditemukan.</p>}
   </div>}
  </div>
  {selected.length>0&&<div className="selected-brands" aria-label="Brand terpilih">{selected.map(brand=><button type="button" key={brand} onClick={()=>onChange(selected.filter(item=>item!==brand).join('|')||'all')} aria-label={'Hapus brand '+brand}>{brand}<X size={14} aria-hidden="true"/></button>)}</div>}
 </div>;
}

export function CatalogFilters({filters,onChange,onReset,sizes,brands,categories,count,active,loading}:{filters:Filters;onChange:(key:FilterKey,value:string)=>void;onReset:()=>void;sizes:string[];brands:string[];categories:string[];count:number;active:number;loading:boolean}){
 const [open,setOpen]=useState(false),[resetVersion,setResetVersion]=useState(0);
 const categoryId=useId(),selectedCategories=selectedValues(filters.category);
 const preservedCategory=selectedCategories.length>0&&!categories.includes(filters.category);
 const invalidRange=!!filters.min&&!!filters.max&&Number(filters.min)>Number(filters.max);
 return <Sheet open={open} onOpenChange={setOpen}>
  <SheetTrigger asChild><button className="button secondary catalog-filter-trigger"><SlidersHorizontal size={17}/>Size & Filter{active>0&&<span className="count-badge">{active}</span>}</button></SheetTrigger>
  <SheetContent className="filter-sheet catalog-filter-sheet" onEscapeKeyDown={event=>{if((event.target as HTMLElement)?.closest('.brand-search input[aria-expanded="true"]'))event.preventDefault()}}>
   <SheetHeader><SheetTitle>Filter</SheetTitle><SheetDescription className="sr-only">Pilih size, kategori, brand, atau rentang harga.</SheetDescription></SheetHeader>
   <div className="catalog-filter-body">
    <FilterChoices label="Size" value={filters.size} onChange={value=>onChange('size',value)} options={sizes.map(size=>({value:size,label:size}))}/>
    <label className="catalog-filter-label" htmlFor={categoryId}>Category<select id={categoryId} className="input" value={filters.category} onChange={event=>onChange('category',event.target.value)}><option value="all">Semua</option>{preservedCategory&&<option value={filters.category}>{selectedCategories.join(', ')}</option>}{categories.map(category=><option key={category} value={category}>{category}</option>)}</select></label>
    <BrandSelector key={resetVersion} brands={brands} value={filters.brand} onChange={value=>onChange('brand',value)}/>
    <fieldset className="catalog-price-filter"><legend>Price</legend><div className="catalog-price-range"><label><span>Min (Rp)</span><input className="input" inputMode="numeric" type="number" min="0" placeholder="Min" aria-label="Harga minimum" value={filters.min} onChange={event=>onChange('min',event.target.value)}/></label><span aria-hidden="true">—</span><label><span>Max (Rp)</span><input className="input" inputMode="numeric" type="number" min="0" placeholder="Max" aria-label="Harga maksimum" value={filters.max} onChange={event=>onChange('max',event.target.value)}/></label></div>{invalidRange&&<p className="field-error" role="alert">Harga minimum melebihi maksimum.</p>}</fieldset>
   </div>
   <div className="catalog-filter-actions"><button type="button" className="text-button" onClick={()=>{onReset();setResetVersion(version=>version+1)}}>Reset</button><button type="button" className="button primary" disabled={loading||invalidRange} onClick={()=>setOpen(false)}>{loading?'Memuat barang…':`Lihat ${count} barang`}</button></div>
  </SheetContent>
 </Sheet>;
}
