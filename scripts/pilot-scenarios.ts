#!/usr/bin/env bun
/**
 * PILOT VALIDATION GATE — Test 2: 10 realnih AI scenarijev (fiksni, ponovljivi)
 *
 * Vsak scenarij pošlje POST /api/itinerary (in kjer relevant /refine + /save)
 * na PRODUKCIJO in shrani odgovor v scripts/pilot-results/scenario-<n>.json.
 *
 * Omejitve, ki jih skripta spoštuje:
 *   - /api/itinerary rate limit = 10 klicev / 10 min → skripta naredi TOČNO 10 POSTov
 *   - refine = 2 klica (limit 20/10 min), save = 1 klic (limit 30/h)
 *
 * Uporaba: bun run scripts/pilot-scenarios.ts
 */

const BASE = "https://i-feel-slovenia.onrender.com";
const OUT = "scripts/pilot-results";
const TIMEOUT = 90_000;

interface PlannerInput {
  budget: number;
  days: number;
  interests: string[];
  season: "spring" | "summer" | "autumn" | "winter";
  groupSize: number;
  startDate?: string;
  language?: "sl" | "en";
  partyType?: "couple" | "family" | "friends" | "solo";
}

// ---------------------------------------------------------------------------
// Izberi datuma iz REALNE napovedi (Open-Meteo, Bled koordinate) — suh + deževen
// dan v naslednjih 7 dneh, da sta scenarija 1 in 2 ponovljiva in poštena.
// ---------------------------------------------------------------------------
interface ForecastDay {
  date: string;
  precipProb: number;
  code: number;
  tempMax: number;
}

async function fetchForecast(): Promise<ForecastDay[]> {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=46.36&longitude=14.11" +
    "&daily=precipitation_probability_max,weather_code,temperature_2m_max" +
    "&timezone=Europe%2FLjubljana&forecast_days=8";
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const j = (await res.json()) as {
    daily: {
      time: string[];
      precipitation_probability_max: number[];
      weather_code: number[];
      temperature_2m_max: number[];
    };
  };
  return j.daily.time.map((date, i) => ({
    date,
    precipProb: j.daily.precipitation_probability_max[i],
    code: j.daily.weather_code[i],
    tempMax: Math.round(j.daily.temperature_2m_max[i]),
  }));
}

async function postJson(path: string, body: unknown): Promise<{ status: number; json: unknown; timeMs: number }> {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, timeMs: Date.now() - started };
}

// ---------------------------------------------------------------------------
// Scenariji
// ---------------------------------------------------------------------------

const forecast = await fetchForecast();
console.log("Napoved (Bled):", forecast.map((f) => `${f.date} ${f.precipProb}%/${f.tempMax}°C`).join(" | "));

const dryDay = forecast.slice(1, 6).find((f) => f.precipProb < 30) ?? forecast[1];
const rainyDay = [...forecast.slice(1, 6)].sort((a, b) => b.precipProb - a.precipProb)[0];
console.log(`SUH dan (scenarij 1): ${dryDay.date} (${dryDay.precipProb} %)`);
console.log(`DEŽEVEN dan (scenarij 2): ${rainyDay.date} (${rainyDay.precipProb} %)`);

interface Scenario {
  id: number;
  name: string;
  input: PlannerInput;
}

