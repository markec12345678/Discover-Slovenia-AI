/**
 * VERIFIKACIJA 31 TRŽNIH SLIK — VLM presoja (base64 lokalne datoteke).
 * Rezultat: /home/z/my-project/marketplace-verify-report.json (resume zmožen)
 *
 * Uporaba: bun scripts/verify-marketplace-images.ts
 */
import ZAI from "z-ai-web-dev-sdk";
import { promises as fs } from "fs";

const TEXTS: Record<string, string> = {
  "mp-gostilna":
    "Gostilna Pri Lipovcu, Ptuj — tradicionalna štajerska gostilna z domačimi jedmi (notranjost gostilne).",
  "mp-gostilna-jed":
    "Gostilna Pri Lipovcu — štajerske jedi: bujtl repa, jota, pražen krompir, domače sladice.",
  "mp-vodnik":
    "Planinski vodnik Triglav Milan — certificirani gorski vodnik za vzpone na Triglav.",
  "mp-koca":
    "Triglav v dveh dneh z vodnikom — klasični vzpon prek Kredarice z nočitvijo v planinskem domu.",
  "mp-penzion":
    "Penzion Bohinj Ezerca — družinski penzion ob Bohinjskem jezeru s pogledom na Komarno Ruto.",
  "mp-penzion-soba":
    "Penzion Bohinj Ezerca — soba s pogledom na Bohinjsko jezero.",
  "mp-wellness-kmetija":
    "Kmečki wellness Hudičevec — sauna, kopel v hladnem potoku in masaže na kmetiji pod Pohorjem.",
  "mp-savna":
    "Kmečki wellness Hudičevec — finska sauna.",
  "mp-rafting":
    "Soča Avanture Bovec — vodeni rafting na Soči z licenciranimi vodniki.",
  "mp-rafting-akcija":
    "Rafting na Soči — skupinska tura, 2-urni rafting po Soči.",
  "mp-kanjoning":
    "Kanjoning v soteski Sušec — spust po naravnih toboganih in skokih v kristalno čisto vodo soteske.",
  "mp-korita":
    "Kanjoning Sušec / Soča — korita Soče, naravni bazeni vrezani v apnenec.",
  "mp-soline":
    "Soline Piran — piranska sol, solni cvet iz Sečoveljskih solin / solinarska tura po solinah.",
  "mp-sol-izdelki":
    "Soline Piran trgovina — piranska sol in solni cvet v trgovini.",
  "mp-kavarna":
    "Kavarna Zvezda Ljubljana — kavarna s domačimi sladicami na starem mestnem jedru Ljubljane.",
  "mp-torta":
    "Kavarna Zvezda — domače sladice (kremšnita / torte) s kavo.",
  "mp-jama-vlak":
    "Postojnska jama partner — ogled jame z podzemnim vlakcem.",
  "mp-jama-kapniki":
    "Vodeni ogled Postojnske jame — kapniki v jami.",
  "mp-kajak":
    "Piran Sunset Kayak — kajak izleti ob sončnem zahodu ob piranski obali.",
  "mp-kajak-blizu":
    "Sončni zahod s kajakom — Piran, mirna večerna tura.",
  "mp-vinska-klet":
    "Vinski klet Ptuj — degustacije štajerskih vin v srednjeveški kleti pod mestnim jedrom.",
  "mp-degustacija":
    "Degustacija štajerskih vin — 7 vin lokalnih vinarjev z blagimi sirevi in štajersko pogačo.",
  "mp-kuharska":
    "Kuharska delavnica štajerskih jedi — priprava jote, bujtl repe in domače gibanice.",
  "mp-sir":
    "Kmečka delavnica — sir in skuta: molža, priprava sira, degustacija.",
  "mp-sir-miza":
    "Kmečka delavnica — sir in skuta z dobrotami.",
  "mp-solni-cvet":
    "Izdelek: Piranski solni cvet 250 g — ročno pobran solni cvet iz Sečoveljskih solin.",
  "mp-med":
    "Izdelek: Kranjski med cvetni 500 g — nefiltriran cvetni med kranjske sivke iz Bohinja.",
  "mp-bucno-olje":
    "Izdelek: Štajersko bučno olje 250 ml — hladno stiskano bučno olje iz štajerske buče.",
  "mp-refosk":
    "Izdelek: Refosk premium 0,75 l — sortni refošk iz istrskih vinogradov.",
  "mp-kapa":
    "Izdelek: Volnena pletenina — kapa Triglav, ročno pletena volnena kapa z motivom Triglava.",
  "mp-darilni":
    "Izdelek: Darilni paket Soča (3 izdelki) — nahrbtnik: lokalni sir, med in zeliščni čaj iz Soče doline.",
};

