/**
 * CRON RUNNER — dnevni scheduler za /api/cron/daily-trip-push (samo-vzdrževalni).
 *
 * NAMEN: v okoljih BREZ cron demona (self-host, sandbox) poganja dnevni
 * push opomnik za shranjena potovanja. Na Vercelu to deluje vercel.json
 * (crons → "0 6 * * *"); ta skripta je alternativa/backup za druga okolja.
 *
 * Zaženi (ozadje):
 *   CRON_SECRET=xxx nohup bun scripts/cron-runner.ts > /tmp/cron-runner.log 2>&1 &
 *
 * Ročni sprožilec (enkrat takoj, brez zanke):
 *   CRON_SECRET=xxx bun scripts/cron-runner.ts --now
 *
 * Env:
 *   CRON_SECRET   — obvezen (Bearer auth; enak kot API rute)
 *   BASE_URL      — privzeto http://localhost:3005
 *   RUN_AT_UTC    — privzeto "06:00" (07:00/08:00 dopoldne po Ljubljani;
 *                   enak urnik kot vercel.json produkcija)
 *
 * Lastnosti:
 *   - izračuna čas do naslednjega RUN_AT_UTC, spi, pokliče, zapiše
 *     enovrstični povzetek, ponovi (neskončna zanka)
 *   - napake omrežja NE ubijejo procesa (naslednji poskus jutri)
 *   - avtorizacija s timing-safe primerjavo na API strani (verifyCronAuth)
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3005";
const RUN_AT_UTC = process.env.RUN_AT_UTC ?? "06:00";
const ENDPOINT = `${BASE_URL}/api/cron/daily-trip-push`;

/** Končna točka za flage iz ukazne vrstice. */
const args = new Set(process.argv.slice(2)); // --now | --dry

/** Izračunaj ms do naslednjega RUN_AT_UTC (HH:MM). */
function msUntilNextRun(): number {
  const [h, m] = RUN_AT_UTC.split(":").map((x) => Number(x));
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Neveljaven RUN_AT_UTC "${RUN_AT_UTC}" (pričakovan HH:MM)`);
  }
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0)
  );
  if (next.getTime() <= now.getTime()) {
    // Današnji termin je že mimo → naslednji dan.
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

/** Pokliči dnevni push endpoint in vrni enovrstični povzetek. */
async function runOnce(dry: boolean): Promise<string> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET ni nastavljen (env)");

  const url = dry ? `${ENDPOINT}?dry=1` : ENDPOINT;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(60_000),
  });

  const data = (await res.json().catch(() => null)) as {
    sent?: number;
    failed?: number;
    gone?: number;
    planned?: number;
    eligible?: number;
    error?: string;
  } | null;

  if (!res.ok || !data) {
    return `HTTP ${res.status} ${data?.error ?? "(brez telesa)"}`;
  }
  return `eligible:${data.eligible ?? "?"} planned:${data.planned ?? "?"} sent:${data.sent ?? 0} failed:${data.failed ?? 0} gone:${data.gone ?? 0}`;
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function main(): Promise<void> {
  log(`cron-runner zagnan — ${ENDPOINT} ob ${RUN_AT_UTC} UTC vsak dan`);

  // Ročni sprožilec: enkrat takoj in končaj (brez zanke).
  if (args.has("--now") || args.has("--dry")) {
    try {
      const summary = await runOnce(args.has("--dry"));
      log(`ročni zagon (${args.has("--dry") ? "dry" : "real"}): ${summary}`);
      process.exit(0);
    } catch (err) {
      log(`ročni zagon NEUSPESEN: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  }

  // Dnevna zanka.
  for (;;) {
    const delay = msUntilNextRun();
    const at = new Date(Date.now() + delay);
    log(`naslednji zagon: ${at.toISOString()} (čez ${Math.round(delay / 60000)} min)`);

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const summary = await runOnce(false);
      log(`zagon: ${summary}`);
    } catch (err) {
      // Omrežna napaka NE ubije zanke — poskusimo jutri znova.
      log(`napaka: ${err instanceof Error ? err.message : err}`);
    }
  }
}

main().catch((err) => {
  log(`usodna napaka: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
