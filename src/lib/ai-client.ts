import { logAIUsage } from "@/lib/ai-usage";

// ============================================================================
// AI Client — VISION-ONLY (Issue #9 ZERO-AI / deterministic-first)
// ============================================================================
//
// ISSUE #9: tekstovna več-provider veriga (generateCompletion:
// OpenRouter → Gemini → Puter → z-ai → null) je ODSTRANJENA — jedro
// izdelka je 100 % deterministično (0 LLM žetonov na vseh rutah).
// Ta modul je zdaj IZOLIRANA OPCIJSKA vision plast za edini ostanek,
// ki ga deterministična koda utemeljeno ne more pokriti:
//
//   VIZUALNO-SEMANTIČNO razumevanje slik (Issue #9 §5/§11/§32):
//   - /api/itinerary/ingest-image — "Začni s sliko": VLM prebere
//     besedilo/imena s screenshot-a; UJEMANJE z destinacijami ostaja
//     DETERMINISTIČNO v klicalcu (matchDestinationsInText).
//   - /api/journey/bookings/parse (zavihek Slika) — rezervacijski
//     screenshot; tekst/PDF/ICS poti so čisto deterministični (parserji).
//
// Veriga vision: GEMINI (produkcija; GEMINI_API_KEY prek OpenAI-compat
// REST končne točke, NAVADEN fetch — paket `openai` je ODSTRANJEN iz
// odvisnosti) → z-ai VLM (razvojni sandbox, dinamični uvoz, brez
// poverilnic uporabnika) → null (klicalec ima iskren fallback: 502 +
// ročna alternativa).
//
// BREZ KLJUČA (= privzeto): vision vrne null → ruti pošteno odgovorijo
// 502 "AI storitev trenutno ni dosegljiva" + napotijo na URL/PDF/pins
// zavihke oz. ročni vnos. Jedro deluje BREZ tega modula.
//
// Varnost: GEMINI_API_KEY je STREŽNIŠKI env (nikoli NEXT_PUBLIC_/VITE_).
// Legacy `VITE_GEMINI_API_KEY` se NE uporablja — glej SECURITY.md.
// ============================================================================

// ─── Skupni tipi ──────────────────────────────────────────────────────────

/** ISSUE #4 §11: žetoni iz provider odgovora (kadar jih vir pošlje). */
export interface AIUsageTokens {
  promptTokens?: number;
  completionTokens?: number;
}

/** §11 metering kontekst — prisotnost pomeni, da veriga ZAPIŠE vrstico v
 *  AIUsageLog (brez njega: 0 zapisov — testi/mocki ostanejo hermetični). */
export interface AIUsageLogContext {
  /** Klicalo/plast: "ingest_image" | "reservation_parse" | … */
  feature: string;
  userId?: string;
  sessionId?: string;
}

export interface AIVisionResult {
  content: string;
  source: "gemini" | "z-ai-sdk";
  /** §11 metering (od začetka verige do uspeha, ms). */
  latencyMs: number;
  model?: string;
  usage?: AIUsageTokens;
}

/** Vir vision odgovora (produkcija = Gemini; sandbox = z-ai VLM). */
export type AIVisionSource = AIVisionResult["source"];

// ─── Provider 1: GEMINI VISION (OpenAI-compat REST, navaden fetch) ────────

const GEMINI_DEFAULT_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";
const GEMINI_DEFAULT_MODEL = "gemini-3.6-flash";
const GEMINI_VISION_TIMEOUT_MS = 45_000;

function geminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "YOUR_GEMINI_API_KEY") return null;
  return key;
}

function geminiModel(): string {
  return process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
}

function geminiBaseUrl(): string {
  return (
    process.env.GEMINI_BASE_URL?.replace(/\/?$/, "/") ||
    GEMINI_DEFAULT_BASE_URL
  );
}

/** Kratek opis napake (brez skrivnosti) — samo ob neuspehu. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 200);
  return String(error).slice(0, 200);
}

interface GeminiChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Gemini vision klic prek OpenAI-compat REST (NAVADEN fetch — paket
 * `openai` ni več odvisnost projekta, Issue #9 §40). Vrne null, če ključ
 * ni nastavljen (privzeto stanje — vision je OPCIJA, ne zahteva).
 * `reasoning_effort: "low"`: ekstrakcija imen/besedila je mehanična
 * naloga (globoko razmišljanje bi le porabilo izhodni proračun).
 */
