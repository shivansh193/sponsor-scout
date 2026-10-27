import { storeKind } from "@/lib/cache";
import { GEMINI_MODEL, hasLLM } from "@/lib/llm";
import { isMock } from "@/lib/qloo";

export const runtime = "nodejs";

export function GET() {
  return Response.json({ qloo: isMock() ? "mock" : "live", llm: hasLLM() ? GEMINI_MODEL : null, store: storeKind });
}
