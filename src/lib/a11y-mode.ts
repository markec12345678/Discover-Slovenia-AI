// ============================================================================
// W5 (Issue #15, 1.135.0): VISOK KONTRAST + BRALNI NAČIN (0 AI, 0 strežnika)
// ============================================================================
// STB portal (slovenia.info) kot nacionalni standard dostopnosti ima visok
// kontrast in bralni način; mi imamo dark mode + reduced-motion + ARIA, ta
// dva načina pa ne. Oba sta ČISTA KLIENTNA PLAST nad obstoječo CSS
// spremenljivko arhitekturo (Tailwind 4 @theme inline → --background ipd.):
//
//   <html> razredi:
//     .contrast-high  — EKSPPLICITNO zagnan visok kontrast (prepis palete)
//     .contrast-off   — EKSPPLICITNO izklopljen (preglasi OS zahtevo)
//     .reading-mode   — tipografska povečava (font-size + leading pisave)
//
//   OS spoštovanje (varovalo iz benchmarka): brez shranjene izbire CSS
//   upošteva @media (prefers-contrast: more) — vrednosti se primejo, razen
//   če je uporabnik izrecno izklopu (html.contrast-off). Shranjena izbira
//   (localStorage) vedno zmaga nad OS privzetkom — enakega kot next-themes.
//
// Iskrena meja: bralni način je TIPOGRAFSKA povečava (112,5 % osnovnega
// koraka + gostejši vrstični presledki odstavkov) — NI preoblikovanje
// strani v golo besedilo (obstaja vsebina, ki je navezana na zemljevide,
// karte in dialoge — zero feature loss kanon).
// ============================================================================

/** Ključ localStorage (isti vir kot no-flash skript v layout head). */
export const A11Y_STORAGE_KEY = "dsa-a11y";

/** Eksplicitna uporabničeva izbira kontrasta; null = sledi OS (prefers-contrast). */
export type ContrastChoice = "on" | "off" | null;

/** Shranjeno stanje obeh načinov (serializirano v localStorage). */
export interface A11yPrefs {
  contrast: ContrastChoice;
  reading: boolean;
}

/** Privzeto stanje (nič shranjenega): sledi OS za kontrast, branje izklopljeno. */
export const DEFAULT_A11Y_PREFS: A11yPrefs = { contrast: null, reading: false };

/**
 * Varen parse shranjenega stanja (korupcija/prazno/tuje ključe ignorira —
 * pade nazaj na privzeto). Čista funkcija — primerna za unit teste.
 */
export function parseA11yPrefs(raw: string | null): A11yPrefs {
  if (!raw) return { ...DEFAULT_A11Y_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<A11yPrefs> | null;
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_A11Y_PREFS };
    }
    return {
      contrast:
        parsed.contrast === "on" || parsed.contrast === "off"
          ? parsed.contrast
          : null,
      reading: parsed.reading === true,
    };
  } catch {
    return { ...DEFAULT_A11Y_PREFS };
  }
}

/** Razredi, ki jih mora nositi <html> za dano stanje (nosilec: layout skript
 *  pred barvanjem + ta lib ob preklopu — ENA funkcija, en vir resnice). */
export function a11yClasses(prefs: A11yPrefs): string[] {
  const classes: string[] = [];
  if (prefs.contrast === "on") classes.push("contrast-high");
  if (prefs.contrast === "off") classes.push("contrast-off");
  if (prefs.reading) classes.push("reading-mode");
  return classes;
}

/** Ali je visok kontrast DEJANSKO dejaven? (eksplicitno ON, ali OS zahteval
 *  in uporabnik ni izrecno izklopu). Uporabno za stanje stikala v UI —
 *  brez DOM branja, primerno za teste. */
export function isHighContrastActive(
  prefs: A11yPrefs,
  osPrefersContrast: boolean
): boolean {
  if (prefs.contrast === "on") return true;
  if (prefs.contrast === "off") return false;
  return osPrefersContrast;
}
