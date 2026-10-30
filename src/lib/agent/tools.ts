import * as qloo from "../qloo";
import { cityPoint, neighbourhoodName } from "../geo";
import { BUDGETS, categoryTags, excludeCompetitors, mergeNeighbourhoods, pct, rankPicks, topPoints } from "../score";
import type { Entity, EntityKind, Evidence, Pick, Report, SponsorKind, TraceStep } from "../types";
import type { ToolDef } from "../llm";

// Agent tools. Each one calls Qloo, runs deterministic scoring, writes its
// result into the report, and returns a compact summary for the LLM. The LLM
// sees numbers only through these summaries.

export type Emit = (e: { type: "step"; step: TraceStep } | { type: "note"; text: string }) => void;

export interface Ctx {
  report: Report;
  emit: Emit;
}

export interface ToolResult {
  count: number;
  summary: Record<string, unknown>;
  note?: string;
  empty?: boolean;
}

const SPONSOR_KINDS: SponsorKind[] = ["podcast", "person", "artist"];
const KIND_LABEL: Record<string, string> = { podcast: "podcasts", person: "creators", artist: "artists", place: "places", brand: "brands", tv_show: "TV shows", destination: "destinations" };

const brief = (p: Pick | Entity) => ({
  id: p.id,
  name: p.name,
  affinity: p.affinity == null ? null : Math.round(p.affinity * 100),
  popularity_pct: p.popularity == null ? null : Math.round(p.popularity * 100),
  ...("valueScore" in p ? { value: Math.round(p.valueScore * 100), raw_rank: p.rankRaw } : {}),
});

function seedIds(r: Report) {
  return r.seed.entities.map((e) => e.id);
}

function signal(r: Report) {
  return { entities: seedIds(r), tags: r.seed.tags.map((t) => t.id), age: r.input.age };
}

function requireSeed(r: Report) {
  if (!r.seed.entities.length && !r.seed.tags.length) throw new Error("No audience signal yet. Call resolve_brand or resolve_lookalikes first.");
}

function audienceLabel(r: Report) {
  return r.input.brand ? `${r.input.brand.name}'s audience` : "your audience";
}

// ---------- tool implementations ----------

async function resolve_brand(ctx: Ctx, args: { query?: string }): Promise<ToolResult> {
  const r = ctx.report;
  const query = args.query || r.input.brand?.name || r.input.brandQuery;
  const { value } = await qloo.searchEntities(query, ["brand"], 5);
  const confirmed = r.input.brand ? value.find((e) => e.id === r.input.brand!.id) ?? value[0] : value[0];
  if (!confirmed) return { count: 0, empty: true, summary: { found: false, hint: "Brand not in Qloo. Call resolve_lookalikes." }, note: "not found" };
  const entity = r.input.brand ? { id: r.input.brand.id, name: r.input.brand.name } : { id: confirmed.id, name: confirmed.name };
  if (!r.seed.entities.some((e) => e.id === entity.id)) r.seed.entities.unshift(entity);
  r.seed.categoryTags = dedupe([...r.seed.categoryTags, ...categoryTags(confirmed.tags)]);
  r.seed.tags = dedupe([...r.seed.tags, ...r.input.tags]);
  return { count: 1, summary: { found: true, brand: entity.name, popularity_pct: confirmed.popularity == null ? null : Math.round(confirmed.popularity * 100), tags: confirmed.tags.map((t) => t.name).slice(0, 6) } };
}

async function resolve_lookalikes(ctx: Ctx): Promise<ToolResult> {
  const r = ctx.report;
  const { lookalikes, tags } = r.input;
  if (!lookalikes.length && !tags.length) return { count: 0, empty: true, summary: { error: "No lookalike brands or vibe tags were given." } };
  for (const l of lookalikes) if (!r.seed.entities.some((e) => e.id === l.id)) r.seed.entities.push(l);
  // Category tags of the lookalikes mark competitors to exclude from collabs.
  for (const l of lookalikes) {
    const { value } = await qloo.searchEntities(l.name, ["brand"], 3);
    const hit = value.find((e) => e.id === l.id);
    if (hit) r.seed.categoryTags = dedupe([...r.seed.categoryTags, ...categoryTags(hit.tags)]);
  }
  r.seed.tags = dedupe([...r.seed.tags, ...tags]);
  r.seed.categoryTags = dedupe([...r.seed.categoryTags, ...categoryTags(tags)]);
  return { count: lookalikes.length + tags.length, summary: { lookalikes: lookalikes.map((l) => l.name), tags: tags.map((t) => t.name) } };
}

