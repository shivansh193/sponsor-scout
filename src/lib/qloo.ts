import { cached, hashKey } from "./cache";
import { mockQloo } from "./mock";
import type { AgeBand, Demographics, Entity, EntityKind, HeatPoint, Tag } from "./types";

// Typed wrapper for the Qloo hackathon API. All calls are GET with query params
// and the X-Api-Key header. Raw responses go through the server-side cache
// (24h) and are then normalised by the parsers below, so mock and live data
// take the same path.
//
// The docs don't publish full response schemas; the parsers were checked
// against live responses with scripts/probe.mts. Demographics come back as
// signed indices (-1..1) relative to the general population, not shares.

export const QLOO_BASE = process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";
const CACHE_TTL = 60 * 60 * 24;

export const isMock = () => process.env.QLOO_MOCK === "1" || !process.env.QLOO_API_KEY;

export class QlooError extends Error {
  constructor(
    public status: number,
    public path: string,
    message: string,
  ) {
    super(message);
  }
}

export type Params = Record<string, string | number | undefined | null>;

export function canonicalQuery(params: Params): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join("&");
}

export interface RawResult {
  data: unknown;
  cacheHit: boolean;
}

// The hackathon API allows 10 requests per second (X-Second-RateLimit-Limit).
// One run fans out about a dozen calls at once, so starts are spaced to stay
// under that, and a 429 is retried after the window resets.
const PER_SECOND = 8;
const RETRIES_429 = 3;
const recentStarts: number[] = [];

async function slot() {
  for (;;) {
    const now = Date.now();
    while (recentStarts.length && now - recentStarts[0] >= 1000) recentStarts.shift();
    if (recentStarts.length < PER_SECOND) {
      recentStarts.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000 - (now - recentStarts[0]) + 5));
  }
}

async function fetchQloo(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await slot();
    const res = await fetch(url, {
      headers: { "X-Api-Key": process.env.QLOO_API_KEY!, accept: "application/json" },
      cache: "no-store",
    });
    if (res.status !== 429 || attempt >= RETRIES_429) return res;
    await new Promise((r) => setTimeout(r, 1100 + attempt * 500 + Math.random() * 300));
  }
}

export async function qlooGet(path: string, params: Params): Promise<RawResult> {
  const qs = canonicalQuery(params);
  const mock = isMock();
  const key = `qloo:${mock ? "mock" : "live"}:${hashKey(`${path}?${qs}`)}`;
  const { value, hit } = await cached(key, CACHE_TTL, async () => {
    if (mock) return mockQloo(path, params);
    const res = await fetchQloo(`${QLOO_BASE}${path}?${qs}`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 403 on an entity type usually means the type is unsupported for this key.
      throw new QlooError(res.status, path, `Qloo ${res.status} on ${path}: ${body.slice(0, 200)}`);
    }
    return res.json();
  });
  return { data: value, cacheHit: hit };
}

// ---------- parsing helpers ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

