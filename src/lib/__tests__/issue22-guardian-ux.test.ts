// ============================================================================
// ISSUE #22 — TRAVEL GUARDIAN: UX INTEGRACIJA (source contract + čisti deli)
// ============================================================================
// Pokriva:
//  - go-view: activeDayIndex (aditivno polje za Guardian akcije);
//  - go-edit: dodajanje nearby kandidata (v2 OK; v1 zavrnitev; stabilen
//    ključ nearby:{id}; konec dneva brez reordering);
//  - go-mode.tsx source contract: Guardian banner/konflikt/dan-start/
//    free-time sekcije so IZRISANE na naravnih mestih (§30 — nič skritega),
//    aria-live, akcije vežejo obstoječe mehanizme (toggleSkip/planer/nav),
//    nearby fetch ima dedupe ključ (brez refetch-šuma);
//  - guardian podkomponente: obstoj + ključne atribute (role=status/alert,
//    aria-live, pressed tipke, h-11 akcije ≥44 px);
//  - moja-potovanja: Nadaljuj na poti člen (§30.C) obstaja na karticah.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { MyTripDay, MyTripView, TripEntry } from "@/lib/journey/trip-view";
import { buildGoView } from "@/lib/journey/go-view";
import type { GoTripRecordV1, GoTripRecordV2 } from "@/lib/journey/go-persist";
import {
  addNearbyStopToRecord,
  canAddNearbyStops,
  nearbyCandidateToEntry,
} from "@/lib/journey/go-edit";

const ROOT = process.cwd();

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function mkEntry(key: string, over: Partial<TripEntry> = {}): TripEntry {
  return {
    key,
    category: "attractions",
    icon: "🏛️",
    title: `Postanek ${key}`,
    providerLabel: { sl: "AI načrt", en: "AI plan" },
    status: "INFO",
    statusLabel: { sl: "Načrtovani postanek", en: "Planned stop" },
    cancellation: { sl: "Ni rezervacije.", en: "No booking." },
    bookingId: null,
    ...over,
  };
}

function mkTrip(days: MyTripDay[]): MyTripView {
  return {
    title: { sl: "MOJA POT — BLED", en: "MY TRIP — BLED" },
    days,
    externalCards: [],
    confirmation: { confirmedCount: 0, note: { sl: "ni", en: "none" } },
    generatedAt: new Date().toISOString(),
  };
}

const NOW = new Date(2026, 8, 21, 10, 0);

// ---------------------------------------------------------------------------
// 1 — GO VIEW: activeDayIndex (aditivno)
// ---------------------------------------------------------------------------

describe("ISSUE #22 E: go-view — activeDayIndex", () => {
  test("① samodejna izbira dneva → indeks aktivnega dneva", () => {
    const trip = mkTrip([
      { date: "2026-09-19", dateLabel: { sl: "a", en: "a" }, entries: [mkEntry("a1")] },
      { date: "2026-09-21", dateLabel: { sl: "b", en: "b" }, entries: [mkEntry("b1")] },
    ]);
    const v = buildGoView(trip, NOW, null, {});
    expect(v.activeDayIndex).toBe(1); // danes je drugi dan

    const v2 = buildGoView(trip, NOW, null, {}, { dayOverride: 0 });
    expect(v2.activeDayIndex).toBe(0); // ročna izbira
  });
});

// ---------------------------------------------------------------------------
// 2 — GO EDIT: dodajanje nearby kandidata (čisto)
// ---------------------------------------------------------------------------

