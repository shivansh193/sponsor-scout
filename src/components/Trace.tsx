import type { TraceStep } from "@/lib/types";

const DOT: Record<TraceStep["status"], string> = {
  running: "bg-accent animate-pulse",
  done: "bg-accent",
  empty: "bg-value",
  error: "bg-danger",
};

export function Trace({ steps, notes = [] }: { steps: TraceStep[]; notes?: string[] }) {
  if (!steps.length && !notes.length) return null;
  return (
    <ol className="space-y-1.5 font-mono text-xs" aria-live="polite">
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-2">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT[s.status]}`} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="text-ink">{s.label}</span>
            <span className="text-muted">
              {" "}
              · {s.tool}
              {s.status !== "running" && s.count !== undefined && ` · ${s.count} result${s.count === 1 ? "" : "s"}`}
              {s.ms !== undefined && ` · ${(s.ms / 1000).toFixed(1)}s`}
              {s.status === "empty" && " · empty"}
            </span>
            {s.note && <span className={`block ${s.status === "error" ? "text-danger" : "text-muted"}`}>{s.note}</span>}
          </span>
        </li>
      ))}
      {notes.map((n, i) => (
        <li key={`n${i}`} className="pl-4 text-value">
          {n}
        </li>
      ))}
    </ol>
  );
}
