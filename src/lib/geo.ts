import { kvGet, kvSet } from "./cache";

// Reverse geocoding via OpenStreetMap Nominatim. Their policy is at most one
// request per second with an identifying User-Agent, so calls are serialised
// and every answer is cached for 30 days.

const UA = process.env.NOMINATIM_USER_AGENT ?? "sponsor-scout/0.1 (hackathon demo)";
const TTL = 60 * 60 * 24 * 30;
let queue: Promise<unknown> = Promise.resolve();
let last = 0;

export const geocodingEnabled = () => process.env.NOMINATIM !== "off";

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fn();
  });
  queue = next.catch(() => undefined);
  return next;
}

export interface GeoName {
  name: string | null;
  cached: boolean;
}

export async function neighbourhoodName(lat: number, lng: number, allowFetch = true): Promise<GeoName> {
  const key = `geo:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = await kvGet<{ name: string | null }>(key);
  if (hit) return { name: hit.name, cached: true };
  if (!geocodingEnabled() || !allowFetch) return { name: null, cached: false };
  try {
    const name = await throttled(async () => {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=15&lat=${lat}&lon=${lng}`;
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const j = (await res.json()) as { address?: Record<string, string> };
      const a = j.address ?? {};
      return a.neighbourhood ?? a.suburb ?? a.quarter ?? a.city_district ?? a.borough ?? a.town ?? a.village ?? null;
    });
    await kvSet(key, { name }, TTL);
    return { name, cached: false };
  } catch {
    return { name: null, cached: false };
  }
}