describe("ISSUE #22 E: go-edit — dodajanje nearby v pot", () => {
  const v2: GoTripRecordV2 = {
    version: 2,
    kind: "itinerary",
    savedAt: "2026-09-21T08:00:00.000Z",
    view: mkTrip([
      { date: "2026-09-21", dateLabel: { sl: "danes", en: "today" }, entries: [mkEntry("a")] },
    ]),
  };
  const v1: GoTripRecordV1 = {
    version: 1,
    savedAt: "2026-09-21T08:00:00.000Z",
    journey: {} as never,
    selectedIds: [],
  };

  const cand = {
    id: "fsq123",
    name: "Kavarna Zvezda",
    lat: 46.05,
    lng: 14.5,
    category: "drink" as const,
  };

  test("① v2: doda NA KONEC dneva (brez reordering) + nov savedAt", () => {
    expect(canAddNearbyStops(v2)).toBe(true);
    const updated = addNearbyStopToRecord(v2, cand, 0);
    expect(updated).not.toBeNull();
    expect(updated?.version).toBe(2);
    const day = updated!.view.days[0];
    expect(day.entries).toHaveLength(2);
    expect(day.entries[0].key).toBe("a"); // obstoječi vrstni red NEDOTAKNJEN
    expect(day.entries[1].key).toBe("nearby:fsq123"); // stabilen ključ z izvorom
    expect(day.entries[1].title).toBe("Kavarna Zvezda");
    expect(day.entries[1].lat).toBe(46.05);
    // ČISTO: originalni zapis ni mutiran
    expect(v2.view.days[0].entries).toHaveLength(1);
    expect(updated!.savedAt >= v2.savedAt).toBe(true);
  });

  test("② v1: zavrnitev (kanonična pot se ne mutira — iskrena opomba v UX)", () => {
    expect(canAddNearbyStops(v1)).toBe(false);
    expect(addNearbyStopToRecord(v1, cand, 0)).toBeNull();
  });

  test("③ neveljaven indeks / koordinate → null (fail-closed)", () => {
    expect(addNearbyStopToRecord(v2, cand, 5)).toBeNull();
    expect(addNearbyStopToRecord(v2, cand, -1)).toBeNull();
    expect(
      addNearbyStopToRecord(v2, { ...cand, lat: Number.NaN }, 0)
    ).toBeNull();
  });

  test("④ nearbyCandidateToEntry: iskren vnos (INFO status, brez časa, vir poimenovan)", () => {
    const e = nearbyCandidateToEntry(cand);
    expect(e.key).toBe("nearby:fsq123");
    expect(e.status).toBe("INFO");
    expect(e.time).toBeUndefined();
    expect(e.timeNote?.sl).toContain("Dodano med potjo");
    expect(e.providerLabel.sl).toContain("Zemljevid");
  });
});

// ---------------------------------------------------------------------------
// 3 — GO MODE SOURCE CONTRACT (§30: nič skritega, naravna mesta)
// ---------------------------------------------------------------------------

