import {requireFinance} from '@/modules/finance/server';
import {requireOwnerUser} from '@/lib/auth/owner';
import {AppError} from '@/modules/catalog/server';
import Finance from './ui';
import './finance.css';
export const dynamic='force-dynamic';
export const metadata={title:'ELITE Finance',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{productId?:string}>}){
 let actor;let failure='';
 try{actor=await requireFinance()}
 catch(error){if(error instanceof AppError&&error.status===401)await requireOwnerUser('/admin/finance');failure=error instanceof AppError?error.message:'Finance belum dapat dimuat.'}
 if(!actor)return <main className="management"><h1>ELITE Finance</h1><p>{failure}</p><a href="/admin">Kembali ke admin</a></main>;
 const query=await searchParams;
 return <Finance primary={!actor.delegated} productId={query.productId?.slice(0,100)??null}/>;
}
