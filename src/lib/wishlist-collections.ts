// W3 (Issue #15, val V1): KOLEKCIJE PRILJUBLJENIH — razdelki lista
// "Priljubljene" po temi in destinaciji (Mindtripov vzorec "someday
// collections", po našem kanonu).
//
// NAČELA (enaka kot wishlist-trip-bridge.ts):
//   - ČISTA PLAST: 0 React odvisnosti, čiste funkcije, unit-testabilne.
//   - DETERMINISTIČNO: tema vnosa izhaja IZKLJUČNO iz (type + category)
//     podatka, ki ga površina shranjevanja že ima — nobenega ugibanja,
//     nobenega AI. Semenske teme = obstoječi intent čipi načrtovalnika
//     (bestFor slovar: hrana / kultura / aktivnosti / mir …).
//   - ISKREN FALLBACK: vnosi BREZ kategorije (starejši shranjeni vnosi
//     pred 1.132.0) NE uidejo v izmišljeno temo — pošteno razdelko "Drugo".
//   - ZERO FEATURE LOSS: ploščen seznam ostaja kot pogled "Vse"; dodajanje
//     prek obstoječega srčka se NE spremeni (kategorija se zapiše ob
//     shranjevanju — dodatno, neobvezno polje).
//
// Razdelka "Po destinaciji" uporabljata ISTO resolucijsko pravilo kot
// groupWishlistByDestination (wishlist-trip-bridge.ts): neobčutljivo
// ujemanje imena ALI slug-a proti DESTINATIONS (T1 dataset); nerazrešljivo
// besedilo ostane iskreno vidno brez ID-ja.

import { DESTINATIONS } from "@/lib/slovenia-data";
import type { WishlistEntry } from "@/lib/wishlist-storage";

/** Jeziki, ki jih nosi WL slovar lista priljubljenih (W3: 4-jezično). */
export type WishlistLang = "sl" | "en" | "it" | "de";

/**
 * Tema zbirke — semenske teme iz intent čipov načrtovalnika (bestFor
 * slovar), prirejene taksonomiji tržnice. ID-ji so stabilni (telemetrija
 * ne beleži imen tem — samo števce).
 */
export type WishlistTheme = "hrana" | "kultura" | "aktivnosti" | "mir" | "drugo";

/**
 * Preslikava (type + category) → tema. Kategorije so vrednosti polj
 * Experience.category / Product.category (D8-B taksonomija tržnice).
 * NEZNANA ali MANJKAJOČA kategorija → "drugo" (iskreno — starejši vnosi
 * pred obogatitvijo nimajo kategorije in NE uidejo v napačno temo).
 */
const THEME_BY_CATEGORY: Record<string, WishlistTheme> = {
  // hrana (intent čip): degustacije + živilski izdelki tržnice
  "experience:tasting": "hrana",
  "product:food": "hrana",
  "product:wine": "hrana",
  "product:honey": "hrana",
  "product:oil": "hrana",
  // kultura (intent čip): kulturne izkušnje + delavnice + obrt/suvenir
  "experience:cultural": "kultura",
  "experience:workshop": "kultura",
  "product:craft": "kultura",
  "product:souvenir": "kultura",
  // aktivnosti (intent čip): ogledi, narava, avantura
  "experience:tour": "aktivnosti",
  "experience:outdoor": "aktivnosti",
  "experience:adventure": "aktivnosti",
  // mir (intent čip): wellness doživetja
  "experience:wellness": "mir",
};

/** Tema vnosa — čista preslikava iz (type, category); brez kategorije → "drugo". */
export function themeOfEntry(
  entry: Pick<WishlistEntry, "type" | "category">
): WishlistTheme {
  const category =
    typeof entry.category === "string" ? entry.category.trim().toLowerCase() : "";
  if (!category) return "drugo";
  return THEME_BY_CATEGORY[`${entry.type}:${category}`] ?? "drugo";
}

/** Skupina teme z vnosi (razdelek "Po temi"). */
export interface WishlistThemeGroup {
  theme: WishlistTheme;
  entries: WishlistEntry[];
}

/**
 * Združi vnose po temi — vrstni red: število padajoče (največja tema prva),
 * pri izenačenju fiksni vrstni red taksonomije (hrana, kultura, aktivnosti,
 * mir, drugo) za stabilen UI.
 */
const THEME_ORDER: WishlistTheme[] = ["hrana", "kultura", "aktivnosti", "mir", "drugo"];

