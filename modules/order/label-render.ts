import { PDFiumLibrary } from "@hyzyla/pdfium";
import { encode } from "fast-png";
import { AppError } from "@/modules/order/order-server";

// Render the official PDF locally in the Node runtime.
let library:ReturnType<typeof PDFiumLibrary.init>|undefined;
let renderQueue:Promise<unknown>=Promise.resolve();
export async function pdfToPng(pdf:Uint8Array){
 const run=renderQueue.then(async()=>{
  library??=PDFiumLibrary.init();
  const lib=await library,doc=await lib.loadDocument(pdf);
  try{if(doc.getPageCount()!==1)throw new AppError(502,"PDF label memuat lebih dari satu halaman. Gunakan format satu label per halaman.");const page=doc.getPage(0),size=page.getOriginalSize();if(size.originalWidth>900||size.originalHeight>1300)throw new AppError(502,"Ukuran PDF label terlalu besar.");const scale=Math.min(300/72,1800/Math.max(size.originalWidth,size.originalHeight));const image=await page.render({scale,render:async({width,height,data})=>encode({width,height,data,depth:8,channels:4})});return image.data;}
  finally{doc.destroy();}
 });
 renderQueue=run.catch(()=>{});return run;
}
