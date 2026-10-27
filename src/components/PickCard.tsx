"use client";

import { useState } from "react";
import type { Pick } from "@/lib/types";
import { KIND_NAME, KindIcon, Meter } from "./ui";

interface PitchResult {
  evidence: string[];
  email: string;
  source: "gemini" | "template";
}

export function PickCard({ pick, reportId, rankBy }: { pick: Pick; reportId: string; rankBy: "value" | "raw" }) {
  const [open, setOpen] = useState(false);
  const [pitch, setPitch] = useState<PitchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const rank = rankBy === "value" ? pick.rankValue : pick.rankRaw;
  const climbed = pick.rankRaw - pick.rankValue;

  async function loadPitch() {
    setOpen((o) => !o);
    if (pitch || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pitch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportId, entityId: pick.id }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Pitch failed");
      setPitch(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pitch failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="rounded-lg border border-line bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-sm text-muted">{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-medium leading-snug">{pick.name}</h3>
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <KindIcon kind={pick.kind} className="h-3.5 w-3.5" />
              {KIND_NAME[pick.kind] ?? pick.kind}
            </span>
            <span className="rounded bg-value-soft px-1.5 py-0.5 font-mono text-xs text-value" title="affinity × (1 − popularity)^k">
              value {Math.round(pick.valueScore * 100)}
            </span>
            {rankBy === "value" && climbed >= 2 && <span className="text-xs text-accent">↑{climbed} vs raw rank</span>}
          </div>
          {pick.address && <p className="text-xs text-muted">{pick.address}</p>}
          <div className="mt-3 space-y-1.5">
            <Meter label="Affinity" value={pick.affinity} />
            <Meter label="Popularity" value={pick.popularity} tone="pop" />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">{pick.why}</p>
          <button type="button" onClick={loadPitch} className="mt-3 text-xs font-medium text-accent underline-offset-2 hover:underline" aria-expanded={open}>
            {open ? "Hide pitch" : "Draft pitch email"}
          </button>
          {open && (
            <div className="mt-3 space-y-3 border-t border-line pt-3">
              {loading && <p className="text-xs text-muted">Comparing audiences and drafting…</p>}
              {error && <p className="text-xs text-danger">{error}</p>}
              {pitch && (
                <>
                  <ul className="space-y-0.5 text-xs">
                    {pitch.evidence.map((l) => (
                      <li key={l} className="font-mono">
                        {l}
                      </li>
                    ))}
                  </ul>
                  <pre className="whitespace-pre-wrap rounded-md bg-paper p-3 font-sans text-sm leading-relaxed">{pitch.email}</pre>
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      className="rounded border border-line px-2 py-1 hover:border-accent"
                      onClick={async () => {
                        await navigator.clipboard.writeText(pitch.email);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      {copied ? "Copied" : "Copy email"}
                    </button>
                    <span className="text-muted">{pitch.source === "gemini" ? "Written by Gemini from the evidence above" : "Template filled from the evidence above"}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function PickList({ picks, reportId, rankBy, empty, single = false }: { picks: Pick[] | undefined; reportId: string; rankBy: "value" | "raw"; empty: string; single?: boolean }) {
  if (!picks?.length) return <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">{empty}</p>;
  const sorted = [...picks].sort((a, b) => (rankBy === "value" ? a.rankValue - b.rankValue : a.rankRaw - b.rankRaw));
  return (
    <div className={`grid gap-3 ${single ? "" : "md:grid-cols-2"}`}>
      {sorted.map((p) => (
        <PickCard key={p.id} pick={p} reportId={reportId} rankBy={rankBy} />
      ))}
    </div>
  );
}
