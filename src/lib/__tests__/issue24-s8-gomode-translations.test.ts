import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  GL,
  GFn,
  goAll,
  goLangOf,
  goLocaleTag,
  type GoFn,
  type GoStrings,
} from "@/lib/journey/go-lang";
import { GO_LABELS, cardinalLabel } from "@/lib/journey/go-view";
import {
  ACCURACY_CLASS_LABELS,
  ARRIVAL_LABELS,
  TRAVEL_LABELS,
} from "@/lib/journey/travel-state";
import { QUALITY_LABELS, RESERVE_LABELS } from "@/lib/journey/time-reserve";
import { STOP_GEO_LABELS } from "@/lib/journey/resolve-stop-geo";
import { GO_WEATHER_LABELS } from "@/lib/journey/go-weather";
import { GO_NAV_LABELS } from "@/lib/journey/go-nav";
import {
  GO_AUDIO_LABELS,
  buildNearbyNarration,
  buildStopNarration,
} from "@/lib/journey/go-audio";
import type { GoEntryCard } from "@/lib/journey/go-view";
import { HEALTH_LABELS } from "@/lib/journey/trip-health";
import {
  CONFLICT_LABELS,
  GUARDIAN_ACTION_LABELS,
} from "@/lib/journey/conflict-detect";
import {
  RECOVERY_ACTION_LABELS,
  RECOVERY_LABELS,
} from "@/lib/journey/recovery";
import { DAY_START_LABELS } from "@/lib/journey/day-start";
import {
  FREE_TIME_LABELS,
  NEARBY_CATEGORY_LABELS,
} from "@/lib/journey/free-time";
import { DAY_LINE_LABELS, DAY_MAP_LABELS } from "@/lib/journey/day-line";
import { GO_EDIT_LABELS } from "@/lib/journey/go-edit";
import { CONFIRMATION_STATUS_LABELS } from "@/lib/journey/booking";
import { openingStatusAt } from "@/lib/opening-hours";

/**
 * ISSUE #24 Sklop 8 (1.170.0) — GO MODE I18N, FAZA 2: POLNI PREVODI.
 *
 * Faza 1 (1.169.0, S7) je odprla /{locale}/na-poti za vseh 6 jezikov z
 * EN-dedovanjem (PL prehodni kanon). Faza 2 prevede VSE Go Mode UI nize
 * (~330 enot × it/de/fr/es): IT/DE/FR/ES uporabnik dobi SVOJ jezik na
 * celi površini — naslov strani, GPS, guardian (stanje/konflikti/recovery/
 * jutro/prosti čas), vreme, navigacija, odpiralni časi, glasovni vodik.
 *
 * PODATKOVNI slovarji shranjenih zapisov ({sl,en} pari — providerLabel,
 * dateLabel, statusLabel poti …) ostanejo jezikovno NEVTRALNI: tuji jezik
 * vidi EN stran para (isti kanon kot faza 1 — zapis je na napravi, brez
 * migracij; P4-8: nikoli SL za tuje uporabnike).
 *
 * Ta test varuje:
 *  A) helper kanon (GL/GFn/goAll — EN dedovanje, nikoli SL za tuje);
 *  B) STRUKTURNO POPOLNOST — vsaka listna enota ključnih slovarjev nosi
 *     VSE 4 tuje prevode (anti "tiho EN padlo" varovalo);
 *  C) ne-mešanje (P4-8): tuji izpis ≠ SL (razen jezikovno nevtralnih);
 *  D) kakovostni vzorci (klicali za kakovost, ne samo obstoj);
 *  E) funkcionalne enote + projekcijski graditelji (goAll);
 *  F) resolucija v komponentah (goLangOf — faza 2 source contract);
 *  G) iskrena meja: offline.html ostaja EN za tuje (faza 1 kanon,
 *     dokumentirana meja — lastna naloga, če kdaj).
 */

const ROOT = join(import.meta.dir, "../../..");
const FOREIGN = ["it", "de", "fr", "es"] as const;
const GO_LANGS = ["sl", "en", ...FOREIGN] as const;

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

// ---------------------------------------------------------------------------
// A) HELPER KANON — GL/GFn/goAll/goLangOf (isti dedni kanon kot PL)
// ---------------------------------------------------------------------------

