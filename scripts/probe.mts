// Coverage probe: run once the Qloo key arrives.
//   QLOO_API_KEY=... npx tsx scripts/probe.mts "Brand A" "Brand B" ...
// Prints a coverage table and writes raw samples to probe-output/ (git-ignored;
// it contains Qloo response data, which must never be committed).

import { mkdirSync, writeFileSync } from "node:fs";
import { QLOO_BASE, canonicalQuery, type Params } from "../src/lib/qloo";

const KEY = process.env.QLOO_API_KEY;
if (!KEY) {
  console.error("Set QLOO_API_KEY");
  process.exit(1);
}

const DEFAULT_BRANDS = [
  // Mix of small, mid and large DTC brands. Edit freely.
  "Glossier", "Allbirds", "Warby Parker", "Blue Bottle Coffee", "Liquid Death", "Olipop", "Graza", "Aesop",
  "Brooklinen", "Away", "Rhode", "Fly By Jing", "Partake Foods", "Blueland", "The Sill",
];
const CITIES = ["New York", "Los Angeles", "London", "Mumbai", "Bengaluru"];
const brands = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_BRANDS;
const OUT = "probe-output";
mkdirSync(OUT, { recursive: true });

async function get(path: string, params: Params) {
  const url = `${QLOO_BASE}${path}?${canonicalQuery(params)}`;
  const t0 = Date.now();
  const res = await fetch(url, { headers: { "X-Api-Key": KEY! } });
  const body = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(body);
  } catch {}
  return { status: res.status, ms: Date.now() - t0, json, body };
}

const count = (j: unknown, ...path: string[]) => {
  let cur = j as Record<string, unknown> | undefined;
  for (const p of path) cur = cur?.[p] as Record<string, unknown> | undefined;
  return Array.isArray(cur) ? cur.length : 0;
};

const rows: Record<string, string | number>[] = [];
let sampled = false;

for (const name of brands) {
  const s = await get("/search", { query: name, types: "urn:entity:brand", take: 3 });
  const hit = (s.json as { results?: { entity_id: string; name: string; popularity?: number }[] })?.results?.[0];
  const row: Record<string, string | number> = { query: name, search: s.status, match: hit ? `${hit.name}` : "-", pop: hit?.popularity?.toFixed(2) ?? "-" };
  if (hit) {
    const sig = { "signal.interests.entities": hit.entity_id, take: 10 };
    for (const k of ["podcast", "person", "artist", "brand", "place"]) {
      const r = await get("/v2/insights", { ...sig, "filter.type": `urn:entity:${k}`, ...(k === "place" ? { "filter.location.query": "New York" } : {}) });
      row[k] = r.status === 200 ? count(r.json, "results", "entities") : `HTTP ${r.status}`;
      if (!sampled) writeFileSync(`${OUT}/insights-${k}.json`, JSON.stringify(r.json, null, 2));
    }
    const d = await get("/v2/insights", { "filter.type": "urn:demographics", "signal.interests.entities": hit.entity_id });
    row.demo = d.status === 200 ? count(d.json, "results", "demographics") : `HTTP ${d.status}`;
    if (!sampled) writeFileSync(`${OUT}/demographics.json`, JSON.stringify(d.json, null, 2));
    for (const c of CITIES) {
      const h = await get("/v2/insights", { "filter.type": "urn:heatmap", "filter.location.query": c, "signal.interests.entities": hit.entity_id });
      row[`heat:${c}`] = h.status === 200 ? count(h.json, "results", "heatmap") : `HTTP ${h.status}`;
      if (!sampled && c === "New York") writeFileSync(`${OUT}/heatmap.json`, JSON.stringify(h.json, null, 2));
    }
    if (!sampled) {
      writeFileSync(`${OUT}/search.json`, JSON.stringify(s.json, null, 2));
      const t = await get("/v2/tags", { "filter.query": "coffee", take: 5 });
      writeFileSync(`${OUT}/tags.json`, JSON.stringify({ status: t.status, body: t.json ?? t.body }, null, 2));
      const cmp = await get("/v2/analysis/compare", { "a.signal.interests.entities": hit.entity_id, "b.signal.interests.entities": hit.entity_id });
      writeFileSync(`${OUT}/compare.json`, JSON.stringify({ status: cmp.status, body: cmp.json ?? cmp.body }, null, 2));
      sampled = true;
    }
  }
  rows.push(row);
  console.log(JSON.stringify(row));
}

console.table(rows);
writeFileSync(`${OUT}/coverage.json`, JSON.stringify(rows, null, 2));
console.log(`\nSample responses written to ${OUT}/. Check field names against the parsers marked VERIFY in src/lib/qloo.ts.`);
