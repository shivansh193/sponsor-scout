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
  const key = `geo2:${lat.toFixed(3)},${lng.toFixed(3)}`;
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
      // Administrative units like "Manhattan Community Board 3" aren't names people use.
      const names = [a.neighbourhood, a.suburb, a.quarter, a.city_district, a.borough, a.town, a.village];
      return names.find((n) => n && !/community board|district \d/i.test(n)) ?? null;
    });
    await kvSet(key, { name }, TTL);
    return { name, cached: false };
  } catch {
    return { name: null, cached: false };
  }
}

/** City centre via Nominatim search, cached for 30 days. Null when geocoding is off or the city is unknown. */
export async function cityPoint(city: string): Promise<{ lat: number; lng: number } | null> {
  const key = `geocity:${city.trim().toLowerCase()}`;
  const hit = await kvGet<{ p: { lat: number; lng: number } | null }>(key);
  if (hit) return hit.p;
  if (!geocodingEnabled()) return null;
  try {
    const p = await throttled(async () => {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&featureType=city&q=${encodeURIComponent(city)}`;
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const [first] = (await res.json()) as { lat: string; lon: string }[];
      return first ? { lat: Number(first.lat), lng: Number(first.lon) } : null;
    });
    await kvSet(key, { p }, TTL);
    return p;
  } catch {
    return null;
  }
}
