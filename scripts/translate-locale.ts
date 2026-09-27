/**
 * W1 (Issue #15, V0): AI-podprt prevod sporočilnih datotek v IT + DE.
 *
 * Kanon (UX-WORKFLOW-BENCHMARK §4 V0):
 * - prevodi so STROJNI (LLM) → dokler niso revidirani, jih v UI pošteno
 *   označujemo (mtNotice — provenance pristop platforme);
 * - SL ostaja primarni vir resnice; EN je referenčni par (kontekst);
 * - ZERO FEATURE LOSS: struktura ključev ostane IDENTIČNA (pariteta,
 *   razširjen task71 test);
 * - ICU placeholderji {x} se morajo ohraniti.
 *
 * Uporaba: bun scripts/translate-locale.mjs [it,de]
 * Predpomnilnik: .translate-cache/<target>/<hash>.json (obnovljivo).
 * Poročilo: /tmp/translate-report.json + stderr dnevnik.
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(import.meta.dir, "..");
const MESSAGES_DIR = path.join(ROOT, "src", "i18n", "messages");
const CACHE_DIR = path.join(ROOT, ".translate-cache");
const REPORT_PATH = "/tmp/translate-report.json";

const TARGETS = (process.argv[2] ?? "it,de").split(",").map((s) => s.trim());

const LANG_NAMES: Record<string, string> = {
  it: "Italian",
  de: "German (Standard German, Hochdeutsch)",
};

// ── pomožniki ─────────────────────────────────────────────────────────────

type Flat = Record<string, string>;

function flat(obj: unknown, prefix = ""): Flat {
  const out: Flat = {};
  if (typeof obj !== "object" || obj === null) return out;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      Object.assign(out, flat(value, p));
    } else {
      out[p] = String(value);
    }
  }
  return out;
}

/** Obnovi gnezdeno drevo z enako obliko kot vir (leaf → translated). */
function rebuild(template: unknown, translations: Flat, prefix = ""): unknown {
  if (typeof template !== "object" || template === null || Array.isArray(template)) {
    return translations[prefix] ?? String(template);
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      out[key] = rebuild(value, translations, p);
    } else {
      out[key] = translations[p] ?? String(value);
    }
  }
  return out;
}

function placeholders(s: string): string[] {
  return [...(s.match(/\{[a-zA-Z0-9_]+\}/g) ?? [])].sort();
}

function parseJsonLoose(raw: string): unknown {
  let t = raw.trim();
  // odstrani markdown ograje
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(t);
  } catch {
    // reševalni poskus: najdi prvi { … zadnji }
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("neveljaven JSON");
  }
}

function cachePath(target: string, key: string) {
  const h = crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
  return path.join(CACHE_DIR, target, `${h}.json`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── LLM klic z retry ──────────────────────────────────────────────────────

let zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function translateBatch(
  target: string,
  entries: { key: string; sl: string; en: string }[]
): Promise<Record<string, string> | null> {
  const langName = LANG_NAMES[target];
  const payload = entries.map((e) => ({ key: e.key, sl: e.sl, en: e.en }));

  const system = [
    `You are a professional tourism-marketplace translator for a Slovenian travel platform (Discover Slovenia AI).`,
    `Translate INTO ${langName}.`,
    `RULES:`,
    `1. Return ONLY a valid JSON object: {"<key>": "<translation>"} for every input key — no markdown, no commentary.`,
    `2. Preserve ICU placeholders exactly ({name}, {count}, …) — never translate, reorder or drop them.`,
    `3. Use the Slovenian (sl) text as source of truth; the English (en) text is context/reference for tone.`,
    `4. Tone: warm, honest, professional tourism copy. Keep numbers, prices, units, brand names (e.g. Bled, Triglav, kremšnita) sensible — use established ${target === "it" ? "Italian" : "German"} tourism naming.`,
    `5. Keep the translation concise — roughly the same length as the source.`,
    `6. Escape newlines as \\n and quotes as \\" in JSON values.`,
  ].join("\n");

  const user = JSON.stringify({ translate_to: target, strings: payload });

  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      if (!zai) zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: system },
          { role: "user", content: user },
        ],
        thinking: { type: "disabled" },
      });
      const raw = completion.choices[0]?.message?.content ?? "";
      const parsed = parseJsonLoose(raw) as Record<string, unknown>;
      if (typeof parsed !== "object" || parsed === null) throw new Error("ni objekt");

      const out: Record<string, string> = {};
      let ok = true;
      for (const e of entries) {
        const v = parsed[e.key];
        if (typeof v !== "string" || v.trim().length === 0) {
          ok = false;
          break;
        }
        // placeholder validacija: presek SL/EN mora biti prisoten, nič zunaj unije
        const need = placeholders(e.sl).filter((p) => placeholders(e.en).includes(p));
        const union = new Set([...placeholders(e.sl), ...placeholders(e.en)]);
        const got = placeholders(v);
        const missing = need.filter((p) => !got.includes(p));
        const extra = got.filter((p) => !union.has(p));
        if (missing.length > 0 || extra.length > 0) {
          ok = false;
          break;
        }
        out[e.key] = v;
      }
      if (!ok) throw new Error("validacijaplaceholderjev/kljucev");
      return out;
    } catch (err) {
      const msg = String(err);
      // 429 rate limit → DOLG premor (10s → 180s), kratka ponovitev ne pomaga
      const isRate = msg.includes("429") || msg.toLowerCase().includes("too many");
      const waitMs = isRate
        ? Math.min(10000 * 2 ** (attempt - 1), 180000)
        : 800 * attempt;
      process.stderr.write(
        `  [poskus ${attempt}${isRate ? " — 429" : ""}] batch velikosti ${entries.length} odpovedal (${msg.slice(0, 90)}); čakam ${Math.round(waitMs / 1000)} s\n`
      );
      await sleep(waitMs);
    }
  }
  return null;
}

