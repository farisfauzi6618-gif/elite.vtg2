import {selectedColorProduct} from '@/modules/catalog/color-variants';
import Catalog from '@/app/catalog';
import {publicProduct,type Product} from '@/modules/catalog/catalog-types';
import {readProduct} from '@/modules/catalog/server';
import {notFound} from 'next/navigation';
import {cache} from 'react';
import {productShareMetadata} from '@/modules/catalog/product-share';
const loadProduct=cache(readProduct);
export const dynamic='force-dynamic';
export async function generateMetadata({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{color?:string}>}){const {id}=await params;try{const p=await loadProduct(id);if(p.status!=='published')return {title:'Produk tidak tersedia — ELITE.VTG',robots:{index:false,follow:false}};return productShareMetadata(selectedColorProduct(p,(await searchParams).color))}catch{return {title:'Produk tidak tersedia — ELITE.VTG',robots:{index:false,follow:false}}}}
export default async function ProductPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{color?:string}>}){const {id}=await params;let p;try{p=await loadProduct(id)}catch{notFound()}if(p.status!=='published')notFound();return <Catalog productId={id} initialColor={(await searchParams).color} initialProduct={publicProduct(p) as unknown as Product}/>;}