const PROFILE_KINDS: EntityKind[] = ["artist", "podcast", "tv_show", "brand", "destination"];

async function audience_profile(ctx: Ctx): Promise<ToolResult> {
  const r = ctx.report;
  requireSeed(r);
  const s = signal(r);
  const [demo, ...lists] = await Promise.all([
    s.entities.length ? qloo.demographics(s.entities).catch(() => ({ value: null })) : Promise.resolve({ value: null }),
    ...PROFILE_KINDS.map((k) => qloo.insights(k, { ...s, excludeEntities: s.entities, take: 6 }).catch(() => ({ value: [] as Entity[] }))),
  ]);
  r.audience.demographics = demo.value;
  PROFILE_KINDS.forEach((k, i) => (r.audience.top[k] = lists[i].value));
  const count = lists.reduce((n, l) => n + l.value.length, 0);
  const d = demo.value;
  return {
    count,
    empty: count === 0,
    summary: {
      demographics: d ? { age: round2(d.age), gender: round2(d.gender) } : "unavailable",
      top: Object.fromEntries(PROFILE_KINDS.map((k, i) => [k, lists[i].value.slice(0, 4).map(brief)])),
    },
  };
}

async function find_sponsors(ctx: Ctx, args: { category?: string }): Promise<ToolResult> {
  const r = ctx.report;
  requireSeed(r);
  const kind = (SPONSOR_KINDS.includes(args.category as SponsorKind) ? args.category : "podcast") as SponsorKind;
  const { popularityMax } = BUDGETS[r.input.budget];
  const res = await qloo.insights(kind, { ...signal(r), popularityMax, excludeEntities: seedIds(r), take: 20 });
  const picks = rankPicks(res.value, r.input.budget, audienceLabel(r)).slice(0, 10);
  r.sponsors[kind] = picks;
  return {
    count: picks.length,
    empty: !picks.length,
    note: res.warning,
    summary: { category: kind, budget: r.input.budget, popularity_cap_pct: popularityMax ? Math.round(popularityMax * 100) : null, picks: picks.slice(0, 5).map(brief) },
  };
}

async function map_city(ctx: Ctx, args: { city?: string }): Promise<ToolResult> {
  const r = ctx.report;
  requireSeed(r);
  const city = args.city || r.input.city;
  if (!city) return { count: 0, empty: true, summary: { error: "No city given." } };
  const res = await qloo.heatmap({ ...signal(r), location: city });
  const points = res.value;
  const top = topPoints(points, 12);
  const named = [];
  let fetched = 0;
  for (const p of top) {
    const g = await neighbourhoodName(p.lat, p.lng, fetched < 8);
    if (!g.cached) fetched++;
    named.push({ ...p, name: g.name });
  }
  // Prefer areas with a readable name; fall back to grid cells only if too few resolved.
  const merged = mergeNeighbourhoods(named);
  const withNames = merged.filter((h) => !h.name.startsWith("Area "));
  const hoods = (withNames.length >= 3 ? withNames : merged).slice(0, 6);
  const center = points.length ? ([avg(points.map((p) => p.lat)), avg(points.map((p) => p.lng))] as [number, number]) : null;
  r.city = { query: city, center, points, neighbourhoods: hoods, partners: r.city?.partners ?? [] };
  return {
    count: points.length,
    empty: !points.length,
    note: points.length ? `${hoods.length} neighbourhoods` : "no heatmap data",
    summary: { city, grid_points: points.length, top_neighbourhoods: hoods.map((h) => ({ name: h.name, affinity_rank_pct: Math.round(h.affinityRank * 100), grid_points: h.points })) },
  };
}

