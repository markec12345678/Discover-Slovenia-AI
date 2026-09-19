// ============================================================================
// TASK 51 (§15) — TESTNI PODPROCES: PRAVI OSRM pridobivalec nad lokalnim TLS
// strežnikom z načini odpovedi.
//
// ZAKAJ PODPROCES (forenzika, 20. 9. 2026):
//  - bun test poganja vse datoteke v ENEM procesu s SKUPNIM registrom
//    modulov (dokazano s sondo: dve testni datoteki, env spremenljivka se
//    vidi v obeh) → OSRM_BASE v road-routing-server.ts je ŽE zapečen na
//    mrtev naslov iz prve uvožene datoteke → po-uvozna preusmeritev NI
//    mogoča;
//  - NODE_EXTRA_CA_CERTS (zaupanje lokalnemu samopodpisanemu certifikatu)
//    se prebere OB ZAGONU procesa — nastavitev znotraj testne datoteke je
//    prepozna (sonda: "self signed certificate").
//  Zato ta skripta teče kot OTROK-proces (`bun run`) z lastnim okoljem
//  (NODE_EXTRA_CA_CERTS) in izpiše izid kot JSON na stdout.
//
// KAJ DOKAZUJE: PRAVA (ne-mockana) plast defaultOsrmJsonFetcher — vsak
// način odpovedi OSRM se konča kot null (ali veljaven JSON) na ISTI meji,
// nad katero fetchOsrmLeg/buildLegRouteIndex enovito padeta na POŠTENO
// hevristiko (vir: "heuristic" — NIKOLI "osrm").
//
// Načini lokalnega TLS strežnika:
//   /ok         → 200 + veljaven OSRM JSON (code "Ok", routes[0])
//   /500        → HTTP 500          → fetcher: null
//   /malformed  → 200 + "{{{ slab"  → fetcher: null (JSON.parse catch)
//   /notroute   → 200 + {"code":"NoRoute"} → fetcher: JSON (zavrne šele
//                 fetchOsrmLeg — plast NAD pridobivalcem)
//   /hang       → odgovor nikoli    → fetcher: null (timeout → destroy)
//   mrt vrata   → ECONNREFUSED      → fetcher: null (omrežna napaka)
// ============================================================================

import { defaultOsrmJsonFetcher } from "@/lib/road-routing-server";

const PORT = 4351;
const CERT = import.meta.dir + "/task51-osrm-test-cert.pem";
const KEY = import.meta.dir + "/task51-osrm-test-key.pem";

// Certifikat generiramo PRED zagonom strežnika (openssl): če datoteki
// manjkata ali sta starejši od 12 h, ju regeneriramo (cert velja 2 dni).
async function ensureCert(): Promise<boolean> {
  const certExists = await Bun.file(CERT).exists();
  const keyExists = await Bun.file(KEY).exists();
  if (certExists && keyExists) {
    try {
      const stat = await Bun.file(CERT).stat();
      if (Date.now() - stat.mtimeMs < 12 * 60 * 60 * 1000) return true;
    } catch {
      /* regeneriraj */
    }
  }
  const proc = Bun.spawn([
    "openssl", "req", "-x509", "-newkey", "rsa:2048",
    "-keyout", KEY, "-out", CERT, "-days", "2", "-nodes",
    "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
  ], { stdout: "ignore", stderr: "ignore" });
  return (await proc.exited) === 0;
}

const OSRM_OK = JSON.stringify({
  code: "Ok",
  routes: [
    {
      distance: 42000, // metri → 42 km
      duration: 2500, // sekunde → ~41,7 min
      geometry: { coordinates: [[14.0, 46.05], [14.1, 46.06]] },
    },
  ],
});

interface Outcome {
  mode: string;
  result: unknown;
}

const outcomes: Outcome[] = [];

// Majhen timeout za /hang (400 ms) — produkcijska funkcija sprejema
// timeoutMs kot parameter (v produkciji OSRM_TIMEOUT_MS = 2,5 s za vse
// noge); test ga skrajša, da ostane hiter in determinističen.
const TIMEOUT_MS = 400;

async function run(mode: string, url: string, timeoutMs = TIMEOUT_MS) {
  let result: unknown;
  try {
    result = await defaultOsrmJsonFetcher(url, timeoutMs);
  } catch (e) {
    result = { THREW: String((e as Error).message).slice(0, 80) };
  }
  outcomes.push({ mode, result });
}

const hasCert = await ensureCert();

if (!hasCert) {
  // openssl ni na voljo — pošteno javimo (nadrejeni test skipne)
  console.log(JSON.stringify({ cert: "missing-openssl", outcomes: [] }));
} else {
  const base = `https://127.0.0.1:${PORT}`;
  const server = Bun.serve({
    port: PORT,
    tls: { cert: Bun.file(CERT), key: Bun.file(KEY) },
    fetch(req) {
      const p = new URL(req.url).pathname;
      switch (p) {
        case "/ok":
          return new Response(OSRM_OK, { status: 200 });
        case "/500":
          return new Response("internal error", { status: 500 });
        case "/malformed":
          return new Response("{{{ to ni veljaven JSON", { status: 200 });
        case "/notroute":
          return new Response(JSON.stringify({ code: "NoRoute", routes: [] }), {
            status: 200,
          });
        default:
          // /hang — nikoli ne odgovori (timeout pot)
          return new Promise(() => {});
      }
    },
  });

  const t0 = Date.now();
  await run("ok-json", `${base}/ok`);
  await run("http-500", `${base}/500`);
  await run("malformed-body", `${base}/malformed`);
  await run("json-notroute", `${base}/notroute`);
  await run("timeout-hang", `${base}/hang`);
  await run("network-dead-port", `https://127.0.0.1:9/route/v1/driving/`);
  const totalMs = Date.now() - t0;

  console.log(JSON.stringify({ cert: "ok", totalMs, outcomes }));
  server.stop(true);
}

process.exit(0);
