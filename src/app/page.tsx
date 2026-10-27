import { Planner } from "@/components/Planner";
import { LIVE_EXAMPLES, MOCK_EXAMPLES } from "@/lib/examples";
import { isMock } from "@/lib/qloo";

export const dynamic = "force-dynamic";

export default function Home() {
  const mode = isMock() ? "mock" : "live";
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-10 max-w-2xl">
        <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Sponsor what your customers already love.</h1>
        <p className="mt-4 text-muted">
          Enter your brand. An agent profiles your customers&apos; taste with Qloo, then ranks podcasts, creators, artists, neighbourhoods and collab brands by affinity and by value: loved by your audience, not yet famous, so you can afford them.
        </p>
        {mode === "mock" && <p className="mt-3 inline-block rounded bg-value-soft px-2 py-1 text-xs text-value">Running on synthetic data until the Qloo API key is set.</p>}
      </div>
      <Planner examples={mode === "mock" ? MOCK_EXAMPLES : LIVE_EXAMPLES} mode={mode} />
    </main>
  );
}
