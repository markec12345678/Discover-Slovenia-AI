/**
 * AUDIT VSEH VSEBINSKIH SLIK (destinacije + dogodki + blog + hero) — VLM presoja.
 * Za vsako sliko preveri, ali prikazuje PREDMET iz besedila (ne generično pokrajino).
 * Rezultat: /home/z/my-project/image-audit-report.json
 *
 * Uporaba: bun scripts/audit-content-images.ts
 */
import ZAI from "z-ai-web-dev-sdk";
import { promises as fs } from "fs";
import { DESTINATIONS } from "../src/lib/slovenia-data";
import { EVENTS } from "../src/lib/events-data";
import { BLOG_POSTS } from "../src/lib/blog-data";

interface AuditItem {
  kind: "destination" | "event" | "blog" | "hero";
  id: string;
  name: string;
  text: string;
  url: string;
}

const items: AuditItem[] = [];

for (const d of DESTINATIONS) {
  items.push({
    kind: "destination",
    id: d.id,
    name: d.name,
    text: `${d.tagline}. ${d.description}`,
    url: d.image,
  });
}

for (const e of EVENTS) {
  items.push({
    kind: "event",
    id: e.id,
    name: e.name,
    text: `${e.description} Lokacija: ${e.location}.`,
    url: e.image,
  });
}

for (const b of BLOG_POSTS) {
  items.push({
    kind: "blog",
    id: b.slug,
    name: b.title,
    text: `${b.excerpt} Kategorija: ${b.category}.`,
    url: b.image,
  });
}

// Hero — Bled ob sončnem zahodu
items.push({
  kind: "hero",
  id: "hero-bled",
  name: "Hero: Blejsko jezero",
  text: "Blejsko jezero z otokom, cerkvijo in gradom ob sončnem zahodu.",
  url: "https://sfile.chatglm.cn/images-ppt/6e61d0d8dc53.jpg",
});

const PROMPT = (it: AuditItem) => `You are auditing whether a website card image matches its accompanying text about a place in Slovenia (or a Slovenian event/topic).

TEXT (Slovenian):
Name: ${it.name}
${it.text}

Look at the image carefully and answer STRICTLY as JSON (no other text):
{"what_image_shows": "<one short sentence in English describing what the image actually depicts>", "match": <true|false>, "score": <integer 0-10 — how well the image illustrates THIS specific place/event/subject>, "reason": "<one short sentence in English>"}

Strict rules:
- The image must depict the SPECIFIC place/subject in the text (named landmarks, geography, town vs nature, river vs forest, castle vs landscape).
- A generic pretty landscape that could be anywhere does NOT match if the text names specific landmarks (town, church, castle, river confluence, island...).
- If the image shows a DIFFERENT subject than the text (e.g. text describes a river town but image shows a forest), match MUST be false and score <= 3.
- If the image clearly shows the right subject (recognizable landmark or unambiguous scene), match is true with score >= 8.
- Borderline (right general area but wrong specifics): score 4-7, match false.`;

interface Verdict {
  what_image_shows: string;
  match: boolean;
  score: number;
  reason: string;
}

async function auditOne(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  it: AuditItem,
): Promise<{ item: AuditItem; verdict?: Verdict; error?: string }> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await zai.chat.completions.createVision({
        // model je obvezen v CreateChatCompletionVisionBody tipu (GLM VLM)
        model: "glm-4.5v",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT(it) },
              { type: "image_url", image_url: { url: it.url } },
            ],
          },
        ],
        thinking: { type: "disabled" },
      });
      const raw = res.choices[0]?.message?.content ?? "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { item: it, error: `no JSON: ${raw.slice(0, 200)}` };
      const verdict = JSON.parse(jsonMatch[0]) as Verdict;
      return { item: it, verdict };
    } catch (e) {
      const msg = String(e);
      if ((msg.includes("429") || msg.includes("ECONNRESET")) && attempt < 5) {
        await new Promise((r) => setTimeout(r, 20000 + 10000 * attempt));
        continue;
      }
      return { item: it, error: msg.slice(0, 200) };
    }
  }
  return { item: it, error: "unreachable" };
}

async function main() {
  // RESUME: preberi obstoječi poročilo, preskoči uspešno auditarane
  const REPORT = "/home/z/my-project/image-audit-report.json";
  let prev: Record<string, unknown>[] = [];
  try {
    prev = JSON.parse(await fs.readFile(REPORT, "utf-8"));
  } catch {
    prev = [];
  }
  const byKey = new Map<string, Record<string, unknown>>();
  for (const p of prev) {
    if ((p as { match?: boolean }).match !== null)
      byKey.set(
        `${(p as { kind: string }).kind}/${(p as { id: string }).id}`,
        p,
      );
  }

  const todo = items.filter(
    (it) => !byKey.has(`${it.kind}/${it.id}`),
  );
  console.log(
    `Auditing ${todo.length}/${items.length} images (${byKey.size} already done)...`,
  );
  const zai = await ZAI.create();

  const save = async () => {
    await fs.writeFile(REPORT, JSON.stringify([...byKey.values()], null, 2), "utf-8");
  };

  // SEKVENCIČNO z pavzo + INKREMENTALNO SHRANJEVANJE (429 rate limit)
  for (let i = 0; i < todo.length; i++) {
    const r = await auditOne(zai, todo[i]);
    const v = r.verdict;
    byKey.set(`${r.item.kind}/${r.item.id}`, {
      kind: r.item.kind,
      id: r.item.id,
      name: r.item.name,
      url: r.item.url,
      error: r.error ?? null,
      shows: v?.what_image_shows ?? null,
      match: v?.match ?? null,
      score: v?.score ?? null,
      reason: v?.reason ?? null,
    });
    await save();
    console.log(
      `  ${i + 1}/${todo.length} ${r.item.kind}/${r.item.id} → ${v ? (v.match ? `OK ${v.score}` : `NE ${v.score}`) : "ERR"}${v ? ` (${v.what_image_shows.slice(0, 70)})` : ""}`,
    );
    await new Promise((res) => setTimeout(res, 4000));
  }

  // konzolna tabela
  const report = [...byKey.values()];
  console.log("\n=== UJEMANJA (match=true) ===");
  for (const r of report.filter((r) => r.match)) {
    console.log(`  [OK ${r.score}] ${r.kind}/${r.id} — ${r.name}`);
  }
  console.log("\n=== NEUJEMANJA / NAPAKE ===");
  for (const r of report.filter((r) => !r.match)) {
    console.log(
      `  [${r.score ?? "ERR"}] ${r.kind}/${r.id} — ${r.name}\n      slika: ${r.shows ?? r.error}\n      razlog: ${r.reason ?? ""}`,
    );
  }
  const mismatches = report.filter((r) => !r.match).length;
  console.log(
    `\nSKUPAJ: ${report.length} | neujemanj: ${mismatches} | ujemanj: ${report.length - mismatches}`,
  );
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
