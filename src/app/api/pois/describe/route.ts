import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { generateCompletion } from "@/lib/ai-client";

// POST /api/pois/describe — generira AI opis za POI (z enkratnim cache-iranjem)
//
// POI-ji iz OpenStreetMap imajo pogosto samo ime in koordinate — brez opisa.
// Ta endpoint generira kratek (1-stavni) AI opis za podan POI in ga cache-ira
// v data/poi-descriptions.json. Naslednji klic za isti POI prebere iz cache-a
// (0 AI stroškov).
//
// Cache je permanenten — POI imena se ne spreminjajo.

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
  source: "ai" | "fallback";
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

// Kategorija → slovenski opis za kontekst
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

export async function POST(request: Request) {
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

  // 1. Preveri cache
  const store = await readCache();
  const cached = store[body.id];
  if (cached) {
    return NextResponse.json({
      description: cached.description,
      source: "cache",
      cached: true,
    });
  }

  // 2. Generiraj AI opis
  const categoryLabel = CATEGORY_LABELS[body.category] || "zanimivost";
  const locationStr = body.address ? ` (${body.address})` : "";
  const coordsStr = body.lat && body.lng ? ` koordinate ${body.lat.toFixed(4)}, ${body.lng.toFixed(4)}` : "";

  const prompt = `Generiraj kratek (1 stavek, max 120 znakov) informativen opis za slovensko turistično točko.

IME: ${body.name}
KATEGORIJA: ${categoryLabel}${body.subcategory ? ` (${body.subcategory})` : ""}
LOKACIJA: ${locationStr || "Slovenija"}${coordsStr}

Pravila:
- 1 stavek, max 120 znakov
- V slovenščini
- Informativen in privlačen
- Brez cen ali ur (te se spreminjajo)
- Samo opis, brez "Ta POI je..." prefixa

Primeri:
- "Srednjeveški grad na pečini z razgledom na Blejsko jezero."
- "Tradicionalna slovenska restavracija z lokalnimi specialitetami."
- "Biser slovenskega alpskega sveta s kristalno čisto vodo."

Odgovor (SAMO opis, brez prefixa):`;

  try {
    const result = await generateCompletion(
      [
        {
          role: "system",
          content: "Si pomočnik za generiranje kratkih opisov slovenskih turističnih točk. Odgovoriš SAMO z opisom, brez dodatnega besedila.",
        },
        { role: "user", content: prompt },
      ],
      { temperature: 0.6 }
    );

    let description = result?.content?.trim() || "";
    // Čiščenje: odstrani narekovaje če jih je AI dodal
    description = description.replace(/^["'"]|["'"]$/g, "");
    // Omeji na 150 znakov (varnost)
    if (description.length > 150) {
      description = description.substring(0, 147) + "...";
    }

    if (!description) {
      // Fallback opis
      description = `${body.name} — ${categoryLabel} v Sloveniji.`;
    }

    const source = result?.source === "fallback" ? "fallback" : "ai";

    // 3. Shrani v cache (permanentno)
    store[body.id] = {
      description,
      generatedAt: Date.now(),
      source,
    };
    await writeCache(store);

    console.log(`[poi-describe] AI opis za "${body.name}" (source: ${result?.source})`);

    return NextResponse.json({
      description,
      source: result?.source || "fallback",
      cached: false,
    });
  } catch (error) {
    console.error("[poi-describe] AI napaka:", error);

    // Fallback opis
    const fallbackDesc = `${body.name} — ${categoryLabel} v Sloveniji.`;
    store[body.id] = {
      description: fallbackDesc,
      generatedAt: Date.now(),
      source: "fallback",
    };
    await writeCache(store);

    return NextResponse.json({
      description: fallbackDesc,
      source: "fallback",
      cached: false,
    });
  }
}

// GET — admin endpoint za statistiko cache-a
export async function GET() {
  const store = await readCache();
  const entries = Object.values(store);
  return NextResponse.json({
    total: entries.length,
    aiGenerated: entries.filter((e) => e.source === "ai").length,
    fallback: entries.filter((e) => e.source === "fallback").length,
    cacheFile: CACHE_FILE,
  });
}
