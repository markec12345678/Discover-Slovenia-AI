import OpenAI from "openai";

/**
 * AI Client — več-provider veriga (F10, 1.13.0)
 *
 * Vrstni red (prvi uspešni zmaga):
 *   1. GEMINI   — Google AI Studio prek OpenAI-compat končne točke
 *                (GEMINI_API_KEY; brezplačna stopnja — primarno za
 *                produkcijo na Vercel/Render, kjer je regija podprta)
 *   2. PUTER    — brezplačni OpenAI-compatible API (PUTER_AUTH_TOKEN)
 *   3. z-ai-sdk — z-ai-web-dev-sdk (razvojni sandbox)
 *   → null      — klicalec uporabi lasten determinističen fallback
 *
 * ZAKAJ OpenAI-compat za Gemini: paket `openai` je ŽE odvisnost projekta,
 * Gemini pa izpostavlja vmesnik /v1beta/openai/ (chat/completions z
 * enakimi tipi sporočil, vključno z image_url za vision). Nič nove
 * odvisnosti, enak vmesnik, enaki tipi.
 *
 * CIRCUIT BREAKER (Gemini): 3 zaporedne napake → 5 minut odmora, da
 * geo-blokirana/nedosegljiva regija (npr. razvojni sandbox) NE obdavči
 * vsakega klica z zamudo neuspešnega poskusa. Uspešna preverjava
 * zdravja (ai-health) breaker pošteno RESETIRA.
 *
 * Varnost: GEMINI_API_KEY je STREŽNIŠKI env (nikoli NEXT_PUBLIC_/VITE_).
 * Legacy `VITE_GEMINI_API_KEY` (client-side, vidna ob buildu) je iz
 * predhodne faze in se NE uporablja — glej SECURITY.md.
 */

// ─── Skupni tipi ──────────────────────────────────────────────────────────

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AIProviderSource = "gemini" | "puter" | "z-ai-sdk" | "fallback";

export interface AICompletionResult {
  content: string;
  source: AIProviderSource;
}

export interface AICompletionOptions {
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
}

export interface AIVisionResult {
  content: string;
  source: "gemini" | "z-ai-sdk";
}

// ─── Provider 1: GEMINI (OpenAI-compat) ──────────────────────────────────

const GEMINI_DEFAULT_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";
// gemini-2.5-flash je za NOVE uporabnike umaknjen (Google 2026: 404 z
// nasvetom prekinitve) — privzeti model je uradno priporočeni naslednik.
// Preglasi se z GEMINI_MODEL (npr. "gemini-3.6-pro" za kvaliteto).
const GEMINI_DEFAULT_MODEL = "gemini-3.6-flash";
const GEMINI_TIMEOUT_MS = 45_000;

let geminiClient: OpenAI | null = null;

function geminiModel(): string {
  return process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
}

function getGeminiClient(): OpenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") return null;
  if (!geminiClient) {
    geminiClient = new OpenAI({
      baseURL: process.env.GEMINI_BASE_URL || GEMINI_DEFAULT_BASE_URL,
      apiKey,
      timeout: GEMINI_TIMEOUT_MS,
      maxRetries: 1,
    });
  }
  return geminiClient;
}

// Circuit breaker (glej glavo modula)
const GEMINI_BREAKER_FAILURES = 3;
const GEMINI_BREAKER_COOLDOWN_MS = 5 * 60_000;
let geminiFailures = 0;
let geminiCooldownUntil = 0;

function geminiBreakerOpen(): boolean {
  return Date.now() < geminiCooldownUntil;
}

function geminiRecordFailure(): void {
  geminiFailures += 1;
  if (geminiFailures >= GEMINI_BREAKER_FAILURES) {
    geminiCooldownUntil = Date.now() + GEMINI_BREAKER_COOLDOWN_MS;
    geminiFailures = 0;
    console.warn(
      `[ai-client] Gemini: ${GEMINI_BREAKER_FAILURES} zaporedne napake → odmor ${GEMINI_BREAKER_COOLDOWN_MS / 60_000} min (circuit breaker)`
    );
  }
}

