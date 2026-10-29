import type { Content } from "@google/genai";
import { nanoid } from "nanoid";
import { hasLLM, toolTurn } from "../llm";
import { isMock } from "../qloo";
import { BUDGETS, ordinal, pct } from "../score";
import type { Report, RunInput } from "../types";
import { TOOLS, runTool, type Ctx, type Emit } from "./tools";

const MAX_TURNS = 14;
// After this, the agent hands over to the scripted plan so the request finishes in time.
const GEMINI_BUDGET_MS = Number(process.env.GEMINI_BUDGET_MS ?? 30000);

const SYSTEM = `You are Sponsor Scout, a media-planning agent for small direct-to-consumer brands.
Your job: find who the brand should sponsor (podcasts, creators, artists), where it should show up in a city, and which non-competing brands to collaborate with, using Qloo taste data through your tools.

Rules:
- Start with resolve_brand if a brand was confirmed, otherwise resolve_lookalikes. If resolve_brand returns found=false, call resolve_lookalikes and say so.
- Then call audience_profile, then find_sponsors for each of podcast, person and artist.
- If a city was given, call map_city and find_partners for it.
- Call find_collab_brands.
- If a tool returns empty, try the fallback (lookalikes or tags) once, and mention it.
- Every claim must come from a tool result. Never invent numbers, names or facts. Only use numbers exactly as tools returned them.
- When finished, reply with a plain summary of 3 to 5 short sentences for the founder: the audience in one line, the best value sponsorship and why (with its affinity and popularity numbers), the best neighbourhood if mapped, and one collab. No marketing fluff, no headings, no bullet points.`;