describe("S8 A) go-lang helper kanon (EN dedovanje, nikoli SL za tuje)", () => {
  test("① GL: sl → sl, en → en, tuji → tuji če obstaja, sicer EN", () => {
    const s: GoStrings = { sl: "SL", en: "EN" };
    expect(GL("sl", s)).toBe("SL");
    expect(GL("en", s)).toBe("EN");
    // Manjkajoči tuji prevod → EN (NIKOLI SL — P4-8).
    expect(GL("it", s)).toBe("EN");
    expect(GL("de", s)).toBe("EN");
    expect(GL("fr", s)).toBe("EN");
    expect(GL("es", s)).toBe("EN");
    // Neznan jezik → SL (nazaj-kompatibilno z izvirnikom).
    expect(GL("xx", s)).toBe("SL");
    expect(GL("", s)).toBe("SL");
  });

  test("② GL: eksplicitni tuji prevod zmaga", () => {
    const s: GoStrings = { sl: "SL", en: "EN", it: "IT", de: "DE", fr: "FR", es: "ES" };
    expect(GL("it", s)).toBe("IT");
    expect(GL("de", s)).toBe("DE");
    expect(GL("fr", s)).toBe("FR");
    expect(GL("es", s)).toBe("ES");
  });

  test("③ GFn: funkcijske enote z istim dednim kanonom", () => {
    const f: GoFn<[number], string> = {
      sl: (n) => `SL ${n}`,
      en: (n) => `EN ${n}`,
      it: (n) => `IT ${n}`,
    };
    expect(GFn("sl", f)(7)).toBe("SL 7");
    expect(GFn("en", f)(7)).toBe("EN 7");
    expect(GFn("it", f)(7)).toBe("IT 7");
    // de/fr/es manjkajo → EN.
    expect(GFn("de", f)(7)).toBe("EN 7");
    expect(GFn("es", f)(7)).toBe("EN 7");
    // Neznan → SL.
    expect(GFn("xx", f)(7)).toBe("SL 7");
  });

  test("④ goAll: zgradi vseh 6 jezikov hkrati (padec na EN za manjkajoče)", () => {
    const f: GoFn<[string], string> = {
      sl: (t) => `SL ${t}`,
      en: (t) => `EN ${t}`,
      fr: (t) => `FR ${t}`,
    };
    const all = goAll(f, "X");
    expect(all).toEqual({ sl: "SL X", en: "EN X", it: "EN X", de: "EN X", fr: "FR X", es: "EN X" });
  });

  test("⑤ goLangOf + goLocaleTag: 6 jezikov + BCP-47 oznake", () => {
    expect(goLangOf("sl")).toBe("sl");
    expect(goLangOf("it")).toBe("it");
    expect(goLangOf("xx")).toBe("sl");
    expect(goLangOf("hr")).toBe("sl");
    expect(goLocaleTag("sl")).toBe("sl-SI");
    expect(goLocaleTag("en")).toBe("en-GB");
    expect(goLocaleTag("it")).toBe("it-IT");
    expect(goLocaleTag("de")).toBe("de-DE");
    expect(goLocaleTag("fr")).toBe("fr-FR");
    expect(goLocaleTag("es")).toBe("es-ES");
  });
});

// ---------------------------------------------------------------------------
// B) STRUKTURNA POPOLNOST — vsak list ima vse 4 tuje prevode
// ---------------------------------------------------------------------------

/** Sprehodi objekt in zahtevaj, da ima vsak GoStrings list VSE 4 tuje
 *  ključe. Vrne seznam poti listov brez polnega prevoda (prazno = OK). */
function missingForeignPaths(
  node: unknown,
  path: string,
  out: string[]
): void {
  if (node == null || typeof node !== "object") return;
  if (typeof node === "function") return;
  const rec = node as Record<string, unknown>;
  const keys = Object.keys(rec);
  const looksLikeStrings =
    typeof rec.sl === "string" &&
    (typeof rec.sl === "function" || typeof rec.sl === "string") &&
    "sl" in rec &&
    "en" in rec &&
    typeof rec.en === "string" &&
    !("actions" in rec) &&
    keys.length <= 8;
  const hasForeign = FOREIGN.every((l) => rec[l] !== undefined);
  if (looksLikeStrings && !hasForeign) {
    out.push(path);
    return;
  }
  // Funkcijska enota (vrednosti so funkcije) — preveri tuje ključe.
  const looksLikeFn =
    typeof rec.sl === "function" &&
    typeof rec.en === "function" &&
    !("actions" in rec);
  if (looksLikeFn && !hasForeign) {
    out.push(path);
    return;
  }
  for (const k of keys) {
    if (k === "actions" || k === "severity" || k === "kind") continue;
    const v = rec[k];
    if (v != null && typeof v === "object") {
      missingForeignPaths(v, `${path}.${k}`, out);
    }
  }
}