function geminiRecordSuccess(): void {
  geminiFailures = 0;
  geminiCooldownUntil = 0;
}

/** Kratek, varen opis napake (brez ključa, brez stacka) za loge/health. */
function describeError(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    return `${error.status ?? "?"} ${error.message?.slice(0, 140)}`;
  }
  if (error instanceof Error) return error.message.slice(0, 140);
  return String(error).slice(0, 140);
}

// ─── Provider 2: PUTER ────────────────────────────────────────────────────

let puterClient: OpenAI | null = null;

function getPuterClient(): OpenAI | null {
  const token = process.env.PUTER_AUTH_TOKEN;
  const baseUrl =
    process.env.PUTER_BASE_URL || "https://api.puter.com/puterai/openai/v1/";

  if (!token || token === "YOUR_PUTER_AUTH_TOKEN") {
    return null;
  }

  if (!puterClient) {
    puterClient = new OpenAI({
      baseURL: baseUrl,
      apiKey: token,
      timeout: 45_000,
      maxRetries: 1,
    });
  }

  return puterClient;
}

function puterModel(): string {
  return process.env.PUTER_MODEL || "z-ai/glm-5.1";
}

// ─── Generacija (veriga) ─────────────────────────────────────────────────

/**
 * Generira AI chat completion po verigi Gemini → Puter → z-ai-sdk.
 * Če vsi odpovejo, vrne null (klicalec naj uporabi lasten fallback).
 */
export async function generateCompletion(
  messages: AIMessage[],
  options?: AICompletionOptions
): Promise<AICompletionResult | null> {
  const temperature = options?.temperature ?? 0.7;
  // P7-C2 (F5.4): strežna zgornja meja izpisa — prej neomejeno (token-bomb
  // tudi pod rate limitom). Privzeto 4096 (nad vsemi legitimnimi izpisi),
  // klicalec lahko zahteva krajše (npr. health-check 8).
  const maxTokens = options?.maxTokens ?? 4096;

  const mapped = messages.map((m) => ({ role: m.role, content: m.content }));

  // === 1. GEMINI (OpenAI-compat) ===
  // Gemini 3.x thinking modeli porabijo del IZHODNEGA proračuna za notranje
  // razmišljanje (živo preverjeno z GitHub runnerja 2026-09-15: max_tokens
  // 16 → finish_reason "length", completion_tokens 0) — zato ima učinkoviti
  // proračun TLA 512 žetonov, da majhni klici (health, ask) ne ostanejo brez
  // vidne vsebine. P7-C2 zgornja meja ostaja (tala ne odprejo token-bombe).
  const geminiMaxTokens = Math.max(maxTokens, 512);
  const gemini = getGeminiClient();
  if (gemini && !geminiBreakerOpen()) {
    try {
      const completion = await gemini.chat.completions.create({
        model: geminiModel(),
        messages: mapped,
        temperature,
        max_tokens: geminiMaxTokens,
        ...(options?.jsonMode
          ? { response_format: { type: "json_object" as const } }
          : {}),
      });
      const content = completion.choices[0]?.message?.content?.trim();
      if (content) {
        geminiRecordSuccess();
        return { content, source: "gemini" };
      }
      throw new Error("empty Gemini content");
    } catch (error) {
      geminiRecordFailure();
      console.error(
        "[ai-client] Gemini napaka:",
        describeError(error),
        "→ nadaljujemo na Puter/z-ai"
      );
    }
  }

  // === 2. PUTER ===
  const puter = getPuterClient();
  if (puter) {
    try {
      const completion = await puter.chat.completions.create({
        model: puterModel(),
        messages: mapped,
        temperature,
        max_tokens: maxTokens,
        ...(options?.jsonMode
          ? { response_format: { type: "json_object" as const } }
          : {}),
      });
      const content = completion.choices[0]?.message?.content?.trim();
      if (content) {
        return { content, source: "puter" };
      }
    } catch (error) {
      console.error("[ai-client] Puter API napaka:", describeError(error));
    }
  }

  // === 3. z-ai-web-dev-sdk (razvojni sandbox) ===
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: mapped,
      thinking: { type: "disabled" },
      max_tokens: maxTokens,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (content) {
      return { content, source: "z-ai-sdk" };
    }
  } catch (error) {
    console.error(
      "[ai-client] z-ai-web-dev-sdk napaka:",
      describeError(error)
    );
  }

  return null;
}

