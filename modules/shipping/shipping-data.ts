export type Location = { id: number; label: string; province: string; city: string; district: string; village: string; postalCode: string };
export type Rate = { cost: number; service: string; etd: string; description?:string };
type Row = Record<string, unknown>;
const field = (v: unknown, max = 240) => typeof v === "string" ? v.trim().slice(0, max) : "";
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export function normalizeLocations(data: unknown): Location[] {
  if (!Array.isArray(data)) throw new Error("INVALID_LOCATION_RESPONSE");
  const seen = new Set<number>();
  return data.flatMap((raw): Location[] => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Row;
    const id = typeof row.id === "number" ? row.id : Number(row.id);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) return [];
    const item = { id, label: field(row.label), province: field(row.province_name, 80), city: field(row.city_name, 80), district: field(row.district_name, 80), village: field(row.subdistrict_name, 80), postalCode: field(row.zip_code, 10) };
    if (!item.label || !item.city || !item.district) return [];
    seen.add(id); return [item];
  });
}
export function resolveOrigin(locations: Location[]): Location {
  const matches = locations.filter(l => norm(l.district) === "BALEENDAH" && ["BANDUNG", "KABUPATENBANDUNG", "KABBANDUNG"].includes(norm(l.city)) && norm(l.province) === "JAWABARAT" && norm(l.village) === "BALEENDAH");
  if (matches.length !== 1) throw new Error("AMBIGUOUS_ORIGIN");
  return matches[0];
}
export function availableJntRates(data: unknown): Rate[] {
  if (!Array.isArray(data)) throw new Error("INVALID_RATE_RESPONSE");
  const rates = data.flatMap((raw): Rate[] => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Row;
    const service = field(row.service, 40);
    const cost = typeof row.cost === "number" ? row.cost : Number(row.cost);
    if (field(row.code).toLowerCase() !== "jnt" || !/^[A-Za-z0-9][A-Za-z0-9 _&+./()-]{0,39}$/.test(service) || !Number.isSafeInteger(cost) || cost <= 0 || cost > 100000000) return [];
    return [{ cost, service, etd: field(row.etd, 80),description:field(row.description,100) }];
  });
  const unique=new Map<string,Rate>();
  for(const rate of rates){const code=norm(rate.service),previous=unique.get(code);if(!previous||rate.cost<previous.cost)unique.set(code,rate);}
  return [...unique.values()].sort((a,b)=>a.cost-b.cost);
}
export function selectRegularRate(data: unknown): Rate | null {
  const rates=availableJntRates(data).filter(r=>["EZ", "REG", "REGULAR", "REGULER"].includes(norm(r.service)));
  if (!rates.length) return null;
  // Use only an explicitly recognised regular service. Other J&T services never substitute for it.
  const preferred = rates.filter(r => norm(r.service) === "EZ");
  return (preferred.length ? preferred : rates).reduce((a,b) => b.cost < a.cost ? b : a);
}
