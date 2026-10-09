import {sameOrigin} from '@/lib/request-security';
import { env } from '@/lib/env';
import { availableJntRates, normalizeLocations, resolveOrigin, selectRegularRate, type Location } from "@/modules/shipping/shipping-data";

const BASE = "https://rajaongkir.komerce.id/api/v1/";
export class ShippingError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
function db() {
  if (!env.DB) throw new ShippingError(503, "STORAGE_UNAVAILABLE", "Penyimpanan koneksi sedang tidak tersedia. Coba lagi atau gunakan tarif manual.");
  return env.DB;
}
function configSecret() {
  const secret = env.RAJAONGKIR_CONFIG_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) throw new ShippingError(503, "CONFIG_UNAVAILABLE", "Pengaturan koneksi belum siap. Gunakan tarif manual sementara.");
  return secret;
}
async function cryptoKey() {
  const raw = Uint8Array.from(configSecret().match(/.{2}/g)!, s => parseInt(s, 16));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("elite-vtg-rajaongkir-v1") }, await cryptoKey(), new TextEncoder().encode(value));
  return encode(iv) + "." + encode(new Uint8Array(ciphertext));
}
async function decrypt(value: string) {
  const [iv, ciphertext] = value.split(".");
  try {
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv), additionalData: new TextEncoder().encode("elite-vtg-rajaongkir-v1") }, await cryptoKey(), decode(ciphertext));
    return new TextDecoder().decode(raw);
  } catch { throw new ShippingError(503, "KEY_UNAVAILABLE", "Koneksi perlu diaktifkan ulang. Masukkan API key RajaOngkir kembali."); }
}
type ConfigRow = { encrypted_key: string; origin_json: string; updated_at: string };
async function storedConfig() {
  return db().prepare("SELECT encrypted_key, origin_json, updated_at FROM shipping_config WHERE id = 1").first<ConfigRow>();
}
async function initializedConfig() {
  let row = await storedConfig();
  if (!row && env.RAJAONGKIR_API_KEY) {
    await connect(env.RAJAONGKIR_API_KEY);
    row = await storedConfig();
  }
  return row;
}
export async function status() {
  configSecret();
  const row = await initializedConfig();
  if(row){try{await decrypt(row.encrypted_key);}catch(error){if(error instanceof ShippingError&&error.code==='KEY_UNAVAILABLE')return {connected:false,origin:JSON.parse(row.origin_json) as Location,checkedAt:row.updated_at,needsReconnect:true};throw error;}}
  return { connected: !!row, origin: row ? JSON.parse(row.origin_json) as Location : null, checkedAt: row?.updated_at || null };
}
async function configuration() {
  const row = await initializedConfig();
  if (!row) throw new ShippingError(409, "NOT_CONNECTED", "Hubungkan API key RajaOngkir terlebih dahulu, atau gunakan tarif manual.");
  return { key: await decrypt(row.encrypted_key), origin: JSON.parse(row.origin_json) as Location };
}
async function request(path: string, key: string, body?: URLSearchParams, allowNotFound = false): Promise<unknown> {
  let response: Response;
  try { response = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { key, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, body: body?.toString(), signal: AbortSignal.timeout(12000), redirect: "manual" }); }
  catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const message = error instanceof Error ? error.message.split(key).join("[REDACTED]").slice(0, 300) : "Unknown fetch failure";
    console.error("RajaOngkir request failed", { name, message });
    throw new ShippingError(503, "PROVIDER_UNAVAILABLE", "RajaOngkir belum merespons. Coba lagi atau gunakan tarif manual.");
  }
  let payload: { meta?: { code?: number; status?: string | boolean }; data?: unknown };
  try { payload = await response.json(); } catch { throw new ShippingError(502, "INVALID_RESPONSE", "Respons RajaOngkir tidak dapat dibaca. Gunakan tarif manual sementara."); }
  const code = Number(payload.meta?.code || response.status);
  if (response.status === 429 || code === 429) throw new ShippingError(429, "QUOTA_LIMIT", "Batas permintaan RajaOngkir tercapai. Tunggu kuota pulih atau gunakan tarif manual.");
  if ([401,403].includes(response.status) || [401,403].includes(code)) throw new ShippingError(400, "INVALID_API_KEY", "API key ditolak. Gunakan key layanan Cek Ongkir RajaOngkir/Komerce yang aktif.");
  if (allowNotFound && (response.status === 404 || code === 404)) return [];
  if (!response.ok || code >= 400 || payload.meta?.status === "error" || payload.meta?.status === false) throw new ShippingError(502, "PROVIDER_ERROR", "RajaOngkir belum dapat memberikan hasil untuk permintaan ini. Coba lagi atau gunakan tarif manual.");
  return payload.data;
}
async function lookup(query: string, key: string) {
  const params = new URLSearchParams({ search: query, limit: "30", offset: "0" });
  try { return normalizeLocations(await request("destination/domestic-destination?" + params, key, undefined, true)); }
  catch(e) { if(e instanceof ShippingError) throw e; throw new ShippingError(502,"INVALID_RESPONSE","Data wilayah RajaOngkir tidak sesuai format. Gunakan tarif manual sementara."); }
}
export async function connect(key: string) {
  configSecret();
  if (key.length < 10 || key.length > 256 || /\s/.test(key)) throw new ShippingError(400, "INVALID_INPUT", "Tempel API key Cek Ongkir yang lengkap, tanpa spasi.");
  const locations = await lookup("Baleendah", key);
  let origin: Location;
  try { origin = resolveOrigin(locations); }
  catch { throw new ShippingError(502, "ORIGIN_NOT_CONFIRMED", "Asal Baleendah, Kabupaten Bandung belum dapat dicocokkan secara pasti. Koneksi belum disimpan; gunakan tarif manual dan coba lagi nanti."); }
  const encryptedKey = await encrypt(key);
  const now = new Date().toISOString();
  await db().batch([
    db().prepare("INSERT INTO shipping_config (id, encrypted_key, origin_json, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET encrypted_key = excluded.encrypted_key, origin_json = excluded.origin_json, updated_at = excluded.updated_at").bind(encryptedKey, JSON.stringify(origin), now),
    db().prepare("DELETE FROM search_cache"),
    db().prepare("DELETE FROM location_cache"),
  ]);
  return { connected: true, origin, checkedAt: now };
}
export async function search(query: string) {
  const config = await configuration();
  const normalized = query.trim().replace(/\s+/g," ");
  if (normalized.length < 3 || normalized.length > 100 || (!/[\p{L}]/u.test(normalized) && !/^\d{5}$/.test(normalized))) throw new ShippingError(400,"INVALID_INPUT","Ketik minimal 3 karakter nama wilayah atau kode pos 5 digit.");
  const queryKey = normalized.toLowerCase();
  const cached = await db().prepare("SELECT payload FROM search_cache WHERE query = ? AND expires_at > ?").bind(queryKey, Date.now()).first<{payload:string}>();
  if (cached) return JSON.parse(cached.payload) as Location[];
  const locations = await lookup(normalized, config.key);
  // Public geographic data may be cached; shipping rates always come from a fresh user-triggered call.
  const statements = locations.map(l => db().prepare("INSERT INTO location_cache (id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload").bind(l.id, JSON.stringify(l)));
  statements.push(db().prepare("INSERT INTO search_cache (query, payload, expires_at) VALUES (?, ?, ?) ON CONFLICT(query) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at").bind(queryKey,JSON.stringify(locations),Date.now()+7*86400000));
  await db().batch(statements);
  return locations;
}
async function routeRates(destinationId: number, grams: number) {
  if (!Number.isSafeInteger(destinationId) || destinationId <= 0 || !Number.isSafeInteger(grams) || grams < 1 || grams > 100000) throw new ShippingError(400,"INVALID_INPUT","Pilih tujuan dari daftar dan isi berat lebih dari 0 hingga 100 kg.");
  const config = await configuration();
  const cached = await db().prepare("SELECT payload FROM location_cache WHERE id = ?").bind(destinationId).first<{payload:string}>();
  if (!cached) throw new ShippingError(400,"UNKNOWN_DESTINATION","Cari dan pilih ulang tujuan dari daftar RajaOngkir.");
  const destination = JSON.parse(cached.payload) as Location;
  const raw = await request("calculate/domestic-cost", config.key, new URLSearchParams({ origin: String(config.origin.id), destination: String(destinationId), weight: String(grams), courier: "jnt", price: "lowest" }));
  return {destination,raw};
}
export async function rates(destinationId:number,grams:number){
 const {destination,raw}=await routeRates(destinationId,grams);
 let services;try{services=availableJntRates(raw).map(r=>({amount:r.cost,service:r.service,description:r.description||"",etd:r.etd}));}catch{throw new ShippingError(502,"INVALID_RESPONSE","Tarif J&T belum dapat dibaca. Coba lagi.");}
 if(!services.length)throw new ShippingError(404,"NO_JNT_SERVICE","Layanan J&T belum tersedia untuk tujuan dan berat paket ini.");
 return {destination:destination.label,weight:grams/1000,services};
}
export async function quote(destinationId: number, grams: number) {
  const {destination,raw}=await routeRates(destinationId,grams);
  let rate;
  try { rate = selectRegularRate(raw); } catch { throw new ShippingError(502,"INVALID_RESPONSE","Format tarif RajaOngkir tidak dikenali. Gunakan tarif manual sementara."); }
  if (!rate) throw new ShippingError(404,"NO_REGULAR_SERVICE","J&T Regular belum tersedia untuk rute ini. Gunakan tarif manual setelah mengecek Berdu atau agen J&T.");
  return { destination: destination.label, weight: grams / 1000, amount: rate.cost, service: rate.service, etd: rate.etd, source: "RajaOngkir/Komerce — API", checked: new Intl.DateTimeFormat("id-ID", {timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"}).format(new Date())+" WIB" };
}
export function assertSameOrigin(req: Request) {
 if (!sameOrigin(req)) throw new ShippingError(403,"INVALID_ORIGIN","Permintaan harus berasal dari aplikasi ini.");
}
