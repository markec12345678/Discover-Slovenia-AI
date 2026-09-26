// ISSUE #9 Z9-E — merjenje determinističnih poti (dev strežnik, toplo)
// 0 AI ključev v okolju (GEMINI_API_KEY ni nastavljen — vizija izklopljena).
import { generateDeterministicInsights } from "@/lib/deterministic-insights";
import { buildDeterministicWhy, scoreProduct, rankProductCandidates } from "@/lib/ai-recommendations";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BASE = "http://localhost:3000";
const results: Array<[string, string, number]> = [];

async function timed(label: string, path: string, init?: RequestInit, expectCheck?: (d: unknown) => string) {
  // 1x ogrevanje (dev kompilacija rute) + 3 meritve
  for (let i = 0; i < 4; i++) {
    const t0 = performance.now();
    const res = await fetch(`${BASE}${path}`, init);
    await res.text();
    const ms = performance.now() - t0;
    if (i === 0) continue; // ogrevanje — ne šteje
    results.push([label, `${res.status}`, Math.round(ms * 10) / 10]);
  }
  if (expectCheck) {
    const res = await fetch(`${BASE}${path}`, init);
    const d = await res.json().catch(() => ({}));
    results.push([`${label} (vir)`, expectCheck(d), 0]);
  }
}

const JSONH = { "Content-Type": "application/json" };

// ── 1. Planner (deterministični) ────────────────────────────────────────────
const plannerBody = JSON.stringify({
  budget: 800, days: 3, interests: ["narava", "hrana", "kultura"],
  season: "summer", groupSize: 2, language: "sl",
});
let plannerData: any = null;
await timed("planner POST /api/itinerary", "/api/itinerary", { method: "POST", headers: JSONH, body: plannerBody });
{
  const res = await fetch(`${BASE}/api/itinerary`, { method: "POST", headers: JSONH, body: plannerBody });
  plannerData = await res.json();
}

// ── 2. Refine (deterministični ukazni parser) ───────────────────────────────
const itinerary = plannerData?.itinerary ?? plannerData;
if (itinerary) {
  const refineBody = JSON.stringify({
    itinerary,
    formData: { budget: 800, days: 3, interests: ["narava"], season: "summer", groupSize: 2, language: "sl" },
    instruction: "dodaj Bled na prvi dan",
  });
  await timed("refine POST /api/itinerary/refine", "/api/itinerary/refine", { method: "POST", headers: JSONH, body: refineBody });
} else {
  results.push(["refine", "preskočeno (ni načrta)", 0]);
}

// ── 3. Klepet (domenska plast, 0 LLM) ──────────────────────────────────────
await timed(
  "chat POST /api/chat", "/api/chat",
  { method: "POST", headers: JSONH, body: JSON.stringify({ messages: [{ role: "user", content: "Kaj naj vidim na Bledu?" }], language: "sl" }) },
  (d) => String((d as any)?.source ?? "?")
);

// ── 4. Pametno iskanje (deterministični iskalnik) ──────────────────────────
await timed(
  "search POST /api/smart-search", "/api/smart-search",
  { method: "POST", headers: JSONH, body: JSON.stringify({ query: "bled hoja in vino" }) },
  (d) => String((d as any)?.source ?? "?")
);

// ── 5. POI opis (deterministični graditelj + cache) ────────────────────────
const POI_FILE = "data/poi-descriptions.json";
const poiBackup = existsSync(POI_FILE) ? readFileSync(POI_FILE) : null;
await timed(
  "poi POST /api/pois/describe (nov)", "/api/pois/describe",
  { method: "POST", headers: JSONH, body: JSON.stringify({ id: "perf-probe-z9e", name: "Perf točka", category: "attraction", subcategory: "viewpoint" }) },
  (d) => String((d as any)?.source ?? "?")
);
await timed(
  "poi POST /api/pois/describe (cache)", "/api/pois/describe",
  { method: "POST", headers: JSONH, body: JSON.stringify({ id: "perf-probe-z9e", name: "Perf točka", category: "attraction", subcategory: "viewpoint" }) },
  (d) => String((d as any)?.source ?? "?")
);
// povrni repo datoteko (meritve NE smejo pustiti sledi)
if (poiBackup) writeFileSync(POI_FILE, poiBackup);

// ── 6. Rezervacije — BESEDILO (deterministični parser) ─────────────────────
await timed(
  "parse POST /api/journey/bookings/parse", "/api/journey/bookings/parse",
  { method: "POST", headers: JSONH, body: JSON.stringify({ text: "POTRDITEV REZERVACIJE\nHotel Park, Bled\nPrihod: 24. 09. 2026\nOdhod: 26. 09. 2026\n2 gostota\nPotrditvena številka: BK-2026-4471\nSkupna cena: 340 EUR" }) },
  (d) => String((d as any)?.via ?? (d as any)?.method ?? "?")
);

// ── 7. SEO FAQ (deterministični graditelj — SSR destinacije) ───────────────
await timed("faq GET /destinacija/bled (SSR)", "/destinacije/bled");
await timed("home GET / (baza)", "/");

// ── 8. Vpogledi + priporočila — LIB meritve (čisti izračun, bun) ───────────
{
  const input = {
    totalListings: 38, totalOwners: 25, premiumOwners: 8, enterpriseOwners: 2,
    freeOwners: 15, mrr: 1240, churnRate: 3.2, totalViews: 15400, totalClicks: 1830,
    totalAiRecs: 210, leads7d: 6, leads30d: 21,
    topCategories: [{ category: "gostilna", count: 9 }, { category: "sobe", count: 7 }],
    topRegions: [{ region: "gorenjska", count: 11 }, { region: "obalno-kraška", count: 6 }],
    type: "admin",
  } as never;
  // ogrevanje JIT
  for (let i = 0; i < 50; i++) generateDeterministicInsights(input, "admin");
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) generateDeterministicInsights(input, "admin");
  const per = (performance.now() - t0) / 1000;
  results.push(["vpogledi (lib, 1000×)", "deterministic", Math.round(per * 1000) / 1000]);
}
{
  const product = { id: "p1", name: "Kolesarska tura po Bohinju", category: "kolesarjenje", price: 45, organic: true, rating: 4.8, destinationName: "Bohinj" } as never;
  const product2 = { id: "p2", name: "Degustacija vin v Goriški brdi", category: "vino", price: 30, organic: false, rating: 4.9, destinationName: "Goriška brda" } as never;
  scoreProduct(product, { interests: ["vino", "narava"], budget: 500 } as never);
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    scoreProduct(product, { interests: ["vino", "narava"], budget: 500 } as never);
    rankProductCandidates(product, [product, product2]);
    buildDeterministicWhy(product, "product", "sl");
  }
  const per = (performance.now() - t0) / 1000;
  results.push(["priporočila (lib, 1000×)", "deterministic", Math.round(per * 1000) / 1000]);
}

// ── Izpis ──────────────────────────────────────────────────────────────────
console.log("\n=== Z9-E MERITVE (dev, topli klici, 3× na pot) ===");
for (const [label, note, ms] of results) {
  console.log(`${label.padEnd(44)} ${String(note).padEnd(14)} ${ms} ms`);
}
