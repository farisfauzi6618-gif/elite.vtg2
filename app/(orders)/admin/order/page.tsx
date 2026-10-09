import { requireOwnerUser } from "@/lib/auth/owner";
import { owner, AppError } from "@/modules/order/order-server";
import Link from "next/link";
import Admin from "@/app/(orders)/admin/order/ui";
export const dynamic="force-dynamic";
export default async function AdminPage(){await requireOwnerUser("/admin/order");try{await owner();}catch(e){return <main className="access-error"><h1>Akses khusus pemilik</h1><p>{e instanceof AppError?e.message:"Pengaturan belum tersedia. Coba lagi."}</p><Link href="/">Kembali ke halaman order</Link></main>;}return <Admin/>;}