export function groupWishlistByTheme(entries: WishlistEntry[]): WishlistThemeGroup[] {
  const groups = new Map<WishlistTheme, WishlistEntry[]>();
  for (const entry of entries) {
    const theme = themeOfEntry(entry);
    const bucket = groups.get(theme);
    if (bucket) {
      bucket.push(entry);
    } else {
      groups.set(theme, [entry]);
    }
  }
  return [...groups.entries()]
    .map(([theme, groupEntries]) => ({ theme, entries: groupEntries }))
    .sort(
      (a, b) =>
        b.entries.length - a.entries.length ||
        THEME_ORDER.indexOf(a.theme) - THEME_ORDER.indexOf(b.theme)
    );
}

/** Skupina destinacije z vnosi (razdelek "Po destinaciji"). */
export interface WishlistDestinationSection {
  /** ID iz DESTINATIONS (T1) — undefined, če besedilo ni razrešljivo. */
  destinationId?: string;
  /** Iskreno ime: kanonično ime destinacije ALI surov tekst vnosa. */
  destinationName: string;
  entries: WishlistEntry[];
}

/**
 * Resolucija destinacije vnosa — ISTO pravilo kot groupWishlistByDestination
 * (wishlist-trip-bridge.ts): neobčutljivo ujemanje imena ALI slug-a proti
 * DESTINATIONS. Izvoženo, da obe plasti delita eno pravilo.
 */
export function resolveWishlistDestination(
  entry: Pick<WishlistEntry, "destination">
): { id: string; name: string } | undefined {
  const raw = (entry.destination ?? "").trim();
  if (!raw) return undefined;
  const needle = raw.toLowerCase();
  const dest = DESTINATIONS.find(
    (d) => d.name.toLowerCase() === needle || d.slug.toLowerCase() === needle
  );
  return dest ? { id: dest.id, name: dest.name } : undefined;
}

/**
 * Združi vnose po destinaciji z VNOSI v skupini — isto resolucijsko pravilo
 * kot groupWishlistByDestination (most v my-trip-view), obogateno za razdelke
 * lista: vrstni red število padajoče; brez besedila → drugaLabel; nerazrešljivo
 * besedilo → iskreno surovo ime brez ID-ja.
 */
export function groupWishlistEntriesByDestination(
  entries: WishlistEntry[],
  otherLabel = "Drugo"
): WishlistDestinationSection[] {
  const groups = new Map<string, WishlistDestinationSection>();
  for (const entry of entries) {
    const resolved = resolveWishlistDestination(entry);
    let key: string;
    let section: WishlistDestinationSection;
    if (resolved) {
      key = `id:${resolved.id}`;
    } else if ((entry.destination ?? "").trim()) {
      key = `raw:${(entry.destination ?? "").trim().toLowerCase()}`;
    } else {
      key = "__none__";
    }
    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    if (resolved) {
      section = {
        destinationId: resolved.id,
        destinationName: resolved.name,
        entries: [entry],
      };
    } else if (key === "__none__") {
      section = { destinationId: undefined, destinationName: otherLabel, entries: [entry] };
    } else {
      // iskren fallback: surovo besedilo kot ime, BREZ ID-ja
      section = {
        destinationId: undefined,
        destinationName: (entry.destination ?? "").trim(),
        entries: [entry],
      };
    }
    groups.set(key, section);
  }
  return [...groups.values()].sort((a, b) => b.entries.length - a.entries.length);
}

/**
 * Oznake tem — 4 jeziki (SL primarna resnica, EN referenčni par; IT/DE
 * strojni prevod po kanonu mtNotice — odkrito, dokler ni revidiran).
 * Vrednote SL so skladne z besedjem intent čipov načrtovalnika.
 */
export const WISHLIST_THEME_LABELS: Record<
  WishlistTheme,
  Record<WishlistLang, string>
> = {
  hrana: {
    sl: "Hrana in pijača",
    en: "Food & drink",
    it: "Cibo e bevande",
    de: "Essen & Trinken",
  },
  kultura: {
    sl: "Kultura in obrt",
    en: "Culture & crafts",
    it: "Cultura e artigianato",
    de: "Kultur & Handwerk",
  },
  aktivnosti: {
    sl: "Aktivnosti in avantura",
    en: "Activities & adventure",
    it: "Attività e avventura",
    de: "Aktivitäten & Abenteuer",
  },
  mir: {
    sl: "Mir in wellness",
    en: "Calm & wellness",
    it: "Quiet e benessere",
    de: "Ruhe & Wellness",
  },
  drugo: {
    sl: "Drugo",
    en: "Other",
    it: "Altro",
    de: "Sonstiges",
  },
};

/** Oznaka "Drugo" za razdelke po destinaciji — 4 jeziki (isti kanon). */
export const WISHLIST_OTHER_LABEL: Record<WishlistLang, string> = {
  sl: "Drugo",
  en: "Other",
  it: "Altro",
  de: "Sonstiges",
};
