import test,{after} from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {mkdir,rm} from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
await mkdir('.test-runtime',{recursive:true});const file=path.resolve('.test-runtime/member-invite.mjs');
await build({entryPoints:['modules/catalog/member-invite.ts'],bundle:true,platform:'node',format:'esm',outfile:file});const m=await import(pathToFileURL(file));after(()=>rm(file,{force:true}));
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}};
function environment(){let now=0,sequence=0;const pending=new Map(),events=new EventTarget();return {events,pending,timers:{setTimeout:(fn,ms)=>{const id=++sequence;pending.set(id,{fn,at:now+ms});return id},clearTimeout:id=>pending.delete(id)},advance(ms){now+=ms;while(true){const next=[...pending].sort((a,b)=>a[1].at-b[1].at).find(([,value])=>value.at<=now);if(!next)break;pending.delete(next[0]);next[1].fn()}}}}
test('invitation waits six seconds and only claims the session when shown',()=>{
 const e=environment(),session=m.createMemberInviteSession(storage);let shown=0;const stop=m.scheduleMemberInvite({...e,session,canShow:()=>true,onShow:()=>shown++});
 assert.equal(shown,0);assert.equal(session.seen(),false);e.advance(5999);assert.equal(shown,0);e.advance(1);assert.equal(shown,1);assert.equal(session.seen(),true);assert.equal(e.pending.size,0);
 e.events.dispatchEvent(new Event('pointerup'));e.advance(10000);assert.equal(shown,1);assert.equal(e.pending.size,0);stop();
});
test('dismissed/shown invitation remains suppressed across a new page in the same session',()=>{
 const store=storage(),first=m.createMemberInviteSession(()=>store);first.markSeen();const next=m.createMemberInviteSession(()=>store),e=environment();let shown=0;
 m.scheduleMemberInvite({...e,session:next,canShow:()=>true,onShow:()=>shown++});e.advance(10000);assert.equal(shown,0);assert.equal(e.pending.size,0);
 const freshTab=m.createMemberInviteSession(storage);assert.equal(freshTab.seen(),false);
});
test('hidden tabs, active inputs and other dialogs defer instead of consuming the invitation',()=>{
 for(const reason of ['hidden','input','dialog']){const e=environment(),session=m.createMemberInviteSession(storage);let blocked=true,shown=0;
 m.scheduleMemberInvite({...e,session,canShow:()=>!blocked,onShow:()=>shown++});e.advance(6000);assert.equal(shown,0,reason);assert.equal(session.seen(),false);assert.equal(e.pending.size,0);
 blocked=false;for(const name of ['visibilitychange','focusout','pointerup'])e.events.dispatchEvent(new Event(name));assert.equal(e.pending.size,1);e.advance(199);assert.equal(shown,0);e.advance(1);assert.equal(shown,1);assert.equal(e.pending.size,0);}
});
test('auth changes, opening account and leaving the shopping route cancel pending work',()=>{
 const e=environment(),session=m.createMemberInviteSession(storage);let shown=0;const stop=m.scheduleMemberInvite({...e,session,canShow:()=>true,onShow:()=>shown++});e.advance(3000);stop();e.events.dispatchEvent(new Event('pointerup'));e.advance(10000);assert.equal(shown,0);assert.equal(session.seen(),false);assert.equal(e.pending.size,0);
});
test('another instance claiming the session during the delay prevents a duplicate',()=>{
 const store=storage(),a=m.createMemberInviteSession(()=>store),b=m.createMemberInviteSession(()=>store),e=environment();let shown=0;m.scheduleMemberInvite({...e,session:a,canShow:()=>true,onShow:()=>shown++});b.markSeen();e.advance(6000);assert.equal(shown,0);assert.equal(e.pending.size,0);
});
test('unavailable browser storage remains safe and retains the in-memory dismissal',()=>{
 const session=m.createMemberInviteSession(()=>{throw Error('Storage denied')});assert.equal(session.seen(),false);session.markSeen();assert.equal(session.seen(),true);const e=environment();m.scheduleMemberInvite({...e,session,canShow:()=>true,onShow:()=>assert.fail('must stay dismissed')});assert.equal(e.pending.size,0);
});
