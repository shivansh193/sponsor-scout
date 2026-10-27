import { generateText, hasLLM } from "./llm";
import { ordinal, pct } from "./score";
import type { Demographics, Evidence, Report } from "./types";

const KIND_WORD: Record<string, string> = { podcast: "podcast", person: "channel", artist: "music", place: "venue", brand: "brand" };

function topBucket(m: Record<string, number> | undefined): string | null {
  if (!m) return null;
  const e = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
  return e ? e[0].replace(/_/g, " ") : null;
}

/** Evidence lines, built from Qloo numbers only. Shown to the user and given to the LLM verbatim. */
export function evidenceLines(r: Report, ev: Evidence): string[] {
  const p = ev.pick;
  const lines = [`Audience affinity: ${pct(p.affinity)}/100`];
  if (p.popularity != null) lines.push(`Popularity: ${ordinal(Math.round(p.popularity * 100))} percentile`);
  lines.push(`Rank: #${p.rankValue} by value, #${p.rankRaw} by raw affinity`);
  if (ev.overlap.score != null) lines.push(`Audience overlap score: ${pct(ev.overlap.score)}/100`);
  if (ev.overlap.sharedTags.length) lines.push(`Shared taste signals: ${ev.overlap.sharedTags.join(", ")}`);
  const a = topBucket(ev.audienceDemographics?.age);
  const b = topBucket(ev.demographics?.age);
  if (a && b) lines.push(`Strongest age band: ${a} (brand audience) vs ${b} (${p.name})`);
  const g = genderLean(ev.demographics);
  if (g) lines.push(`${p.name} audience leans ${g}`);
  return lines;
}

function genderLean(d: Demographics | null): string | null {
  if (!d) return null;
  const m = d.gender.male ?? 0;
  const f = d.gender.female ?? 0;
  if (Math.abs(m - f) < 0.1) return null;
  return m > f ? "male" : "female";
}

export async function draftPitch(r: Report, ev: Evidence): Promise<{ email: string; source: "gemini" | "template" }> {
  const brand = r.input.brand?.name || r.input.brandQuery || "our brand";
  const ev_ = evidenceLines(r, ev);
  if (hasLLM()) {
    try {
      const email = await generateText(
        `Write a short outreach email (under 140 words) from the founder of ${brand} to ${ev.pick.name} (a ${KIND_WORD[ev.pick.kind] ?? ev.pick.kind}), proposing a ${ev.pick.kind === "brand" ? "collaboration" : ev.pick.kind === "place" ? "pop-up or partnership" : "sponsorship"}.
Use only these facts as evidence, paraphrased naturally, and do not add any other numbers or claims about either party:
${ev_.map((l) => `- ${l}`).join("\n")}
Start with "Subject:" on the first line. Plain, specific, friendly. No hype words. Sign off as "[Your name], ${brand}".`,
        "You write concise, honest B2B outreach emails. You never invent facts.",
      );
      if (email) return { email, source: "gemini" };
    } catch {
      // fall through to the template
    }
  }
  const p = ev.pick;
  return {
    source: "template",
    email: `Subject: ${brand} x ${p.name}

Hi ${p.name} team,

I run ${brand}. We used taste data from Qloo to find where our customers already spend their attention, and you came out near the top: our audience's affinity with you is ${pct(p.affinity)}/100${ev.overlap.sharedTags.length ? `, with shared interests in ${ev.overlap.sharedTags.slice(0, 3).join(", ")}` : ""}.

We'd love to talk about a ${p.kind === "brand" ? "collaboration" : p.kind === "place" ? "pop-up or partnership" : "sponsorship"} that fits your audience. Could we set up a 20-minute call next week?

[Your name], ${brand}`,
  };
}

export async function withoutQloo(r: Report): Promise<string> {
  const brand = r.input.brand?.name || r.input.brandQuery || r.input.lookalikes.map((l) => l.name).join(" / ");
  const city = r.input.city || "New York";
  return generateText(
    `Which podcasts, creators and artists should the brand "${brand}" sponsor, which brands should it collaborate with, and where in ${city} should it do a pop-up? Give a short list for each.`,
  );
}
