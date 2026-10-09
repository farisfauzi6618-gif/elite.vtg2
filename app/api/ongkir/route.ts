import { assertSameOrigin, quote, rates, search, ShippingError, status } from "@/modules/shipping/shipping-server";
import { connect } from '@/modules/shipping/legacy-shipping-server';
import { getOwnerUser } from '@/lib/auth/owner';
import { publicRate } from '@/modules/catalog/request-rate';
import { readLimitedText } from '@/modules/catalog/request-limits';
export const dynamic = "force-dynamic";
const respond = (payload: unknown, code = 200) => Response.json(payload, {status:code, headers:{"Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"}});
function fail(error: unknown) {
  if (error instanceof ShippingError) return respond({error:error.message,code:error.code},error.status);
  // Never log request bodies, provider responses, or API credentials.
  console.error("Shipping operation failed");
  return respond({error:"Layanan ongkir sedang tidak tersedia. Coba lagi atau gunakan tarif manual.",code:"UNAVAILABLE"},503);
}
async function owner(req: Request) { if (!await getOwnerUser(req)) throw new ShippingError(401,'OWNER_ONLY','Masuk sebagai pemilik untuk menggunakan kalkulator ongkir.'); }
export async function GET(req: Request) {
  try {await owner(req); return respond(await status());} catch(e) {return fail(e);}
}
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await owner(req);
    await publicRate(req,'owner-shipping',180);
    const raw = await readLimitedText(req,2048);
    let body;
    try {body=JSON.parse(raw);} catch {throw new ShippingError(400,"INVALID_INPUT","Format permintaan tidak valid.");}
    if (!body || typeof body!=="object" || Array.isArray(body)) throw new ShippingError(400,"INVALID_INPUT","Permintaan tidak valid.");
    if(body.action==="connect" && typeof body.key==='string') return respond(await connect(body.key));
    if(body.action==="search" && typeof body.query==="string") return respond({locations:await search(body.query)});
    if(body.action==="quote" && typeof body.destinationId==="number" && typeof body.grams==="number") return respond(await quote(body.destinationId,body.grams));
    if(body.action==="rates" && typeof body.destinationId==="number" && typeof body.grams==="number") return respond(await rates(body.destinationId,body.grams));
    throw new ShippingError(400,"INVALID_INPUT","Permintaan ongkir tidak valid.");
  } catch(e) {return fail(e);}
}

export const runtime="nodejs";
