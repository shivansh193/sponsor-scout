import type { Budget, Entity, HeatPoint, Neighbourhood, Pick } from "./types";

// Deterministic scoring. The LLM never touches these numbers.

export const BUDGETS: Record<Budget, { k: number; popularityMax?: number; label: string }> = {
  bootstrapped: { k: 1.0, popularityMax: 0.8, label: "Bootstrapped" },
  growing: { k: 0.5, popularityMax: 0.95, label: "Growing" },
  funded: { k: 0.0, label: "Funded" },
};

/** valueScore = affinity * (1 - popularity)^k. k=0 ranks by affinity alone. */
export function valueScore(affinity: number, popularity: number, k: number): number {
  const a = clamp01(affinity);
  const p = clamp01(popularity);
  return a * Math.pow(1 - p, k);
}

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

export const pct = (x: number | null | undefined) => (x == null ? "n/a" : `${Math.round(x * 100)}`);
export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** Ranks entities by affinity (raw) and by value, and writes a "why" line from real numbers only. */
export function rankPicks(entities: Entity[], budget: Budget, audienceLabel = "your audience"): Pick[] {
  const { k } = BUDGETS[budget];
  const usable = entities.filter((e) => e.affinity != null);
  const byRaw = [...usable].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
  const rawRank = new Map(byRaw.map((e, i) => [e.id, i + 1]));
  const scored = usable.map((e) => ({ e, v: valueScore(e.affinity ?? 0, e.popularity ?? 0, k) }));
  scored.sort((a, b) => b.v - a.v || (b.e.affinity ?? 0) - (a.e.affinity ?? 0));
  const top = byRaw[0];
  return scored.map(({ e, v }, i) => {
    const parts = [`Affinity ${pct(e.affinity)}/100 with ${audienceLabel}`];
    if (e.popularity != null) parts.push(`${ordinal(Math.round(e.popularity * 100))} popularity percentile`);
    if (top && top.id !== e.id && top.popularity != null && e.popularity != null && e.popularity < top.popularity) {
      const gap = Math.round((top.popularity - e.popularity) * 100);
      parts.push(`${gap} pts less famous than the #1 affinity pick`);
    }
    return { ...e, valueScore: v, rankRaw: rawRank.get(e.id)!, rankValue: i + 1, why: parts.join(" · ") };
  });
}

/** Drops direct competitors: the input brands themselves and anything sharing a category tag. */
export function excludeCompetitors(entities: Entity[], categoryTagIds: string[], seedIds: string[]): Entity[] {
  const cats = new Set(categoryTagIds);
  const seeds = new Set(seedIds);
  return entities.filter((e) => !seeds.has(e.id) && !e.tags.some((t) => cats.has(t.id)));
}

/** Category tags of the seed brands (used to exclude competitors from collabs). */
export function categoryTags<T extends { id: string }>(tags: T[]): T[] {
  return tags.filter((t) => t.id.includes(":category:"));
}

export function topPoints(points: HeatPoint[], n: number): HeatPoint[] {
  return [...points].sort((a, b) => b.affinityRank - a.affinityRank || b.affinity - a.affinity).slice(0, n);
}

/** Merges named heatmap points that fall in the same neighbourhood. Input order is preserved by first appearance. */
export function mergeNeighbourhoods(named: (HeatPoint & { name: string | null })[]): Neighbourhood[] {
  const groups = new Map<string, (HeatPoint & { name: string | null })[]>();
  for (const p of named) {
    const key = p.name ?? `Area ${p.geohash}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return [...groups.entries()]
    .map(([name, ps]) => ({
      name,
      lat: avg(ps.map((p) => p.lat)),
      lng: avg(ps.map((p) => p.lng)),
      affinityRank: Math.max(...ps.map((p) => p.affinityRank)),
      affinity: avg(ps.map((p) => p.affinity)),
      popularity: avg(ps.map((p) => p.popularity)),
      points: ps.length,
    }))
    .sort((a, b) => b.affinityRank - a.affinityRank);
}
