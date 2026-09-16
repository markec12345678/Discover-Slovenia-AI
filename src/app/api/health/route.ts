// FAIL-MODE (1.27.0): javni zdravstveni endpoint — izpostavi stanje STARTUP
// migracij (instrumentation.ts), da spodletele migracije niso več tihe
// (200 homepage + 500 API-scenarij iz revizije P1).
//
// Semantika:
//   - 200 + status "ok"       — vsi startup koraki uspeli/prisotni
//   - 200 + status "skipped*" — koraki zavestno izklopljeni (env zastavice)
//   - 503 + status "degraded" — vsaj en korak failed ALI unknown (DB bila
//                               nedosegljiva ob zagonu → shema morda
//                               manjka → tveganje 500 na API-jih)
//   - 200 + status "no-data"  — instrumentacija se na tej instanci ni
//                               zagnala (redko; npr. predictivni zagon)
//
// Serverless niansa: posnetek je PER-INSTANCA (register teče na hladnem
// zagonu) — "degraded" enega merjenja pomeni "nekaj hladnih zagonov je
// padlo", ne "celo stran je dol". Za uptime monitorje: 503 = preveri
// podrobnosti.
//
// Detajli so SANITIZIRANI (src/lib/startup-migration-status.ts) — iz
// povezovalnih nizov so poverilnice odstranjene, preden pridejo sem.

import { NextResponse } from "next/server";
import { getStartupMigrationReport } from "@/lib/startup-migration-status";
// Default uvoz (ne poimenovan) — Next.js opozorilo: poimenovani izvozi iz
// JSON modulov bodo kmalu odstranjeni ("only default export is available
// soon"), kar bi prelomilo ta endpoint.
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startup = getStartupMigrationReport();
  const degraded = startup.some(
    (s) => s.status === "failed" || s.status === "unknown"
  );
  const status =
    startup.length === 0 ? "no-data" : degraded ? "degraded" : "ok";

  return NextResponse.json(
    {
      status,
      version: pkg.version,
      startup,
      checkedAt: new Date().toISOString(),
    },
    // 503 samo ob degraded — obstoječa smoke orodja ta endpoint ne
    // uporabljajo (preverjeno), monitorski alarmi pa imajo standardni kanal.
    { status: degraded ? 503 : 200 }
  );
}
