/**
 * VERIFIKACIJA NOVIH SLIK — VLM presoja ujemanja (base64 lokalne datoteke).
 * Rezultat: /home/z/my-project/image-verify-report.json
 */
import ZAI from "z-ai-web-dev-sdk";
import { promises as fs } from "fs";

const TEXTS: Record<string, string> = {
  dravograd:
    "Dravograd je majhno mestece na severu Slovenije kjer se stikajo tri reke — Drava, Meža in Mislinja. Obkrožen z gozdovi Kozjaka in Pohorja. Hidroelektrarna na Dravi in pohodniške poti ob reki.",
  "koroska-smucanje":
    "Tradicionalni smučarski dogodek na Ribniškem Pohorju z glasbenim programom in lokalnimi specialitetami. Družinski dan na snegu. Lokacija: Smučišče Ribnica na Pohorju.",
  "ljubljanski-zimski-festival":
    "Vrhunski mednarodni glasbeni festival klasične in komorne glasbe v Cankarjevem domu, operi in ljubljanskih cerkvah. Tradicija od 1952.",
  "dolenjska-cvicek":
    "Praznik tradicionalnega dolenjskega vina cviček. Vinske degustacije, kulinarične stojnice in glasba ob Krki. Lokacija: Glavni trg, Novo mesto.",
  "bela-krajina-koline":
    "Tradicionalne koline v Beli krajini z opankanjem (pletje koruznih venčkov) in lokalno glasbo. Avtentična belokranjska kultura. Lokacija: Stari trg, Črnomelj.",
  "koroska-music":
    "Komorni glasbeni festival v Slovenj Gradcu z nastopi slovenskih in mednarodnih glasbenikov v zgodovinskih ambientih. Lokacija: Dvorana slovenskih glasbenikov.",
  "bled-winter-swim":
    "Tradicionalni zimski plavalni memorial na Blejskem jezeru. Najbolj drzni plavalci skočijo v ledeno vodo jezera. Družinski dogodek z vročo čokolado in kremšnito ob obali.",
  "trnfest-ljubljana":
    "Tradicionalni avgustovski festival v ljubljanski četrti Trnovo. Koncerti jazz, blues in world glasbe na prostem, ulično gledališče, ustvarjalne delavnice in večerni vrvež ob Trnavskem mostu.",
  "okarina-festival-bled":
    "Mednarodni etno-glasbeni festival na Bledu z glasbeniki iz vsega sveta. Koncerti na blejskem otoku, v gradu in ob jezeru.",
  "celjski-sejem":
    "Tradicionalni celjski sejem z razstavo obrti, kmetijstva, domačih izdelkov in vozil. Spremljevalni program z glasbo, degustacijami in animacijami za otroke na sejmišču.",
  "jamski-sejem-postojna":
    "Tradicionalni decembrski sejem v Postojni z ročnimi izdelki kraške regije, pršutom, teranom, keramiko in božično razsvetljavo. Glasbeni program vsak večer.",
};

interface Verdict {
  id?: string;
  what_image_shows?: string;
  match?: boolean;
  score?: number;
  reason?: string;
}

async function main() {
  const zai = await ZAI.create();
  const report: Verdict[] = [];
  const ids = Object.keys(TEXTS);
  for (const id of ids) {
    const buf = await fs.readFile(`public/content/${id}.jpg`);
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
                  text: `You are auditing whether a website card image matches its accompanying text about a place/event in Slovenia.

TEXT (Slovenian):
${TEXTS[id]}

Answer STRICTLY as JSON (no other text):
{"what_image_shows": "<one short sentence in English>", "match": <true|false>, "score": <integer 0-10>, "reason": "<one short sentence>"} 

Rules: match=true (score >= 8) only if the image clearly depicts the specific subject of the text (right place type, right activity, right atmosphere, season consistent). Also flag any obvious visual defect (distorted faces, garbled text, artifacts) in "reason".`,
                },
                { type: "image_url", image_url: { url: b64 } },
              ],
            },
          ],
          thinking: { type: "disabled" },
        });
        const raw = res.choices[0]?.message?.content ?? "";
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) verdict = JSON.parse(m[0]);
      } catch (e) {
        console.log(`  ! ${id} poskus ${attempt}: ${String(e).slice(0, 80)}`);
        await new Promise((r) => setTimeout(r, 25000));
      }
    }
    console.log(
      `  ${id} → ${verdict ? (verdict.match ? `OK ${verdict.score}` : `NE ${verdict.score}`) : "ERR"} | ${verdict?.what_image_shows?.slice(0, 80) ?? ""}`,
    );
    report.push({ id, ...verdict });
    await new Promise((r) => setTimeout(r, 3000));
  }
  await fs.writeFile(
    "/home/z/my-project/image-verify-report.json",
    JSON.stringify(report, null, 2),
    "utf-8",
  );
  const bad = report.filter((r) => !r.match);
  console.log(`\nRezultat: ${report.length - bad.length}/${report.length} OK`);
  if (bad.length) process.exitCode = 2;
}
main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
