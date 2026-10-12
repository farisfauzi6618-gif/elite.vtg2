export const MEMBER_INVITE_DELAY_MS=6000;
const SESSION_KEY='elite:member-invite:v1';
type InviteSession={seen:()=>boolean;markSeen:()=>void};
export function createMemberInviteSession(storage:()=>Pick<Storage,'getItem'|'setItem'>):InviteSession{
 let remembered=false;
 return {
  seen(){if(remembered)return true;try{remembered=storage().getItem(SESSION_KEY)==='1'}catch{}return remembered},
  markSeen(){remembered=true;try{storage().setItem(SESSION_KEY,'1')}catch{}},
 };
}
export const memberInviteSession=createMemberInviteSession(()=>window.sessionStorage);
type Timers={setTimeout:(callback:()=>void,ms:number)=>number;clearTimeout:(id:number)=>void};
// No polling or additional account request: eligibility comes from the account UI.
export function scheduleMemberInvite({session,canShow,onShow,events,timers}:{session:InviteSession;canShow:()=>boolean;onShow:()=>void;events:Pick<Document,'addEventListener'|'removeEventListener'>;timers:Timers}){
 if(session.seen())return ()=>{};
 let stopped=false,ready=false,delay:number|undefined,wake:number|undefined;
 const names=['visibilitychange','focusout','pointerup'];
 const stop=()=>{stopped=true;if(delay!==undefined)timers.clearTimeout(delay);if(wake!==undefined)timers.clearTimeout(wake);for(const name of names)events.removeEventListener(name,resume)};
 const attempt=()=>{if(stopped||!ready)return;if(session.seen()){stop();return}if(!canShow())return;session.markSeen();stop();onShow()};
 const resume=()=>{if(stopped||!ready)return;if(wake!==undefined)timers.clearTimeout(wake);wake=timers.setTimeout(attempt,200)};
 for(const name of names)events.addEventListener(name,resume);
 delay=timers.setTimeout(()=>{ready=true;attempt()},MEMBER_INVITE_DELAY_MS);
 return stop;
}
