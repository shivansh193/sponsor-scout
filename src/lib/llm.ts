import { GoogleGenAI, type Content, type FunctionDeclaration, type ThinkingLevel } from "@google/genai";

// Gemini wrapper. The model ID is configurable because Google rotates Flash
// IDs; the default alias tracks the current Flash model.

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
export const hasLLM = () => Boolean(process.env.GEMINI_API_KEY);

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return client;
}

// Optional second model, tried once the main one keeps returning overload errors.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL;
const RETRY_DELAYS_MS = [800, 2000];
// Per-request cap, so one slow call can't eat the whole serverless time budget.
const CALL_TIMEOUT_MS = Number(process.env.GEMINI_CALL_TIMEOUT_MS ?? 20000);

// Planning tool calls needs little reasoning, and Flash's default thinking makes
// each turn slow. "default" leaves the model's own setting.
const THINKING_LEVEL = (process.env.GEMINI_THINKING_LEVEL ?? "MINIMAL").toUpperCase();
let thinkingSupported = THINKING_LEVEL !== "DEFAULT";

function thinkingConfig(): { thinkingConfig?: { thinkingLevel: ThinkingLevel } } {
  return thinkingSupported ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL as ThinkingLevel } } : {};
}

function isTransient(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /\b(429|500|502|503|504)\b|overloaded|high demand|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msg);
}

function isTimeout(e: unknown): boolean {
  return (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) || /aborted|timed? ?out/i.test(String(e));
}

/** Model IDs this key can call that contain `match`, for picking GEMINI_MODEL. */
export async function listModels(match = "flash"): Promise<string[]> {
  const out: string[] = [];
  for await (const m of await ai().models.list()) if (m.name?.includes(match)) out.push(m.name.replace("models/", ""));
  return out.sort();
}

/** Retries transient Gemini errors (overload, rate limit) with backoff, then tries the fallback model. */
async function withRetry<T>(fn: (model: string) => Promise<T>): Promise<T> {
  const models = FALLBACK_MODEL && FALLBACK_MODEL !== GEMINI_MODEL ? [GEMINI_MODEL, FALLBACK_MODEL] : [GEMINI_MODEL];
  let last: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await fn(model);
      } catch (e) {
        last = e;
        // A model that rejects the thinking setting: drop it and retry straight away.
        if (thinkingSupported && /thinking/i.test(e instanceof Error ? e.message : String(e))) {
          thinkingSupported = false;
          attempt--;
          continue;
        }
        // A timed-out call would just time out again: move on to the fallback model.
        if (isTimeout(e)) break;
        if (!isTransient(e)) throw e;
        if (attempt < RETRY_DELAYS_MS.length) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  throw last;
}

export async function generateText(prompt: string, system?: string): Promise<string> {
  const res = await withRetry((model) =>
    ai().models.generateContent({
      model,
      contents: prompt,
      config: { ...(system ? { systemInstruction: system } : {}), ...thinkingConfig(), abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS) },
    }),
  );
  return res.text?.trim() ?? "";
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolTurn {
  text: string;
  calls: { id?: string; name: string; args: Record<string, unknown> }[];
  content: Content | undefined;
}

export async function toolTurn(history: Content[], tools: ToolDef[], system: string): Promise<ToolTurn> {
  const functionDeclarations: FunctionDeclaration[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema: t.parameters,
  }));
  const res = await withRetry((model) =>
    ai().models.generateContent({
      model,
      contents: history,
      config: { systemInstruction: system, tools: [{ functionDeclarations }], temperature: 0.2, ...thinkingConfig(), abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS) },
    }),
  );
  return {
    text: res.text?.trim() ?? "",
    calls: (res.functionCalls ?? []).map((c) => ({ id: c.id, name: c.name ?? "", args: (c.args ?? {}) as Record<string, unknown> })),
    content: res.candidates?.[0]?.content,
  };
}