describe("ISSUE #22 E: go-mode.tsx — source contract", () => {
  const src = readFileSync(
    join(ROOT, "src/components/sections/go-mode.tsx"),
    "utf8"
  );

  test("① Guardian engine povezan (buildGuardian + assessRecovery + day start + free time)", () => {
    expect(src).toContain("buildGuardian({");
    expect(src).toContain("assessRecovery({");
    expect(src).toContain("buildDayStartSummary({");
    expect(src).toContain("detectFreeTimeWindow({");
    expect(src).toContain("filterNearbyCandidates({");
  });

  test("② Banner izrisan ob glavi (PRVA stvar po naslovu — §30.E)", () => {
    expect(src).toContain("<GuardianBanner snapshot={guardian}");
    // Vrstni red: banner pred dnevno navigacijo (JSX sekcija, ne komentar)
    // in pred NASLEDNJE kartico.
    const iBanner = src.indexOf("<GuardianBanner snapshot={guardian}");
    const iDayNav = src.indexOf("view.daySwitcher.length > 0");
    const iNext = src.indexOf('id="naslednje"');
    expect(iBanner).toBeGreaterThan(-1);
    expect(iBanner).toBeLessThan(iDayNav);
    expect(iBanner).toBeLessThan(iNext);
  });

  test("③ Konflikt kartica ob pozornosti + akcije vežejo obstoječe mehanizme", () => {
    expect(src).toContain("<GuardianConflictCard");
    expect(src).toContain("guardian.topConflict");
    expect(src).toContain("onAction={onGuardianAction}");
    // NAVIGATE = obstoječi #21 handoff (goNavLinks + coarse pointer), ne nov
    // navigacijski sistem; SKIP/COMPLETE = toggleSkip/toggleDone.
    expect(src).toContain('action === "NAVIGATE"');
    expect(src).toContain("toggleSkip(conflict.stopKey)");
    expect(src).toContain("toggleDone(conflict.stopKey)");
    expect(src).toContain("goNavLinks(view.next.entry");
  });

  test("④ ZAČNI DAN: jutranji povzetek izrisan ob primernem stanju (§30 uporabniško ime)", () => {
    expect(src).toContain("dayStart?.applicable");
    expect(src).toContain("<GuardianDayStartSection");
    expect(src).toContain('id="naslednje"'); // skok na naslednji cilj
    // GPS vklop SAMO na uporabnikovo dejanje (kanon #21 §9).
    expect(src.indexOf("geo.start();")).toBeGreaterThan(
      src.indexOf("const startDay")
    );
  });

  test("⑤ FREE-TIME: sekcija po NASLEDNJE kartici + varnostni fetch z dedupe", () => {
    expect(src).toContain("freeTime && (");
    expect(src).toContain("<GuardianFreeTimeSection");
    const iFree = src.indexOf("<GuardianFreeTimeSection");
    const iNext = src.indexOf('id="naslednje"');
    expect(iFree).toBeGreaterThan(iNext); // sekundarna informacija (§21)
    // Dedupe ključ preprečuje refetch ob vsakem GPS tiku.
    expect(src).toContain("nearbyLastKeyRef.current === nbKey");
    // PROD REGRESIJA (dokaz #22): nalagalnik je LAST-WRITE-WINS PO KLJUČU —
    // BREZ AbortControllerja (abort ob vsaki 2-s fiksaciji je ubil vse
    // fetche, dedupe pa prepovedoval ponovni poskus → vedno prazno).
    // Zastareli izpisi se zavžejo s primerjavo ključa.
    const nbStart = src.indexOf("Nalagalnik kandidatov");
    const nbEnd = src.indexOf("}, [view, now, freeTime, nearbyCategory");
    const nbSection = src.slice(nbStart, nbEnd);
    expect(nbStart).toBeGreaterThan(-1);
    expect(nbSection).not.toContain("signal:"); // brez aborta (zadnji zmaguje)
    expect(nbSection).toContain("nearbyLastKeyRef.current !== runKey) return;");
    expect(nbSection).toContain("setNearbyFits(fits)");
    // Bbox je GROBA posplošitev pozicije (ne nosimo točne lokacije naprej).
    expect(src).toContain("nearbyBbox({ lat: nbLat, lng: nbLng }, 5)");
  });

  test("⑥ nearby dodajanje: v2 pogoj + iskrena v1 opomba (go-edit)", () => {
    expect(src).toContain("canAddNearbyStops(record)");
    expect(src).toContain("addNearbyStopToRecord(");
    expect(src).toContain("saveItineraryGoTrip(updated.view");
    // v1: feedback sporočilo (kanonična pot — ne moremo dodati).
    // Sklop 8 (1.170.0): en vir resnice GO_EDIT_LABELS.notPossibleV1
    // (prej inline dvojnik v go-mode; besedilo živi v go-edit.ts).
    expect(src).toContain("GO_EDIT_LABELS.notPossibleV1");
    expect(
      readFileSync(
        join(import.meta.dir, "../journey/go-edit.ts"),
        "utf8"
      )
    ).toContain("dodajanje med potjo ni mogoče");
  });

  test("⑦ ZERO FEATURE LOSS: obstoječe sekcije ostajajo (shema dneva, vreme, avdio, preskok)", () => {
    for (const anchor of [
      "<GoDayLine", // shema dneva (#21)
      "parseGoWeatherResponse", // vreme (task 65)
      "<GoAudioButton", // glasovni vodnik (W7)
      "toggleSkip(view.next!.entry.key)", // preskok (#21 §5)
      "AlertDialogTrigger", // konec Go Mode
    ]) {
      expect(src).toContain(anchor);
    }
  });
});