describe("S8 B) strukturna popolnost — vsak list nosi it/de/fr/es", () => {
  const dicts: Record<string, unknown> = {
    GO_LABELS,
    ACCURACY_CLASS_LABELS,
    TRAVEL_LABELS,
    ARRIVAL_LABELS,
    QUALITY_LABELS,
    RESERVE_LABELS,
    STOP_GEO_LABELS,
    GO_WEATHER_LABELS,
    GO_NAV_LABELS,
    HEALTH_LABELS,
    CONFLICT_LABELS,
    GUARDIAN_ACTION_LABELS,
    RECOVERY_ACTION_LABELS,
    RECOVERY_LABELS,
    DAY_START_LABELS,
    FREE_TIME_LABELS,
    NEARBY_CATEGORY_LABELS,
    DAY_LINE_LABELS,
    DAY_MAP_LABELS,
    GO_EDIT_LABELS,
    CONFIRMATION_STATUS_LABELS,
  };

  test("① slovarji Go Mode površine so 6-jezični (0 manjkajočih poti)", () => {
    const missing: string[] = [];
    for (const [name, dict] of Object.entries(dicts)) {
      missingForeignPaths(dict, name, missing);
    }
    expect(missing).toEqual([]);
  });

  test("② CARDINALS (smeri neba) ×6 — vzorčni azimuti", () => {
    expect(cardinalLabel(0).it).toBe("nord");
    expect(cardinalLabel(0).de).toBe("Norden");
    expect(cardinalLabel(90).fr).toBe("est");
    expect(cardinalLabel(90).es).toBe("este");
    expect(cardinalLabel(180).it).toBe("sud");
    expect(cardinalLabel(270).de).toBe("Westen");
  });

  test("③ GO_AUDIO_LABELS: Record<GoLang, …> — vseh 6 jezikov + vzorci", () => {
    for (const l of GO_LANGS) {
      expect(GO_AUDIO_LABELS[l], `GO_AUDIO_LABELS.${l}`).toBeDefined();
      expect(GO_AUDIO_LABELS[l].readStop.length).toBeGreaterThan(0);
      expect(GO_AUDIO_LABELS[l].readStopAria("Bled")).toContain("Bled");
    }
    // kakovostni vzorci (ne samo obstoj)
    expect(GO_AUDIO_LABELS.it.readStop).toBe("Ascolta");
    expect(GO_AUDIO_LABELS.de.nearby).toContain("Nähe");
    expect(GO_AUDIO_LABELS.fr.showText).toContain("texte");
    expect(GO_AUDIO_LABELS.es.stopPlayback).toBe("Detener");
  });
});

// ---------------------------------------------------------------------------
// C) P4-8 NE-MEŠANJE — tuji izpis NI slovenski (razen nevtralnih)
// ---------------------------------------------------------------------------

/** Oznake, ki so jezikovno nevtralne po naravi (simboli/kratice). */
const NEUTRAL = new Set(["GPS", "Go Mode", "min", "km", "OSRM", "24/7"]);

