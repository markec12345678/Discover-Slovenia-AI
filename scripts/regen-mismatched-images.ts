/**
 * REGENERACIJA 11 NEUJEMAJOCIH SLIK — natančni prompti iz besedila.
 * Generira → sharp resize/compress → public/content/<id>.jpg
 *
 * Uporaba: bun scripts/regen-mismatched-images.ts
 */
import ZAI from "z-ai-web-dev-sdk";
import { promises as fs } from "fs";
import path from "path";

interface Job {
  id: string;
  size: "1344x768" | "1024x1024";
  prompt: string;
}

const JOBS: Job[] = [
  // === DESTINACIJA (16:9) ===
  {
    id: "dravograd",
    size: "1344x768",
    prompt:
      "Aerial view of the small town of Dravograd in northern Slovenia at the confluence of three rivers: the wide green Drava river meeting the narrower Meža and Mislinja rivers, a small hydroelectric dam on the Drava, red-roofed houses and a church with two tall towers on a hill above the town, dense green forests of the Kozjak and Pohorje hills surrounding the valley, soft morning light, photorealistic travel photography, high quality, detailed, no text, no signage, no logos",
  },
  // === DOGODKI (1:1) ===
  {
    id: "koroska-smucanje",
    size: "1024x1024",
    prompt:
      "Family winter ski day at a small ski slope on the forested Ribnica na Pohorju hill in Slovenia, parents teaching children to ski on a gentle groomed slope, snow-covered spruce trees, a cozy wooden ski hut at the edge, sunny blue sky, joyful relaxed atmosphere, photorealistic winter sports photography, high quality, detailed, no text, no signage, no logos",
  },
  {
    id: "ljubljanski-zimski-festival",
    size: "1024x1024",
    prompt:
      "Interior of a grand concert hall during a classical music performance, close view of a string quartet — two violinists, violist and cellist in black evening attire — playing on a warmly lit wooden stage, rows of dark red seats softly blurred in the foreground, golden ambient stage lighting, winter evening atmosphere, photorealistic concert photography, high quality, detailed, absolutely no letters, no words, no writing, no captions, no banners, no posters, no signage, no logos",
  },
  {
    id: "dolenjska-cvicek",
    size: "1024x1024",
    prompt:
      "Autumn outdoor wine festival on the main square of Novo mesto in the Dolenjska region of Slovenia, wooden stalls with bottles of ruby red cviček wine and bunches of grapes, smiling people toasting with wine glasses, folk musicians playing accordion, colorful facades of old town houses, warm September afternoon light, photorealistic festival photography, high quality, detailed, no text, no signage, no logos",
  },
  {
    id: "bela-krajina-koline",
    size: "1024x1024",
    prompt:
      "Traditional Slovenian koline pig-slaughter feast in a rustic farmyard in Bela krajina, long wooden table laden with freshly made sausages and black pudding on rustic plates, steaming cooking pots, family members in aprons serving food, woven corn husk wreaths hanging on the wall, late autumn atmosphere with warm lantern light, photorealistic documentary food photography, high quality, detailed, no text, no signage, no logos",
  },
  {
    id: "koroska-music",
    size: "1024x1024",
    prompt:
      "Intimate chamber music concert of an early music ensemble playing period instruments: lute, viola da gamba and wooden recorder, three musicians in dark historic-inspired concert attire, elegant hall with dark wood paneling, portraits and brass chandeliers, warm candle-like lighting, photorealistic classical concert photography, high quality, detailed, no text, no signage, no logos",
  },
  {
    id: "bled-winter-swim",
    size: "1024x1024",
    prompt:
      "Winter swimming event on Lake Bled in Slovenia, brave swimmers in colorful swim caps and wetsuits walking into the icy green water from a wooden bathing platform at the lake shore, snow-covered shore and Bled island with the church in the background, misty winter morning, spectators in winter coats cheering, photorealistic sports event photography, high quality, detailed, no text, no signage, no logos",
  },
  {
    id: "trnfest-ljubljana",
    size: "1024x1024",
    prompt:
      "Summer evening street festival in the old Trnovo quarter of Ljubljana, open-air concert with a small band playing on a stage next to a church with a green wooden door, strings of warm lights above the narrow street, relaxed crowd with drinks sitting on wooden benches, old house facades, warm August twilight, photorealistic festival photography, high quality, detailed, no text, no signage, no logos",
  },
  {
    id: "okarina-festival-bled",
    size: "1024x1024",
    prompt:
      "World music festival at Lake Bled in Slovenia, musicians with guitar and african drums performing on a small lakeside stage at golden sunset, Bled island with the church and the castle on the cliff in the background, audience seated on grass by the calm lake water, festive summer evening, photorealistic concert photography, high quality, detailed, no text, no signage, no logos",
  },
  {
    id: "celjski-sejem",
    size: "1024x1024",
    prompt:
      "Traditional autumn county fair in the Slovenian town of Celje, outdoor fairground with wooden stalls offering local farm produce, honey, pottery and crafts, farmers presenting livestock, families with children walking between stalls, colorful canvas tents, autumn day, festive rural atmosphere, photorealistic documentary photography, high quality, detailed, no text, no signage, no logos",
  },
  {
    id: "jamski-sejem-postojna",
    size: "1024x1024",
    prompt:
      "December Christmas market in the town of Postojna in Slovenia, wooden stalls with handmade ceramics, karst prosciutto ham and local red wine, warm Christmas lights and a decorated Christmas tree, festive evening crowd in winter coats, karst stone buildings in the background, light snowfall, photorealistic Christmas market photography, high quality, detailed, no text, no signage, no logos",
  },
];

const OUT_DIR = "public/content";

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const zai = await ZAI.create();
  const done: string[] = [];
  const failed: string[] = [];

  for (const job of JOBS) {
    const out = path.join(OUT_DIR, `${job.id}.png`);
    try {
      await fs.access(out);
      console.log(`  = ${job.id} že obstaja, preskočim`);
      done.push(job.id);
      continue;
    } catch {
      /* generiraj */
    }

    let ok = false;
    for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
      try {
        const res = await zai.images.generations.create({
          prompt: job.prompt,
          size: job.size,
        });
        const b64 = res.data?.[0]?.base64;
        if (!b64) throw new Error("no base64 in response");
        await fs.writeFile(out, Buffer.from(b64, "base64"));
        const kb = Math.round(Buffer.from(b64, "base64").length / 1024);
        console.log(`  ✓ ${job.id} (${job.size}, ${kb} KB)`);
        ok = true;
        done.push(job.id);
      } catch (e) {
        const msg = String(e);
        console.log(
          `  ! ${job.id} poskus ${attempt} spodletel: ${msg.slice(0, 120)}`,
        );
        if (attempt < 4) {
          await new Promise((r) =>
            setTimeout(r, msg.includes("429") ? 30000 : 5000),
          );
        }
      }
    }
    if (!ok) failed.push(job.id);
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(
    `\nGeneriranih: ${done.length}/${JOBS.length}${failed.length ? ` | SPODLETELI: ${failed.join(", ")}` : ""}`,
  );
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
