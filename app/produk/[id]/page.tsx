import Catalog from '@/app/catalog';
import {publicProduct,type Product} from '@/modules/catalog/catalog-types';
import {readProduct} from '@/modules/catalog/server';
import {notFound} from 'next/navigation';
import {cache} from 'react';
import {productShareMetadata} from '@/modules/catalog/product-share';
const loadProduct=cache(readProduct);
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{id:string}>}){const {id}=await params;try{const p=await loadProduct(id);if(p.status!=='published')return {title:'Produk tidak tersedia — ELITE.VTG',robots:{index:false,follow:false}};return productShareMetadata(p)}catch{return {title:'Produk tidak tersedia — ELITE.VTG',robots:{index:false,follow:false}}}}
export default async function ProductPage({params}:{params:Promise<{id:string}>}){const {id}=await params;let p;try{p=await loadProduct(id)}catch{notFound()}if(p.status!=='published')notFound();return <Catalog productId={id} initialProduct={publicProduct(p) as unknown as Product}/>;}
