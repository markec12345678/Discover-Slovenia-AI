/**
 * W1 (Issue #15 V0): AI-podprt prevod destinacijskih overlayjev v IT + DE.
 *
 * Ustvari src/lib/slovenia-data-it.ts in src/lib/slovenia-data-de.ts —
 * isti vzorec kot slovenia-data-en.ts (Partial overlay po poljih:
 * tagline/description/highlights/activities/duration; id/slug/coords/cene
 * ostanejo izvirni). Dolžine highlights/activities se ujemajo z originalom.
 *
 * Uporaba: bun scripts/translate-destinations.ts [it,de]
 * Predpomnilnik: .translate-cache/dest-<target>/<id>.json
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const CACHE_DIR = path.join(ROOT, ".translate-cache");
const TARGETS = (process.argv[2] ?? "it,de").split(",").map((s) => s.trim());

const LANG_NAMES: Record<string, string> = {
  it: "Italian",
  de: "German (Standard German, Hochdeutsch)",
  // W12 (smer 2, faza 1): francoski in španski overlayji destinacij.
  fr: "French (Standard French, français standard)",
  es: "Spanish (Castilian Spanish, español de España)",
};

/** Primeri uveljavljenih turističnih poimenovanj po ciljnem jeziku. */
const NAMING_EXAMPLES: Record<string, { lang: string; places: string; days: string }> = {
  it: { lang: "Italian", places: "Lago di Bled, Grotte di Postumia", days: "1-2 giorni" },
  de: { lang: "German", places: "Bleder See, Postojna-Höhle", days: "1–2 Tage" },
  fr: { lang: "French", places: "Lac de Bled, Grottes de Postojna", days: "1-2 jours" },
  es: { lang: "Spanish", places: "Lago de Bled, Cuevas de Postojna", days: "1-2 días" },
};

interface OverlayEntry {
  tagline: string;
  description: string;
  highlights: string[];
  activities: string[];
  duration: string;
}

// bun natively uvozi TS module
const { DESTINATIONS } = await import(path.join(ROOT, "src/lib/slovenia-data.ts"));
const { DESTINATIONS_EN } = await import(path.join(ROOT, "src/lib/slovenia-data-en.ts"));

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseJsonLoose(raw: string): unknown {
  let t = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("neveljaven JSON");
  }
}

let zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function translateDestination(
  target: string,
  id: string,
  sl: { tagline: string; description: string; highlights: string[]; activities: string[]; duration: string },
  en: OverlayEntry
): Promise<OverlayEntry | null> {
  const langName = LANG_NAMES[target];
  const system = [
    `You are a professional tourism translator for a Slovenian travel platform (Discover Slovenia AI).`,
    `Translate the destination card INTO ${langName}.`,
    `RULES:`,
    `1. Return ONLY valid JSON: {"tagline": "…", "description": "…", "highlights": ["…", …], "activities": ["…", …], "duration": "…"} — no markdown, no commentary.`,
    `2. Slovenian (sl) is the source of truth; English (en) is context/reference.`,
    `3. highlights and activities MUST have exactly ${sl.highlights.length} and ${sl.activities.length} items respectively (same as source).`,
    `4. Use established ${NAMING_EXAMPLES[target]?.lang ?? "local"} tourism naming (e.g. ${NAMING_EXAMPLES[target]?.places ?? "recognisable place names"}). Keep place names recognisable.`,
    `5. duration: keep the same day-range, translate the unit (e.g. "${NAMING_EXAMPLES[target]?.days ?? "1-2 days"}").`,
    `6. Tone: warm, honest, professional tourism copy; similar length as source.`,
  ].join("\n");

  const user = JSON.stringify({ destination_id: id, sl, en });

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
      // W12 popravek (portoroz): model včasih izpiše ključe s presledkom
      // pred dvopičjem ({"tagline ": …}) — JSON je veljaven, a bi validacija
      // padla na v.tagline === undefined. Normaliziramo ključe (strip
      // okolnih presledkov) pred validacijo — prihodnje varno za vse.
      const v: Partial<OverlayEntry> = Object.fromEntries(
        Object.entries(parsed).map(([k, val]) => [k.trim(), val])
      ) as Partial<OverlayEntry>;
      if (
        typeof v.tagline !== "string" || v.tagline.trim().length < 5 ||
        typeof v.description !== "string" || v.description.trim().length < 40 ||
        !Array.isArray(v.highlights) || v.highlights.length !== sl.highlights.length ||
        !Array.isArray(v.activities) || v.activities.length !== sl.activities.length ||
        typeof v.duration !== "string" || v.duration.trim().length === 0 ||
        ![v.tagline, v.description, v.duration, ...v.highlights, ...v.activities].every((s) => typeof s === "string" && s.trim().length > 0)
      ) {
        throw new Error("validacija oblike");
      }
      return v as OverlayEntry;
    } catch (err) {
      const msg = String(err);
      const isRate = msg.includes("429") || msg.toLowerCase().includes("too many");
      const waitMs = isRate ? Math.min(10000 * 2 ** (attempt - 1), 180000) : 800 * attempt;
      process.stderr.write(`  [${id} poskus ${attempt}${isRate ? " — 429" : ""}] ${msg.slice(0, 80)}; čakam ${Math.round(waitMs / 1000)} s\n`);
      await sleep(waitMs);
    }
  }
  return null;
}

