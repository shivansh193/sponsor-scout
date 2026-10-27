import { loadReport } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report) return Response.json({ error: "Report not found" }, { status: 404 });
  return Response.json(report);
}
