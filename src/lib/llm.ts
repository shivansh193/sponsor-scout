import { GoogleGenAI, type Content, type FunctionDeclaration } from "@google/genai";

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

function isTransient(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /\b(429|500|502|503|504)\b|overloaded|high demand|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msg);
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
      config: system ? { systemInstruction: system } : undefined,
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
      config: { systemInstruction: system, tools: [{ functionDeclarations }], temperature: 0.2 },
    }),
  );
  return {
    text: res.text?.trim() ?? "",
    calls: (res.functionCalls ?? []).map((c) => ({ id: c.id, name: c.name ?? "", args: (c.args ?? {}) as Record<string, unknown> })),
    content: res.candidates?.[0]?.content,
  };
}
