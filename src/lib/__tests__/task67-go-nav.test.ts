// ============================================================================
// TASK 67 — GO MODE NAVIGACIJSKI HANDOFF (1.67.0)
// ============================================================================
// Pokriva: geo URI graditelj (RFC 5870 + Android q konvencija; fail-closed
// koordinate; sanitizacija + encoding oznake — injection varnost), web URL
// graditelj (Google Maps Directions URL API — SAMO številke v URL), nadzor
// goNavLinks (iskrena odsotnost brez geo — isti kanon kot DistanceChip),
// čisto izbiro pickGoNavHref, okoljski isCoarsePointer (SSR/matchMedia),
// oznake SL/EN in celotno verigo buildGoView → GoEntryCard → handoff.
// ============================================================================

import { afterEach, describe, expect, test } from "bun:test";

import {
  GO_NAV_LABELS,
  buildGeoNavUri,
  buildWebNavUrl,
  goNavLinks,
  isCoarsePointer,
  pickGoNavHref,
  type GoNavLinks,
} from "@/lib/journey/go-nav";
import { buildGoView } from "@/lib/journey/go-view";
import type { MyTripDay, MyTripView, TripEntry } from "@/lib/journey/trip-view";

// ---------------------------------------------------------------------------
// Fixture gradniki (čisti — isti kanon kot TASK 64)
// ---------------------------------------------------------------------------