// ─── Vision (F8: slikovni vnos) ──────────────────────────────────────────

/**
 * Vision completion: Gemini (image_url prek OpenAI-compat) → z-ai VLM.
 *
 * Uporaba: F8 "Začni s sliko" — AI LE PREBRE sliko (ekstraktor imen),
 * ujemanje z destinacijami ostane DETERMINISTIČNO v klicalcu.
 * imageDataUrl pričakovana oblika: data:image/(jpeg|png|webp);base64,…
 */
export async function generateVisionCompletion(
  prompt: string,
  imageDataUrl: string,
  options?: { maxTokens?: number }
): Promise<AIVisionResult | null> {
  // Tla 512 (isti razlog kot pri generateCompletion — thinking proračun)
  const maxTokens = Math.max(options?.maxTokens ?? 1024, 512);

  // === 1. GEMINI (image_url del v OpenAI-compat formatu) ===
  const gemini = getGeminiClient();
  if (gemini && !geminiBreakerOpen()) {
    try {
      const completion = await gemini.chat.completions.create({
        model: geminiModel(),
        messages: [
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: prompt },
              { type: "image_url" as const, image_url: { url: imageDataUrl } },
            ],
          },
        ],
        max_tokens: maxTokens,
      });
      const content = completion.choices[0]?.message?.content?.trim();
      if (content) {
        geminiRecordSuccess();
        return { content, source: "gemini" };
      }
      throw new Error("empty Gemini vision content");
    } catch (error) {
      geminiRecordFailure();
      console.error(
        "[ai-client] Gemini vision napaka:",
        describeError(error),
        "→ nadaljujemo na z-ai VLM"
      );
    }
  }

  // === 2. z-ai VLM (razvojni sandbox) ===
  // Tip `model` je v .d.ts obvezen, a runtime (in uradni CLI) ga ne pošilja —
  // storitev sama izbere vision model; cast je dokumentiran (F8).
  const VLM_TIMEOUT_MS = 45_000;
  try {
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
        visionBody as Parameters<
          typeof zai.chat.completions.createVision
        >[0]
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("VLM_TIMEOUT")), VLM_TIMEOUT_MS)
      ),
    ]);

    const content = completion.choices[0]?.message?.content?.trim();
    if (content) {
      return { content, source: "z-ai-sdk" };
    }
  } catch (error) {
    console.error(
      "[ai-client] z-ai VLM napaka:",
      describeError(error)
    );
  }

  return null;
}

// ─── Zdravje providerjev ─────────────────────────────────────────────────

export interface AIProviderHealth {
  /** Ali je env spremenljivka nastavljena (provider je v verigi). */
  configured: boolean;
  /** Ali je živ preizkusni klic uspel. */
  ok: boolean;
  /** Model, ki bi ga provider uporabil. */
  model: string;
  /** Odzivni čas preizkusa (ms) — samo ob uspehu. */
  latencyMs?: number;
  /** Kratek opis napake (brez skrivnosti) — samo ob neuspehu. */
  error?: string;
}

export interface AIHealthReport {
  /** Provider, ki bi ZDAJ servisal generacijo (prvi živ). */
  active: AIProviderSource | "none";
  gemini: AIProviderHealth;
  puter: AIProviderHealth;
  zai: AIProviderHealth;
}

/**
 * Preveri vse tri providerje Z PARALELNO (vsak s svojo timeout mejo 12 s),
 * z minimalnim completionom ("Odgovori samo z 'OK'", maxTokens 8).
 *
 * Pommbno: preizkusi Geminija BEZ circuit breakerja — uspeh breaker
 * resetira (health check je pošten detektor okrevanja).
 */