function describeInput(i: RunInput): string {
  return [
    i.brand ? `Confirmed brand in Qloo: ${i.brand.name}.` : `Brand "${i.brandQuery || "(none)"}" is not confirmed in Qloo.`,
    i.lookalikes.length ? `Lookalike brands: ${i.lookalikes.map((l) => l.name).join(", ")}.` : "",
    i.tags.length ? `Vibe tags: ${i.tags.map((t) => t.name).join(", ")}.` : "",
    i.city ? `City: ${i.city}.` : "No city given; skip map_city and find_partners.",
    `Budget: ${i.budget}.`,
    i.age ? `Target age band: ${i.age}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function newReport(input: RunInput): Report {
  return {
    id: nanoid(10),
    createdAt: new Date().toISOString(),
    mode: isMock() ? "mock" : "live",
    agent: hasLLM() ? "gemini" : "scripted",
    input,
    seed: { entities: [], tags: [], categoryTags: [] },
    audience: { demographics: null, top: {} },
    sponsors: {},
    city: null,
    collabs: [],
    summary: "",
    notes: [],
    trace: [],
  };
}

/** Required steps for a complete report, in order. Used by the scripted plan and to backfill anything the LLM skipped. */
function requiredSteps(r: Report): { name: string; args: Record<string, unknown>; done: (r: Report) => boolean }[] {
  const steps: { name: string; args: Record<string, unknown>; done: (r: Report) => boolean }[] = [];
  if (r.input.brand) steps.push({ name: "resolve_brand", args: { query: r.input.brand.name }, done: (x) => x.seed.entities.some((e) => e.id === r.input.brand!.id) });
  if (r.input.lookalikes.length || r.input.tags.length || !r.input.brand)
    steps.push({ name: "resolve_lookalikes", args: {}, done: (x) => r.input.lookalikes.every((l) => x.seed.entities.some((e) => e.id === l.id)) && r.input.tags.every((t) => x.seed.tags.some((s) => s.id === t.id)) });
  steps.push({ name: "audience_profile", args: {}, done: (x) => Object.keys(x.audience.top).length > 0 });
  for (const c of ["podcast", "person", "artist"] as const) steps.push({ name: "find_sponsors", args: { category: c }, done: (x) => x.sponsors[c] !== undefined });
  if (r.input.city) {
    steps.push({ name: "map_city", args: { city: r.input.city }, done: (x) => !!x.city && x.city.points.length > 0 });
    steps.push({ name: "find_partners", args: { city: r.input.city }, done: (x) => !!x.city && x.city.partners.length > 0 });
  }
  steps.push({ name: "find_collab_brands", args: {}, done: (x) => x.collabs.length > 0 });
  return steps;
}

async function runScripted(ctx: Ctx, attempted: Set<string>) {
  for (const s of requiredSteps(ctx.report)) {
    const key = `${s.name}:${JSON.stringify(s.args)}`;
    if (s.done(ctx.report) || attempted.has(key)) continue;
    attempted.add(key);
    const res = await runTool(ctx, s.name, s.args);
    if (s.name === "resolve_brand" && res.empty) ctx.emit({ type: "note", text: "Brand not found in Qloo, falling back to lookalikes and tags." });
  }
}

async function runGemini(ctx: Ctx, attempted: Set<string>): Promise<{ text: string; allowed: Set<string> }> {
  const tools = Object.values(TOOLS).map((t) => t.def);
  const history: Content[] = [{ role: "user", parts: [{ text: describeInput(ctx.report.input) }] }];
  const allowed = new Set<string>();
  const deadline = Date.now() + GEMINI_BUDGET_MS;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (Date.now() > deadline) {
      const msg = "Gemini ran past its time budget; finishing the remaining steps with the scripted plan.";
      ctx.report.notes.push(msg);
      ctx.emit({ type: "note", text: msg });
      return { text: "", allowed };
    }
    const res = await toolTurn(history, tools, SYSTEM);
    if (!res.calls.length) return { text: res.text, allowed };
    if (res.content) history.push(res.content);
    const parts = [];
    for (const call of res.calls) {
      attempted.add(`${call.name}:${JSON.stringify(call.args)}`);
      const out = await runTool(ctx, call.name, call.args);
      const payload = { ...out.summary, result_count: out.count, ...(out.note ? { note: out.note } : {}) };
      collectNumbers(payload, allowed);
      parts.push({ functionResponse: { id: call.id, name: call.name, response: payload } });
    }
    history.push({ role: "user", parts });
  }
  return { text: "", allowed };
}

/** Collects every number the LLM was shown, so the summary can be checked against it. */
function collectNumbers(v: unknown, out: Set<string>) {
  if (typeof v === "number") out.add(String(v));
  else if (typeof v === "string") for (const m of v.match(/\d+(\.\d+)?/g) ?? []) out.add(m);
  else if (Array.isArray(v)) v.forEach((x) => collectNumbers(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectNumbers(x, out));
}

/** True when every number in the text appeared in a tool result (ordinals like "41st" included). */
export function numbersGrounded(text: string, allowed: Set<string>): boolean {
  return (text.match(/\d+(\.\d+)?/g) ?? []).every((n) => allowed.has(n) || Number(n) <= 10);
}

export function templateSummary(r: Report): string {
  const out: string[] = [];
  const top = r.audience.top;
  const like = [top.artist?.[0]?.name, top.tv_show?.[0]?.name, top.destination?.[0]?.name].filter(Boolean);
  if (like.length) out.push(`This audience over-indexes on ${like.join(", ")}.`);
  const best = [...(r.sponsors.podcast ?? []).slice(0, 1), ...(r.sponsors.person ?? []).slice(0, 1), ...(r.sponsors.artist ?? []).slice(0, 1)].sort((a, b) => b.valueScore - a.valueScore)[0];
  if (best)
    out.push(
      `Best value sponsorship on a ${BUDGETS[r.input.budget].label.toLowerCase()} budget: ${best.name} (affinity ${pct(best.affinity)}/100, ${best.popularity == null ? "popularity n/a" : `${ordinal(Math.round(best.popularity * 100))} popularity percentile`}).`,
    );
  const hood = r.city?.neighbourhoods[0];
  if (hood && r.city) out.push(`In ${r.city.query}, ${hood.name} is the strongest area (affinity rank ${pct(hood.affinityRank)}/100).`);
  if (r.collabs[0]) out.push(`For a collab, start with ${r.collabs[0].name} (affinity ${pct(r.collabs[0].affinity)}/100).`);
  return out.join(" ") || "Qloo returned too little data for this input. Try adding lookalike brands or vibe tags.";
}

export async function runAgent(input: RunInput, emit: Emit): Promise<Report> {
  const report = newReport(input);
  const ctx: Ctx = { report, emit };
  const attempted = new Set<string>();
  let llmText = "";
  let allowed = new Set<string>();

  if (hasLLM()) {
    try {
      ({ text: llmText, allowed } = await runGemini(ctx, attempted));
    } catch (e) {
      report.agent = "scripted";
      const msg = `Gemini failed (${e instanceof Error ? e.message.slice(0, 120) : "error"}); finishing with the scripted plan.`;
      report.notes.push(msg);
      emit({ type: "note", text: msg });
    }
  }

  // Backfill anything the LLM skipped so the report is always complete.
  const before = report.trace.length;
  await runScripted(ctx, attempted);
  if (report.agent === "gemini" && report.trace.length > before) {
    const msg = `Agent skipped ${report.trace.length - before} step(s); ran them for completeness.`;
    report.notes.push(msg);
    emit({ type: "note", text: msg });
  }

  if (llmText && numbersGrounded(llmText, allowed)) report.summary = llmText;
  else {
    if (llmText) report.notes.push("Agent summary cited a number not found in any Qloo result, so it was replaced with a generated summary.");
    report.summary = templateSummary(report);
  }
  for (const s of report.trace) if (s.status === "empty" && s.tool === "resolve_brand") report.notes.push("Brand not found in Qloo; used lookalikes and tags instead.");
  return report;
}