/** Prevajanje seznama vnosov z rekreativnim razpolavljanjem ob odpovedi. */
async function translateEntries(
  target: string,
  entries: { key: string; sl: string; en: string }[],
  report: { fallbacks: string[]; batches: number }
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const BATCH = 24;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const cacheKey = JSON.stringify(batch.map((b) => [b.key, b.sl, b.en]));
    const cPath = cachePath(target, cacheKey);
    let got: Record<string, string> | null = null;
    if (fs.existsSync(cPath)) {
      got = JSON.parse(fs.readFileSync(cPath, "utf8"));
    } else {
      got = await translateBatch(target, batch);
      if (!got && batch.length > 4) {
        // razpolovi in poskusi po delih
        const mid = Math.ceil(batch.length / 2);
        const a = await translateEntries(target, batch.slice(0, mid), {
          fallbacks: report.fallbacks,
          batches: 0,
        });
        const b = await translateEntries(target, batch.slice(mid), {
          fallbacks: report.fallbacks,
          batches: 0,
        });
        got = { ...a, ...b };
        const missingKeys = batch.filter((x) => !got || !(x.key in got)).map((x) => x.key);
        if (missingKeys.length > 0) got = null;
      }
      if (got) {
        fs.mkdirSync(path.dirname(cPath), { recursive: true });
        fs.writeFileSync(cPath, JSON.stringify(got));
      }
      // vljudnostni premor med LLM klici (zmanjša 429)
      await sleep(400);
    }
    if (got) {
      Object.assign(result, got);
    } else {
      // konec vrvi: fallback na EN + zapis v poročilo (ročni popavek potem)
      for (const e of batch) {
        result[e.key] = e.en;
        report.fallbacks.push(`${target}:${e.key}`);
      }
    }
    report.batches++;
    const done = Math.min(i + BATCH, entries.length);
    process.stderr.write(`[${target}] ${done}/${entries.length} nizov (batch ${report.batches})\n`);
  }
  return result;
}

// ── glavni program ────────────────────────────────────────────────────────

async function main() {
  const sl = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, "sl.json"), "utf8"));
  const en = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, "en.json"), "utf8"));
  const slFlat = flat(sl);
  const enFlat = flat(en);
  const keys = Object.keys(slFlat).sort();
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(enFlat).sort())) {
    throw new Error("PARITETA SL/EN JE PRETRGANA — prevedi najprej uskladi sl.json/en.json");
  }

  const report: Record<string, { fallbacks: string[]; batches: number; strings: number }> = {};

  for (const target of TARGETS) {
    process.stderr.write(`\n=== PREVOD messages/${target}.json (${keys.length} nizov) ===\n`);
    const entries = keys.map((k) => ({ key: k, sl: slFlat[k], en: enFlat[k] }));
    const rep = { fallbacks: [], batches: 0 };
    const translated = await translateEntries(target, entries, rep);
    const nested = rebuild(sl, translated);
    fs.writeFileSync(
      path.join(MESSAGES_DIR, `${target}.json`),
      JSON.stringify(nested, null, 2) + "\n",
      "utf8"
    );
    report[target] = { ...rep, strings: keys.length };
    process.stderr.write(`√ zapisan messages/${target}.json (${rep.fallbacks.length} fallbackov na EN)\n`);
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  const totalFallbacks = Object.values(report).reduce((a, r) => a + r.fallbacks.length, 0);
  process.stderr.write(`\nKONČANO. Fallbacki na EN (za ročni popavek): ${totalFallbacks} — ${REPORT_PATH}\n`);
}

main().catch((err) => {
  process.stderr.write(`USODNA NAPAKA: ${String(err)}\n`);
  process.exit(1);
});