async function find_partners(ctx: Ctx, args: { city?: string }): Promise<ToolResult> {
  const r = ctx.report;
  requireSeed(r);
  const city = args.city || r.input.city;
  if (!city) return { count: 0, empty: true, summary: { error: "No city given." } };
  // A bare name like "New York" can resolve to the whole state, so live runs
  // search around the geocoded city centre. Hotels are rarely pop-up partners.
  const pt = qloo.isMock() ? null : await cityPoint(city);
  const res = await qloo.insights("place", { ...signal(r), location: city, near: pt ? { ...pt, radius: 15000 } : undefined, excludeTags: ["urn:tag:genre:place:hotel"], popularityMax: BUDGETS[r.input.budget].popularityMax, take: 20 });
  const picks = rankPicks(res.value, r.input.budget, audienceLabel(r)).slice(0, 8);
  r.city = r.city ? { ...r.city, partners: picks } : { query: city, center: null, points: [], neighbourhoods: [], partners: picks };
  return { count: picks.length, empty: !picks.length, note: res.warning, summary: { city, partners: picks.slice(0, 5).map(brief) } };
}

// Qloo files hospitals, universities and the like as brands; they aren't collab partners.
const NOT_COLLAB_GENRES = ["healthcare", "academic", "government", "religious"].map((g) => `urn:tag:genre:brand:${g}`);

async function find_collab_brands(ctx: Ctx): Promise<ToolResult> {
  const r = ctx.report;
  requireSeed(r);
  const cats = [...r.seed.categoryTags.map((t) => t.id), ...NOT_COLLAB_GENRES];
  const res = await qloo.insights("brand", { ...signal(r), excludeTags: cats, excludeEntities: seedIds(r), popularityMax: BUDGETS[r.input.budget].popularityMax, take: 20 });
  // Qloo ignores bad params silently, so the exclusion is applied again in code.
  const clean = excludeCompetitors(res.value, cats, seedIds(r));
  const picks = rankPicks(clean, r.input.budget, audienceLabel(r)).slice(0, 8);
  r.collabs = picks;
  return { count: picks.length, empty: !picks.length, note: res.value.length !== clean.length ? `dropped ${res.value.length - clean.length} competitors` : undefined, summary: { excluded_categories: r.seed.categoryTags.map((t) => t.name), collabs: picks.slice(0, 5).map(brief) } };
}

export function findPick(r: Report, id: string): Pick | undefined {
  const all = [...Object.values(r.sponsors).flat(), ...(r.city?.partners ?? []), ...r.collabs];
  return all.find((p) => p?.id === id);
}

export async function explainPick(r: Report, id: string): Promise<Evidence> {
  const pick = findPick(r, id);
  if (!pick) throw new Error(`Unknown pick ${id}`);
  const ids = seedIds(r);
  const [cmp, demo] = await Promise.all([
    ids.length ? qloo.compare(ids, [id]).catch(() => ({ value: { score: null, sharedTags: [] } })) : Promise.resolve({ value: { score: null, sharedTags: pick.tags.map((t) => t.name).slice(0, 3) } }),
    qloo.demographics([id]).catch(() => ({ value: null })),
  ]);
  return { pick, overlap: cmp.value, demographics: demo.value, audienceDemographics: r.audience.demographics };
}

async function explain_pick(ctx: Ctx, args: { entity_id?: string }): Promise<ToolResult> {
  const ev = await explainPick(ctx.report, String(args.entity_id ?? ""));
  return {
    count: 1,
    summary: { pick: brief(ev.pick), overlap_score: ev.overlap.score == null ? null : Math.round(ev.overlap.score * 100), shared_tags: ev.overlap.sharedTags, pick_gender: ev.demographics ? round2(ev.demographics.gender) : null },
  };
}

// ---------- registry ----------

type Impl = (ctx: Ctx, args: Record<string, unknown>) => Promise<ToolResult>;