export async function checkAIHealth(): Promise<AIHealthReport> {
  const probeMessages: AIMessage[] = [
    { role: "user", content: "Odgovori samo z 'OK'" },
  ];

  const gemini = getGeminiClient();
  const geminiStart = Date.now();
  // 512 (ne 8): thinking modeli porabijo proračun za notranje razmišljanje
  // — s 8 žetoni bi odgovor bil vedno prazen (finish_reason "length"),
  // health pa bi lažno javil odpoved delujočega providerja.
  const geminiProbe = gemini
    ? gemini.chat.completions.create({
        model: geminiModel(),
        messages: probeMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: 0,
        max_tokens: 512,
      })
    : Promise.reject(new Error("not-configured"));

  const puter = getPuterClient();
  const puterStart = Date.now();
  const puterProbe = puter
    ? puter.chat.completions.create({
        model: puterModel(),
        messages: probeMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: 0,
        max_tokens: 8,
      })
    : Promise.reject(new Error("not-configured"));

  const zaiStart = Date.now();
  const zaiProbe = (async () => {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    return zai.chat.completions.create({
      messages: probeMessages,
      thinking: { type: "disabled" },
      max_tokens: 8,
    });
  })();

  const [geminiRes, puterRes, zaiRes] = await Promise.allSettled([
  geminiProbe,
  puterProbe,
  zaiProbe,
  ]);

  // ── Gemini ──
  let geminiHealth: AIProviderHealth;
  if (!gemini) {
    geminiHealth = {
      configured: false,
      ok: false,
      model: geminiModel(),
    };
  } else if (geminiRes.status === "fulfilled") {
    const ok = Boolean(
      geminiRes.value.choices[0]?.message?.content?.trim()
    );
    if (ok) geminiRecordSuccess(); // health uspeh → breaker reset
    geminiHealth = {
      configured: true,
      ok,
      model: geminiModel(),
      latencyMs: Date.now() - geminiStart,
      ...(ok ? {} : { error: "empty content" }),
    };
  } else {
    geminiHealth = {
      configured: true,
      ok: false,
      model: geminiModel(),
      error: describeError(geminiRes.reason),
    };
  }

  // ── Puter ──
  let puterHealth: AIProviderHealth;
  if (!puter) {
    puterHealth = {
      configured: false,
      ok: false,
      model: puterModel(),
    };
  } else if (puterRes.status === "fulfilled") {
    const ok = Boolean(puterRes.value.choices[0]?.message?.content?.trim());
    puterHealth = {
      configured: true,
      ok,
      model: puterModel(),
      latencyMs: Date.now() - puterStart,
      ...(ok ? {} : { error: "empty content" }),
    };
  } else {
    puterHealth = {
      configured: true,
      ok: false,
      model: puterModel(),
      error: describeError(puterRes.reason),
    };
  }

  // ── z-ai-sdk ──
  let zaiHealth: AIProviderHealth;
  if (zaiRes.status === "fulfilled") {
    const ok = Boolean(zaiRes.value.choices[0]?.message?.content?.trim());
    zaiHealth = {
      configured: true,
      ok,
      model: "z-ai-sdk",
      latencyMs: Date.now() - zaiStart,
      ...(ok ? {} : { error: "empty content" }),
    };
  } else {
    zaiHealth = {
      configured: true,
      ok: false,
      model: "z-ai-sdk",
      error: describeError(zaiRes.reason),
    };
  }

  // Aktivni provider = prvi ŽIV v verigi (breaker pri Geminiju se je prav
  // ravnokar ponastavil ob uspehu, zato je odločitev skladna s generacijo)
  let active: AIHealthReport["active"] = "none";
  if (geminiHealth.ok) active = "gemini";
  else if (puterHealth.ok) active = "puter";
  else if (zaiHealth.ok) active = "z-ai-sdk";

  return { active, gemini: geminiHealth, puter: puterHealth, zai: zaiHealth };
}
