import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { createHash } from "node:crypto";
import { rateLimit } from "@/lib/rate-limit";
import { checkAdmin } from "@/lib/auth-guards";

// POST /api/pois/describe — deterministični opis POI-ja (z enkratnim
// cache-iranjem)
//
// POI-ji iz OpenStreetMap imajo pogosto samo ime in koordinate — brez opisa.
// Ta endpoint SESTAVI kratek opis iz strukturiranih vhodnih polj (ime,
// kategorija, podkategorija, naslov) — 0 AI klicev (Issue #9 ZERO-AI,
// skupina A) — in ga cache-ira v data/poi-descriptions.json. Naslednji klic
// za isti POI prebere iz cache-a (0 stroškov).
//
// Cache je permanenten — POI imena se ne spreminjajo. Vsak NOVI zapis ima
// source "deterministic" (prejšnji bug: zapisi so se označili "ai" tudi
// kadar je odgovoril fallback — z odstranitvijo AI poti je bug odpravljen
// trajno). Starejši zapisi v cache datoteki lahko nosijo "ai"/"fallback" —
// admin statistika jih šteje pošteno.

interface DescribeRequest {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  lat?: number;
  lng?: number;
  address?: string;
}

interface CacheEntry {
  description: string;
  generatedAt: number;
  /** "deterministic" za vse nove zapise (#9); "ai"/"fallback" = starejši. */
  source: "deterministic" | "ai" | "fallback";
}

type CacheStore = Record<string, CacheEntry>;

const CACHE_FILE = path.join(process.cwd(), "data", "poi-descriptions.json");

async function readCache(): Promise<CacheStore> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCache(store: CacheStore): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (error) {
    console.error("[poi-describe] writeCache napaka:", error);
  }
}

// Kategorija → slovenska oznaka (ista preslikava kot prej; neznana →
// "zanimivost" — iskrena rezerva, brez izmišljanja podrobnosti)
const CATEGORY_LABELS: Record<string, string> = {
  attraction: "turistična atrakcija",
  museum: "muzej",
  restaurant: "restavracija",
  hotel: "hotel",
  viewpoint: "razgledna točka",
  natural: "naravni objekt",
  religious: "verski objekt",
  shop: "trgovina",
  other: "zanimivost",
};

/**
 * Deterministični graditelj opisa IZ strukturiranih polj (Issue #9 ZERO-AI):
 * `${name} — ${categoryLabel} (subcategory) · address` — brez izmišljenih
 * podrobnosti (cen, ur, zgodovine), ki jih vnosi ne nosijo.
 */
function buildPoiDescription(
  name: string,
  categoryLabel: string,
  subcategory?: string,
  address?: string
): string {
  return `${name} — ${categoryLabel}${subcategory ? ` (${subcategory})` : ""}${address ? ` · ${address}` : ""}`;
}

export async function POST(request: Request) {
    // Rate limit POI opisov (cache-first)
    const limited = rateLimit(request, { limit: 60, windowMs: 600000, key: "poi-describe" });
    if (limited) return limited;

  // AUDIT 42 (42-e F7): brez meje velikosti telesa bi request.json()
  // najprej prenesel/v pomnilniku naložil poljuben payload (OOM vektor na
  // self-hosted Render) — zavrnemo nad 32 KB, preden karkoli preberemo.
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 32_768) {
    return NextResponse.json({ error: "Preveliko telo zahteve" }, { status: 413 });
  }

  let body: DescribeRequest;
  try {
    body = (await request.json()) as DescribeRequest;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  if (!body?.id || !body?.name) {
    return NextResponse.json(
      { error: "Manjkajo id in name" },
      { status: 400 }
    );
  }

  // HARDENING (revizija 1.33.0, auditorski ugotovitvi 16-b/16-c P2):
  // 1. id je ključ PERMANENTNEGA cross-user diska — javni klic brez oblike
  //    pomeni, da lahko napadalec zastrupi cache za katerega koli POI ID-ja
  //    (spam opisi za vse obiskovalce) ali napihne data/poi-descriptions.json
  //    z megabajtnimi ključi. Zdaj: samo [A-Za-z0-9-], ≤ 64 znakov.
  // 2. name/subcategory/address gredo v zapis opisa — kapirano (dolžina
  //    shranjenega opisa; prej tudi token-bomb vektor za AI prompt).
  // 3. lat/lng (če sta poslana) se v deterministični opis NE uporabljata —
  //    klient ju pošilja iz historične oblike; strežnik ju brezobvezno
  //    sprejme in ignorira (0 TypeError površin: nikoli se ne kliče .toFixed).
  const poiId = String(body.id);
  if (!/^[A-Za-z0-9-]{1,64}$/.test(poiId)) {
    return NextResponse.json(
      { error: "Neveljaven POI id (pričakovani OSM identifikator)" },
      { status: 400 }
    );
  }
  const name = String(body.name).slice(0, 120);
  const subcategory =
    typeof body.subcategory === "string" ? body.subcategory.slice(0, 80) : undefined;
  const address =
    typeof body.address === "string" ? body.address.slice(0, 200) : undefined;

  // 19c-5 (revizija 1.36.0, P2): cache ključ vključuje hash IMENA. Cache je
  // permanenten in javno zapisljiv (first-write-wins) — z ID-jem samim bi
  // napadalec z ukrojjenim imenom zastrupil opis, ki ga nato berejo VSI
  // obiskovalci modala za ta POI. UI vedno pošlje kanonično OSM ime →
  // ključ id+hash(kanonično ime) ne more pasti na napadalčev vnos z drugim
  // imenom; enak vnos imena pa generira pravilen opis iz pravih podatkov.
  const cacheKey = `${poiId}:${createHash("sha256")
    .update(name)
    .digest("hex")
    .slice(0, 12)}`;

  // 1. Preveri cache (perf — deterministični opisi so idempotentni)
  const store = await readCache();
  const cached = store[cacheKey];
  if (cached) {
    return NextResponse.json({
      description: cached.description,
      source: "cache",
      cached: true,
    });
  }

  // 2. Zgradi deterministični opis iz strukturiranih polj (0 AI)
  const categoryLabel = CATEGORY_LABELS[body.category] || "zanimivost";
  const description = buildPoiDescription(name, categoryLabel, subcategory, address);

  // 3. Shrani v cache (permanentno) — vir POŠTENO "deterministic"
  store[cacheKey] = {
    description,
    generatedAt: Date.now(),
    source: "deterministic",
  };
  await writeCache(store);

  console.log(`[poi-describe] deterministični opis za "${name}" (source: deterministic)`);

  return NextResponse.json({
    description,
    source: "deterministic",
    cached: false,
  });
}

// GET — admin endpoint za statistiko cache-a
// P7-B (F4): prej javen + izdal absolutno pot datoteke cache-a (cacheFile)
// — zdaj timing-safe admin zaščita, brez poti.
export async function GET(request: Request) {
  if (!checkAdmin(request)) {
    return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
  }
  const store = await readCache();
  const entries = Object.values(store);
  return NextResponse.json({
    total: entries.length,
    // Legacy zapisi (pred #9) — novi zapisi so vedno "deterministic",
    // zato aiGenerated s časom naraste le še iz starejših zapisov.
    aiGenerated: entries.filter((e) => e.source === "ai").length,
    fallback: entries.filter((e) => e.source === "fallback").length,
    deterministic: entries.filter((e) => e.source === "deterministic").length,
  });
}
