import { hasLLM } from "@/lib/llm";
import { withoutQloo } from "@/lib/pitch";
import { clientIp, loadReport, rateLimit, saveReport } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { reportId } = (await req.json().catch(() => ({}))) as { reportId?: string };
  const report = reportId ? await loadReport(reportId) : null;
  if (!report) return Response.json({ error: "Report not found" }, { status: 404 });
  if (report.withoutQloo) return Response.json({ text: report.withoutQloo });
  if (!hasLLM()) return Response.json({ error: "Set GEMINI_API_KEY to run the LLM-only comparison." }, { status: 503 });
  if (!(await rateLimit(clientIp(req), "noqloo", 20, 3600))) return Response.json({ error: "Rate limited" }, { status: 429 });
  try {
    report.withoutQloo = await withoutQloo(report);
    await saveReport(report);
    return Response.json({ text: report.withoutQloo });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "LLM call failed" }, { status: 502 });
  }
}