function mkEntry(key: string, over: Partial<TripEntry> = {}): TripEntry {
  return {
    key,
    category: "attractions",
    icon: "🏛️",
    title: `Postanek ${key}`,
    providerLabel: { sl: "FSQ OS Places", en: "FSQ OS Places" },
    status: "INFO",
    statusLabel: {
      sl: "Samo informacija — brez rezervacije",
      en: "Information only — no booking",
    },
    cancellation: {
      sl: "Ni rezervacije — nič za preklicati.",
      en: "No booking — nothing to cancel.",
    },
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

/** 20. 9. 2026, 10:00 LOKALNO — dan z datumom == danes je aktiven. */
const NOW = new Date(2026, 8, 20, 10, 0);

// Realne koordinate 4 držav (isti identitetni kot TASK 64/65 testi):
const BLED = { lat: 46.3683, lng: 14.1127 }; // SI
const DUBROVNIK = { lat: 42.6407, lng: 18.1077 }; // HR
const KOTOR = { lat: 42.4247, lng: 18.7714 }; // ME
const TIRANA = { lat: 41.3275, lng: 19.8187 }; // AL

// ---------------------------------------------------------------------------
// 1 — GEO URI GRADILNIK (RFC 5870 + Android q konvencija)
// ---------------------------------------------------------------------------

describe("TASK 67: buildGeoNavUri", () => {
  test("① osnovni format: geo:lat,lng?q=lat,lng(Label) — fiksno 6 mest", () => {
    expect(buildGeoNavUri(BLED.lat, BLED.lng, "Blejsko jezero")).toBe(
      "geo:46.368300,14.112700?q=46.368300,14.112700(Blejsko%20jezero)"
    );
  });

  test("② brez oznake → samo geo:lat,lng (q parameter IZPUSTIČEN)", () => {
    expect(buildGeoNavUri(BLED.lat, BLED.lng)).toBe("geo:46.368300,14.112700");
    expect(buildGeoNavUri(BLED.lat, BLED.lng, undefined)).toBe(
      "geo:46.368300,14.112700"
    );
  });

  test("③ prazna/whitespace oznaka → brez q (ne delamo praznega labela)", () => {
    expect(buildGeoNavUri(BLED.lat, BLED.lng, "")).toBe("geo:46.368300,14.112700");
    expect(buildGeoNavUri(BLED.lat, BLED.lng, "   ")).toBe("geo:46.368300,14.112700");
  });

  test("④ negativne koordinate ostanejo predznak (južna/zahodna polutka)", () => {
    const uri = buildGeoNavUri(29.95, -90.07, "New Orleans");
    expect(uri).toBe("geo:29.950000,-90.070000?q=29.950000,-90.070000(New%20Orleans)");
  });

  test("⑤ 0,0 je VELJAVNA WGS84 točka (Golfski zaliv — ne lažemo, da ni)", () => {
    expect(buildGeoNavUri(0, 0)).toBe("geo:0.000000,0.000000");
  });

  test("⑥ 4 države regije: Bled, Dubrovnik, Kotor, Tirana — vsaka svoja točka", () => {
    expect(buildGeoNavUri(BLED.lat, BLED.lng)).toContain("geo:46.368300");
    expect(buildGeoNavUri(DUBROVNIK.lat, DUBROVNIK.lng)).toContain("42.640700,18.107700");
    expect(buildGeoNavUri(KOTOR.lat, KOTOR.lng)).toContain("42.424700,18.771400");
    expect(buildGeoNavUri(TIRANA.lat, TIRANA.lng)).toContain("41.327500,19.818700");
  });

  test("⑦ oznaka z oklepaji → ODSTRANJENI (so struktura q formata, ne vsebina)", () => {
    const uri = buildGeoNavUri(BLED.lat, BLED.lng, "Zoo (stari del)");
    expect(uri).toBe(
      "geo:46.368300,14.112700?q=46.368300,14.112700(Zoo%20stari%20del)"
    );
  });

  test("⑧ INJECTION: &, <, >, \", \\ v oznaki → sanitizirani/encodani, ni raw izpada", () => {
    const uri = buildGeoNavUri(BLED.lat, BLED.lng, 'Bled & <script>"x\\"y</script>');
    // Surovi & bi lahko razbil q parameter — encodan je %26 (znaka & ni v URI).
    expect(uri).not.toContain("&");
    expect(uri).not.toContain("<");
    expect(uri).not.toContain(">");
    expect(uri).not.toContain('"');
    expect(uri).toContain("%26"); // & je URL-encodan
    // Koordinate ostanejo CELA (napadalec ne premakne cilja):
    expect(uri).toContain("geo:46.368300,14.112700?q=46.368300,14.112700");
  });

  test("⑨ # v oznaki → encodan (%23 — ne more odpreti fragmenta)", () => {
    const uri = buildGeoNavUri(BLED.lat, BLED.lng, "Kraj #1");
    expect(uri).not.toMatch(/#/);
    expect(uri).toContain("%231");
  });

  test("⑩ FAIL-CLOSED koordinate: NaN / ±Infinity / meje prekoračene → null", () => {
    expect(buildGeoNavUri(Number.NaN, 14)).toBeNull();
    expect(buildGeoNavUri(46, Number.NaN)).toBeNull();
    expect(buildGeoNavUri(Number.POSITIVE_INFINITY, 14)).toBeNull();
    expect(buildGeoNavUri(Number.NEGATIVE_INFINITY, 14)).toBeNull();
    expect(buildGeoNavUri(90.0001, 14)).toBeNull(); // lat meja
    expect(buildGeoNavUri(-90.0001, 14)).toBeNull();
    expect(buildGeoNavUri(46, 180.0001)).toBeNull(); // lng meja
    expect(buildGeoNavUri(46, -180.0001)).toBeNull();
  });

  test("⑪ meje točno na robu so VELJAVNE (±90 lat, ±180 lng)", () => {
    expect(buildGeoNavUri(90, 0)).toBe("geo:90.000000,0.000000");
    expect(buildGeoNavUri(-90, 0)).toBe("geo:-90.000000,0.000000");
    expect(buildGeoNavUri(0, 180)).toBe("geo:0.000000,180.000000");
    expect(buildGeoNavUri(0, -180)).toBe("geo:0.000000,-180.000000");
  });

  test("⑫ toFixed(6): 0 eksponentnih zapisov (eksponent bi zlomil URI parse)", () => {
    const tiny = buildGeoNavUri(0.0000012, 0.0000012);
    expect(tiny).toBe("geo:0.000001,0.000001");
    const big = buildGeoNavUri(41.3275, 19.8187);
    expect(big).not.toMatch(/e[+-]/i);
  });
});

// ---------------------------------------------------------------------------
// 2 — WEB URL GRADILNIK (Google Maps Directions URL API)
// ---------------------------------------------------------------------------

describe("TASK 67: buildWebNavUrl", () => {
  test("① format: dir API + destination koordinate (fiksno 6 mest)", () => {
    expect(buildWebNavUrl(BLED.lat, BLED.lng)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=46.368300,14.112700"
    );
  });

  test("② negativne koordinate: zahodna polutka", () => {
    expect(buildWebNavUrl(29.95, -90.07)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=29.950000,-90.070000"
    );
  });

  test("③ SAMO številke v URL — funkcija NASLOVA niti ne sprejme (0 user text)", () => {
    // Tipni nivo: funkcija sprejme (number, number) — naslov ne more priti noter.
    const url = buildWebNavUrl(KOTOR.lat, KOTOR.lng);
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+\.\d{6},-?\d+\.\d{6}$/);
  });

  test("④ FAIL-CLOSED: NaN / Infinity / meje → null", () => {
    expect(buildWebNavUrl(Number.NaN, 18)).toBeNull();
    expect(buildWebNavUrl(42, Number.NaN)).toBeNull();
    expect(buildWebNavUrl(Number.POSITIVE_INFINITY, 18)).toBeNull();
    expect(buildWebNavUrl(91, 18)).toBeNull();
    expect(buildWebNavUrl(42, 181)).toBeNull();
    expect(buildWebNavUrl(42, -181)).toBeNull();
  });

  test("⑤ 4 države: vsaka postane svoj natančen destination", () => {
    expect(buildWebNavUrl(DUBROVNIK.lat, DUBROVNIK.lng)).toContain("42.640700,18.107700");
    expect(buildWebNavUrl(TIRANA.lat, TIRANA.lng)).toContain("41.327500,19.818700");
  });
});

// ---------------------------------------------------------------------------
// 3 — NADZOR goNavLinks (iskrena odsotnost brez geo)
// ---------------------------------------------------------------------------

describe("TASK 67: goNavLinks", () => {
  test("① postanek z geo → OBE povezavi (geo + web), koordinate se ujemata", () => {
    const links = goNavLinks({
      lat: BLED.lat,
      lng: BLED.lng,
      title: "Blejski grad",
    });
    expect(links).not.toBeNull();
    expect(links!.geo).toContain("geo:46.368300,14.112700");
    expect(links!.geo).toContain("(Blejski%20grad)");
    expect(links!.web).toContain("destination=46.368300,14.112700");
  });

  test("② BREZ geo (lat/lng undefined) → NULL — handoff preprosto NI", () => {
    expect(goNavLinks({ lat: undefined, lng: undefined, title: "X" })).toBeNull();
    expect(goNavLinks({ title: "X" })).toBeNull();
  });

  test("③ SAMO ena koordinata → null (polovična geo ni geo)", () => {
    expect(goNavLinks({ lat: BLED.lat, lng: undefined, title: "X" })).toBeNull();
    expect(goNavLinks({ lat: undefined, lng: BLED.lng, title: "X" })).toBeNull();
  });

  test("④ NaN koordinata → null (fail-closed skozi cel nadzor)", () => {
    expect(goNavLinks({ lat: Number.NaN, lng: 14, title: "X" })).toBeNull();
    expect(goNavLinks({ lat: 46, lng: Number.NaN, title: "X" })).toBeNull();
  });

  test("⑤ naslov postanka z nevarnimi znaki → geo q varen, web SAJEN iz koordinat", () => {
    const links = goNavLinks({
      lat: KOTOR.lat,
      lng: KOTOR.lng,
      title: "Kotor & Perast <staro mesto>",
    });
    expect(links).not.toBeNull();
    expect(links!.geo).not.toContain("&");
    expect(links!.geo).not.toContain("<");
    // Web URL nosi SAMO koordinate — napad v naslovu ne more priti noter:
    expect(links!.web).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=42.424700,18.771400"
    );
  });

  test("⑥ naslov je vedno prisoten pri TripEntry (title: string) — q label obstaja", () => {
    const e = mkEntry("bled", { lat: BLED.lat, lng: BLED.lng, title: "Blejsko jezero" });
    const links = goNavLinks(e);
    expect(links!.geo).toContain("(Blejsko%20jezero)");
  });
});

// ---------------------------------------------------------------------------
// 4 — ČISTA IZBIRA pickGoNavHref
// ---------------------------------------------------------------------------

describe("TASK 67: pickGoNavHref", () => {
  const links: GoNavLinks = {
    geo: "geo:46.368300,14.112700",
    web: "https://www.google.com/maps/dir/?api=1&destination=46.368300,14.112700",
  };

  test("① coarse (mobilni) → geo: URI (izbirnik aplikacij)", () => {
    expect(pickGoNavHref(links, true)).toBe(links.geo);
  });

  test("② fine (desktop) → web URL", () => {
    expect(pickGoNavHref(links, false)).toBe(links.web);
  });

  test("③ null povezave → null (ne izmišljujemo — ne pri true ne pri false)", () => {
    expect(pickGoNavHref(null, true)).toBeNull();
    expect(pickGoNavHref(null, false)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5 — OKOLJSKI isCoarsePointer (SSR / matchMedia)
// ---------------------------------------------------------------------------

describe("TASK 67: isCoarsePointer", () => {
  afterEach(() => {
    // Cleanup mock okolja (ne puščamo globalnega window v bun testu).
    delete (globalThis as Record<string, unknown>).window;
  });

  test("① brez window (SSR / bun server) → false (konzervativni web fallback)", () => {
    delete (globalThis as Record<string, unknown>).window;
    expect(isCoarsePointer()).toBe(false);
  });

  test("② matchMedia vrne matches:true → true (telefon/tablet)", () => {
    (globalThis as Record<string, unknown>).window = {
      matchMedia: (q: string) => ({ matches: q === "(pointer: coarse)" }),
    };
    expect(isCoarsePointer()).toBe(true);
  });

  test("③ matchMedia vrne matches:false → false (desktop)", () => {
    (globalThis as Record<string, unknown>).window = {
      matchMedia: () => ({ matches: false }),
    };
    expect(isCoarsePointer()).toBe(false);
  });

  test("④ matchMedia NI funkcija → false (ne podpira — ne eksplodira)", () => {
    (globalThis as Record<string, unknown>).window = { matchMedia: "ne-funkcija" };
    expect(isCoarsePointer()).toBe(false);
  });

  test("⑤ matchMeta vrže izjemo → false (fail-closed na web fallback)", () => {
    (globalThis as Record<string, unknown>).window = {
      matchMedia: () => {
        throw new Error("boom");
      },
    };
    expect(isCoarsePointer()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6 — OZNAKE SL/EN
// ---------------------------------------------------------------------------

describe("TASK 67: oznake", () => {
  test("① navigate + external v obeh jezikih", () => {
    expect(GO_NAV_LABELS.navigate.sl).toBe("Navigiraj");
    expect(GO_NAV_LABELS.navigate.en).toBe("Navigate");
    expect(GO_NAV_LABELS.external.sl).toContain("zunanjo");
    expect(GO_NAV_LABELS.external.en).toContain("external");
  });

  test("② navigateAria funkcija vključi NASLOV postanka (oba jezika)", () => {
    expect(GO_NAV_LABELS.navigateAria.sl("Blejski grad")).toContain("Blejski grad");
    expect(GO_NAV_LABELS.navigateAria.en("Bled Castle")).toContain("Bled Castle");
    expect(GO_NAV_LABELS.navigateAria.sl("X")).toContain("Navigiraj");
    expect(GO_NAV_LABELS.navigateAria.en("X")).toContain("Navigate");
  });
});

// ---------------------------------------------------------------------------
// 7 — CELA VERIGA: buildGoView → GoEntryCard → handoff (DI, 0 omrežja)
// ---------------------------------------------------------------------------

describe("TASK 67: veriga journey → Go Mode → navigacijski handoff", () => {
  test("① NASLEDNJI postanek z geo → povezavi handoffa z NJEGOVIMI koordinatami", () => {
    const trip = mkTrip([
      {
        date: "2026-09-20",
        dateLabel: { sl: "20. september", en: "20 September" },
        entries: [
          mkEntry("grad", {
            title: "Blejski grad",
            lat: BLED.lat,
            lng: BLED.lng,
            time: { start: "11:00" },
          }),
        ],
      },
    ]);
    const view = buildGoView(trip, NOW, null, {});
    expect(view.next).toBeDefined();
    const links = goNavLinks(view.next!.entry);
    expect(links).not.toBeNull();
    expect(links!.geo).toContain("geo:46.368300,14.112700?q=46.368300,14.112700(Blejski%20grad)");
    expect(links!.web).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=46.368300,14.112700"
    );
    // Izbira skozi isto verigo:
    expect(pickGoNavHref(links, true)).toBe(links!.geo);
    expect(pickGoNavHref(links, false)).toBe(links!.web);
  });

  test("② postanek BREZ geo → handoff NI (iskrena odsotnost — kot razdalja)", () => {
    const trip = mkTrip([
      {
        date: "2026-09-20",
        dateLabel: { sl: "20. september", en: "20 September" },
        entries: [mkEntry("brez-geo", { title: "Samo ime, brez koordinat" })],
      },
    ]);
    const view = buildGoView(trip, NOW, null, {});
    const links = goNavLinks(view.next!.entry);
    expect(links).toBeNull();
    expect(pickGoNavHref(links, true)).toBeNull();
    expect(pickGoNavHref(links, false)).toBeNull();
  });

  test("③ remaining postanki: vsak s svojo geo dobi svoj handoff (4 države v enem dnevu)", () => {
    const trip = mkTrip([
      {
        date: "2026-09-20",
        dateLabel: { sl: "20. september", en: "20 September" },
        entries: [
          mkEntry("si", { title: "Bled", lat: BLED.lat, lng: BLED.lng, time: { start: "09:00" } }),
          mkEntry("hr", { title: "Dubrovnik", lat: DUBROVNIK.lat, lng: DUBROVNIK.lng }),
          mkEntry("me", { title: "Kotor", lat: KOTOR.lat, lng: KOTOR.lng }),
          mkEntry("al", { title: "Tirana", lat: TIRANA.lat, lng: TIRANA.lng }),
        ],
      },
    ]);
    const view = buildGoView(trip, NOW, null, {});
    const all = [view.next!, ...view.remaining].map((c) => goNavLinks(c.entry));
    expect(all).toHaveLength(4);
    expect(all.every((l) => l != null)).toBe(true);
    expect(all[0]!.web).toContain("destination=46.368300");
    expect(all[1]!.web).toContain("destination=42.640700");
    expect(all[2]!.web).toContain("destination=42.424700");
    expect(all[3]!.web).toContain("destination=41.327500");
  });

  test("④ opravljeni postanki ostanejo z geo (handoff še vedno mogoč — vrnitev/ponovni obisk)", () => {
    const trip = mkTrip([
      {
        date: "2026-09-20",
        dateLabel: { sl: "20. september", en: "20 September" },
        entries: [
          mkEntry("grad", { title: "Blejski grad", lat: BLED.lat, lng: BLED.lng }),
          mkEntry("jezero", { title: "Blejsko jezero", lat: 46.3728, lng: 14.1017 }),
        ],
      },
    ]);
    const view = buildGoView(trip, NOW, null, { grad: "2026-09-20T08:30:00.000Z" });
    expect(view.done).toHaveLength(1);
    const links = goNavLinks(view.done[0].entry);
    expect(links).not.toBeNull();
    expect(links!.geo).toContain("(Blejski%20grad)");
  });
});