const scenarios: Scenario[] = [
  {
    id: 1,
    name: "Par, 2 dni, Ljubljana in Bled, brez dežja",
    input: {
      budget: 400, days: 2, interests: ["romantika", "kultura", "hrana", "mesto"],
      season: "autumn", groupSize: 2, partyType: "couple",
      startDate: dryDay.date, language: "sl",
    },
  },
  {
    id: 2,
    name: "Družina z otroki, 3 dni, deževna napoved",
    input: {
      budget: 600, days: 3, interests: ["družina", "narava", "aktivnosti"],
      season: "autumn", groupSize: 4, partyType: "family",
      startDate: rainyDay.date, language: "sl",
    },
  },
  {
    id: 3,
    name: "Solo popotnik, 1 dan, brez avtomobila",
    input: {
      budget: 100, days: 1, interests: ["mesto", "kultura", "hrana"],
      season: "autumn", groupSize: 1, partyType: "solo", language: "sl",
    },
  },
  {
    id: 4,
    name: "Prijatelji, 3 dni, narava in aktivnosti",
    input: {
      budget: 800, days: 3, interests: ["narava", "aktivnosti", "adrenalin", "avantura"],
      season: "summer", groupSize: 4, partyType: "friends",
      startDate: forecast[2]?.date ?? dryDay.date, language: "sl",
    },
  },
  {
    id: 5,
    name: "Starejši par, počasen tempo, malo hoje",
    input: {
      budget: 500, days: 2, interests: ["mir", "sprostitev", "kultura", "hrana"],
      season: "autumn", groupSize: 2, partyType: "couple", language: "sl",
    },
  },
  {
    id: 6,
    name: "Julijski vikend, želja po manj obremenjenih krajih",
    input: {
      budget: 500, days: 3, interests: ["mir", "narava"],
      season: "summer", groupSize: 2, partyType: "couple",
      startDate: "2027-07-17", language: "sl", // sobota → dan 2 = nedelja (Postojnska crowd)
    },
  },
  {
    id: 7,
    name: "Uporabnik brez določenega datuma",
    input: {
      budget: 300, days: 2, interests: ["romantika", "narava"],
      season: "summer", groupSize: 2, partyType: "couple", language: "sl",
    },
  },
  {
    id: 8,
    name: "Uporabnik spremeni datum po prvem itinererju (refine)",
    input: {
      budget: 350, days: 2, interests: ["narava", "fotografija"],
      season: "autumn", groupSize: 2, partyType: "couple", language: "sl",
    },
  },
  {
    id: 10,
    name: "Uporabnik odpre destinacijo prek SEO/GEO strani (Bled) in začne načrt",
    input: {
      budget: 450, days: 2, interests: ["romantika", "fotografija", "narava"],
      season: "autumn", groupSize: 2, partyType: "couple",
      startDate: dryDay.date, language: "sl",
    },
  },
];

interface ScenarioResult {
  id: number;
  name: string;
  input: PlannerInput;
  status: number;
  timeMs: number;
  json: unknown;
  refine?: { status: number; instruction: string; timeMs: number; json: unknown };
  save?: { status: number; shareId?: string; timeMs: number; json: unknown };
}

const results: ScenarioResult[] = [];

// --- S1..S8, S10 (9 POST klicev; S9 je refine na rezultatu S4) ---
for (const s of scenarios) {
  console.log(`\n--- Scenarij ${s.id}: ${s.name} ---`);
  const r = await postJson("/api/itinerary", s.input);
  console.log(`POST /api/itinerary → ${r.status} (${r.timeMs} ms)`);
  const entry: ScenarioResult = { ...s, status: r.status, timeMs: r.timeMs, json: r.json };
  results.push(entry);
  await Bun.write(`${OUT}/scenario-${s.id}.json`, JSON.stringify(entry, null, 2));

  // Scenarij 8: refine — sprememba datuma
  if (s.id === 8 && r.status === 200 && r.json) {
    const refineBody = {
      itinerary: r.json,
      formData: s.input,
      instruction: `Zamenjaj datum odhoda na ${forecast[3]?.date ?? dryDay.date} in prilagodi načrt novim dnevom.`,
    };
    const rr = await postJson("/api/itinerary/refine", refineBody);
    console.log(`REFINE (sprememba datuma) → ${rr.status} (${rr.timeMs} ms)`);
    entry.refine = { status: rr.status, instruction: refineBody.instruction, timeMs: rr.timeMs, json: rr.json };
    await Bun.write(`${OUT}/scenario-8.json`, JSON.stringify(entry, null, 2));
  }

  // Scenarij 10: save (anonimno) + EN različica (10. in zadnji POST)
  if (s.id === 10 && r.status === 200 && r.json) {
    const saveBody = { itinerary: r.json, name: "Pilot validacija — Bled iz SEO" };
    const rs = await postJson("/api/itinerary/save", saveBody);
    console.log(`SAVE → ${rs.status} (${rs.timeMs} ms)`);
    entry.save = {
      status: rs.status,
      shareId: (rs.json as { shareId?: string })?.shareId,
      timeMs: rs.timeMs,
      json: rs.json,
    };
    const enInput: PlannerInput = { ...s.input, language: "en", interests: ["romance", "photography", "nature"] };
    const re = await postJson("/api/itinerary", enInput);
    console.log(`EN POST → ${re.status} (${re.timeMs} ms)`);
    await Bun.write(`${OUT}/scenario-10-en.json`, JSON.stringify({ input: enInput, status: re.status, timeMs: re.timeMs, json: re.json }, null, 2));
  }
}

