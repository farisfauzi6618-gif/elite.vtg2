'use client';

import {useState} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogTitle,DialogTrigger} from '@/components/ui/dialog';
import {fallbackPhoto,photoUrl} from '@/modules/catalog/photo-url';

export function AdminPhotoPreview({photoKey,alt,medium=false}:{photoKey:string;alt:string;medium?:boolean}){
 const [open,setOpen]=useState(false);
 return <Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild><button type="button" className={'admin-photo-preview'+(medium?' admin-photo-preview-medium':'')} aria-label={'Lihat foto asli — '+alt}>
   <img className={medium?'editor-photo':undefined} src={photoUrl(photoKey,medium?'card':'thumb')} width={medium?800:240} height={medium?1000:300} alt={alt} loading={medium?'eager':'lazy'} decoding="async" onError={event=>fallbackPhoto(event.currentTarget,photoKey)}/>
   {medium&&<span>Lihat foto asli</span>}
  </button></DialogTrigger>
  {open&&<DialogContent className="photo-zoom-dialog">
   <DialogTitle className="sr-only">Foto asli — {alt}</DialogTitle>
   <DialogDescription className="sr-only">Foto ukuran penuh untuk memeriksa kondisi barang. Tutup untuk kembali ke editor.</DialogDescription>
   <img src={photoUrl(photoKey)} alt={alt}/>
  </DialogContent>}
 </Dialog>;
}
