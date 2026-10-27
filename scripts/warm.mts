// Precomputes the landing-page examples on a deployed instance so the judges'
// first click replays a cached run.
//   npx tsx scripts/warm.mts https://your-app.vercel.app

import { LIVE_EXAMPLES, MOCK_EXAMPLES } from "../src/lib/examples";

const base = process.argv[2] ?? "http://localhost:3000";
const status = (await (await fetch(`${base}/api/status`)).json()) as { qloo: string };
const examples = status.qloo === "live" ? LIVE_EXAMPLES : MOCK_EXAMPLES;

for (const ex of examples) {
  const t0 = Date.now();
  const res = await fetch(`${base}/api/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ex.input) });
  const text = await res.text();
  const id = text.match(/event: report\ndata: \{"id":"([^"]+)"/)?.[1];
  const err = text.match(/event: error\ndata: (.*)/)?.[1];
  console.log(`${ex.title}: ${id ? `${base}/r/${id}` : `FAILED ${err ?? res.status}`} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
