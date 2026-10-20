export const WHATSAPP_NUMBER='6285174389305';
export const WHATSAPP_DISPLAY='0851 7438 9305';
export const WHATSAPP_URL='https://wa.me/'+WHATSAPP_NUMBER;

export async function copySupportNumber(copy?:((number:string)=>Promise<void>)){
 if(!copy)return false;
 try{await copy(WHATSAPP_NUMBER);return true}catch{return false}
}
