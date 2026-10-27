"use client";

import { useEffect, useState } from "react";
import type { Tag } from "@/lib/types";

export interface BrandHit {
  id: string;
  name: string;
  popularity: number | null;
  tags: string[];
}

function useSearch<T>(url: string, q: string): { results: T[]; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ results: T[]; loading: boolean; error: string | null }>({ results: [], loading: false, error: null });
  useEffect(() => {
    if (q.trim().length < 2) {
      setState({ results: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${url}?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        const j = await res.json();
        setState({ results: j.results ?? [], loading: false, error: j.error ?? null });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setState({ results: [], loading: false, error: "Search failed" });
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [url, q]);
  return state;
}

const inputCls = "w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

/** Brand search box. Calls onPick with a Qloo entity; also reports whether the last search found nothing. */
export function BrandSearch({ value, onChange, onPick, placeholder, exclude = [], onEmpty }: { value: string; onChange: (s: string) => void; onPick: (b: BrandHit) => void; placeholder: string; exclude?: string[]; onEmpty?: (empty: boolean) => void }) {
  const { results, loading, error } = useSearch<BrandHit>("/api/search", value);
  const [open, setOpen] = useState(false);
  const shown = results.filter((r) => !exclude.includes(r.id));
  const empty = !loading && value.trim().length >= 2 && results.length === 0 && !error;
  useEffect(() => onEmpty?.(empty), [empty, onEmpty]);
  return (
    <div className="relative">
      <input
        className={inputCls}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-autocomplete="list"
      />
      {open && value.trim().length >= 2 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-line bg-card shadow-lg" role="listbox">
          {loading && <li className="px-3 py-2 text-xs text-muted">Searching Qloo…</li>}
          {error && <li className="px-3 py-2 text-xs text-danger">{error}</li>}
          {empty && <li className="px-3 py-2 text-xs text-muted">No match in Qloo.</li>}
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent-soft"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(r);
                  setOpen(false);
                }}
              >
                <span>
                  {r.name}
                  {r.tags.length > 0 && <span className="ml-2 text-xs text-muted">{r.tags.join(", ")}</span>}
                </span>
                {r.popularity != null && <span className="shrink-0 font-mono text-xs text-muted">pop {Math.round(r.popularity * 100)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TagSearch({ selected, onAdd }: { selected: Tag[]; onAdd: (t: Tag) => void }) {
  const [q, setQ] = useState("");
  const { results, loading } = useSearch<Tag>("/api/tags", q);
  const shown = results.filter((r) => !selected.some((s) => s.id === r.id));
  return (
    <div>
      <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vibe tags, e.g. slow living, streetwear" />
      {q.trim().length >= 2 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {loading && <span className="text-xs text-muted">Searching tags…</span>}
          {!loading && !shown.length && <span className="text-xs text-muted">No tags found.</span>}
          {shown.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onAdd(t);
                setQ("");
              }}
              className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-accent hover:bg-accent-soft"
            >
              + {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Chip({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs text-ink">
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-muted hover:text-ink" aria-label="Remove">
          ×
        </button>
      )}
    </span>
  );
}

export { inputCls };
