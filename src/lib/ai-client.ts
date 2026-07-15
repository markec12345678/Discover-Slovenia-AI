import OpenAI from "openai";

/**
 * AI Client — uporablja Puter's free OpenAI-compatible API
 * Model: z-ai/glm-5.1 (GLM)
 *
 * Puter poskytuje brezplačni dostop do AI modelov preko OpenAI-compatible API.
 * To omogoča AI itinerer generiranje brez plačila API ključev.
 *
 * Če Puter ni konfiguriran, fallback na z-ai-web-dev-sdk.
 */

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  const token = process.env.PUTER_AUTH_TOKEN;
  const baseUrl = process.env.PUTER_BASE_URL || "https://api.puter.com/puterai/openai/v1/";

  if (!token || token === "YOUR_PUTER_AUTH_TOKEN") {
    return null;
  }

  if (!client) {
    client = new OpenAI({
      baseURL: baseUrl,
      apiKey: token,
    });
  }

  return client;
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionResult {
  content: string;
  source: "puter" | "z-ai-sdk" | "fallback";
}

/**
 * Generira AI chat completion.
 * Najprej poskusi Puter API (brezplačno).
 * Če Puter odpove, fallback na z-ai-web-dev-sdk.
 * Če tudi ta odpove, vrne null (klicalec naj uporabi lasten fallback).
 */
export async function generateCompletion(
  messages: AIMessage[],
  options?: { temperature?: number; jsonMode?: boolean }
): Promise<AICompletionResult | null> {
  const temperature = options?.temperature ?? 0.7;
  const model = process.env.PUTER_MODEL || "z-ai/glm-5.1";

  // === 1. POSKUSI PUTER API ===
  try {
    const c = getClient();
    if (c) {
      const completion = await c.chat.completions.create({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature,
        ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {}),
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (content) {
        return { content, source: "puter" };
      }
    }
  } catch (error) {
    console.error("[ai-client] Puter API napaka:", error);
  }

  // === 2. FALLBACK NA z-ai-web-dev-sdk ===
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      thinking: { type: "disabled" },
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (content) {
      return { content, source: "z-ai-sdk" };
    }
  } catch (error) {
    console.error("[ai-client] z-ai-web-dev-sdk napaka:", error);
  }

  return null;
}

/**
 * Hitro preveri ali je Puter API na voljo
 */
export async function checkAIHealth(): Promise<{ puter: boolean; model: string }> {
  try {
    const result = await generateCompletion(
      [{ role: "user", content: "Odgovori samo z 'OK'" }],
      { temperature: 0 }
    );
    return { puter: result?.source === "puter", model: process.env.PUTER_MODEL || "z-ai/glm-5.1" };
  } catch {
    return { puter: false, model: "none" };
  }
}
