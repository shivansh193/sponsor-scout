import { encodeGeohash } from "./geohash";

// Synthetic Qloo responses, shaped like the documented API. Every name here is
// invented; no real Qloo data is ever committed. Output is deterministic per
// query so the demo is stable.

type P = Record<string, string | number | undefined | null>;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: string) {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pickOf = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const TAGS: { id: string; name: string; subtype: string }[] = [
  ["urn:tag:category:brand:coffee", "Coffee", "category"],
  ["urn:tag:category:brand:skincare", "Skincare", "category"],
  ["urn:tag:category:brand:sneakers", "Sneakers", "category"],
  ["urn:tag:category:brand:candles", "Candles", "category"],
  ["urn:tag:category:brand:outdoor_gear", "Outdoor gear", "category"],
  ["urn:tag:category:brand:tea", "Tea", "category"],
  ["urn:tag:category:brand:snacks", "Snacks", "category"],
  ["urn:tag:keyword:qloo:slow_living", "Slow living", "keyword"],
  ["urn:tag:keyword:qloo:minimalist", "Minimalist", "keyword"],
  ["urn:tag:keyword:qloo:sustainable", "Sustainable", "keyword"],
  ["urn:tag:keyword:qloo:streetwear", "Streetwear", "keyword"],
  ["urn:tag:keyword:qloo:specialty_coffee", "Specialty coffee", "keyword"],
  ["urn:tag:keyword:qloo:clean_beauty", "Clean beauty", "keyword"],
  ["urn:tag:keyword:qloo:indie", "Indie", "keyword"],
  ["urn:tag:keyword:qloo:wellness", "Wellness", "keyword"],
  ["urn:tag:keyword:qloo:craft", "Craft", "keyword"],
  ["urn:tag:keyword:qloo:hiking", "Hiking", "keyword"],
  ["urn:tag:keyword:qloo:design", "Design", "keyword"],
  ["urn:tag:keyword:qloo:vintage", "Vintage", "keyword"],
  ["urn:tag:keyword:qloo:plant_based", "Plant-based", "keyword"],
].map(([id, name, subtype]) => ({ id, name, subtype }));

const tagById = new Map(TAGS.map((t) => [t.id, t]));

// Synthetic brand catalog for /search. "Little Hill Tea" is deliberately absent
// so the "brand not found -> lookalikes" fallback can be demoed.
const BRANDS: { name: string; tags: string[]; popularity: number }[] = [
  { name: "Ember & Oak Coffee", tags: ["coffee", "specialty_coffee", "craft", "slow_living"], popularity: 0.42 },
  { name: "Fernleaf Skin", tags: ["skincare", "clean_beauty", "minimalist", "wellness"], popularity: 0.38 },
  { name: "Kerbside Sneakers", tags: ["sneakers", "streetwear", "vintage", "design"], popularity: 0.55 },
  { name: "Tidewater Candle Co.", tags: ["candles", "slow_living", "design"], popularity: 0.31 },
  { name: "Northline Outdoor", tags: ["outdoor_gear", "hiking", "sustainable"], popularity: 0.6 },
  { name: "Saffron Street Snacks", tags: ["snacks", "plant_based", "indie"], popularity: 0.27 },
  { name: "Quiet Hours Tea", tags: ["tea", "slow_living", "wellness"], popularity: 0.33 },
  { name: "Paper Kite Teahouse", tags: ["tea", "craft", "indie"], popularity: 0.22 },
  { name: "Moss & Stone Apothecary", tags: ["skincare", "wellness", "plant_based"], popularity: 0.29 },
  { name: "Gridline Supply", tags: ["design", "minimalist"], popularity: 0.47 },
  { name: "Lantern Field Ceramics", tags: ["design", "craft", "slow_living"], popularity: 0.25 },
  { name: "Copper Kettle Roasters", tags: ["coffee", "craft"], popularity: 0.36 },
].map((b) => ({ ...b, tags: b.tags.map((t) => TAGS.find((x) => x.id.endsWith(`:${t}`))!.id) }));

const brandId = (name: string) => `mock-brand-${slug(name)}`;

const WORDS = {
  adj: ["Slow", "Quiet", "Second", "Golden", "Small", "Open", "Late", "Wild", "Paper", "Salt", "Analog", "Morning", "Common", "Field", "Low", "Bright"],
  noun: ["Pour", "Hours", "Table", "Hands", "Signal", "Kitchen", "Studio", "Garden", "Shelf", "Room", "Season", "Corner", "Tape", "Map", "Thread", "Harbour"],
  podcastSuffix: ["Podcast", "Radio", "Hour", "Show", "Sessions", "Club", "Diaries", "Report"],
  first: ["Maya", "Theo", "Priya", "Jonah", "Lena", "Arjun", "Noor", "Callum", "Ines", "Kofi", "Rhea", "Milo", "Zara", "Eli", "Tara", "Omar"],
  last: ["Hart", "Okafor", "Varma", "Lind", "Castell", "Reyes", "Holloway", "Mehta", "Brandt", "Achebe", "Sato", "Quinn", "Duval", "Iyer"],
  bandSuffix: ["Club", "Choir", "Machine", "Collective", "Parade", "Ensemble", "Tapes", "Kids", "Weather"],
  brandSuffix: ["Goods", "Supply Co.", "Studio", "Provisions", "Works", "House", "Co.", "Atelier"],
  placeKind: ["Café", "Records", "Bakery", "Books", "Gallery", "Wine Bar", "Market", "Studio", "Hall", "Workshop"],
  street: ["Mercer", "Linden", "Harbor", "Ash", "Union", "Orchard", "Kent", "Willow", "Bedford", "Marlow"],
};

export const MOCK_CITIES: Record<string, [number, number]> = {
  "new york": [40.7128, -74.006],
  nyc: [40.7128, -74.006],
  brooklyn: [40.6782, -73.9442],
  "los angeles": [34.0522, -118.2437],
  la: [34.0522, -118.2437],
  london: [51.5072, -0.1276],
  "san francisco": [37.7749, -122.4194],
  chicago: [41.8781, -87.6298],
  mumbai: [19.076, 72.8777],
  bengaluru: [12.9716, 77.5946],
  bangalore: [12.9716, 77.5946],
  delhi: [28.6139, 77.209],
  "new delhi": [28.6139, 77.209],
};

function genName(kind: string, r: () => number): string {
  const W = WORDS;
  switch (kind) {
    case "podcast":
      return r() < 0.5 ? `The ${pickOf(r, W.adj)} ${pickOf(r, W.noun)} ${pickOf(r, W.podcastSuffix)}` : `${pickOf(r, W.adj)} ${pickOf(r, W.noun)} ${pickOf(r, W.podcastSuffix)}`;
    case "person":
      return `${pickOf(r, W.first)} ${pickOf(r, W.last)}`;
    case "artist":
      return r() < 0.4 ? `${pickOf(r, W.first)} ${pickOf(r, W.last)}` : `${pickOf(r, W.adj)} ${pickOf(r, W.noun)} ${pickOf(r, W.bandSuffix)}`;
    case "brand":
      return `${pickOf(r, W.adj)} ${pickOf(r, W.noun)} ${pickOf(r, W.brandSuffix)}`;
    case "place":
      return `${pickOf(r, W.adj)} ${pickOf(r, W.noun)} ${pickOf(r, W.placeKind)}`;
    case "tv_show":
      return `${pickOf(r, W.adj)} ${pickOf(r, W.noun)}`;
    case "destination":
      return pickOf(r, ["Lisbon", "Kyoto", "Oaxaca", "Copenhagen", "Hampi", "Hokkaido", "Big Sur", "Marfa", "Goa", "Tbilisi"]);
    default:
      return `${pickOf(r, W.adj)} ${pickOf(r, W.noun)}`;
  }
}

function seedTagIds(p: P): string[] {
  const ents = String(p["signal.interests.entities"] ?? "").split(",").filter(Boolean);
  const tags = String(p["signal.interests.tags"] ?? "").split(",").filter(Boolean);
  const fromBrands = ents.flatMap((id) => BRANDS.find((b) => brandId(b.name) === id)?.tags ?? []);
  return [...new Set([...fromBrands, ...tags])];
}

function cityCenter(q: string): [number, number] | null {
  return MOCK_CITIES[q.trim().toLowerCase()] ?? null;
}

function mockEntities(kind: string, p: P) {
  const signal = `${p["signal.interests.entities"] ?? ""}|${p["signal.interests.tags"] ?? ""}|${p["signal.demographics.age"] ?? ""}`;
  const r = rng(`${kind}|${signal}|${p["filter.location.query"] ?? ""}`);
  const take = Number(p.take ?? 10);
  const popMax = p["filter.popularity.max"] != null ? Number(p["filter.popularity.max"]) : 1;
  const exclude = new Set(String(p["filter.exclude.entities"] ?? "").split(",").filter(Boolean));
  const excludeTags = new Set(String(p["filter.exclude.tags"] ?? "").split(",").filter(Boolean));
  const seedTags = seedTagIds(p);
  const center = kind === "place" && p["filter.location.query"] ? cityCenter(String(p["filter.location.query"])) : null;
  if (kind === "place" && p["filter.location.query"] && !center) return [];

  // Candidate pool: affinity falls with rank, popularity is independent, so the
  // value ranking differs from the raw ranking (the point of the product).
  const pool: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const pool_n = 40;
  const brandPool = kind === "brand" ? BRANDS : [];
  for (let i = 0; i < pool_n; i++) {
    const fromCatalog = brandPool[i];
    const name = fromCatalog ? fromCatalog.name : genName(kind, r);
    if (seen.has(name)) continue;
    seen.add(name);
    const id = fromCatalog ? brandId(name) : `mock-${kind}-${hash(`${kind}:${name}`).toString(36)}`;
    const tagIds = fromCatalog
      ? fromCatalog.tags
      : [...new Set([pickOf(r, seedTags.length ? seedTags : TAGS.map((t) => t.id)), pickOf(r, TAGS).id])].filter((t) => !t.includes(":category:") || kind === "brand");
    if (kind === "brand" && !fromCatalog) tagIds.push(pickOf(r, TAGS.filter((t) => t.subtype === "category")).id);
    const affinity = Math.max(0.05, Math.min(0.999, 0.98 - i * 0.018 - r() * 0.05 + (fromCatalog ? 0.05 : 0)));
    const popularity = fromCatalog ? fromCatalog.popularity : Math.min(0.995, 0.15 + Math.pow(r(), 0.6) * 0.85);
    const props: Record<string, unknown> = {
      short_description: `Synthetic ${kind.replace("_", " ")} for local development.`,
    };
    const e: Record<string, unknown> = {
      entity_id: id,
      name,
      types: [`urn:entity:${kind}`],
      popularity: Number(popularity.toFixed(4)),
      query: { affinity: Number(affinity.toFixed(4)) },
      tags: tagIds.map((t) => ({ tag_id: t, name: tagById.get(t)?.name ?? t, type: tagById.get(t)?.subtype })),
      properties: props,
    };
    if (center) {
      const lat = center[0] + (r() - 0.5) * 0.12;
      const lon = center[1] + (r() - 0.5) * 0.14;
      e.location = { lat, lon, geohash: encodeGeohash(lat, lon, 7) };
      props.address = `${10 + Math.floor(r() * 300)} ${pickOf(r, WORDS.street)} St (synthetic)`;
    }
    pool.push(e);
  }
  return pool
    .filter((e) => (e.popularity as number) <= popMax)
    .filter((e) => !exclude.has(e.entity_id as string))
    .filter((e) => !(e.tags as { tag_id: string }[]).some((t) => excludeTags.has(t.tag_id)))
    .sort((a, b) => (b.query as { affinity: number }).affinity - (a.query as { affinity: number }).affinity)
    .slice(0, take);
}

function mockDemographics(p: P) {
  const ids = String(p["signal.interests.entities"] ?? "").split(",").filter(Boolean);
  return {
    success: true,
    results: {
      demographics: ids.map((id) => {
        const r = rng(`demo|${id}`);
        const skew = r() - 0.5;
        const ages = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"];
        return {
          entity_id: id,
          query: {
            age: Object.fromEntries(ages.map((a, i) => [a, Number((Math.cos((i - 2 + skew * 3) / 1.6) * 0.6 - 0.15 + (r() - 0.5) * 0.15).toFixed(3))])),
            gender: { male: Number((skew * 0.6).toFixed(3)), female: Number((-skew * 0.6).toFixed(3)) },
          },
        };
      }),
    },
  };
}

function mockHeatmap(p: P) {
  const center = cityCenter(String(p["filter.location.query"] ?? ""));
  if (!center) return { success: true, results: { heatmap: [] } };
  const r = rng(`heat|${p["signal.interests.entities"]}|${p["signal.interests.tags"]}|${p["filter.location.query"]}`);
  const hotspots = Array.from({ length: 4 }, () => [center[0] + (r() - 0.5) * 0.12, center[1] + (r() - 0.5) * 0.14, 0.4 + r() * 0.6]);
  const heat = [];
  for (let i = 0; i < 160; i++) {
    const lat = center[0] + (r() - 0.5) * 0.2;
    const lng = center[1] + (r() - 0.5) * 0.24;
    const a = hotspots.reduce((acc, [hl, hg, w]) => acc + w * Math.exp(-(((lat - hl) ** 2 + (lng - hg) ** 2) / 0.0006)), 0);
    heat.push({ lat, lng, a: Math.min(1, a + r() * 0.08) });
  }
  const sorted = [...heat].sort((x, y) => x.a - y.a);
  return {
    success: true,
    results: {
      heatmap: heat.map((h) => ({
        location: { latitude: Number(h.lat.toFixed(6)), longitude: Number(h.lng.toFixed(6)), geohash: encodeGeohash(h.lat, h.lng, 6) },
        query: { affinity: Number(h.a.toFixed(4)), affinity_rank: Number(((sorted.indexOf(h) + 1) / heat.length).toFixed(4)), popularity: Number(r().toFixed(4)) },
      })),
    },
  };
}

export function mockQloo(path: string, p: P): unknown {
  if (path === "/search") {
    const q = String(p.query ?? "").toLowerCase().trim();
    const hits = q ? BRANDS.filter((b) => b.name.toLowerCase().includes(q) || q.split(/\s+/).every((w) => b.name.toLowerCase().includes(w))) : [];
    return {
      results: hits.slice(0, Number(p.take ?? 8)).map((b) => ({
        entity_id: brandId(b.name),
        name: b.name,
        types: ["urn:entity:brand"],
        popularity: b.popularity,
        tags: b.tags.map((t) => ({ tag_id: t, name: tagById.get(t)!.name, type: tagById.get(t)!.subtype })),
        properties: { short_description: "Synthetic brand for local development." },
      })),
    };
  }
  if (path === "/v2/tags") {
    const q = String(p["filter.query"] ?? "").toLowerCase();
    return { success: true, results: { tags: TAGS.filter((t) => !q || t.name.toLowerCase().includes(q)).slice(0, Number(p.take ?? 10)).map((t) => ({ id: t.id, name: t.name, type: t.subtype })) } };
  }
  if (path === "/v2/analysis/compare") {
    const a = seedTagIds({ "signal.interests.entities": p["a.signal.interests.entities"] });
    const r = rng(`cmp|${p["a.signal.interests.entities"]}|${p["b.signal.interests.entities"]}`);
    const shared = (a.length ? a : TAGS.map((t) => t.id)).filter((t) => !t.includes(":category:")).slice(0, 3);
    return { success: true, results: { tags: shared.map((t) => ({ tag_id: t, name: tagById.get(t)?.name, query: { affinity: Number((0.5 + r() * 0.45).toFixed(3)) } })) } };
  }
  if (path === "/v2/insights") {
    const type = String(p["filter.type"] ?? "");
    if (type === "urn:demographics") return mockDemographics(p);
    if (type === "urn:heatmap") return mockHeatmap(p);
    const kind = type.replace("urn:entity:", "");
    return { success: true, results: { entities: mockEntities(kind, p), duration: 0.01 } };
  }
  return { success: false, results: {} };
}
