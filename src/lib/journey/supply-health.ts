// ============================================================================
// TASK 74 — ZDRAVJE VIROV: pogled za MY TRIP (§22 izolacija odpovedi + §30)
// ============================================================================
// journey.supplyHealth.degradedProviders (slugi virov, ki so odpovedali ob
// generiranju — manjkajoč dataset / napaka adapterja) se je doslej zabeležil
// SAMO strežniško (API log + note posameznih kategorij). Ta modul ga dvigne
// v uporabniku berljiv pogled na ravni CELEGA potovanja:
//   - KATERI viri (prikazna imena iz ENOTEGA registra),
//   - KAJ to pomeni (fail-closed: iz teh virov ni ponudb — nič izmišljenega),
//   - POMIRITEV §22 (odpoved ENEGA vira ne uniči poti — ostalo deluje).
//
// ISKRENOST (isti kanon kot vreme v TASK 66): PRAZNA množica = vsi viri
// odgovorili = TIŠINA (ne slave-ujemo odsotnosti težav). Pas se pokaže
// SAMO ob dejanski odpovedi — to je utež, ki si jo potnik zasluži videti
// ravno takrat, ko so kategorije lažje, kot bi lahko bile.
//
// ČISTO: 0 React, 0 db, 0 localStorage — testirljivo brez brskalnika.
// Preslikava slug → oznaka: register (getProvider — datoteka je CLIENT-
// VARNA po svoji glavi; isti vzorec že uporabljata map-view in
// product-modal). Neznan slug → surovi niz (iskreno: nikoli ne izmislimo
// imena vira, ki ga register pozna pod drugim imenom).
// ============================================================================

import { getProvider } from "@/lib/supply/registry";

export type SupplyHealthLang = "sl" | "en";

/** Pogled zdravja virov (render pripravljen, brez React odvisnosti). */
export interface SupplyHealthView {
  /** Prikazna imena odpovedalih virov (deduplicirano, zaporedje ohranjeno). */
  readonly providerLabels: readonly string[];
  /** Seznam za poved (labels združeni z lokalno konvencijo ločila). */
  readonly listText: string;
}

/**
 * Zgradi pogled iz slugov odpovedalih virov.
 * Vrne null, kadar ni (ali ni smiselno) kaj pokazati:
 *   - undefined/null (stari zapisi brez supplyHealth polja),
 *   - prazna množica (vsi viri odgovorili — tišina),
 *   - samo smeti (ne-nizi/prazni nizi — fail-closed brez sesutja).
 */
export function supplyHealthView(
  degraded: readonly unknown[] | undefined | null,
  lang: SupplyHealthLang
): SupplyHealthView | null {
  if (!Array.isArray(degraded) || degraded.length === 0) return null;
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const slug of degraded) {
    if (typeof slug !== "string" || slug.trim().length === 0) continue;
    // Register je ENOTI vir imen; neznan slug pokaže surovo (njegovo
    // pravo ime ne obstaja — izmišljati ga ne smemo).
    const label = getProvider(slug)?.labels[lang] ?? slug;
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  if (labels.length === 0) return null;
  return { providerLabels: labels, listText: labels.join(", ") };
}

/**
 * Kopija pasu (SL/EN) — v lib modulu (isti vzorec kot TRIP_WEATHER_LABELS),
 * da so trditve „nič izmišljenega" in „ostalo deluje" testno varovane.
 */
export const SUPPLY_HEALTH_LABELS = {
  title: {
    sl: "Nekateri viri niso odgovorili",
    en: "Some sources did not respond",
  },
  body: {
    sl: (list: string) =>
      `Ob generiranju poti teh virov ni bilo mogoče doseči: ${list}. Iz njih ni ponudb — nič izmišljenega. Ostalo potovanje deluje.`,
    en: (list: string) =>
      `These sources could not be reached when this trip was generated: ${list}. Their offers are missing — nothing invented. The rest of the journey still works.`,
  },
} as const;