async function geminiVisionFetch(
  prompt: string,
  imageDataUrl: string,
  maxTokens: number
): Promise<{ content: string; model: string; usage?: AIUsageTokens } | null> {
  const apiKey = geminiApiKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    GEMINI_VISION_TIMEOUT_MS
  );
  try {
    const res = await fetch(`${geminiBaseUrl()}chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: geminiModel(),
        max_tokens: maxTokens,
        reasoning_effort: "low",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Gemini vision HTTP ${res.status}`);
    }
    const data = (await res.json()) as GeminiChatResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("empty Gemini vision content");
    return {
      content,
      model: data.model || geminiModel(),
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
          }
        : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Provider 2: z-ai VLM (razvojni sandbox, dinamični uvoz) ──────────────

const VLM_TIMEOUT_MS = 45_000;

/**
 * z-ai VLM klic (z-ai-web-dev-sdk — platformski SDK brez poverilnic
 * uporabnika; deluje v razvojnem sandboxu, v produkciji pošteno odpove →
 * klicalec pade na null/502). Tip `model` je v .d.ts obvezen, a runtime
 * (in uradni CLI) ga ne pošilja — storitev sama izbere vision model;
 * cast je dokumentiran (F8, nespremenjeno vedenje).
 */
async function zaiVisionCompletion(
  prompt: string,
  imageDataUrl: string
): Promise<{ content: string; usage?: AIUsageTokens } | null> {
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();

  const visionBody = {
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: prompt },
          {
            type: "image_url" as const,
            image_url: { url: imageDataUrl },
          },
        ],
      },
    ],
    thinking: { type: "disabled" as const },
  };

  const completion = await Promise.race([
    zai.chat.completions.createVision(
      visionBody as Parameters<typeof zai.chat.completions.createVision>[0]
    ),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("VLM_TIMEOUT")), VLM_TIMEOUT_MS)
    ),
  ]);

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) return null;
  const usage = (completion as { usage?: { prompt_tokens?: number; completion_tokens?: number } })
    .usage;
  return {
    content,
    usage: usage
      ? {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
        }
      : undefined,
  };
}

// ─── Vision veriga (javni vmesnik) ────────────────────────────────────────

/**
 * Vision completion: Gemini (OpenAI-compat REST) → z-ai VLM → null.
 *
 * Uporaba: F8 "Začni s sliko" + rezervacijski screenshot — AI LE PREBRE
 * sliko (ekstraktor imen/besedila), ujemanje z destinacijami/rezervacijo
 * ostaja DETERMINISTIČNO v klicalcu.
 * imageDataUrl pričakovana oblika: data:image/(jpeg|png|webp);base64,…
 *
 * ISSUE #4 §11 (val 1): `options.usageLog` zapiše vrstico v AIUsageLog
 * (fire-and-forget, isti kanon).
 */
