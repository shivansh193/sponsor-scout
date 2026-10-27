import { beforeAll, describe, expect, it } from "vitest";
import { numbersGrounded, runAgent } from "./run";

beforeAll(() => {
  process.env.QLOO_MOCK = "1";
  process.env.NOMINATIM = "off";
  delete process.env.GEMINI_API_KEY;
});

describe("numbersGrounded", () => {
  const allowed = new Set(["87", "34"]);
  it("accepts numbers the tools returned, and small counts", () => {
    expect(numbersGrounded("Affinity 87, 34th percentile, 3 podcasts.", allowed)).toBe(true);
  });
  it("rejects invented numbers", () => {
    expect(numbersGrounded("Reaches 250000 listeners.", allowed)).toBe(false);
  });
});

describe("runAgent (scripted, mock data)", () => {
  it("falls back to lookalikes and produces a complete report", async () => {
    const steps: string[] = [];
    const r = await runAgent(
      {
        brandQuery: "Little Hill Tea",
        brand: null,
        lookalikes: [{ id: "mock-brand-quiet-hours-tea", name: "Quiet Hours Tea" }],
        tags: [{ id: "urn:tag:keyword:qloo:slow_living", name: "Slow living" }],
        city: "London",
        budget: "bootstrapped",
      },
      (e) => e.type === "step" && e.step.status !== "running" && steps.push(e.step.tool),
    );
    expect(steps).toEqual(["resolve_lookalikes", "audience_profile", "find_sponsors", "find_sponsors", "find_sponsors", "map_city", "find_partners", "find_collab_brands"]);
    expect(r.sponsors.podcast?.length).toBeGreaterThan(0);
    expect(r.city?.points.length).toBeGreaterThan(0);
    // Tea is the lookalike's category, so no tea brand may appear as a collab.
    expect(r.collabs.some((c) => c.tags.some((t) => t.id === "urn:tag:category:brand:tea"))).toBe(false);
    expect(r.summary).toMatch(/Best value sponsorship/);
  });
});
