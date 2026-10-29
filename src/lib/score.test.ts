import { describe, expect, it } from "vitest";
import { excludeCompetitors, mergeNeighbourhoods, rankPicks, valueScore } from "./score";
import type { Entity } from "./types";

const ent = (id: string, affinity: number, popularity: number, tags: string[] = []): Entity => ({
  id,
  name: id,
  kind: "podcast",
  affinity,
  popularity,
  tags: tags.map((t) => ({ id: t, name: t })),
});

describe("valueScore", () => {
  it("k=0 is plain affinity", () => {
    expect(valueScore(0.8, 0.99, 0)).toBeCloseTo(0.8);
  });
  it("k=1 penalises popularity linearly", () => {
    expect(valueScore(0.8, 0.5, 1)).toBeCloseTo(0.4);
  });
  it("k=0.5 uses the square root", () => {
    expect(valueScore(1, 0.75, 0.5)).toBeCloseTo(0.5);
  });
  it("clamps out-of-range inputs", () => {
    expect(valueScore(1.4, -0.2, 1)).toBeCloseTo(1);
    expect(valueScore(0.5, 1.3, 1)).toBe(0);
    expect(valueScore(NaN, 0.2, 1)).toBe(0);
  });
});

describe("rankPicks", () => {
  const list = [ent("famous", 0.95, 0.98), ent("niche", 0.85, 0.3), ent("mid", 0.9, 0.6)];

  it("bootstrapped promotes high-affinity, low-popularity picks", () => {
    const r = rankPicks(list, "bootstrapped");
    expect(r.map((p) => p.id)).toEqual(["niche", "mid", "famous"]);
    expect(r[0].rankRaw).toBe(3);
    expect(r[0].rankValue).toBe(1);
  });

  it("funded ranks by affinity alone", () => {
    expect(rankPicks(list, "funded").map((p) => p.id)).toEqual(["famous", "mid", "niche"]);
  });

  it("why line uses only the entity's numbers", () => {
    const niche = rankPicks(list, "bootstrapped").find((p) => p.id === "niche")!;
    expect(niche.why).toContain("Affinity 85/100");
    expect(niche.why).toContain("30th popularity percentile");
    expect(niche.why).toContain("68 pts less famous");
  });

  it("drops entities without affinity", () => {
    expect(rankPicks([{ ...ent("x", 0, 0), affinity: null }], "growing")).toHaveLength(0);
  });
});

describe("excludeCompetitors", () => {
  it("removes seeds and same-category brands", () => {
    const out = excludeCompetitors(
      [ent("seed", 0.9, 0.5), ent("rival", 0.9, 0.5, ["urn:tag:category:brand:coffee"]), ent("ok", 0.8, 0.4, ["urn:tag:keyword:qloo:design"])],
      ["urn:tag:category:brand:coffee"],
      ["seed"],
    );
    expect(out.map((e) => e.id)).toEqual(["ok"]);
  });
});

describe("mergeNeighbourhoods", () => {
  it("merges points with the same name and keeps the best rank", () => {
    const p = (name: string | null, rank: number, geohash = "dr5ru") => ({ name, lat: 1, lng: 2, geohash, affinity: rank, affinityRank: rank, popularity: 0.5 });
    const out = mergeNeighbourhoods([p("Williamsburg", 0.99), p("Bushwick", 0.97), p("Williamsburg", 0.95), p(null, 0.9, "dr5rx")]);
    expect(out.map((n) => n.name)).toEqual(["Williamsburg", "Bushwick", "Area dr5rx"]);
    expect(out[0].points).toBe(2);
    expect(out[0].affinityRank).toBe(0.99);
  });
});

describe("stripMarkdown", () => {
  it("removes bold, headings and star bullets", async () => {
    const { stripMarkdown } = await import("./pitch");
    expect(stripMarkdown("### Podcasts\n*   **How I Built This:** craft\n---\nDone")).toBe("Podcasts\n- How I Built This: craft\n\nDone");
  });
});
