'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,MessageCircle,Link as LinkIcon,Ellipsis,X,Download,Share2} from 'lucide-react';
import {Drawer,DrawerTrigger,DrawerContent,DrawerTitle,DrawerDescription,DrawerClose} from './ui/drawer';
import {performProductShare,productShareUrl,whatsappShareUrl,copyProductLink,shareStoryFile} from '@/modules/catalog/product-share';
import type {Product} from '@/modules/catalog/catalog-types';
import {track} from '@/modules/analytics/client';

function InstagramIcon(){return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".75" fill="currentColor" stroke="none"/></svg>;}
type Story={file:File;url:string;copied:boolean;canShare:boolean};
export function ProductShare({product,admin=false}:{product:Product;admin?:boolean}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[manual,setManual]=useState(false),[story,setStory]=useState<Story|null>(null);
 const pending=useRef(false),asset=useRef<Story|null>(null),generation=useRef(0);
 const storyKey=JSON.stringify([product.id,product.name,product.brand,product.price,product.photoKey,product.photoKeys,product.groups.map(g=>[g.qty,g.fits,g.price])]);
 useEffect(()=>{setStory(null);setNotice('');setManual(false);return()=>{generation.current++;if(asset.current)URL.revokeObjectURL(asset.current.url);asset.current=null;}},[storyKey]);
 if(product.status!=='published')return null;
 const url=productShareUrl(product),copy=()=>navigator.clipboard?.writeText?copyProductLink(product,value=>navigator.clipboard.writeText(value)):Promise.resolve(false);
 const record=(method:string)=>track('product_share_'+method,{productId:product.id,productName:product.name,shareMethod:method});
 function changeOpen(value:boolean){setOpen(value);if(value){record('opened');setNotice('');setManual(false);}}
 async function copyLink(){if(pending.current)return;record('copy_link');const copied=await copy();setNotice(copied?'Link copied':'Pilih dan salin product link.');setManual(!copied);if(story)setStory(value=>value?{...value,copied}:value);}
 async function more(){if(pending.current)return;pending.current=true;setBusy(true);record('more');
  try{const result=await performProductShare(product,{...(typeof navigator.share==='function'?{share:data=>navigator.share(data)}:{}),...(navigator.clipboard?.writeText?{copy:value=>navigator.clipboard.writeText(value)}:{})});if(result==='copy_link')setNotice('Link copied');else if(result==='manual_copy'||result==='copy_fallback'){setManual(true);setNotice('Gunakan Copy Link atau salin product link.');}}
  finally{pending.current=false;setBusy(false);}
 }
 function fileAdapter(){return {canShare:(data:{files:File[]})=>typeof navigator.canShare==='function'&&navigator.canShare(data),...(typeof navigator.share==='function'?{share:(data:{files:File[];title:string})=>navigator.share(data)}:{})};}
 async function instagram(){if(pending.current)return;pending.current=true;setBusy(true);setNotice('Preparing Story image…');record('instagram_story');const token=generation.current;
  // Start clipboard access in the click gesture; never claim success on denied permission.
  const copying=copy();
  try{let file=asset.current?.file;if(!file){const {generateStoryCard}=await import('@/modules/catalog/story-card');file=await generateStoryCard(product);}
   const copied=await copying;if(token!==generation.current)return;
   let supported=false;try{supported=typeof navigator.canShare==='function'&&navigator.canShare({files:[file]})}catch{}
   const value:Story={file,url:asset.current?.url||URL.createObjectURL(file),copied,canShare:supported};asset.current=value;setStory(value);setManual(!copied);
   setNotice(copied?"Story image ready. Product link copied. Add it using Instagram's Link sticker.":"Story image ready. Copy the product link to add Instagram's Link sticker.");
   // Image generation may outlast transient activation. Keep a fresh-gesture share button.
   if(supported&&(!navigator.userActivation||navigator.userActivation.isActive))await shareStoryFile(file,product.name,fileAdapter());
  }catch(e){if(token===generation.current)setNotice((e as Error).message||'Story image belum dapat disiapkan. Gunakan Copy Link.');}
  finally{pending.current=false;setBusy(false);}
 }
 async function shareReadyStory(){if(!story||pending.current)return;pending.current=true;setBusy(true);try{const result=await shareStoryFile(story.file,product.name,fileAdapter());if(result==='fallback')setNotice('Simpan Story image, lalu unggah melalui Instagram.');}finally{pending.current=false;setBusy(false);}}
 return <div className="product-share"><Drawer open={open} onOpenChange={changeOpen} autoFocus><DrawerTrigger asChild><button className="product-share-button product-share-entry" type="button" aria-label="Share product"><ArrowUpRight size={20} strokeWidth={1.5}/>{admin?'Share Product':'Share'}</button></DrawerTrigger><DrawerContent className="elite-share-sheet"><header><DrawerTitle>Share this piece</DrawerTitle><DrawerClose asChild><button className="elite-share-close" aria-label="Close share" type="button"><X size={20} strokeWidth={1.5}/></button></DrawerClose></header><DrawerDescription className="sr-only">Share this product to your Story, send it to a friend, or copy its link.</DrawerDescription><div className="elite-share-actions"><button type="button" disabled={busy} onClick={()=>void instagram()}><span><InstagramIcon/></span>Instagram Story</button><a href={whatsappShareUrl(product)} target="_blank" rel="noopener noreferrer" onClick={()=>record('whatsapp')}><span><MessageCircle size={23} strokeWidth={1.5}/></span>WhatsApp</a><button type="button" disabled={busy} onClick={()=>void copyLink()}><span><LinkIcon size={22} strokeWidth={1.5}/></span>Copy Link</button><button type="button" disabled={busy} onClick={()=>void more()}><span><Ellipsis size={24} strokeWidth={1.5}/></span>More</button></div>{notice&&<p className="elite-share-notice" role="status" aria-live="polite">{notice}</p>}{story&&<div className="elite-story-ready"><img src={story.url} alt={'ELITE.VTG Story card — '+product.name} width={1080} height={1920}/><div>{story.canShare&&<button className="elite-story-action" type="button" disabled={busy} onClick={()=>void shareReadyStory()}><Share2 size={16}/>Share Story image</button>}<a className="elite-story-action" href={story.url} download={story.file.name}><Download size={16}/>Save Story image</a><p>Choose Instagram if available. Add the product link using Instagram’s Link sticker.</p></div></div>}{manual&&<input className="product-share-manual" aria-label="Product link" readOnly value={url} onFocus={e=>e.currentTarget.select()}/>}</DrawerContent></Drawer>{admin&&<button className="product-share-button admin-copy-product" type="button" onClick={()=>void copyLink()}><LinkIcon size={15}/>Copy Product Link</button>}{!open&&notice&&<span className="product-share-notice" role="status">{notice}</span>}{!open&&manual&&<input className="product-share-manual" aria-label="Product link" readOnly value={url} onFocus={e=>e.currentTarget.select()}/>}</div>;
}