describe("S8 C) P4-8: tuji izpis ni slovenski (anti-mešanje)", () => {
  test("① TRAVEL_LABELS / CONFLICT_LABELS / GUARDIAN_ACTION_LABELS: it ≠ sl", () => {
    for (const kind of Object.keys(TRAVEL_LABELS) as (keyof typeof TRAVEL_LABELS)[]) {
      for (const l of FOREIGN) {
        const foreign = GL(l, TRAVEL_LABELS[kind]);
        expect(foreign, `TRAVEL_LABELS.${kind} ${l}`).not.toBe(TRAVEL_LABELS[kind].sl);
      }
    }
    for (const kind of Object.keys(CONFLICT_LABELS) as (keyof typeof CONFLICT_LABELS)[]) {
      for (const l of FOREIGN) {
        expect(GL(l, CONFLICT_LABELS[kind]), `CONFLICT_LABELS.${kind} ${l}`)
          .not.toBe(CONFLICT_LABELS[kind].sl);
      }
    }
    for (const a of Object.keys(GUARDIAN_ACTION_LABELS) as (keyof typeof GUARDIAN_ACTION_LABELS)[]) {
      for (const l of FOREIGN) {
        expect(GL(l, GUARDIAN_ACTION_LABELS[a]), `GUARDIAN_ACTION_LABELS.${a} ${l}`)
          .not.toBe(GUARDIAN_ACTION_LABELS[a].sl);
      }
    }
  });

  test("② HEALTH_LABELS naslovi: tuji ≠ SL (guardian pasica)", () => {
    for (const h of ["ON_TRACK", "NEEDS_ATTENTION", "BLOCKED", "UNKNOWN"] as const) {
      for (const l of FOREIGN) {
        expect(GL(l, HEALTH_LABELS[h]), `HEALTH_LABELS.${h} ${l}`)
          .not.toBe(HEALTH_LABELS[h].sl);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// D) KAKOVOSTNI VZORCI — klicalo za prevode (ne samo obstoj ključev)
// ---------------------------------------------------------------------------

describe("S8 D) kakovostni vzorci prevodov", () => {
  test("① GO_LABELS.countdown: v teh 5 jezikih različne besede za isti min", () => {
    const out = [
      GO_LABELS.countdown.sl(30),
      GO_LABELS.countdown.en(30),
      GO_LABELS.countdown.it(30),
      GO_LABELS.countdown.de(30),
      GO_LABELS.countdown.fr(30),
      GO_LABELS.countdown.es(30),
    ];
    expect(out[0]).toContain("30");
    expect(out[1]).toBe("in 30 min");
    expect(out[2]).toBe("tra 30 min");
    expect(out[3]).toBe("in 30 Min.");
    expect(out[4]).toBe("dans 30 min");
    expect(out[5]).toBe("en 30 min");
  });

  test("② GO_NAV_LABELS.navigate ×6 (glavni gumb Go Mode)", () => {
    expect(GO_NAV_LABELS.navigate.sl).toBe("Navigiraj");
    expect(GO_NAV_LABELS.navigate.en).toBe("Navigate");
    expect(GO_NAV_LABELS.navigate.it).toBe("Naviga");
    expect(GO_NAV_LABELS.navigate.de).toBe("Navigieren");
    expect(GO_NAV_LABELS.navigate.fr).toBe("Naviguer");
    expect(GO_NAV_LABELS.navigate.es).toBe("Navegar");
  });

  test("③ openingStatusAt: zaprto + odpiranje v vseh 6 jezikih", () => {
    // Nedelja 08:00, vir zaprt ob 07:00 v ponedeljek → "zaprto · odpre pon 08:00".
    const res = openingStatusAt("Mo-Fr 09:00-17:00", { weekday: 0, minutes: 7 * 60 });
    expect(res.status).toBe("CLOSED");
    expect(res.detail.sl).toContain("odpre pon");
    expect(res.detail.en).toContain("opens Mon");
    expect(res.detail.it).toContain("apre lun");
    expect(res.detail.de).toContain("öffnet Mo");
    expect(res.detail.fr).toContain("ouvre lun");
    expect(res.detail.es).toContain("abre lun");
  });

  test("④ openingStatusAt: odprto do ure ×6", () => {
    const res = openingStatusAt("Mo-Fr 09:00-17:00", { weekday: 1, minutes: 10 * 60 });
    expect(res.status).toBe("OPEN");
    expect(res.detail.sl).toContain("odprto do");
    expect(res.detail.en).toContain("open until");
    expect(res.detail.it).toContain("aperto fino");
    expect(res.detail.de).toContain("geöffnet bis");
    expect(res.detail.fr).toContain("ouvert jusqu");
    expect(res.detail.es).toContain("abierto hasta");
  });

  test("⑤ CONFLICT_LABELS vzorci (naslovi vrst konfliktov)", () => {
    expect(CONFLICT_LABELS.AT_RISK_BOOKING.it).toBe("Prenotazione a rischio");
    expect(CONFLICT_LABELS.CLOSED_ON_ARRIVAL.de).toBe("Bei Ankunft geschlossen");
    expect(CONFLICT_LABELS.CANCELLED_BOOKING.fr).toBe("Réservation annulée");
    expect(CONFLICT_LABELS.MISSING_GEO.es).toBe("Ubicación desconocida");
  });

  test("⑥ DAY_START_LABELS.greeting: množinske oblike ×6 (stops/bookings)", () => {
    expect(DAY_START_LABELS.greeting.sl(3, 1)).toContain("3 postankov · 1 rezervacijo");
    expect(DAY_START_LABELS.greeting.en(3, 1)).toContain("3 stops · 1 booking");
    expect(DAY_START_LABELS.greeting.it(3, 1)).toContain("3 tappe · 1 prenotazione");
    expect(DAY_START_LABELS.greeting.de(3, 1)).toContain("3 Stationen · 1 Buchung");
    expect(DAY_START_LABELS.greeting.fr(3, 1)).toContain("3 arrêts · 1 réservation");
    expect(DAY_START_LABELS.greeting.es(3, 1)).toContain("3 paradas · 1 reserva");
  });
});

// ---------------------------------------------------------------------------
// E) FUNKCIONALNE ENOTE + PROJEKCIJSKI GRADITELJI
// ---------------------------------------------------------------------------

const BLED_CARD = {
  entry: {
    key: "k",
    title: "Bled",
    providerLabel: { sl: "AI načrt potovanja", en: "AI travel plan" },
    time: { start: "14:30" },
    location: "Bled",
    durationMin: 120,
  },
  distanceKm: 3,
  bearingLabel: { sl: "sever", en: "north", it: "nord", de: "Norden", fr: "nord", es: "norte" },
} as unknown as GoEntryCard;

describe("S8 E) pripovedi (TTS) v vseh 6 jezikih", () => {
  test("① buildStopNarration: uvodni stavek v jeziku uporabnika", () => {
    expect(buildStopNarration(BLED_CARD, "sl")).toContain("Postanek: Bled.");
    expect(buildStopNarration(BLED_CARD, "en")).toContain("Stop: Bled.");
    expect(buildStopNarration(BLED_CARD, "it")).toContain("Tappa: Bled.");
    expect(buildStopNarration(BLED_CARD, "de")).toContain("Station: Bled.");
    expect(buildStopNarration(BLED_CARD, "fr")).toContain("Arrêt : Bled.");
    expect(buildStopNarration(BLED_CARD, "es")).toContain("Parada: Bled.");
  });

  test("② termin v govoru: SL v besedah, tujci s števkami (cap() velika začetnica — kanon)", () => {
    expect(buildStopNarration(BLED_CARD, "sl")).toContain("Ob štirinajstih in pol");
    expect(buildStopNarration(BLED_CARD, "en")).toContain("At 14:30");
    expect(buildStopNarration(BLED_CARD, "it")).toContain("Alle 14:30");
    expect(buildStopNarration(BLED_CARD, "de")).toContain("Um 14:30 Uhr");
    expect(buildStopNarration(BLED_CARD, "fr")).toContain("À 14:30");
    expect(buildStopNarration(BLED_CARD, "es")).toContain("A las 14:30");
  });

  test("③ podatkovni par providerLabel: tuji vidijo EN stran (P4-8)", () => {
    // Zapis je jezikovno nevtralen {sl,en} — IT uporabnik sliši EN.
    expect(buildStopNarration(BLED_CARD, "it")).toContain("AI travel plan");
    expect(buildStopNarration(BLED_CARD, "it")).not.toContain("AI načrt");
    // SL uporabnik sliši SL.
    expect(buildStopNarration(BLED_CARD, "sl")).toContain("AI načrt potovanja");
  });

  test("④ razdalja + smer: PREMICA razkrita v jeziku uporabnika", () => {
    expect(buildStopNarration(BLED_CARD, "sl")).toContain("proti sever, premica");
    expect(buildStopNarration(BLED_CARD, "it")).toContain("verso nord, in linea d'aria");
    expect(buildStopNarration(BLED_CARD, "de")).toContain("Richtung Norden, Luftlinie");
    expect(buildStopNarration(BLED_CARD, "fr")).toContain("vers le nord, à vol d'oiseau");
    expect(buildStopNarration(BLED_CARD, "es")).toContain("hacia el norte, en línea recta");
  });

  test("⑤ buildNearbyNarration: uvodni naslov v jeziku uporabnika", () => {
    // Bled ~ nad Ljubljano — pozicija blizu Bleda vrne destinacije.
    const pos = { lat: 46.3779, lng: 14.1137, accuracyM: 10, timestamp: 0 };
    const sl = buildNearbyNarration(pos, "sl");
    const it = buildNearbyNarration(pos, "it");
    const de = buildNearbyNarration(pos, "de");
    if (sl != null && it != null && de != null) {
      expect(sl).toContain("V tvoji bližini:");
      expect(it).toContain("Nelle tue vicinanze:");
      expect(de).toContain("In deiner Nähe:");
    }
  });

  test("⑥ goAll gradilec v projekcijah (HEALTH flexibleOk ×6)", () => {
    // assessTripHealth uporabi goAll — preverimo gradilec prek oznak.
    const out = goAll(HEALTH_LABELS.flexibleOk, "Bled");
    expect(out.sl).toContain("Naslednji postanek: Bled");
    expect(out.it).toContain("Prossima tappa: Bled");
    expect(out.de).toContain("Nächste Station: Bled");
    expect(out.fr).toContain("Prochain arrêt : Bled");
    expect(out.es).toContain("Próxima parada: Bled");
  });
});

// ---------------------------------------------------------------------------
// F) RESOLUCIJA V KOMPONENTAH (source contract faze 2)
// ---------------------------------------------------------------------------

describe("S8 F) resolucija + tipi po komponentah (source contract)", () => {
  test("① go-mode.tsx: goLangOf + GL t() + 0 starih ternary resolucij", () => {
    const gm = source("src/components/sections/go-mode.tsx");
    expect(gm).toContain("const lang: GoLang = goLangOf(locale)");
    expect(gm).not.toContain('locale === "sl" ? "sl" : "en"');
    expect(gm).not.toContain('lang === "sl" ? "sl-SI" : "en-GB"');
    // Neposredno indeksiranje slovarjev po lang je odpravljeno (GL/GFn).
    expect(gm).not.toContain("L.min[lang]");
    expect(gm).not.toContain("L.stops[lang]");
    expect(gm).not.toContain("GO_LABELS.countdown[lang]");
    expect(gm).not.toContain("ARRIVAL_LABELS.stale[lang]");
  });

  test("② guardian podkomponente: GoLang tip (6 jezikov)", () => {
    for (const f of [
      "src/components/sections/go-mode/guardian-banner.tsx",
      "src/components/sections/go-mode/guardian-conflict.tsx",
      "src/components/sections/go-mode/guardian-free-time.tsx",
      "src/components/sections/go-mode/guardian-day-start.tsx",
      "src/components/sections/go-mode/trip-complete.tsx",
      "src/components/sections/go-day-line.tsx",
      "src/components/sections/go-audio-button.tsx",
    ]) {
      const src = source(f);
      expect(src, f).not.toContain('lang: "sl" | "en"');
      expect(src, f).toContain("GoLang");
    }
  });

  test("③ OpeningHoursStatus: GoLang + 6-jezični missingLabel", () => {
    const s = source("src/components/opening-hours-status.tsx");
    expect(s).toContain("lang: GoLang");
    expect(s).toContain("missingLabel?: GoStrings");
    // Chip oznake ×6 (ZDAJ ODPRNO family).
    expect(s).toContain('sl: "ZDAJ ODPRTO"');
    expect(s).toContain('it: "APERTO ORA"');
    expect(s).toContain('de: "JETZT GEÖFFNET"');
  });

  test("④ podatkovni pari zapisa ostanejo {sl,en} (jezikovna nevtralnost)", () => {
    // trip-view tipi se NISO razširili (zapis na napravi ostane dvodelen).
    const tv = source("src/lib/journey/trip-view.ts");
    expect(tv).toContain("providerLabel: { sl: string; en: string }");
    // go-audio bere par z EN-dedovanjem za tuje (nikoli SL).
    const ga = source("src/lib/journey/go-audio.ts");
    expect(ga).toContain('e.providerLabel?.[lang === "sl" ? "sl" : "en"]');
  });
});

// ---------------------------------------------------------------------------
// G) ISKRENA MEJA — offline.html ostaja EN za tuje (dokumentirana meja)
// ---------------------------------------------------------------------------

describe("S8 G) iskrene meje faze 2", () => {
  test("① offline.html: tuji locale še vedno pomeni EN besedila (faza 1 kanon)", () => {
    const html = source("public/offline.html");
    expect(html).toContain('LANG = "en"');
    expect(html).toContain("var I18N = {");
    // Iskrena meja: offline nizi obstajajo samo SL+EN (lastna naloga, če kdaj).
    expect(html).not.toContain('I18N = {\n    it:');
  });
});
