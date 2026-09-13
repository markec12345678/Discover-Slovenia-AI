/**
 * REGENERACIJA 31 TRŽNIH SLIK (listings/experiences/products) — natančni
 * prompti iz opisov entitet v scripts/seed-demo.ts.
 * Generira PNG → sharp JPEG q74 → public/content/marketplace/<ime>.jpg
 *
 * Uporaba: bun scripts/regen-marketplace-images.ts
 */
import ZAI from "z-ai-web-dev-sdk";
import { promises as fs } from "fs";
import path from "path";

interface Job {
  id: string;
  size: "1344x768" | "1024x1024";
  prompt: string;
}

const NOTEXT =
  "no text, no signage, no logos, no labels with writing, no captions";

const JOBS: Job[] = [
  // ── 16:9 (listings + experiences) ──────────────────────────────────────
  {
    id: "mp-gostilna",
    size: "1344x768",
    prompt: `Interior of a traditional Slovenian gostilna inn in Ptuj, rustic wooden tables and benches, red checkered tablecloths, vintage framed photos on cream-colored walls, warm pendant lights, dark wooden beams, cozy rural restaurant atmosphere, photorealistic interior photography, high quality, detailed, no people, ${NOTEXT}`,
  },
  {
    id: "mp-gostilna-jed",
    size: "1344x768",
    prompt: `Traditional Slovenian Styrian food on a rustic ceramic plate: stewed turnip dish with millet, bowl of sour bean soup jota, slice of homemade layered gibanica cake, wooden table with checkered cloth, warm natural light, photorealistic food photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-vodnik",
    size: "1344x768",
    prompt: `Certified mountain guide in red helmet and harness leading two roped hikers across a rocky limestone ridge of Mount Triglav in Slovenia, steel cables via ferrata, scree slopes, Julian Alps panorama with three-headed summit, clear summer morning, photorealistic mountaineering photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-koca",
    size: "1344x768",
    prompt: `Slovenian alpine mountain hut on a ridge below the summit of Triglav at dusk, sturdy stone and wooden hut with small chapel and weather station mast, warm lights glowing in windows, purple evening sky with first stars, dramatic Julian Alps ridgeline, photorealistic mountain photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-penzion",
    size: "1344x768",
    prompt: `Family-run alpine guesthouse with flower balconies near the shore of Lake Bohinj in Slovenia, green meadow with wooden fence in foreground, calm turquoise lake and forested Julian Alps mountains behind, sunny summer morning, photorealistic architecture photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-penzion-soba",
    size: "1344x768",
    prompt: `Cozy alpine guesthouse bedroom with wooden furniture and a large window overlooking Lake Bohinj and mountains, soft morning light entering, beds with white linen and wool blankets, photorealistic interior photography, high quality, detailed, no people, ${NOTEXT}`,
  },
  {
    id: "mp-wellness-kmetija",
    size: "1344x768",
    prompt: `Outdoor wooden hot tub with rising steam at a rustic Slovenian farmstead on rolling green hills, wooden terrace with lounge chairs, old farmhouse with red roof and orchard in background, golden hour light, photorealistic wellness photography, high quality, detailed, no people, ${NOTEXT}`,
  },
  {
    id: "mp-savna",
    size: "1344x768",
    prompt: `Rustic Finnish sauna interior in a Slovenian farmhouse wellness, tiered wooden benches, hot stones on the sauna heater with gentle steam, bucket with water and birch branches, warm dim light, photorealistic interior photography, high quality, detailed, no people, ${NOTEXT}`,
  },
  {
    id: "mp-rafting",
    size: "1344x768",
    prompt: `Raft with six paddlers in helmets and wetsuits splashing through emerald green rapids of the Soča river in Slovenia, steep forested limestone gorge, bright summer day, water spray in action, photorealistic adventure sports photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-rafting-akcija",
    size: "1344x768",
    prompt: `Close view of paddlers in a raft plunging through a white water wave on the emerald Soča river in Slovenia, water splashing high, focused faces under helmets, sunny day, photorealistic sports photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-kanjoning",
    size: "1344x768",
    prompt: `Canyoneer in wetsuit and helmet mid-air jumping from a rock into a crystal clear emerald pool inside a narrow limestone gorge in Slovenia, waterfall cascading in background, photorealistic adventure photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-korita",
    size: "1344x768",
    prompt: `Emerald pools of the Soča river in a narrow white limestone gorge in Slovenia, sculpted natural rock channels, small waterfall dropping between polished stones, sunlight filtering into the canyon, photorealistic nature photography, high quality, detailed, no people, ${NOTEXT}`,
  },
  {
    id: "mp-soline",
    size: "1344x768",
    prompt: `Aerial view of the Sečovlje salt pans near Piran in Slovenia, geometric network of shallow evaporation pools in pastel shades of pink, white and turquoise, small white pyramids of harvested salt, Adriatic coast in distance, photorealistic aerial photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-sol-izdelki",
    size: "1344x768",
    prompt: `Pyramid of coarse sea salt on a rustic wooden table in a small salt shop, wooden scoop, small glass jars of white salt crystals, burlap sacks, warm natural window light, photorealistic product photography, high quality, detailed, no people, ${NOTEXT}`,
  },
  {
    id: "mp-kavarna",
    size: "1344x768",
    prompt: `Sunny cafe terrace in the old town of Ljubljana, pastel colored baroque facades, small marble tables with coffee cups and dessert plates, potted red geraniums, relaxed afternoon atmosphere on a car-free street, photorealistic street photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-torta",
    size: "1344x768",
    prompt: `Slice of Slovenian cream cake on a small plate next to a cup of coffee, crispy golden puff pastry layers with thick vanilla custard cream dusted with powdered sugar, marble cafe table, warm cafe light, photorealistic food photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-jama-vlak",
    size: "1344x768",
    prompt: `Open cave train with lit carriages driving through an illuminated dripstone tunnel of a famous show cave in Slovenia, white stalactites and stalagmites in warm light, photorealistic cave photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-jama-kapniki",
    size: "1344x768",
    prompt: `Grand hall of a famous show cave in Slovenia, towering white stalactites and stalagmites dramatically lit in purple and amber, boardwalk path through the chamber, mysterious underground atmosphere, photorealistic cave photography, high quality, detailed, no people, ${NOTEXT}`,
  },
  {
    id: "mp-kajak",
    size: "1344x768",
    prompt: `Two kayakers paddling on the calm Adriatic sea at golden sunset near the coast of Piran in Slovenia, silhouette of the old town with the hilltop church of St George in the background, warm orange sky reflecting on gentle water, photorealistic outdoor photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-kajak-blizu",
    size: "1344x768",
    prompt: `Close view of a kayaker's hands holding the paddle with sparkling water drops at golden hour on the calm Adriatic sea near Piran, warm sunset light, gentle ripples, distant coast silhouette, photorealistic outdoor photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-vinska-klet",
    size: "1344x768",
    prompt: `Medieval vaulted wine cellar beneath an old European town, rows of large oak wine barrels along an arched brick ceiling with warm hanging lamps, stone floor, two glasses of white wine on a barrel top, photorealistic interior photography, high quality, detailed, no people, ${NOTEXT}`,
  },
  {
    id: "mp-degustacija",
    size: "1344x768",
    prompt: `Wine tasting table with five glasses of white and amber wine in a row, plate of soft cheeses and flatbread, vineyard visible through an open window in soft natural daylight, photorealistic food and wine photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-kuharska",
    size: "1344x768",
    prompt: `Cooking workshop in a rustic Slovenian kitchen, hands kneading golden pastry dough on a floured wooden table, bowls with cottage cheese, walnuts and apple filling, rolling pin, warm kitchen light, photorealistic cooking photography, high quality, detailed, no faces, ${NOTEXT}`,
  },
  {
    id: "mp-sir",
    size: "1344x768",
    prompt: `Farmhouse cheese making workshop, hands in gloves pressing fresh white curd into round cheese molds, large copper milk pot, wooden shelves with aging cheese wheels in a rustic dairy interior, photorealistic documentary photography, high quality, detailed, no faces, ${NOTEXT}`,
  },
  {
    id: "mp-sir-miza",
    size: "1344x768",
    prompt: `Rustic wooden table with an artisan cheese board: rounds of farm cheese, bowl of white curd cheese with honey drizzle, wooden cheese knife, linen cloth, farmhouse kitchen in soft background, natural window light, photorealistic food photography, high quality, detailed, ${NOTEXT}`,
  },
  // ── 1:1 (izdelki) ──────────────────────────────────────────────────────
  {
    id: "mp-solni-cvet",
    size: "1024x1024",
    prompt: `Product shot of a small glass jar with wooden lid filled with delicate white fleur de sel salt crystals, a few crystals scattered on a light wooden surface, soft studio light, clean minimal background, photorealistic product photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-med",
    size: "1024x1024",
    prompt: `Product shot of a glass jar of golden raw flower honey with a piece of honeycomb on top, wooden honey dipper beside it, light rustic wooden surface, soft studio light, photorealistic product photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-bucno-olje",
    size: "1024x1024",
    prompt: `Product shot of a dark glass bottle of deep green-black pumpkin seed oil with a cork, small pile of dark green pumpkin seeds and a halved orange pumpkin beside it, light wooden surface, soft studio light, photorealistic product photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-refosk",
    size: "1024x1024",
    prompt: `Product shot of a dark green unlabeled wine bottle of red wine next to two glasses of deep ruby red wine, dark moody background with soft rim light, wooden surface, photorealistic product photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-kapa",
    size: "1024x1024",
    prompt: `Product shot of a hand-knitted wool beanie cap in natural grey and white with traditional snowflake and mountain pattern, folded on a light wooden surface, cozy wool texture detail, soft studio light, photorealistic product photography, high quality, detailed, ${NOTEXT}`,
  },
  {
    id: "mp-darilni",
    size: "1024x1024",
    prompt: `Product shot of an open kraft gift box with local delicacies: wedge of farm cheese, small jar of honey, package of herbal tea and a tiny wooden souvenir, arranged on a rustic wooden surface, soft warm light, photorealistic product photography, high quality, detailed, ${NOTEXT}`,
  },
];

const OUT_DIR = "public/content/marketplace";

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
          `  ! ${job.id} poskus ${attempt} spodletel: ${msg.slice(0, 100)}`,
        );
        if (attempt < 4) {
          await new Promise((r) =>
            setTimeout(r, msg.includes("429") ? 30000 : 5000),
          );
        }
      }
    }
    if (!ok) failed.push(job.id);
    await new Promise((r) => setTimeout(r, 1500));
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
