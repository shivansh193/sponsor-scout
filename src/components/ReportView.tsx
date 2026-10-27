"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { BUDGETS, pct } from "@/lib/score";
import type { Demographics, EntityKind, Pick, Report, SponsorKind } from "@/lib/types";
import { PickList } from "./PickCard";
import { Trace } from "./Trace";
import { KIND_NAME, KindIcon, Section } from "./ui";

const CityMap = dynamic(() => import("./CityMap"), { ssr: false, loading: () => <div className="h-[340px] animate-pulse rounded-lg bg-line lg:h-[460px]" /> });

const AGE_LABEL: Record<string, string> = {
  "24_and_younger": "Under 25",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55+",
  "35_and_younger": "35 and under",
  "36_to_55": "36–55",
};

const SPONSOR_TABS: { k: SponsorKind; label: string }[] = [
  { k: "podcast", label: "Podcasts" },
  { k: "person", label: "Creators" },
  { k: "artist", label: "Artists" },
];

const PROFILE_ORDER: EntityKind[] = ["artist", "podcast", "tv_show", "brand", "destination"];

function Diverging({ label, value }: { label: string; value: number }) {
  const v = Math.max(-1, Math.min(1, value));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-muted">{label}</span>
      <div className="relative h-2 flex-1 rounded-full bg-line">
        <div className="absolute top-0 h-full w-px bg-muted" style={{ left: "50%" }} />
        <div className={`absolute top-0 h-full rounded-full ${v >= 0 ? "bg-accent" : "bg-pop"}`} style={v >= 0 ? { left: "50%", width: `${v * 50}%` } : { right: "50%", width: `${-v * 50}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right font-mono tabular-nums">{v > 0 ? "+" : ""}{v.toFixed(2)}</span>
    </div>
  );
}

function DemographicsPanel({ d }: { d: Demographics | null }) {
  if (!d) return <p className="text-sm text-muted">Qloo returned no demographic data for this signal.</p>;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium">Age affinity</p>
        {Object.entries(d.age).map(([k, v]) => (
          <Diverging key={k} label={AGE_LABEL[k] ?? k} value={v} />
        ))}
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium">Gender affinity</p>
        {Object.entries(d.gender).map(([k, v]) => (
          <Diverging key={k} label={k[0].toUpperCase() + k.slice(1)} value={v} />
        ))}
      </div>
      <p className="text-xs text-muted">Above zero means over-represented relative to the general population.</p>
    </div>
  );
}

function bestOf(r: Report): Pick | undefined {
  return Object.values(r.sponsors)
    .flat()
    .filter(Boolean)
    .sort((a, b) => b!.valueScore - a!.valueScore)[0];
}

function WithoutQloo({ report }: { report: Report }) {
  const [text, setText] = useState(report.withoutQloo ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const best = bestOf(report);
  const hood = report.city?.neighbourhoods[0];

  async function ask() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/without-qloo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportId: report.id }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setText(j.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-line bg-card p-4">
        <p className="mb-1 text-sm font-medium">LLM alone</p>
        <p className="mb-3 text-xs text-muted">Same question, no tools, no Qloo.</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {["no evidence", "famous picks", "no location data"].map((t) => (
            <span key={t} className="rounded-full bg-value-soft px-2 py-0.5 text-xs text-value">
              {t}
            </span>
          ))}
        </div>
        {text ? (
          <div className="max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-muted">{text}</div>
        ) : (
          <button type="button" onClick={ask} disabled={loading} className="rounded-md border border-line px-3 py-2 text-sm hover:border-accent disabled:opacity-50">
            {loading ? "Asking the LLM…" : "Ask the LLM without Qloo"}
          </button>
        )}
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
      <div className="rounded-lg border border-accent bg-card p-4">
        <p className="mb-1 text-sm font-medium">With Qloo</p>
        <p className="mb-3 text-xs text-muted">Every number below is from a Qloo response.</p>
        <ul className="space-y-2 text-sm">
          {best && (
            <li>
              <span className="font-medium">{best.name}</span> <span className="text-muted">({KIND_NAME[best.kind]})</span>
              <span className="block font-mono text-xs text-muted">
                affinity {pct(best.affinity)} · popularity {pct(best.popularity)} · value {Math.round(best.valueScore * 100)}
              </span>
            </li>
          )}
          {hood && report.city && (
            <li>
              <span className="font-medium">{hood.name}</span> <span className="text-muted">in {report.city.query}</span>
              <span className="block font-mono text-xs text-muted">
                affinity rank {pct(hood.affinityRank)} · {hood.points} grid point{hood.points === 1 ? "" : "s"}
              </span>
            </li>
          )}
          {report.collabs[0] && (
            <li>
              <span className="font-medium">{report.collabs[0].name}</span> <span className="text-muted">(collab)</span>
              <span className="block font-mono text-xs text-muted">
                affinity {pct(report.collabs[0].affinity)} · popularity {pct(report.collabs[0].popularity)}
              </span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

export function ReportView({ report }: { report: Report }) {
  const [tab, setTab] = useState<SponsorKind>(SPONSOR_TABS.find((t) => report.sponsors[t.k]?.length)?.k ?? "podcast");
  const [rankBy, setRankBy] = useState<"value" | "raw">("value");
  const [copied, setCopied] = useState(false);
  const i = report.input;
  const subject = i.brand?.name || i.brandQuery || i.lookalikes.map((l) => l.name).join(" + ");
  const budget = BUDGETS[i.budget];

  const nav = [
    ["audience", "Audience"],
    ["sponsors", "Sponsors"],
    ...(report.city ? [["city", "Where"]] : []),
    ["collabs", "Collabs"],
    ["compare", "Without Qloo"],
    ["trace", "How"],
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-wider text-muted">Sponsorship plan</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{subject}</h1>
          <p className="mt-1 text-sm text-muted">
            {[i.city, `${budget.label} budget`, i.age && AGE_LABEL[i.age], !i.brand && i.lookalikes.length ? `via ${i.lookalikes.map((l) => l.name).join(", ")}` : null, i.tags.length ? `tags: ${i.tags.map((t) => t.name).join(", ")}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-line bg-card px-3 py-2 text-sm hover:border-accent"
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Link copied" : "Share"}
          </button>
          <Link href="/" className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-paper">
            New plan
          </Link>
        </div>
      </div>

      {report.mode === "mock" && <p className="mb-4 inline-block rounded bg-value-soft px-2 py-1 text-xs text-value">Synthetic demo data. Names and numbers are generated, not from Qloo.</p>}

      <p className="mb-6 max-w-3xl text-lg leading-relaxed">{report.summary}</p>
      {report.notes.length > 0 && (
        <ul className="mb-6 space-y-1 text-xs text-value">
          {report.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      <nav className="sticky top-0 z-10 -mx-4 mb-6 overflow-x-auto border-b border-line bg-paper/95 px-4 backdrop-blur">
        <ul className="flex gap-5 py-2 text-sm whitespace-nowrap">
          {nav.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-muted hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-12">
        <Section id="audience" kicker="Who your customers are" title="Audience profile">
          <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
            <DemographicsPanel d={report.audience.demographics} />
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {PROFILE_ORDER.filter((k) => report.audience.top[k]?.length).map((k) => (
                <div key={k}>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                    <KindIcon kind={k} className="h-3.5 w-3.5" />
                    {KIND_NAME[k]}s they love
                  </p>
                  <ol className="space-y-1 text-sm">
                    {report.audience.top[k]!.slice(0, 5).map((e) => (
                      <li key={e.id} className="flex justify-between gap-2">
                        <span className="truncate">{e.name}</span>
                        <span className="shrink-0 font-mono text-xs text-muted">{pct(e.affinity)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section
          id="sponsors"
          kicker="Who to sponsor"
          title="Sponsor shortlist"
          action={
            <div className="flex rounded-md border border-line text-xs" role="group" aria-label="Ranking">
              {(["value", "raw"] as const).map((r) => (
                <button key={r} type="button" onClick={() => setRankBy(r)} className={`px-3 py-1.5 ${rankBy === r ? "bg-ink text-paper" : ""}`} aria-pressed={rankBy === r}>
                  {r === "value" ? "Best value" : "Raw affinity"}
                </button>
              ))}
            </div>
          }
        >
          <p className="mb-4 max-w-3xl text-sm text-muted">
            Famous sponsorships are overpriced for small brands. Value = affinity × (1 − popularity)<sup>{budget.k}</sup> for a {budget.label.toLowerCase()} budget
            {budget.popularityMax ? `, with anything above the ${Math.round(budget.popularityMax * 100)}th popularity percentile filtered out` : ""}.
          </p>
          <div className="mb-4 flex gap-1 border-b border-line" role="tablist">
            {SPONSOR_TABS.map((t) => (
              <button key={t.k} role="tab" aria-selected={tab === t.k} type="button" onClick={() => setTab(t.k)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.k ? "border-accent font-medium" : "border-transparent text-muted"}`}>
                {t.label} <span className="text-xs text-muted">{report.sponsors[t.k]?.length ?? 0}</span>
              </button>
            ))}
          </div>
          <PickList picks={report.sponsors[tab]} reportId={report.id} rankBy={rankBy} empty="Qloo returned nothing in this category for this audience. Try lookalike brands or vibe tags." />
        </Section>

        {report.city && (
          <Section id="city" kicker="Where to show up" title={`${report.city.query}`}>
            <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
              <div className="order-2 space-y-6 lg:order-1">
                <div>
                  <p className="mb-2 text-sm font-medium">Neighbourhoods that over-index on your audience</p>
                  {report.city.neighbourhoods.length ? (
                    <ol className="space-y-2">
                      {report.city.neighbourhoods.map((h, n) => (
                        <li key={h.name} className="flex items-baseline gap-3 rounded-md border border-line bg-card px-3 py-2 text-sm">
                          <span className="font-mono text-xs text-muted">{n + 1}</span>
                          <span className="flex-1">{h.name}</span>
                          <span className="font-mono text-xs text-muted">
                            rank {pct(h.affinityRank)} · pop {pct(h.popularity)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted">Qloo has no heatmap data for this city and signal.</p>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">Local partners</p>
                  <PickList picks={report.city.partners} reportId={report.id} rankBy={rankBy} empty="No partner places found in this city." single />
                </div>
              </div>
              <div className="order-1 lg:order-2">{report.city.points.length > 0 && <div className="lg:sticky lg:top-14"><CityMap city={report.city} /></div>}</div>
            </div>
          </Section>
        )}

        <Section id="collabs" kicker="Who to collab with" title="Collab brands">
          {report.seed.categoryTags.length > 0 && <p className="mb-4 text-sm text-muted">Excludes your own category: {report.seed.categoryTags.map((t) => t.name).join(", ")}.</p>}
          <PickList picks={report.collabs} reportId={report.id} rankBy={rankBy} empty="No non-competing brands came back for this audience." />
        </Section>

        <Section id="compare" kicker="Would this work without Qloo?" title="Without Qloo vs with Qloo">
          <WithoutQloo report={report} />
        </Section>

        <Section id="trace" kicker="How this plan was built" title="Agent trace">
          <p className="mb-3 text-xs text-muted">
            {report.agent === "gemini" ? "Gemini chose these tool calls." : "Scripted plan (no LLM key set)."} Scoring and ranking are deterministic code. Created {new Date(report.createdAt).toUTCString()}.
          </p>
          <Trace steps={report.trace} />
        </Section>
      </div>
    </main>
  );
}
