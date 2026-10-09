import { db,AppError,decrypt } from "@/modules/order/order-server";
import { shipment } from "@/modules/order/fulfilment";
export const printSizes={page_6:{width:100,height:150,label:"10 × 15 cm"},page_5:{width:100,height:100,label:"10 × 10 cm"},page_1:{width:210,height:297,label:"A4"}};
export async function labelPrintInfo(id:string){
 const s=await shipment(id);if(!s?.awb||!s.label_png||!s.label_pdf)throw new AppError(409,"Label resmi sedang disiapkan. Periksa kembali dari dashboard pemilik.");
 const o=await db().prepare("SELECT name FROM orders WHERE id=?").bind(id).first<{name:string}>();if(!o)throw new AppError(404,"Pesanan tidak ditemukan.");
 const config=s.config_json?JSON.parse(await decrypt(s.config_json)) as {labelPage?:string}:null,key=config?.labelPage;
 const size=key&&key in printSizes?printSizes[key as keyof typeof printSizes]:printSizes.page_6;
 return {invoice:id,awb:s.awb,buyer:o.name,size,pdfUrl:"/api/admin/order/shipments/"+id+"?format=pdf",pngUrl:"/api/admin/order/shipments/"+id+"?format=png"};
}
