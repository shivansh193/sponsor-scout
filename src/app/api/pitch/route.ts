import { explainPick } from "@/lib/agent/tools";
import { kvGet, kvSet } from "@/lib/cache";
import { draftPitch, evidenceLines } from "@/lib/pitch";
import { clientIp, loadReport, rateLimit } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { reportId, entityId } = (await req.json().catch(() => ({}))) as { reportId?: string; entityId?: string };
  if (!reportId || !entityId) return Response.json({ error: "reportId and entityId required" }, { status: 400 });
  const key = `pitch:v2:${reportId}:${entityId}`;
  const hit = await kvGet(key);
  if (hit) return Response.json(hit);
  if (!(await rateLimit(clientIp(req), "pitch", 40, 3600))) return Response.json({ error: "Rate limited" }, { status: 429 });
  const report = await loadReport(reportId);
  if (!report) return Response.json({ error: "Report not found" }, { status: 404 });
  try {
    const ev = await explainPick(report, entityId);
    const { email, source } = await draftPitch(report, ev);
    const out = { evidence: evidenceLines(report, ev), email, source };
    await kvSet(key, out, 60 * 60 * 24 * 90);
    return Response.json(out);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Pitch failed" }, { status: 500 });
  }
}
