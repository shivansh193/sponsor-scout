import { searchTags } from "@/lib/qloo";
import { clientIp, rateLimit } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 60) ?? "";
  if (q.length < 2) return Response.json({ results: [] });
  if (!(await rateLimit(clientIp(req), "search", 120, 3600))) return Response.json({ error: "Rate limited" }, { status: 429 });
  try {
    const { value } = await searchTags(q, 8);
    return Response.json({ results: value });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Tag search failed" }, { status: 502 });
  }
}
