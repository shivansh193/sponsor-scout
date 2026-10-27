"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { Example } from "@/lib/examples";
import type { AgeBand, Budget, RunInput, Tag, TraceStep } from "@/lib/types";
import { BrandSearch, Chip, TagSearch, inputCls, type BrandHit } from "./Pickers";
import { Trace } from "./Trace";

const BUDGET_OPTS: { v: Budget; label: string; hint: string }[] = [
  { v: "bootstrapped", label: "Bootstrapped", hint: "Favour loved-but-not-famous picks" },
  { v: "growing", label: "Growing", hint: "Balance affinity and reach" },
  { v: "funded", label: "Funded", hint: "Rank by affinity alone" },
];

const AGE_OPTS: { v: AgeBand | ""; label: string }[] = [
  { v: "", label: "Any age" },
  { v: "35_and_younger", label: "35 and under" },
  { v: "36_to_55", label: "36–55" },
  { v: "55_and_older", label: "55+" },
];

async function streamRun(input: RunInput, on: { step: (s: TraceStep) => void; note: (t: string) => void }): Promise<string> {
  const res = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `Run failed (${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = chunk.match(/^event: (.*)$/m)?.[1];
      const data = JSON.parse(chunk.match(/^data: (.*)$/m)?.[1] ?? "{}");
      if (event === "step") on.step(data);
      else if (event === "note") on.note(data.text);
      else if (event === "error") throw new Error(data.message);
      else if (event === "report") return data.id;
    }
  }
  throw new Error("The run ended without a report.");
}

export function Planner({ examples, mode }: { examples: Example[]; mode: "live" | "mock" }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<BrandHit | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [lookQuery, setLookQuery] = useState("");
  const [lookalikes, setLookalikes] = useState<BrandHit[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [city, setCity] = useState("");
  const [budget, setBudget] = useState<Budget>("bootstrapped");
  const [age, setAge] = useState<AgeBand | "">("");
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onEmpty = useCallback((e: boolean) => setNotFound(e), []);
  const showFallback = !brand && (notFound || lookalikes.length > 0 || tags.length > 0);

  async function run(input: RunInput) {
    setRunning(true);
    setError(null);
    setSteps([]);
    setNotes([]);
    try {
      const id = await streamRun(input, {
        step: (s) => setSteps((prev) => (prev.some((p) => p.id === s.id) ? prev.map((p) => (p.id === s.id ? s : p)) : [...prev, s])),
        note: (t) => setNotes((n) => [...n, t]),
      });
      router.push(`/r/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
      setRunning(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run({
      brandQuery: brand?.name ?? query,
      brand: brand ? { id: brand.id, name: brand.name } : null,
      lookalikes: brand ? [] : lookalikes.map((l) => ({ id: l.id, name: l.name })),
      tags,
      city: city || undefined,
      budget,
      age: age || undefined,
    });
  }

  const canRun = !running && (brand || lookalikes.length > 0 || tags.length > 0);

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      <form onSubmit={submit} className="space-y-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Your brand</label>
          {brand ? (
            <div className="flex items-center justify-between rounded-md border border-accent bg-accent-soft px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{brand.name}</span>
                <span className="ml-2 text-xs text-muted">matched in Qloo{brand.tags.length ? ` · ${brand.tags.join(", ")}` : ""}</span>
              </span>
              <button type="button" className="text-xs underline" onClick={() => setBrand(null)}>
                Change
              </button>
            </div>
          ) : (
            <BrandSearch value={query} onChange={setQuery} onPick={setBrand} onEmpty={onEmpty} placeholder="Start typing your brand name" />
          )}
          {!brand && !showFallback && (
            <button type="button" className="mt-1.5 text-xs text-muted underline" onClick={() => setNotFound(true)}>
              My brand isn&apos;t listed
            </button>
          )}
        </div>

        {showFallback && (
          <div className="space-y-4 rounded-lg border border-dashed border-line p-4">
            <div>
              <p className="text-sm font-medium">Brands like us</p>
              <p className="text-xs text-muted">Qloo doesn&apos;t know your brand yet. Pick 2–4 brands your customers also buy, and a few vibe tags.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {lookalikes.map((l) => (
                <Chip key={l.id} onRemove={() => setLookalikes((xs) => xs.filter((x) => x.id !== l.id))}>
                  {l.name}
                </Chip>
              ))}
            </div>
            {lookalikes.length < 4 && (
              <BrandSearch
                value={lookQuery}
                onChange={setLookQuery}
                exclude={lookalikes.map((l) => l.id)}
                onPick={(b) => {
                  setLookalikes((xs) => [...xs, b]);
                  setLookQuery("");
                }}
                placeholder="Add a lookalike brand"
              />
            )}
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Chip key={t.id} onRemove={() => setTags((xs) => xs.filter((x) => x.id !== t.id))}>
                  {t.name}
                </Chip>
              ))}
            </div>
            {tags.length < 5 && <TagSearch selected={tags} onAdd={(t) => setTags((xs) => [...xs, t])} />}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="city">
              City for pop-ups <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id="city" className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="New York, London, Mumbai…" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="age">
              Target age
            </label>
            <select id="age" className={inputCls} value={age} onChange={(e) => setAge(e.target.value as AgeBand | "")}>
              {AGE_OPTS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Budget</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {BUDGET_OPTS.map((o) => (
              <label key={o.v} className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${budget === o.v ? "border-accent bg-accent-soft" : "border-line bg-card"}`}>
                <input type="radio" name="budget" value={o.v} checked={budget === o.v} onChange={() => setBudget(o.v)} className="sr-only" />
                <span className="block font-medium">{o.label}</span>
                <span className="block text-xs text-muted">{o.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" disabled={!canRun} className="w-full rounded-md bg-accent px-4 py-3 text-sm font-semibold text-paper disabled:opacity-40 sm:w-auto">
          {running ? "Building your plan…" : "Build my sponsorship plan"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>

      <aside className="space-y-6">
        {(running || steps.length > 0) && (
          <div className="rounded-lg border border-line bg-card p-4">
            <p className="mb-3 text-xs uppercase tracking-wider text-muted">Agent trace</p>
            <Trace steps={steps} notes={notes} />
          </div>
        )}
        {examples.length > 0 && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted">Try an example{mode === "mock" ? " (synthetic data)" : ""}</p>
            <div className="space-y-2">
              {examples.map((ex) => (
                <button key={ex.title} type="button" disabled={running} onClick={() => run(ex.input)} className="block w-full rounded-lg border border-line bg-card p-3 text-left hover:border-accent disabled:opacity-50">
                  <span className="block text-sm font-medium">{ex.title}</span>
                  <span className="block text-xs text-muted">{ex.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
