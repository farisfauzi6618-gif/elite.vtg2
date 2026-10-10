import { env } from '@/lib/env';
import { db,AppError } from '@/modules/catalog/server';
export const TEAM_COOKIE='elite_team';
const LINK_DAYS=90,SESSION_DAYS=30;
type Access={id:string;slot:number;name:string;token_hash:string;token_cipher:string;active:number;version:number;expires_at:number;created_at:number;analytics_allowed:number};
const now=()=>Date.now();
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
export async function hashTeam(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('')}
async function cipherKey(){if(!env.TEAM_ACCESS_SECRET||env.TEAM_ACCESS_SECRET.length<32)throw new AppError(503,'Akses tim belum dikonfigurasi.');return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('elite-team:'+env.TEAM_ACCESS_SECRET)),'AES-GCM',false,['encrypt','decrypt'])}
async function seal(value:string){const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await cipherKey(),new TextEncoder().encode(value)));return btoa(String.fromCharCode(...iv))+'.'+btoa(String.fromCharCode(...bytes))}
async function unseal(value:string){const [iv,data]=value.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(iv),x=>x.charCodeAt(0))},await cipherKey(),Uint8Array.from(atob(data),x=>x.charCodeAt(0))))}
/** Called only after requireOwner, never by public/team login. Three permanent slots. */
export async function listTeam(origin:string){
 for(let slot=1;slot<=3;slot++){if(await db().prepare('SELECT id FROM team_access WHERE slot=?').bind(slot).first())continue;const secret=token();await db().prepare('INSERT INTO team_access(id,slot,name,token_hash,token_cipher,created_at,expires_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(slot) DO NOTHING').bind(crypto.randomUUID(),slot,'Tim '+slot,await hashTeam(secret),await seal(secret),now(),now()+LINK_DAYS*86400000).run()}
 const rows=await db().prepare('SELECT * FROM team_access ORDER BY slot').all<Access>();
 return Promise.all(rows.results.map(async r=>{let link:string|null=null;if(r.active&&r.expires_at>now()){try{link=origin+'/akses-tim#'+await unseal(r.token_cipher);}catch{/* Existing token hashes remain valid; the owner can renew an unreadable link. */}}return {id:r.id,slot:r.slot,name:r.name,active:r.active===1,analyticsAllowed:r.analytics_allowed===1,expiresAt:r.expires_at,link};}));
}
export async function editTeam(value:unknown){
 const v=value as {id?:unknown;action?:unknown;name?:unknown;allowed?:unknown};if(!v||typeof v.id!=='string')throw new AppError(400,'Pilih akses tim.');
 const r=await db().prepare('SELECT * FROM team_access WHERE id=?').bind(v.id).first<Access>();if(!r)throw new AppError(404,'Akses tim tidak ditemukan.');
 if(v.action==='analytics'){if(typeof v.allowed!=='boolean')throw new AppError(400,'Izin analytics harus boolean.');await db().prepare('UPDATE team_access SET analytics_allowed=? WHERE id=?').bind(v.allowed,r.id).run();return;}
 if(v.action==='rename'){if(typeof v.name!=='string'||v.name.trim().length<2||v.name.trim().length>60||/[\x00-\x1f]/.test(v.name))throw new AppError(400,'Nama anggota harus 2–60 karakter.');await db().prepare('UPDATE team_access SET name=? WHERE id=?').bind(v.name.trim(),r.id).run();return}
 if(v.action==='revoke'){await db().batch([db().prepare('UPDATE team_access SET active=0,version=version+1 WHERE id=?').bind(r.id),db().prepare('DELETE FROM team_sessions WHERE access_id=?').bind(r.id)]);return}
 if(v.action==='rotate'){const secret=token();await db().batch([db().prepare('UPDATE team_access SET token_hash=?,token_cipher=?,active=1,version=version+1,expires_at=? WHERE id=?').bind(await hashTeam(secret),await seal(secret),now()+LINK_DAYS*86400000,r.id),db().prepare('DELETE FROM team_sessions WHERE access_id=?').bind(r.id)]);return}
 throw new AppError(400,'Tindakan akses tim tidak valid.');
}
export async function startTeamSession(secret:unknown){
 if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))throw new AppError(403,'Tautan akses tidak valid, sudah dicabut, atau kedaluwarsa.');
 const r=await db().prepare('SELECT * FROM team_access WHERE token_hash=? AND active=1 AND expires_at>?').bind(await hashTeam(secret),now()).first<Access>();if(!r)throw new AppError(403,'Tautan akses tidak valid, sudah dicabut, atau kedaluwarsa.');
 const session=token(),expires=Math.min(now()+SESSION_DAYS*86400000,r.expires_at);
 const created=await db().prepare('INSERT INTO team_sessions(hash,access_id,version,created_at,expires_at) SELECT ?,id,version,?,? FROM team_access WHERE id=? AND version=? AND active=1 AND expires_at>? RETURNING hash').bind(await hashTeam(session),now(),expires,r.id,r.version,now()).first();if(!created)throw new AppError(403,'Akses tim sudah berubah. Minta tautan terbaru kepada pemilik.');
 await db().prepare('DELETE FROM team_sessions WHERE expires_at<?').bind(now()).run();return {session,expires,name:r.name};
}
export function teamCookieValue(raw:string|null){return raw?.split(';').map(x=>x.trim()).find(x=>x.startsWith(TEAM_COOKIE+'='))?.slice(TEAM_COOKIE.length+1)||null}
export async function teamIdentity(cookie:string|null){const session=teamCookieValue(cookie);if(!session||!/^[a-f0-9]{64}$/.test(session))return null;
 const r=await db().prepare('SELECT a.id,a.name,a.analytics_allowed FROM team_sessions s JOIN team_access a ON a.id=s.access_id WHERE s.hash=? AND s.expires_at>? AND a.active=1 AND a.expires_at>? AND a.version=s.version').bind(await hashTeam(session),now(),now()).first<{id:string;name:string;analytics_allowed:number}>();return r?{role:'team' as const,analyticsAllowed:r.analytics_allowed===1,userId:'team:'+r.id,email:'',displayName:r.name,fullName:null}:null;
}
export async function endTeamSession(raw:string|null){const value=teamCookieValue(raw);if(value&&/^[a-f0-9]{64}$/.test(value))await db().prepare('DELETE FROM team_sessions WHERE hash=?').bind(await hashTeam(value)).run()}
export function sessionCookie(request:Request,value:string,expires?:number){return `${TEAM_COOKIE}=${value}; Path=/; HttpOnly; ${new URL(request.url).protocol==='https:'?'Secure; ':''}SameSite=Strict; Max-Age=${expires?Math.max(0,Math.floor((expires-now())/1000)):0}`}