const TEMPLATE = (locale: string, headerNote: string, entries: string) => `/**
 * ${headerNote}
 *
 * W1 (Issue #15 V0, 1.126.0): ${locale.toUpperCase()} prekrivna plast za slovenia-data.ts.
 * Slovenki original ostaja vir resnice — ta datoteka ponuja ${locale === "it" ? "italijanske" : "nemške"} prevode
 * tekstovnih polj (isti vzorec kot slovenia-data-en.ts). Struktura: Partial po
 * poljih; identifikatorji (id/slug/region/type/bestFor/bestSeason keys,
 * coords, slike, cene) so skupni in se NE prevajajo.
 *
 * KLJUČI = \`id\` polja iz slovenia-data.ts (38 destinacij — pokritost 38/38
 * po ID). Dolžine highlights/activities se ujemajo z originalom.
 * Prevod: strojni (LLM, iz SL izvirnika z EN referenco) + označen v UI
 * (mtNotice — provenance kanon platforme) do človeške revizije.
 */
import type { DestinationEn } from "./slovenia-data-en";

export type { DestinationEn } from "./slovenia-data-en";

export const DESTINATIONS_${locale.toUpperCase()}: Record<string, DestinationEn> = {
${entries}
};

/** ${locale.toUpperCase()} overlay za destinacijo po id (fallback null → SL izvirnik). */
export function get${locale.charAt(0).toUpperCase()}${locale.slice(1)}Destination(id: string): DestinationEn | null {
  return DESTINATIONS_${locale.toUpperCase()}[id] ?? null;
}
`;

function emitLocale(locale: string, data: Record<string, OverlayEntry>) {
  const headerNote =
    locale === "it"
      ? "IT prekrivna plast za slovenia-data.ts (W1 faza 1)."
      : locale === "de"
        ? "DE prekrivna plast za slovenia-data.ts (W1 faza 1)."
        : `${locale.toUpperCase()} prekrivna plast za slovenia-data.ts (W12 faza 1 — smer 2).`;
  const entries = Object.entries(data)
    .map(([id, v]) => {
      const hl = v.highlights.map((h) => JSON.stringify(h)).join(", ");
      const ac = v.activities.map((a) => JSON.stringify(a)).join(", ");
      // W12 popravek: id-ji s pomišljajem (nova-gorica …) NISO veljavni
      // necitirani JS ključi (sintaksna napaka "Expected a semicolon").
      // Citiramo točno tiste, ki niso čisti identifikatorji (isti vzorec
      // kot ročno popravljena IT/DE datoteka iz W1).
      const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(id) ? id : JSON.stringify(id);
      return `  ${key}: {\n    tagline: ${JSON.stringify(v.tagline)},\n    description: ${JSON.stringify(v.description)},\n    highlights: [${hl}],\n    activities: [${ac}],\n    duration: ${JSON.stringify(v.duration)},\n  },`;
    })
    .join("\n");
  const out = TEMPLATE(locale, headerNote, entries);
  fs.writeFileSync(path.join(ROOT, "src/lib", `slovenia-data-${locale}.ts`), out, "utf8");
}

async function main() {
  for (const target of TARGETS) {
    process.stderr.write(`\n=== PREVOD destinacijskih overlayjev → ${target} (${DESTINATIONS.length} destinacij) ===\n`);
    const data: Record<string, OverlayEntry> = {};
    const failures: string[] = [];
    for (const d of DESTINATIONS) {
      const en = DESTINATIONS_EN[d.id];
      if (!en) {
        process.stderr.write(`  [${d.id}] MANJKA EN OVERLAY — preskočeno (ostane SL)\n`);
        failures.push(d.id);
        continue;
      }
      const cPath = path.join(CACHE_DIR, `dest-${target}`, `${d.id}.json`);
      let v: OverlayEntry | null = null;
      if (fs.existsSync(cPath)) {
        v = JSON.parse(fs.readFileSync(cPath, "utf8"));
      } else {
        v = await translateDestination(target, d.id, {
          tagline: d.tagline,
          description: d.description,
          highlights: d.highlights,
          activities: d.activities,
          duration: d.duration,
        }, en);
        if (v) {
          fs.mkdirSync(path.dirname(cPath), { recursive: true });
          fs.writeFileSync(cPath, JSON.stringify(v));
        }
        await sleep(400);
      }
      if (v) data[d.id] = v;
      else failures.push(d.id);
      process.stderr.write(`  [${target}] ${Object.keys(data).length}/${DESTINATIONS.length} (${d.id})\n`);
    }
    if (Object.keys(data).length > 0) emitLocale(target, data);
    process.stderr.write(`√ slovenia-data-${target}.ts: ${Object.keys(data).length} destinacij${failures.length > 0 ? `, PRESKOČENE: ${failures.join(", ")}` : ""}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`USODNA NAPAKA: ${String(err)}\n`);
  process.exit(1);
});
