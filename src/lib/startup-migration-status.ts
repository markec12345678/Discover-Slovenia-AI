// FAIL-MODE (1.27.0): posnetek stanja STARTUP migracij za /api/health.
//
// Zakaj: instrumentation.ts izvaja 6 startup korakov (demo baza + 5
// migracij), ki so vsi fail-open (catch → console.error → strežnik
// nadaljuje). To je bilo razumljeno kot emergency rešitev (Neon je
// zaostajal za shemo — živi incident: POST /api/itinerary/save → 500),
// a pomeni, da spodletela migracija TIHO živi: 200 homepage, 500 API.
// Ta modul ne spreminja obnašanja (še vedno fail-open) — samo naredi
// POSLEDICO vidno: /api/health izpostavi stanje vseh korakov.
//
// Semantika na serverless (Vercel): register() teče na vsakem hladnem
// zagonu instance → posnetek je PER-INSTANCA (svež timestamp = svež
// poskus). Za monitoring pomeni: "degraded" na enem merjenju zahtiva
// ogled podrobnosti, ne paniko.
//
// VARNOST: detail gre skozi redactStartupDetail() — Prisma/Neon napake
// pogosto vsebujejo povezovalni niz z GOSTITELJEM IN POVERILNICAMI
// (postgres://user:pass@host/...). Ti nikoli ne smejo priti na javni
// endpoint — sanitizacija je obvezna pred vsakim zapisom.

export type StartupStepStatus = "ok" | "failed" | "skipped" | "unknown";

export interface StartupStepRecord {
  /** Kratek, stalen identifikator koraka (npr. "schema:trip-poll"). */
  name: string;
  status: StartupStepStatus;
  /** Sanitizirana podrobnost (stolpci/dodatki/vzrok) — brez poverilnic. */
  detail?: string;
  /** ISO čas poskusa (UTC). */
  at: string;
}

// Modulska stanje — namerno brez DB/ogs odvisnosti (teče tudi v edge
// kontekstu uvoza; instrumentation ga polni samo v nodejs runtime).
//
// KRITIČNA IMPLEMENTACIJSKA PODROBNOST (ugotovljena z E2E, ne iz dokumentacije):
// Next.js bundle-a instrumentation.ts v LOČEN vstopni vozol (server
// bootstrap) — route handlerji poganjajo DRUGO kopijo modula. Stanje na
// modulu bi torej bilo VEDNO prazno v /api/health (dva.records polja).
// Zato živi zapis na globalThis — enak vzorec kot Prisma dev singleton
// (src/lib/db.ts) — in je skupen CELEMU nodejs procesu (na serverless
// = per-instanci, kar je ravno pravšnja semantika).
const globalStore = globalThis as unknown as {
  __dsaStartupSteps?: StartupStepRecord[];
};
const records: StartupStepRecord[] = (globalStore.__dsaStartupSteps ??= []);

const MAX_DETAIL_CHARS = 300;

/**
 * Sanitizira besedilo napake/osebka za javni /api/health odgovor.
 * Vrstni red: specifični postgres nizi → generični URL-ji s poverilnicami
 * → file: poti → dolžinska meja.
 */
export function redactStartupDetail(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  let s = String(raw);
  // Neon/Prisma: postgres://user:password@host/db?sslmode=...
  s = s.replace(/postgres(?:ql)?:\/\/[^\s"']*/gi, "[redacted-db-url]");
  // Generično: katerikoli URL z vgrajenimi poverilnicami (mysql://, redis://...)
  s = s.replace(
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]*@[^\s"'<>]+/gi,
    "[redacted-url-with-credentials]"
  );
  // Lokalne poti (sqlite demo baza): file:/tmp/dsa-demo.db
  s = s.replace(/file:[^\s"']*/gi, "[redacted-file-path]");
  if (s.length > MAX_DETAIL_CHARS) {
    s = s.slice(0, MAX_DETAIL_CHARS) + " …[orezano]";
  }
  return s;
}

/**
 * Zapiše en startup korak. Pokliče ga IZKLJUČNO instrumentation.ts
 * (ob zagonu strežnika); klic iz drugega konteksta je napaka v načrtu.
 */
export function recordStartupStep(step: {
  name: string;
  status: StartupStepStatus;
  detail?: unknown;
}): void {
  records.push({
    name: step.name,
    status: step.status,
    detail: redactStartupDetail(step.detail),
    at: new Date().toISOString(),
  });
}

/**
 * Defenzivna kopija posnetka za /api/health (klic ne more umazati stanja).
 */
export function getStartupMigrationReport(): StartupStepRecord[] {
  return records.map((r) => ({ ...r }));
}
