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

export async function generateText(prompt: string, system?: string): Promise<string> {
  const res = await ai().models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: system ? { systemInstruction: system } : undefined,
  });
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
  const res = await ai().models.generateContent({
    model: GEMINI_MODEL,
    contents: history,
    config: { systemInstruction: system, tools: [{ functionDeclarations }], temperature: 0.2 },
  });
  return {
    text: res.text?.trim() ?? "",
    calls: (res.functionCalls ?? []).map((c) => ({ id: c.id, name: c.name ?? "", args: (c.args ?? {}) as Record<string, unknown> })),
    content: res.candidates?.[0]?.content,
  };
}