export async function generateVisionCompletion(
  prompt: string,
  imageDataUrl: string,
  options?: {
    maxTokens?: number;
    usageLog?: AIUsageLogContext;
  }
): Promise<AIVisionResult | null> {
  // Tla 512 (isti razlog kot prej — thinking modeli porabijo del
  // IZHODNEGA proračuna za notranje razmišljanje).
  const maxTokens = Math.max(options?.maxTokens ?? 1024, 512);
  const startedAt = Date.now();
  const attempts: string[] = [];
  let result: AIVisionResult | null = null;

  // === 1. GEMINI (produkcija) ===
  if (!geminiApiKey()) {
    attempts.push("gemini:not-configured");
  } else {
    try {
      const gem = await geminiVisionFetch(prompt, imageDataUrl, maxTokens);
      if (gem) {
        attempts.push(`gemini:${gem.model}:ok`);
        result = {
          content: gem.content,
          source: "gemini",
          latencyMs: Date.now() - startedAt,
          model: gem.model,
          usage: gem.usage,
        };
      }
    } catch (error) {
      attempts.push("gemini:error");
      console.error(
        "[ai-client] Gemini vision napaka:",
        describeError(error),
        "→ nadaljujemo na z-ai VLM"
      );
    }
  }

  // === 2. z-ai VLM (razvojni sandbox) ===
  if (!result) {
    try {
      const zai = await zaiVisionCompletion(prompt, imageDataUrl);
      if (zai) {
        attempts.push("z-ai-sdk:ok");
        result = {
          content: zai.content,
          source: "z-ai-sdk",
          latencyMs: Date.now() - startedAt,
          usage: zai.usage,
        };
      }
    } catch (error) {
      attempts.push("z-ai-sdk:error");
      console.error("[ai-client] z-ai VLM napaka:", describeError(error));
    }
  }

  if (options?.usageLog) {
    logAIUsage({
      feature: options.usageLog.feature,
      userId: options.usageLog.userId,
      sessionId: options.usageLog.sessionId,
      source: result?.source ?? "none",
      success: result != null,
      responseTimeMs: Date.now() - startedAt,
      model: result?.model,
      usage: result?.usage,
      metadata: { attempts: attempts.slice(0, 12) },
    });
  }
  return result;
}

// ─── Health (vision-only sonda) ───────────────────────────────────────────

export interface AIProviderHealth {
  /** Ali je provider konfiguriran (env ključ prisoten). */
  configured: boolean;
  /** Ali je ZADNJA sonda uspešna. */
  ok: boolean;
  /** Model sonde (ali null za z-ai — izbere ga storitev). */
  model?: string;
  /** Latencia sonde (ms). */
  latencyMs?: number;
  /** Kratek opis napake (brez skrivnosti) — samo ob neuspehu. */
  error?: string;
}

export interface AIHealthReport {
  /** Vision provider, ki bi ZDAJ servisal klic (prvi živ). */
  active: AIVisionSource | "none";
  gemini: AIProviderHealth;
  zai: AIProviderHealth;
}

/**
 * ISSUE #9: sonda OPCIJSKE vision plasti (samo Gemini + z-ai — tekstovni
 * providerji ne obstajajo več). Paradni klic: minimalen vision completion
 * na 1×1 px sliko ("Odgovori samo z 'OK'"). Poročilo je pošteno tudi ob
 * odsotnosti ključev (configured: false — vizija je opcijska, jedro
 * deluje brez nje).
 */
export async function checkAIHealth(): Promise<AIHealthReport> {
  // 1×1 rdeč pixel PNG (base64) — najmanjša možna vhodna slika.
  const PROBE_IMAGE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  const geminiStart = Date.now();
  const geminiProbe = (async () => {
    const gem = await geminiVisionFetch(
      "Odgovori samo z 'OK'",
      PROBE_IMAGE,
      512
    );
    if (!gem) throw new Error("empty content");
    return gem;
  })();

  const zaiStart = Date.now();
  const zaiProbe = (async () => {
    const zai = await zaiVisionCompletion("Odgovori samo z 'OK'", PROBE_IMAGE);
    if (!zai) throw new Error("empty content");
    return zai;
  })();

  const [geminiRes, zaiRes] = await Promise.allSettled([geminiProbe, zaiProbe]);

  const geminiHealth: AIProviderHealth = geminiApiKey()
    ? geminiRes.status === "fulfilled"
      ? {
          configured: true,
          ok: true,
          model: geminiRes.value.model,
          latencyMs: Date.now() - geminiStart,
        }
      : {
          configured: true,
          ok: false,
          model: geminiModel(),
          error: describeError(geminiRes.reason),
        }
    : { configured: false, ok: false, model: geminiModel() };

  const zaiHealth: AIProviderHealth =
    zaiRes.status === "fulfilled"
      ? {
          configured: true,
          ok: true,
          latencyMs: Date.now() - zaiStart,
        }
      : {
          configured: true,
          ok: false,
          error: describeError(zaiRes.reason),
        };

  const active: AIVisionSource | "none" = geminiHealth.ok
    ? "gemini"
    : zaiHealth.ok
      ? "z-ai-sdk"
      : "none";

  return { active, gemini: geminiHealth, zai: zaiHealth };
}
