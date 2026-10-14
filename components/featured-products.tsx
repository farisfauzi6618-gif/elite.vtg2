'use client';
import {useEffect,useRef} from 'react';
import {track} from '@/modules/analytics/client';
import type {Product} from '@/modules/catalog/catalog-types';
import {ProductCard} from './product-card';
export function FeaturedProducts({products,now,onNavigate}:{products:Product[];now:number;onNavigate:()=>void}){
 const root=useRef<HTMLElement>(null),seen=useRef(new Set<string>());
 const signature=products.map(p=>p.id+':'+p.featuredPosition).join('|');
 useEffect(()=>{
  if(!root.current||!('IntersectionObserver' in window))return;
  let timer:ReturnType<typeof setTimeout>|undefined,queue:{productId:string;position:number}[]=[];
  const flush=()=>{if(queue.length){track('featured_product_view',{products:queue});queue=[];}};
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting||entry.intersectionRatio<0.5)continue;const el=entry.target as HTMLElement,id=el.dataset.featuredId!,position=Number(el.dataset.featuredPosition),key=id+':'+position;if(!seen.current.has(key)){seen.current.add(key);queue.push({productId:id,position});}observer.unobserve(el);}if(queue.length&&!timer)timer=setTimeout(()=>{timer=undefined;flush()},250)},{threshold:0.5});
  root.current.querySelectorAll('[data-featured-id]').forEach(el=>observer.observe(el));
  return()=>{observer.disconnect();if(timer)clearTimeout(timer);flush()};
 },[signature]);
 if(!products.length)return null;
 return <section className="featured-products" aria-label="Featured" ref={root}><h2 className="catalog-section-heading">FEATURED</h2><div className="product-grid">{products.map(p=><div key={p.id} data-featured-id={p.id} data-featured-position={p.featuredPosition??1}><ProductCard product={p} now={now} onNavigate={()=>{track('featured_product_click',{productId:p.id,position:p.featuredPosition??1});onNavigate()}}/></div>)}</div></section>;
}
