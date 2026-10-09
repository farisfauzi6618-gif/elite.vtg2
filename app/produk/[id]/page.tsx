import Catalog from '@/app/catalog';
import {publicProduct,type Product} from '@/modules/catalog/catalog-types';
import {readProduct} from '@/modules/catalog/server';
import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{id:string}>}){const {id}=await params;try{const p=await readProduct(id);if(p.status!=='published')return {title:'Produk tidak tersedia — ELITE.VTG'};return {title:p.name+' — ELITE.VTG',description:p.description||[p.brand,p.category,p.condition].filter(Boolean).join(' · ')}}catch{return {title:'Produk tidak tersedia — ELITE.VTG'}}}
export default async function ProductPage({params}:{params:Promise<{id:string}>}){const {id}=await params;let p;try{p=await readProduct(id)}catch{notFound()}if(p.status!=='published')notFound();return <Catalog productId={id} initialProduct={publicProduct(p) as unknown as Product}/>;}