// ---------------------------------------------------------------------------
// 4 — GUARDIAN PODKOMPONENTE (a11y + uporabniška imena)
// ---------------------------------------------------------------------------

describe("ISSUE #22 E: guardian podkomponente — obstoj in a11y", () => {
  const banner = readFileSync(
    join(ROOT, "src/components/sections/go-mode/guardian-banner.tsx"),
    "utf8"
  );
  const conflict = readFileSync(
    join(ROOT, "src/components/sections/go-mode/guardian-conflict.tsx"),
    "utf8"
  );
  const freeTime = readFileSync(
    join(ROOT, "src/components/sections/go-mode/guardian-free-time.tsx"),
    "utf8"
  );
  const dayStart = readFileSync(
    join(ROOT, "src/components/sections/go-mode/guardian-day-start.tsx"),
    "utf8"
  );

  test("① banner: role=status + aria-live=polite (bralnik zasliši spremembo)", () => {
    expect(banner).toContain('role="status"');
    expect(banner).toContain('aria-live="polite"');
    // Naslovi stanj prihajajo IZ engine (snapshot.headline) — komponenta
    // ne hrani lastnih prevodov stanj (en vir resnice; uporabniška imena
    // §30.E so testno zaklenjena v trip-health HEALTH_LABELS).
    expect(banner).toContain("snapshot.headline");
    expect(banner).not.toContain('"VSE TEČE');
  });

  test("② konflikt: role=alert + FACTS/REASON/IMPACT struktura + recovery zložljiv", () => {
    expect(conflict).toContain('role="alert"');
    expect(conflict).toContain("conflict.facts");
    expect(conflict).toContain("conflict.reason");
    expect(conflict).toContain("conflict.impact");
    expect(conflict).toContain("aria-expanded={showRecovery}");
    expect(conflict).toContain("RECOVERY_ACTION_LABELS");
  });

  test("③ free-time: kategorije Znamenitosti/Hrana/Kava/Sprehod (§30.F) + tipke aria-pressed", () => {
    expect(freeTime).toContain("Znamenitosti");
    expect(freeTime).toContain("Hrana");
    expect(freeTime).toContain("Kava");
    expect(freeTime).toContain("Sprehod");
    expect(freeTime).toContain("aria-pressed={active}");
    expect(freeTime).toContain('aria-live="polite"');
    // Varnostna rezerva je izrecno izpisana (§10 transparentnost).
    expect(freeTime).toContain("safety");
  });

  test("④ day start: ZAČNI DAN + pozdrav + GPS namen (§13/§30.H — zakaj dovoljenje)", () => {
    expect(dayStart).toContain("ZAČNI DAN");
    expect(dayStart).toContain("DOBRO JUTRO");
    expect(dayStart).toContain("gpsHint");
  });
});

// ---------------------------------------------------------------------------
// 5 — MOJA POTOVANJA: Nadaljuj na poti člen (§30.C)
// ---------------------------------------------------------------------------

describe("ISSUE #22 E: moja-potovanja — Nadaljuj na poti (§30.C)", () => {
  const src = readFileSync(
    join(ROOT, "src/app/moja-potovanja/moja-potovanja-view.tsx"),
    "utf8"
  );

  test("① gumb na KARTICI poti (naravno mesto — brez znanja URL-jev)", () => {
    expect(src).toContain("Nadaljuj na poti");
    expect(src).toContain("resumeTrip(trip.shareId");
    expect(src).toContain("saveItineraryGoTrip(view, { shareId })");
    // Iskren fallback: napaka → stran poti (tam je poln tok).
    expect(src).toContain("router.push(`/pot/${shareId}`)");
  });
});