// --- S9: manj vožnje — refine na rezultatu scenarija 4 ---
const s4 = results.find((x) => x.id === 4);
if (s4 && s4.status === 200) {
  console.log(`\n--- Scenarij 9: Uporabnik zahteva manj vožnje (refine na S4) ---`);
  const refineBody = {
    itinerary: s4.json,
    formData: s4.input,
    instruction: "Preveč je vožnje — prestavi lokacije tako, da so bližje skupaj, manj kilometrov na dan.",
  };
  const rr = await postJson("/api/itinerary/refine", refineBody);
  console.log(`REFINE (manj vožnje) → ${rr.status} (${rr.timeMs} ms)`);
  const entry: ScenarioResult = {
    id: 9,
    name: "Uporabnik zahteva manj vožnje (refine)",
    input: s4.input,
    status: s4.status,
    timeMs: s4.timeMs,
    json: s4.json,
    refine: { status: rr.status, instruction: refineBody.instruction, timeMs: rr.timeMs, json: rr.json },
  };
  results.push(entry);
  await Bun.write(`${OUT}/scenario-9.json`, JSON.stringify(entry, null, 2));
}

// --- Povzetek ---
console.log("\n========== POVZETEK ==========");
for (const r of results.sort((a, b) => a.id - b.id)) {
  const j = r.json as Record<string, unknown> | null;
  const days = (j?.days as unknown[] | undefined)?.length ?? 0;
  const source = (j?.source as string) ?? "?";
  const weather = ((j?.days as { weather?: { condition: string; temp: number } }[] | undefined) ?? [])
    .map((d) => `${d.weather?.condition}/${d.weather?.temp}°`)
    .join(", ");
  const ids = ((j?.days as { locations?: { destination_id: string }[] }[] | undefined) ?? [])
    .flatMap((d) => (d.locations ?? []).map((l) => l.destination_id))
    .join(" → ");
  console.log(`S${r.id} [${source}] ${r.status} ${days} dni | ${weather} | ${ids}`);
  if (r.refine) {
    const rj = r.refine.json as Record<string, unknown> | null;
    console.log(`   refine: ${r.refine.status} source=${rj?.source ?? "?"} warning=${(rj?.warning as string)?.slice(0, 60) ?? "—"}`);
  }
  if (r.save) console.log(`   save: ${r.save.status} shareId=${r.save.shareId ?? "—"} url=/pot/${r.save.shareId ?? "?"}`);
}

await Bun.write(`${OUT}/scenarios-summary.json`, JSON.stringify({
  forecast,
  dryDay: dryDay.date,
  rainyDay: rainyDay.date,
  results: results.map((r) => ({ id: r.id, name: r.name, status: r.status, timeMs: r.timeMs })),
}, null, 2));
console.log("\nZapisano v scripts/pilot-results/scenario-*.json");
