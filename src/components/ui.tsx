import type { ReactNode } from "react";

export function Meter({ label, value, tone = "accent" }: { label: string; value: number | null; tone?: "accent" | "pop" | "value" }) {
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  const color = tone === "accent" ? "bg-accent" : tone === "value" ? "bg-value" : "bg-pop";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-muted">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" role="meter" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${v * 100}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right font-mono tabular-nums">{value == null ? "–" : Math.round(v * 100)}</span>
    </div>
  );
}

export function Section({ id, title, kicker, children, action }: { id?: string; title: string; kicker?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line pt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          {kicker && <p className="text-xs uppercase tracking-wider text-muted">{kicker}</p>}
          <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const PATHS: Record<string, string> = {
  podcast: "M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0M12 18v4M8 22h8",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  artist: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  place: "M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  brand: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 7.5h.01",
  tv_show: "M3 7h18v12H3zM8 3l4 4 4-4",
  destination: "M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
};

export function KindIcon({ kind, className = "h-4 w-4" }: { kind: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[kind] ?? PATHS.brand} />
    </svg>
  );
}

export const KIND_NAME: Record<string, string> = { podcast: "Podcast", person: "Creator", artist: "Artist", place: "Place", brand: "Brand", tv_show: "TV show", destination: "Destination", movie: "Film", book: "Book" };
