/**
 * MIGRACIJA CDN SLIK NA LOKALNO GOSTOVANJE (zadnji korak odstranitve odvisnosti
 * od sfile.chatglm.cn):
 *   - destinacije (slovenia-data.ts, slug)   → public/content/<slug>.jpg
 *   - dogodki     (events-data.ts, id)       → public/content/<id>.jpg
 *   - blogi       (blog-data.ts, slug)       → public/content/<slug>.jpg
 *   - hero        (hero.tsx, 1 slika)        → public/content/hero-main.jpg
 *
 * Prenese sliko (retry 3×), sharp optimizacija (max 1600px širine / hero 1920,
 * JPEG q74 mozjpeg progressive) in v izvorni datoteki zamenja URL z lokalno potjo.
 * Resume: URL-ji, ki v izvorni datoteki ne obstajajo več, se preskočijo;
 * če lokalna datoteka že obstaja, se le zamenja URL.
 *
 * Poročilo: /home/z/my-project/cdn-migration-report.json
 *
 * Uporaba: bun scripts/migrate-cdn-images.ts
 */
import sharp from "sharp";
import { promises as fs } from "fs";

const CDN_RE =
  /https:\/\/sfile\.chatglm\.cn\/images-ppt\/[a-z0-9]+\.(?:jpg|jpeg|png)/g;
const KEY_RE = /(?:slug|id):\s*"([^"]+)"/g;

interface Target {
  file: string;
  /**Naziv polja, ki določa ime lokalne datoteke (slug ali id). */
  key: "slug" | "id";
  maxW: number;
}

const TARGETS: Target[] = [
  { file: "src/lib/slovenia-data.ts", key: "slug", maxW: 1600 },
  { file: "src/lib/events-data.ts", key: "id", maxW: 1600 },
  { file: "src/lib/blog-data.ts", key: "slug", maxW: 1600 },
];
const HERO = {
  file: "src/components/sections/hero.tsx",
  name: "hero-main",
  maxW: 1920,
};
const HERO_URL = "https://sfile.chatglm.cn/images-ppt/6e61d0d8dc53.jpg";

interface Entry {
  url: string;
  name: string;
  file: string;
  status: "migrated" | "replaced-only" | "skipped" | "error" | "replaced";
  bytes?: number;
  width?: number;
  height?: number;
  error?: string;
}

const REPORT = "/home/z/my-project/cdn-migration-report.json";

async function download(url: string): Promise<Buffer> {
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "image/*",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = String(e);
      console.log(`  ! prenos poskus ${attempt}: ${lastErr.slice(0, 60)}`);
      await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
  throw new Error(`prenos ni uspel: ${lastErr}`);
}

async function optimize(
  buf: Buffer,
  maxW: number,
): Promise<{ out: Buffer; width: number; height: number }> {
  const img = sharp(buf, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const w = Math.min(meta.width ?? maxW, maxW);
  const out = await img
    .resize({ width: w, withoutEnlargement: true })
    .jpeg({ quality: 74, mozjpeg: true, progressive: true })
    .toBuffer();
  const m2 = await sharp(out).metadata();
  return { out, width: m2.width ?? w, height: m2.height ?? 0 };
}

/** Najdi zadnji (slug|id) pred pozicijo URL-ja → ime entitete. */
function keyBefore(text: string, pos: number): string | null {
  let best: { name: string; idx: number } | null = null;
  KEY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KEY_RE.exec(text)) !== null) {
    if (m.index >= pos) break;
    best = { name: m[1], idx: m.index };
  }
  return best?.name ?? null;
}

async function loadReport(): Promise<Map<string, Entry>> {
  try {
    const prev = JSON.parse(await fs.readFile(REPORT, "utf-8")) as Entry[];
    return new Map(prev.map((e) => [e.url, e]));
  } catch {
    return new Map();
  }
}

async function saveReport(map: Map<string, Entry>) {
  await fs.writeFile(
    REPORT,
    JSON.stringify([...map.values()], null, 2),
    "utf-8",
  );
}

