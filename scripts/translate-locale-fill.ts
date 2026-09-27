/**
 * W1-faza-2b (Issue #15): DOPOLNILNI prevod vrzeli v messages/it.json + de.json.
 *
 * Razlika proti translate-locale.ts (ki bi povozil ročne prevode faze 1):
 * - obstoječe vrednosti, ki se RAZLIKUJEJO od EN, se OHRANIJO (ročni
 *   prevodi 33 ns iz 1.126.0 + LLM prevodi iz predpomnilnika);
 * - prevajajo se SAMO ključi, kjer target == EN && SL != EN (placeholder
 *   vrzeli: planner 404, quiz 84, adriaGuidePage 31, vodiciPage 20, …);
 * - ključi, kjer je SL == EN (blagovne znamke/številke), se preskočijo;
 * - predpomnilnik: .translate-cache/<target>-fill/<hash>.json (ločeno od
 *   prvotne skripte) → vznovljivo med več 10-minutnimi klici.
 *
 * Uporaba: bun scripts/translate-locale-fill.ts [it,de]
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(import.meta.dir, "..");
const MESSAGES_DIR = path.join(ROOT, "src", "i18n", "messages");
const CACHE_DIR = path.join(ROOT, ".translate-cache");
const REPORT_PATH = "/tmp/translate-fill-report.json";

const TARGETS = (process.argv[2] ?? "it,de").split(",").map((s) => s.trim());

const LANG_NAMES: Record<string, string> = {
  it: "Italian",
  de: "German (Standard German, Hochdeutsch)",
};

type Flat = Record<string, string>;

function flat(obj: unknown, prefix = ""): Flat {
  const out: Flat = {};
  if (typeof obj !== "object" || obj === null) return out;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(out, flat(value, p));
    } else {
      out[p] = String(value);
    }
  }
  return out;
}

function placeholders(s: string): string[] {
  return [...(s.match(/\{[a-zA-Z0-9_]+\}/g) ?? [])].sort();
}

function parseJsonLoose(raw: string): unknown {
  let t = raw.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("neveljaven JSON");
  }
}

function cachePath(target: string, key: string) {
  const h = crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
  return path.join(CACHE_DIR, `${target}-fill`, `${h}.json`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

let zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function translateBatch(
  target: string,
  entries: { key: string; sl: string; en: string }[]
): Promise<Record<string, string> | null> {
  const langName = LANG_NAMES[target];
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

  const user = JSON.stringify({
    translate_to: target,
    strings: entries.map((e) => ({ key: e.key, sl: e.sl, en: e.en })),
  });

  for (let attempt = 1; attempt <= 4; attempt++) {
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
      if (!ok) throw new Error("validacija placeholderjev/ključev");
      return out;
    } catch (err) {
      const msg = String(err);
      const isRate = msg.includes("429") || msg.toLowerCase().includes("too many");
      const waitMs = isRate ? Math.min(15000 * 2 ** (attempt - 1), 120000) : 800 * attempt;
      process.stderr.write(
        `  [poskus ${attempt}${isRate ? " — 429" : ""}] batch ${entries.length} nizov odpovedal (${msg.slice(0, 90)}); čakam ${Math.round(waitMs / 1000)} s\n`
      );
      await sleep(waitMs);
      if (isRate && attempt === 4) return null; // ne vztrajaj — naslednji klic nadaljuje iz predpomnilnika
    }
  }
  return null;
}

async function translateEntries(
  target: string,
  entries: { key: string; sl: string; en: string }[],
  report: { fallbacks: string[]; batches: number; cached: number }
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
      report.cached++;
    } else {
      got = await translateBatch(target, batch);
      if (got) {
        fs.mkdirSync(path.dirname(cPath), { recursive: true });
        fs.writeFileSync(cPath, JSON.stringify(got));
      }
      await sleep(400);
    }
    if (got) {
      Object.assign(result, got);
    } else {
      for (const e of batch) {
        result[e.key] = e.en; // fallback: ohrani EN placeholder (naslednji zagon poskusi znova)
        report.fallbacks.push(`${target}:${e.key}`);
      }
    }
    report.batches++;
    const done = Math.min(i + BATCH, entries.length);
    process.stderr.write(`[${target}] ${done}/${entries.length} nizov (batch ${report.batches}, iz predpomnilnika ${report.cached})\n`);
  }
  return result;
}

async function main() {
  const sl = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, "sl.json"), "utf8"));
  const en = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, "en.json"), "utf8"));
  const slFlat = flat(sl);
  const enFlat = flat(en);
  const keys = Object.keys(slFlat).sort();

  const report: Record<string, { fallbacks: string[]; batches: number; cached: number; gaps: number; kept: number }> = {};

  for (const target of TARGETS) {
    const targetPath = path.join(MESSAGES_DIR, `${target}.json`);
    const existing = JSON.parse(fs.readFileSync(targetPath, "utf8"));
    const exFlat = flat(existing);

    // pariteta ključev SL/EN (ista varovalka kot osnovna skripta)
    if (JSON.stringify(keys) !== JSON.stringify(Object.keys(enFlat).sort())) {
      throw new Error("PARITETA SL/EN JE PRETRGANA");
    }
    if (JSON.stringify(keys) !== JSON.stringify(Object.keys(exFlat).sort())) {
      throw new Error(`PARITETA ${target} JE PRETRGANA — obstoječa datoteka nima istih ključev`);
    }

    const gapKeys = keys.filter((k) => exFlat[k] === enFlat[k] && slFlat[k] !== enFlat[k]);
    const kept = keys.length - gapKeys.length;
    process.stderr.write(`\n=== ${target}: ${gapKeys.length} vrzeli za dopolnitev (${kept} obstoječih se ohrani) ===\n`);

    const rep = { fallbacks: [], batches: 0, cached: 0, gaps: gapKeys.length, kept };
    const entries = gapKeys.map((k) => ({ key: k, sl: slFlat[k], en: enFlat[k] }));
    const translated = entries.length > 0 ? await translateEntries(target, entries, rep) : {};

    // spoji: obstoječe vrednosti + dopolnjene vrzeli
    const mergedFlat: Flat = { ...exFlat };
    for (const [k, v] of Object.entries(translated)) {
      if (gapKeys.includes(k)) mergedFlat[k] = v;
    }

    // povozi ploščo drevo nazaj v gnezdeno obliko (obstojeca struktura)
    const nested = JSON.parse(JSON.stringify(existing));
    const apply = (node: Record<string, unknown>, prefix: string) => {
      for (const [key, value] of Object.entries(node)) {
        const p = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          apply(value as Record<string, unknown>, p);
        } else if (!Array.isArray(value)) {
          // VAROVALKA W1-faza-2b: polja (array) NE nadomeščamo — flat() jih
          // je spremenil v nize in bi pokvarilo tip (hrošč: smartSearch.examples)
          const flatKey = Object.keys(mergedFlat).find((mk) => mk === p);
          if (flatKey !== undefined && typeof mergedFlat[p] === "string") node[key] = mergedFlat[p];
        }
      }
    };
    apply(nested as Record<string, unknown>, "");

    fs.writeFileSync(targetPath, JSON.stringify(nested, null, 2) + "\n", "utf8");
    report[target] = { ...rep, gaps: gapKeys.length, kept };
    process.stderr.write(`√ zapisan messages/${target}.json (${rep.fallbacks.length} fallbackov na EN — ponovni zgon poskusi znova)\n`);
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  const totalFallbacks = Object.values(report).reduce((a, r) => a + r.fallbacks.length, 0);
  process.stderr.write(`\nKONČANO. Fallbacki: ${totalFallbacks} — ${REPORT_PATH}\n`);
}

main().catch((err) => {
  process.stderr.write(`USODNA NAPAKA: ${String(err)}\n`);
  process.exit(1);
});
