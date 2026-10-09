import Link from "next/link";
import { requireOwnerUser } from "@/lib/auth/owner";
import { owner,AppError } from "@/modules/order/order-server";
import { labelPrintInfo } from "@/modules/order/label-print";
import { LabelPrint } from "@/app/(orders)/admin/order/print/[id]/ui";
export const dynamic="force-dynamic";
export const metadata={title:"Cetak label · ELITE.VTG",robots:{index:false,follow:false}};
export default async function PrintPage({params}:{params:Promise<{id:string}>}){const {id}=await params;await requireOwnerUser("/admin/order/print/"+id);try{await owner();const label=await labelPrintInfo(id);return <LabelPrint label={label}/>;}catch(e){return <main className="access-error"><h1>Label belum dapat dibuka.</h1><p>{e instanceof AppError?e.message:"Label belum tersedia. Coba lagi dari dashboard."}</p><Link href="/admin/order">Kembali ke dashboard</Link></main>;}}
