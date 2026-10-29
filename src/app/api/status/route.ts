import { storeKind } from "@/lib/cache";
import { GEMINI_MODEL, hasLLM, listModels } from "@/lib/llm";
import { isMock } from "@/lib/qloo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const status = { qloo: isMock() ? "mock" : "live", llm: hasLLM() ? GEMINI_MODEL : null, store: storeKind };
  // ?models=1 lists the Flash model IDs the configured key can call.
  if (hasLLM() && new URL(req.url).searchParams.has("models")) {
    const models = await listModels().catch((e) => [`error: ${e instanceof Error ? e.message.slice(0, 120) : "failed"}`]);
    return Response.json({ ...status, models });
  }
  return Response.json(status);
}
