import {WHATSAPP_NUMBER} from './customer-support';
export const RECOVERY_MESSAGE='Jika akun tersedia, petunjuk pemulihan akan dikirim ke email terdaftar. Periksa juga folder Spam. Jika belum diterima, tunggu sebentar atau hubungi bantuan.';
export const RECOVERY_INVALID='Link pemulihan tidak valid, sudah digunakan, atau kedaluwarsa. Silakan minta link baru.';
export type OwnerRecovery={url:string;phone:string;expiresAt:number};
export function recoveryHelpUrl(identity:string){return 'https://wa.me/'+WHATSAPP_NUMBER+'?text='+encodeURIComponent('Halo ELITE.VTG, saya perlu bantuan memulihkan akun dengan nomor HP '+identity.trim()+'. Saya lupa kata sandi.');}
export function ownerRecoveryMessage(value:OwnerRecovery){return 'ELITE.VTG · Pemulihan akun\n\nAtur ulang kata sandi melalui link berikut:\n'+value.url+'\n\nLink berlaku 15 menit dan hanya sekali pakai. Jangan bagikan link ini kepada siapa pun. Jika Anda tidak meminta pemulihan akun, abaikan pesan ini.';}
