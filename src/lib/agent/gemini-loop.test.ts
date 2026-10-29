import type { Content } from "@google/genai";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolTurn } from "../llm";

// Exercises the Gemini tool loop with a scripted fake model, so the wiring
// (function calls in, function responses back, backfill, summary check) is
// tested without a GEMINI_API_KEY.

const turns: ToolTurn[] = [];
const seen: Content[][] = [];

vi.mock("../llm", () => ({
  GEMINI_MODEL: "fake",
  hasLLM: () => true,
  generateText: async () => "",
  toolTurn: async (history: Content[]) => {
    seen.push(structuredClone(history));
    return turns.shift() ?? { text: "", calls: [], content: undefined };
  },
}));

const { runAgent } = await import("./run");

const call = (name: string, args: Record<string, unknown> = {}, id = name) => ({ id, name, args });
const modelTurn = (calls: ReturnType<typeof call>[]): ToolTurn => ({
  text: "",
  calls,
  content: { role: "model", parts: calls.map((c) => ({ functionCall: c })) },
});

const input = {
  brandQuery: "Ember & Oak Coffee",
  brand: { id: "mock-brand-ember-oak-coffee", name: "Ember & Oak Coffee" },
  lookalikes: [],
  tags: [],
  city: "New York",
  budget: "bootstrapped" as const,
};

beforeAll(() => {
  process.env.QLOO_MOCK = "1";
  process.env.NOMINATIM = "off";
});

beforeEach(() => {
  turns.length = 0;
  seen.length = 0;
});

describe("Gemini tool loop", () => {
  it("runs the model's calls, returns function responses, and backfills skipped steps", async () => {
    turns.push(
      modelTurn([call("resolve_brand", { query: "Ember & Oak Coffee" })]),
      modelTurn([call("audience_profile"), call("find_sponsors", { category: "podcast" }, "fs1")]),
      { text: "Start with the top podcast pick, then test 2 neighbourhoods.", calls: [], content: undefined },
    );
    const steps: string[] = [];
    const notes: string[] = [];
    const r = await runAgent(input, (e) => (e.type === "note" ? notes.push(e.text) : e.step.status !== "running" && steps.push(e.step.tool)));

    expect(r.agent).toBe("gemini");
    // Model-chosen steps first, then the backfilled ones.
    expect(steps).toEqual(["resolve_brand", "audience_profile", "find_sponsors", "find_sponsors", "find_sponsors", "map_city", "find_partners", "find_collab_brands"]);
    expect(notes.some((n) => n.includes("skipped 5 step"))).toBe(true);

    // The second request carried the model turn and a matching function response.
    const second = seen[1];
    expect(second.at(-2)?.role).toBe("model");
    const resp = second.at(-1)?.parts?.[0]?.functionResponse;
    expect(resp?.name).toBe("resolve_brand");
    expect(resp?.id).toBe("resolve_brand");
    expect((resp?.response as { found?: boolean }).found).toBe(true);

    // Two parallel calls come back as two responses in one user turn.
    expect(seen[2].at(-1)?.parts?.map((p) => p.functionResponse?.id)).toEqual(["audience_profile", "fs1"]);

    // Grounded summary (only small counts) is kept.
    expect(r.summary).toBe("Start with the top podcast pick, then test 2 neighbourhoods.");
  });

  it("replaces a summary that cites a number no tool returned", async () => {
    turns.push(modelTurn([call("resolve_brand")]), { text: "This podcast reaches 250000 listeners a week.", calls: [], content: undefined });
    const r = await runAgent(input, () => {});
    expect(r.summary).not.toContain("250000");
    expect(r.notes.some((n) => n.includes("number not found"))).toBe(true);
  });

  it("finishes with the scripted plan when the model call throws", async () => {
    const llm = await import("../llm");
    const spy = vi.spyOn(llm, "toolTurn").mockRejectedValueOnce(new Error("API key not valid"));
    const r = await runAgent(input, () => {});
    expect(r.agent).toBe("scripted");
    expect(r.notes[0]).toContain("Gemini failed");
    expect(r.collabs.length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