function dig(o: unknown, ...path: string[]): unknown {
  let cur = o;
  for (const p of path) {
    if (!isObj(cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function parseTag(t: unknown): Tag | null {
  if (!isObj(t)) return null;
  const id = str(t.tag_id) ?? str(t.id);
  const name = str(t.name);
  if (!id || !name) return null;
  return { id, name, type: str(t.subtype) ?? str(t.type) };
}

export function kindFromTypes(types: unknown, fallback: string): string {
  const first = Array.isArray(types) ? types.find((t) => typeof t === "string") : undefined;
  return typeof first === "string" ? first.replace("urn:entity:", "") : fallback;
}

export function parseEntity(e: unknown, fallbackKind = "unknown"): Entity | null {
  if (!isObj(e)) return null;
  const id = str(e.entity_id) ?? str(e.id);
  const name = str(e.name);
  if (!id || !name) return null;
  const props = isObj(e.properties) ? e.properties : {};
  const loc = isObj(e.location) ? e.location : undefined;
  return {
    id,
    name,
    kind: kindFromTypes(e.types, fallbackKind),
    affinity: num(dig(e, "query", "affinity")),
    popularity: num(e.popularity),
    tags: Array.isArray(e.tags) ? (e.tags.map(parseTag).filter(Boolean) as Tag[]) : [],
    description: str(props.short_description) ?? str(props.description),
    address: str(props.address),
    url: str(props.website) ?? str(props.url),
    lat: loc ? (num(loc.lat) ?? num(loc.latitude) ?? undefined) : undefined,
    lng: loc ? (num(loc.lon) ?? num(loc.lng) ?? num(loc.longitude) ?? undefined) : undefined,
  };
}

function entityArray(data: unknown): unknown[] {
  const r = dig(data, "results");
  if (Array.isArray(r)) return r; // /search
  const e = dig(data, "results", "entities");
  return Array.isArray(e) ? e : [];
}

// ---------- endpoints ----------

export interface Call<T> {
  value: T;
  cacheHit: boolean;
  warning?: string;
}

export async function searchEntities(query: string, kinds: EntityKind[] = ["brand"], take = 8): Promise<Call<Entity[]>> {
  const r = await qlooGet("/search", {
    query,
    types: kinds.map((k) => `urn:entity:${k}`).join(","),
    take,
  });
  const value = entityArray(r.data)
    .map((e) => parseEntity(e, kinds[0]))
    .filter(Boolean) as Entity[];
  return { value, cacheHit: r.cacheHit };
}

export async function searchTags(query: string, take = 10): Promise<Call<Tag[]>> {
  const r = await qlooGet("/v2/tags", { "filter.query": query, take });
  const arr = dig(r.data, "results", "tags");
  const value = Array.isArray(arr) ? (arr.map(parseTag).filter(Boolean) as Tag[]) : [];
  return { value, cacheHit: r.cacheHit };
}

export interface InsightsOpts {
  entities?: string[];
  tags?: string[];
  age?: AgeBand;
  popularityMax?: number;
  excludeTags?: string[];
  excludeEntities?: string[];
  location?: string;
  /** Searches within radius metres of a point instead of by location name. */
  near?: { lat: number; lng: number; radius: number };
  take?: number;
}

function signalParams(o: InsightsOpts): Params {
  return {
    "signal.interests.entities": o.entities?.length ? o.entities.join(",") : undefined,
    "signal.interests.tags": o.tags?.length ? o.tags.join(",") : undefined,
    "signal.demographics.age": o.age,
  };
}

export async function insights(kind: EntityKind, o: InsightsOpts): Promise<Call<Entity[]>> {
  const r = await qlooGet("/v2/insights", {
    "filter.type": `urn:entity:${kind}`,
    ...signalParams(o),
    "filter.popularity.max": o.popularityMax,
    "filter.exclude.tags": o.excludeTags?.length ? o.excludeTags.join(",") : undefined,
    "filter.exclude.entities": o.excludeEntities?.length ? o.excludeEntities.join(",") : undefined,
    "filter.location.query": o.near ? undefined : o.location,
    "filter.location": o.near ? `POINT(${o.near.lng} ${o.near.lat})` : undefined,
    "filter.location.radius": o.near?.radius,
    take: o.take ?? 10,
  });
  const value = entityArray(r.data)
    .map((e) => parseEntity(e, kind))
    .filter(Boolean) as Entity[];
  // Qloo silently ignores invalid params: an empty 200 often means a param that
  // doesn't apply to this filter.type.
  const warning = value.length
    ? undefined
    : `Empty result for ${kind}. Check params against the Entity Type Parameter Guide.`;
  if (warning) console.warn(`[qloo] ${warning}`);
  return { value, cacheHit: r.cacheHit, warning };
}

/** Averages the per-entity demographic affinities into one profile. */
export function parseDemographics(data: unknown): Demographics | null {
  const rows = dig(data, "results", "demographics");
  if (!Array.isArray(rows) || !rows.length) return null;
  const age: Record<string, number[]> = {};
  const gender: Record<string, number[]> = {};
  for (const row of rows) {
    const q = dig(row, "query");
    for (const [bucket, target] of [
      ["age", age],
      ["gender", gender],
    ] as const) {
      const m = dig(q, bucket);
      if (!isObj(m)) continue;
      for (const [k, v] of Object.entries(m)) if (num(v) !== null) (target[k] ??= []).push(v as number);
    }
  }
  const avg = (m: Record<string, number[]>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
  const out = { age: avg(age), gender: avg(gender) };
  return Object.keys(out.age).length || Object.keys(out.gender).length ? out : null;
}

export async function demographics(entities: string[]): Promise<Call<Demographics | null>> {
  const r = await qlooGet("/v2/insights", {
    "filter.type": "urn:demographics",
    "signal.interests.entities": entities.join(","),
  });
  return { value: parseDemographics(r.data), cacheHit: r.cacheHit };
}

export function parseHeatmap(data: unknown): HeatPoint[] {
  const rows = dig(data, "results", "heatmap");
  if (!Array.isArray(rows)) return [];
  const out: HeatPoint[] = [];
  for (const row of rows) {
    const lat = num(dig(row, "location", "latitude"));
    const lng = num(dig(row, "location", "longitude"));
    if (lat === null || lng === null) continue;
    out.push({
      lat,
      lng,
      geohash: str(dig(row, "location", "geohash")) ?? "",
      affinity: num(dig(row, "query", "affinity")) ?? 0,
      affinityRank: num(dig(row, "query", "affinity_rank")) ?? 0,
      popularity: num(dig(row, "query", "popularity")) ?? 0,
    });
  }
  return out;
}

export async function heatmap(o: InsightsOpts & { location: string }): Promise<Call<HeatPoint[]>> {
  const r = await qlooGet("/v2/insights", {
    "filter.type": "urn:heatmap",
    "filter.location.query": o.location,
    ...signalParams(o),
  });
  return { value: parseHeatmap(r.data), cacheHit: r.cacheHit };
}

export interface Overlap {
  score: number | null;
  sharedTags: string[];
}

/** /v2/analysis/compare. Returns shared tags with query.score; this keeps the top tag names and their average score. */
export function parseCompare(data: unknown): Overlap {
  const res = dig(data, "results");
  const rows = (Array.isArray(dig(res, "tags")) ? dig(res, "tags") : dig(res, "entities")) as unknown[] | undefined;
  if (!Array.isArray(rows)) return { score: null, sharedTags: [] };
  const names: string[] = [];
  const scores: number[] = [];
  for (const row of rows) {
    const n = str(dig(row, "name"));
    if (n) names.push(n);
    const s = num(dig(row, "query", "affinity")) ?? num(dig(row, "query", "score")) ?? num(dig(row, "score"));
    if (s !== null) scores.push(s);
  }
  return {
    score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    sharedTags: names.slice(0, 5),
  };
}

export async function compare(a: string[], b: string[]): Promise<Call<Overlap>> {
  const r = await qlooGet("/v2/analysis/compare", {
    "a.signal.interests.entities": a.join(","),
    "b.signal.interests.entities": b.join(","),
  });
  return { value: parseCompare(r.data), cacheHit: r.cacheHit };
}