interface Verdict {
  id?: string;
  what_image_shows?: string;
  match?: boolean;
  score?: number;
  reason?: string;
}

async function main() {
  const REPORT = "/home/z/my-project/marketplace-verify-report.json";
  const zai = await ZAI.create();
  let prev: Verdict[] = [];
  try {
    prev = JSON.parse(await fs.readFile(REPORT, "utf-8"));
  } catch {
    prev = [];
  }
  const byId = new Map<string, Verdict>();
  for (const p of prev) if (p.id && p.match !== null && p.match !== undefined)
    byId.set(p.id, p);
  const ids = Object.keys(TEXTS).filter((id) => !byId.has(id));
  console.log(`Verificiram ${ids.length}/${Object.keys(TEXTS).length} slik...`);

  for (const id of ids) {
    const buf = await fs.readFile(`public/content/marketplace/${id}.jpg`);
    const b64 = `data:image/jpeg;base64,${buf.toString("base64")}`;
    let verdict: Verdict | null = null;
    for (let attempt = 1; attempt <= 4 && !verdict; attempt++) {
      try {
        const res = await zai.chat.completions.createVision({
          // model je obvezen v CreateChatCompletionVisionBody tipu (GLM VLM)
          model: "glm-4.5v",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `You are auditing whether a marketplace card image matches its accompanying text (Slovenian travel marketplace).

TEXT: ${TEXTS[id]}

Answer STRICTLY as JSON (no other text):
{"what_image_shows": "<one short sentence in English>", "match": <true|false>, "score": <integer 0-10>, "reason": "<one short sentence>"}

Rules: match=true (score >= 8) only if the image clearly depicts the specific subject/venue/activity/product of the text. Flag ANY garbled text/letters, distorted faces or obvious AI artifacts in reason (those must lower the score below 8).`,
                },
                { type: "image_url", image_url: { url: b64 } },
              ],
            },
          ],
          thinking: { type: "disabled" },
        });
        const raw = res.choices[0]?.message?.content ?? "";
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) verdict = JSON.parse(m[0]) as Verdict;
      } catch (e) {
        console.log(`  ! ${id} poskus ${attempt}: ${String(e).slice(0, 80)}`);
        await new Promise((r) => setTimeout(r, 25000));
      }
    }
    byId.set(id, { id, ...(verdict ?? {}) });
    await fs.writeFile(
      REPORT,
      JSON.stringify([...byId.values()], null, 2),
      "utf-8",
    );
    console.log(
      `  ${id} → ${verdict ? (verdict.match ? `OK ${verdict.score}` : `NE ${verdict.score}`) : "ERR"} | ${verdict?.what_image_shows?.slice(0, 70) ?? ""}`,
    );
    await new Promise((r) => setTimeout(r, 3000));
  }

  const all = [...byId.values()];
  const bad = all.filter((r) => !r.match);
  console.log(`\nRezultat: ${all.length - bad.length}/${all.length} OK`);
  if (bad.length) {
    console.log("NEUJEMANJA:");
    for (const b of bad)
      console.log(`  [${b.score}] ${b.id} — ${b.what_image_shows} | ${b.reason}`);
    process.exitCode = 2;
  }
}
main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