export const TOOLS: Record<string, { def: ToolDef; impl: Impl; label: (a: Record<string, unknown>, r: Report) => string }> = {
  resolve_brand: {
    def: { name: "resolve_brand", description: "Look up the user's brand in Qloo and use it as the audience signal. Returns found=false if Qloo doesn't know it.", parameters: { type: "object", properties: { query: { type: "string", description: "Brand name" } } } },
    impl: (c, a) => resolve_brand(c, a as { query?: string }),
    label: (a, r) => `Resolving ${a.query || r.input.brand?.name || r.input.brandQuery}`,
  },
  resolve_lookalikes: {
    def: { name: "resolve_lookalikes", description: "Use the user's lookalike brands and vibe tags as the audience signal. Use when the brand is not in Qloo, or to add the user's tags.", parameters: { type: "object", properties: {} } },
    impl: (c) => resolve_lookalikes(c),
    label: () => "Using brands like yours",
  },
  audience_profile: {
    def: { name: "audience_profile", description: "Profile the audience: age and gender affinity, plus top artists, podcasts, TV shows, brands and destinations.", parameters: { type: "object", properties: {} } },
    impl: (c) => audience_profile(c),
    label: () => "Profiling audience",
  },
  find_sponsors: {
    def: { name: "find_sponsors", description: "Rank sponsorship targets in one category by affinity and by value (affinity discounted by popularity, per the user's budget). Call once per category.", parameters: { type: "object", properties: { category: { type: "string", enum: SPONSOR_KINDS } }, required: ["category"] } },
    impl: (c, a) => find_sponsors(c, a as { category?: string }),
    label: (a) => `Finding ${KIND_LABEL[String(a.category)] ?? "sponsors"}`,
  },
  map_city: {
    def: { name: "map_city", description: "Heatmap of where the audience over-indexes in a city, with named top neighbourhoods.", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } },
    impl: (c, a) => map_city(c, a as { city?: string }),
    label: (a, r) => `Mapping ${a.city || r.input.city}`,
  },
  find_partners: {
    def: { name: "find_partners", description: "Local places (cafés, venues, stores) in a city whose audience matches, as partner candidates.", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } },
    impl: (c, a) => find_partners(c, a as { city?: string }),
    label: (a, r) => `Finding partner places in ${a.city || r.input.city}`,
  },
  find_collab_brands: {
    def: { name: "find_collab_brands", description: "Non-competing brands the audience loves, for collaborations. Excludes the user's own category.", parameters: { type: "object", properties: {} } },
    impl: (c) => find_collab_brands(c),
    label: () => "Finding collab brands",
  },
  explain_pick: {
    def: { name: "explain_pick", description: "Audience overlap and demographics for one pick, by entity id. Optional; use for the single strongest pick if you want to cite overlap.", parameters: { type: "object", properties: { entity_id: { type: "string" } }, required: ["entity_id"] } },
    impl: (c, a) => explain_pick(c, a as { entity_id?: string }),
    label: (a, r) => `Explaining ${findPick(r, String(a.entity_id))?.name ?? "pick"}`,
  },
};

let stepN = 0;
export async function runTool(ctx: Ctx, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const t = TOOLS[name];
  const step: TraceStep = { id: `s${Date.now().toString(36)}${stepN++}`, tool: name, label: t ? t.label(args, ctx.report) : name, input: shortArgs(args), status: "running" };
  ctx.report.trace.push(step);
  ctx.emit({ type: "step", step: { ...step } });
  const t0 = Date.now();
  try {
    if (!t) throw new Error(`Unknown tool ${name}`);
    const res = await t.impl(ctx, args);
    Object.assign(step, { status: res.empty ? "empty" : "done", count: res.count, ms: Date.now() - t0, note: res.note });
    ctx.emit({ type: "step", step: { ...step } });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Object.assign(step, { status: "error", ms: Date.now() - t0, note: msg.slice(0, 160) });
    ctx.emit({ type: "step", step: { ...step } });
    return { count: 0, empty: true, summary: { error: msg.slice(0, 300) } };
  }
}

// ---------- helpers ----------

function shortArgs(a: Record<string, unknown>): string {
  const s = Object.entries(a)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

function dedupe<T extends { id: string }>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

function avg(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round2(m: Record<string, number>) {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v * 100) / 100]));
}

export { pct };