async function migrateOne(
  file: string,
  text: string,
  url: string,
  name: string,
  maxW: number,
  report: Map<string, Entry>,
): Promise<{ text: string; entry: Entry }> {
  const local = `/content/${name}.jpg`;
  if (!text.includes(url)) {
    return { text, entry: { url, name, file, status: "skipped" } };
  }
  let entry: Entry = { url, name, file, status: "replaced" };
  const path = `public/content/${name}.jpg`;
  let exists = true;
  try {
    await fs.access(path);
  } catch {
    exists = false;
  }
  if (!exists) {
    try {
      const buf = await download(url);
      const { out, width, height } = await optimize(buf, maxW);
      await fs.writeFile(path, out);
      entry = {
        url,
        name,
        file,
        status: "migrated",
        bytes: out.length,
        width,
        height,
      };
    } catch (e) {
      entry = { url, name, file, status: "error", error: String(e).slice(0, 120) };
      return { text, entry };
    }
  } else {
    entry = { url, name, file, status: "replaced-only" };
  }
  text = text.split(url).join(local);
  return { text, entry };
}

async function main() {
  const report = await loadReport();
  const seen = new Map<string, string>(); // name → url (detekcija kolizij)
  let errors = 0;

  for (const t of TARGETS) {
    let text = await fs.readFile(t.file, "utf-8");
    const urls = [...text.matchAll(CDN_RE)].map((m) => m[0]);
    console.log(`${t.file}: ${urls.length} CDN URL-jev`);
    for (const url of urls) {
      const name = keyBefore(text, text.indexOf(url));
      if (!name) {
        console.log(`  ! ${url}: ni Slug/ID najden — PRESKOČENO`);
        errors++;
        continue;
      }
      if (seen.has(name) && seen.get(name) !== url) {
        console.log(`  ! kolizija imena "${name}" (${url} ≠ ${seen.get(name)})`);
        errors++;
        continue;
      }
      seen.set(name, url);
      const before = text.includes(url);
      const r = await migrateOne(t.file, text, url, name, t.maxW, report);
      text = r.text;
      report.set(url, r.entry);
      await saveReport(report);
      if (r.entry.status === "error") errors++;
      if (before) {
        await fs.writeFile(t.file, text, "utf-8");
        console.log(
          `  ${name} → ${r.entry.status} (${((r.entry.bytes ?? 0) / 1024).toFixed(0)} KB, ${r.entry.width}×${r.entry.height})`,
        );
      } else {
        console.log(`  ${name} → preskočeno (že zamenjano)`);
      }
      await new Promise((r2) => setTimeout(r2, 400));
    }
    await fs.writeFile(t.file, text, "utf-8");
  }

  // Hero — poseben primer (src= v TSX, fiksno ime)
  {
    let text = await fs.readFile(HERO.file, "utf-8");
    if (text.includes(HERO_URL)) {
      const r = await migrateOne(
        HERO.file,
        text,
        HERO_URL,
        HERO.name,
        HERO.maxW,
        report,
      );
      text = r.text;
      report.set(HERO_URL, r.entry);
      await saveReport(report);
      await fs.writeFile(HERO.file, text, "utf-8");
      if (r.entry.status === "error") errors++;
      console.log(
        `hero-main → ${r.entry.status} (${((r.entry.bytes ?? 0) / 1024).toFixed(0)} KB, ${r.entry.width}×${r.entry.height})`,
      );
    } else {
      console.log("hero-main → preskočeno (že zamenjano)");
    }
  }

  const all = [...report.values()];
  const ok = all.filter((e) => e.status !== "error").length;
  console.log(`\nSkupaj: ${ok}/${all.length} uspešno`);
  const bad = all.filter((e) => e.status === "error");
  for (const b of bad) console.log(`  ERROR ${b.name}: ${b.error}`);
  if (errors) process.exitCode = 2;
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
