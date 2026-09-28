// ============================================================================
// W4 (Issue #15, 1.134.0): SEZONSKI PAS HEROJA — mesec → sezona (0 AI)
// ============================================================================
// STB vzorec »Perfect autumn day«: turizem je hiper-sezonski, statičen hero
// pa govori enako vsepovsod. Ta čisti helper deterministično preslika mesec
// na eno od 4 sezon — STATIČNA MAPA (brez nove infrastrukture, brez AI),
// z ISTO sezonsko mejo kot bestTime slovar (december–februar = zima …),
// da hero in best-time strani govorita isti jezik sezon.
//
// Iskrena meja (G4): sezona se izračuna ob vsakem izrisu strežnika. V dev
// načinu (zahteva-po-zahtevo) je vedno sveža; pri hipotetičnem statičnem
// predrendiranju ob buildu bi se zmrznila na build-datum — kozmetična meja
// (zastarel mesec bi pokazal napačno sezono, nikoli napačne podatke).
// ============================================================================

/** Sezona po bestTime kanonu (isti ključi kot seasons.* v bestTime slovarju). */
export type Season = "zima" | "pomlad" | "poletje" | "jesen";

/** Vse sezone v kanonskem zaporedju (zima → pomlad → poletje → jesen). */
export const SEASONS: readonly Season[] = [
  "zima",
  "pomlad",
  "poletje",
  "jesen",
] as const;

/** Statična mapa mesec (0 = januar, 11 = december) → sezona. */
const MONTH_SEASON: readonly Season[] = [
  // jan   feb    mar      apr      maj      jun
  "zima",
  "zima",
  "pomlad",
  "pomlad",
  "pomlad",
  "poletje",
  // jul   avg    sep      okt      nov      dec
  "poletje",
  "poletje",
  "jesen",
  "jesen",
  "jesen",
  "zima",
] as const;

/**
 * Sezona za mesec (0–11). TOTALNA funkcija: vsako končno število (tudi
 * negativno ali > 11) preslika po modulu 12; NaN/Infinity → januar (zima).
 * Nikoli ne vrže — hero ne sme pasti zaradi datuma.
 */
export function seasonForMonth(month: number): Season {
  const m = Number.isFinite(month) ? Math.trunc(month) : 0;
  const idx = ((m % 12) + 12) % 12;
  return MONTH_SEASON[idx];
}

/**
 * Trenutna sezona (privzeto »zdaj«). Pokliče se izključno ob strežniškem
 * izrisu — v klientu bi povzročila hydration nesoglasje (strežnik in klient
 * se lahko izračunata čez polnoč).
 */
export function currentSeason(now: Date = new Date()): Season {
  return seasonForMonth(now.getMonth());
}
