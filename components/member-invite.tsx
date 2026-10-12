'use client';
import {useEffect,useRef,useState} from 'react';
import {Dialog as DialogPrimitive} from 'radix-ui';
import {X} from 'lucide-react';
import {Dialog,DialogClose,DialogPortal,DialogOverlay,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {memberInviteSession,scheduleMemberInvite} from '@/modules/catalog/member-invite';

export function MemberInvite({eligible,blocked,onJoin}:{eligible:boolean;blocked:boolean;onJoin:()=>void}){
 const [open,setOpen]=useState(false),joining=useRef(false),content=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!eligible||blocked){setOpen(false);return}
  return scheduleMemberInvite({session:memberInviteSession,onShow:()=>{joining.current=false;setOpen(true)},events:document,timers:{setTimeout:window.setTimeout.bind(window),clearTimeout:window.clearTimeout.bind(window)},canShow:()=>document.visibilityState==='visible'&&!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')&&!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')});
 },[eligible,blocked]);
 function close(){memberInviteSession.markSeen();setOpen(false)}
 function join(){joining.current=true;close();onJoin()}
 return <Dialog open={open&&eligible&&!blocked} onOpenChange={value=>{if(!value)close()}}><DialogPortal>
  <DialogOverlay className="member-invite-overlay"/>
  <DialogPrimitive.Content ref={content} className="member-invite-dialog" lang="en" onOpenAutoFocus={event=>{event.preventDefault();content.current?.focus({preventScroll:true})}} onCloseAutoFocus={event=>{if(joining.current)event.preventDefault()}}>
   <DialogTitle className="member-invite-title">A little more for members.</DialogTitle>
   <DialogDescription asChild><div className="member-invite-copy"><p className="member-invite-benefit">5% off your first order</p><p className="member-invite-rewards">ELITE Card rewards included.</p></div></DialogDescription>
   <div className="member-invite-actions"><button type="button" className="member-invite-join" onClick={join}>JOIN ELITE</button><button type="button" className="member-invite-continue" onClick={close}>Continue shopping</button></div>
   <DialogClose className="member-invite-close" aria-label="Close"><X size={17} strokeWidth={1.3} aria-hidden="true"/></DialogClose>
  </DialogPrimitive.Content>
 </DialogPortal></Dialog>;
}
