import { runAgent } from "@/lib/agent/run";
import { clientIp, findRun, loadReport, rateLimit, rememberRun, saveReport } from "@/lib/store";
import type { AgeBand, Budget, RunInput, Tag } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const BUDGETS: Budget[] = ["bootstrapped", "growing", "funded"];
const AGES: AgeBand[] = ["35_and_younger", "36_to_55", "55_and_older"];

function parseInput(b: Record<string, unknown>): RunInput | string {
  const ref = (x: unknown) => (x && typeof x === "object" && typeof (x as Tag).id === "string" && typeof (x as Tag).name === "string" ? { id: (x as Tag).id, name: (x as Tag).name } : null);
  const list = (x: unknown, max: number) => (Array.isArray(x) ? (x.map(ref).filter(Boolean) as Tag[]).slice(0, max) : []);
  const input: RunInput = {
    brandQuery: typeof b.brandQuery === "string" ? b.brandQuery.slice(0, 80) : "",
    brand: ref(b.brand),
    lookalikes: list(b.lookalikes, 4),
    tags: list(b.tags, 5),
    city: typeof b.city === "string" && b.city.trim() ? b.city.trim().slice(0, 60) : undefined,
    budget: BUDGETS.includes(b.budget as Budget) ? (b.budget as Budget) : "bootstrapped",
    age: AGES.includes(b.age as AgeBand) ? (b.age as AgeBand) : undefined,
  };
  if (!input.brand && !input.lookalikes.length && !input.tags.length) return "Pick your brand, or at least one lookalike brand or vibe tag.";
  return input;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const input = parseInput(body);
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      // Flush headers at once and keep the connection alive while slow steps run.
      controller.enqueue(enc.encode(": open\n\n"));
      const ping = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 10000);
      try {
        // Cached run: replay its trace quickly so the first click is instant.
        const prevId = body.fresh ? null : await findRun(input);
        const prev = prevId ? await loadReport(prevId) : null;
        if (prev) {
          send("note", { text: "Using a report computed for the same input in the last 24h." });
          for (const s of prev.trace) {
            send("step", s);
            await new Promise((r) => setTimeout(r, 60));
          }
          send("report", { id: prev.id });
          return;
        }
        if (!(await rateLimit(clientIp(req), "run", Number(process.env.RUNS_PER_HOUR ?? 12), 3600))) {
          send("error", { message: "Rate limit reached for new runs. Try an example, or come back in an hour." });
          return;
        }
        const report = await runAgent(input, (e) => (e.type === "step" ? send("step", e.step) : send("note", { text: e.text })));
        await saveReport(report);
        await rememberRun(input, report.id);
        send("report", { id: report.id });
      } catch (e) {
        send("error", { message: e instanceof Error ? e.message : "Run failed" });
      } finally {
        clearInterval(ping);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
