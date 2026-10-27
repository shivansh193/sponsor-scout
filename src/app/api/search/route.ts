import { searchEntities } from "@/lib/qloo";
import { clientIp, rateLimit } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) return Response.json({ results: [] });
  if (!(await rateLimit(clientIp(req), "search", 120, 3600))) return Response.json({ error: "Rate limited" }, { status: 429 });
  try {
    const { value } = await searchEntities(q, ["brand"], 6);
    return Response.json({ results: value.map((e) => ({ id: e.id, name: e.name, popularity: e.popularity, tags: e.tags.slice(0, 4).map((t) => t.name) })) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Search failed" }, { status: 502 });
  }
}
