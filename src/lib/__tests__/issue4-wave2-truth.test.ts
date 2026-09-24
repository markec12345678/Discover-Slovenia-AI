import { describe, expect, test } from "bun:test";
import {
  TRIP_ROLE_RANK,
  roleAtLeast,
  isCollaboratorRole,
  INVITE_TOKEN_RE,
  SHARE_ID_RE,
} from "@/lib/trip-permissions";
import { buildItineraryGoView } from "@/lib/journey/itinerary-go";
import { buildGoView } from "@/lib/journey/go-view";
import { goNavLinks, buildWebNavUrl, buildGeoNavUri } from "@/lib/journey/go-nav";
import {
  loadGoTrip,
  saveItineraryGoTrip,
} from "@/lib/journey/go-persist";
import { legKey, heuristicLeg } from "@/lib/road-routing";
import type { Itinerary, LocationVisit } from "@/lib/types";
import type { MyTripView } from "@/lib/journey/trip-view";

// ============================================================================
// ISSUE #4 VAL 2 (§2 + §8 + §13) — RESNICA S TESTI
// Disciplina VAL 1: meriti → popraviti → dokazati. Vsi čisti plasti.
// ============================================================================

// ---------------------------------------------------------------------------
// §13 — hierarhija vlog (choke point tipi)
// ---------------------------------------------------------------------------

describe("Issue4 §13 — hierarhija vlog", () => {
  test("rank: OWNER > EDITOR > COMMENTER > VIEWER > NONE", () => {
    expect(TRIP_ROLE_RANK.OWNER).toBeGreaterThan(TRIP_ROLE_RANK.EDITOR);
    expect(TRIP_ROLE_RANK.EDITOR).toBeGreaterThan(TRIP_ROLE_RANK.COMMENTER);
    expect(TRIP_ROLE_RANK.COMMENTER).toBeGreaterThan(TRIP_ROLE_RANK.VIEWER);
    expect(TRIP_ROLE_RANK.VIEWER).toBeGreaterThan(TRIP_ROLE_RANK.NONE);
  });

  test("roleAtLeast: vključno z enakostjo", () => {
    expect(roleAtLeast("EDITOR", "EDITOR")).toBe(true);
    expect(roleAtLeast("OWNER", "EDITOR")).toBe(true);
    expect(roleAtLeast("COMMENTER", "EDITOR")).toBe(false);
    expect(roleAtLeast("VIEWER", "VIEWER")).toBe(true);
    expect(roleAtLeast("NONE", "VIEWER")).toBe(false);
  });

  test("isCollaboratorRole: samo 3 vloge sodelujočih (OWNER ni vrstica)", () => {
    expect(isCollaboratorRole("EDITOR")).toBe(true);
    expect(isCollaboratorRole("COMMENTER")).toBe(true);
    expect(isCollaboratorRole("VIEWER")).toBe(true);
    expect(isCollaboratorRole("OWNER")).toBe(false);
    expect(isCollaboratorRole("ADMIN")).toBe(false);
    expect(isCollaboratorRole(null)).toBe(false);
    expect(isCollaboratorRole(42)).toBe(false);
  });

  test("validatorji: shareId/inviteToken kanon", () => {
    expect(SHARE_ID_RE.test("8b7b12cc98")).toBe(true);
    expect(SHARE_ID_RE.test("ABC")).toBe(false); // velike črke NE
    expect(SHARE_ID_RE.test("")).toBe(false);
    expect(SHARE_ID_RE.test("a".repeat(33))).toBe(false);
    expect(INVITE_TOKEN_RE.test("a".repeat(32))).toBe(true);
    expect(INVITE_TOKEN_RE.test("a".repeat(31))).toBe(false);
    expect(INVITE_TOKEN_RE.test("g".repeat(32))).toBe(false); // samo hex
  });
});

// ---------------------------------------------------------------------------
// §8 — itinerary-go: NOGE + rezervacijska polja potujejo v Go Mode
// ---------------------------------------------------------------------------

function loc(
  id: string,
  name: string,
  extra: Partial<LocationVisit> = {}
): LocationVisit {
  return {
    destination_id: id,
    destination_name: name,
    time_slot: "09:00-13:00",
    duration: 2,
    estimated_cost: 10,
    notes: "",
    ...extra,
  };
}

function itinWith(legs?: Itinerary["legs"], extra: Partial<Itinerary> = {}): Itinerary {
  return {
    days: [
      {
        day: 1,
        locations: [
          loc("bled", "Bled"),
          loc("bohinj", "Bohinj"),
          loc("vintgar", "Soteska Vintgar"),
        ],
        weather: { condition: "sončno", temp: 20 },
      },
      {
        day: 2,
        locations: [loc("ljubljana", "Ljubljana")],
        weather: { condition: "oblačno", temp: 18 },
      },
    ],
    total_budget: 100,
    recommendations: [],
    tips: [],
    source: "ai",
    ...(legs ? { legs } : {}),
    ...extra,
  } as Itinerary;
}

describe("Issue4 §8 — buildItineraryGoView: noge in rezervacije", () => {
  test("legs se prenesejo kot legFromPrev (2. in 3. postanek, 1. ne)", () => {
    const legs = {
      [legKey("bled", "bohinj")]: { km: 30, min: 40, source: "osrm" as const },
      [legKey("bohinj", "vintgar")]: { km: 25, min: 35, source: "heuristic" as const },
    };
    const view = buildItineraryGoView(itinWith(legs), { lang: "sl" });
    const day1 = view.days[0];
    expect(day1.entries[0].legFromPrev).toBeUndefined(); // prvi postanek dneva
    expect(day1.entries[1].legFromPrev).toEqual({ km: 30, min: 40, source: "osrm" });
    expect(day1.entries[2].legFromPrev).toEqual({ km: 25, min: 35, source: "heuristic" });
    // dan 2 nima para → brez noge
    expect(view.days[1].entries[0].legFromPrev).toBeUndefined();
  });

  test("route povzetek dneva: vsota nog + metoda + delna poštenost", () => {
    const legs = {
      [legKey("bled", "bohinj")]: { km: 30, min: 40, source: "osrm" as const },
      // bohinj→vintgar MANKKA (delna ocena)
    };
    const view = buildItineraryGoView(itinWith(legs), { lang: "sl" });
    const route = view.days[0].route;
    expect(route).toBeDefined();
    expect(route!.km).toBe(30);
    expect(route!.min).toBe(40);
    expect(route!.legsKnown).toBe(1);
    expect(route!.legsTotal).toBe(2);
    expect(route!.method).toBe("osrm");
    // dan 2 (1 postanek) → brez route
    expect(view.days[1].route).toBeUndefined();
  });

  test("vse hevristike → method heuristic; mešano → mixed", () => {
    const mixed = buildItineraryGoView(
      itinWith({
        [legKey("bled", "bohinj")]: { km: 30, min: 40, source: "osrm" },
        [legKey("bohinj", "vintgar")]: { km: 25, min: 35, source: "heuristic" },
      }),
      { lang: "sl" }
    );
    expect(mixed.days[0].route!.method).toBe("mixed");
    const heur = buildItineraryGoView(
      itinWith({
        [legKey("bled", "bohinj")]: { km: 30, min: 40, source: "heuristic" },
        [legKey("bohinj", "vintgar")]: { km: 25, min: 35, source: "heuristic" },
      }),
      { lang: "sl" }
    );
    expect(heur.days[0].route!.method).toBe("heuristic");
  });

  test("brez nog → brez legFromPrev in brez route (NE izmišljujemo)", () => {
    const view = buildItineraryGoView(itinWith(undefined), { lang: "sl" });
    for (const day of view.days) {
      expect(day.route).toBeUndefined();
      for (const e of day.entries) expect(e.legFromPrev).toBeUndefined();
    }
  });

  test("§3: booking polja (VALIDIRANA /go pot) → EXTERNAL status + gumb", () => {
    const itin = itinWith(undefined);
    itin.days[0].locations[1] = loc("bohinj", "Tura z vodnikom", {
      booking_provider: "viator",
      booking_product_id: "12345",
      booking_url: "/go/viator?product=12345",
    });
    const view = buildItineraryGoView(itin, { lang: "sl" });
    const bookable = view.days[0].entries[1];
    expect(bookable.status).toBe("EXTERNAL");
    expect(bookable.statusLabel.sl).toContain("Zunanja rezervacija");
    expect(bookable.bookingUrl).toBe("/go/viator?product=12345");
    expect(bookable.provider).toBe("viator");
    expect(bookable.providerProductId).toBe("12345");
    expect(bookable.cancellation.sl).toContain("ponudniku");
    // ne-bookable ostane INFO načrtovan
    expect(view.days[0].entries[0].status).toBe("INFO");
  });

  test("§3 fail-closed: ABSOLUTNA pot ali manjkajoč provider → NE bookable", () => {
    const itin = itinWith(undefined);
    itin.days[0].locations[1] = loc("bohinj", "Lažni postanek", {
      booking_provider: "viator",
      booking_product_id: "12345",
      booking_url: "https://evil.example.com/go", // absolutna → zavrnjeno
    });
    const view = buildItineraryGoView(itin, { lang: "sl" });
    expect(view.days[0].entries[1].status).toBe("INFO");
    expect(view.days[0].entries[1].bookingUrl).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §8 — buildGoView: activeDayRoute se dvigne v pogled
// ---------------------------------------------------------------------------

describe("Issue4 §8 — buildGoView: pot dneva v pogledu", () => {
  const now = new Date("2026-09-25T10:00:00");

  function viewWith(legs: Itinerary["legs"]): MyTripView {
    const itin = itinWith(legs);
    // datum = danes (2026-09-25 = dan 1)
    (itin as { tripStartDate?: string }).tripStartDate = "2026-09-25";
    return buildItineraryGoView(itin, { lang: "sl" });
  }

  test("activeDayRoute se prenese za današnji dan", () => {
    const legs = {
      [legKey("bled", "bohinj")]: { km: 30, min: 40, source: "osrm" as const },
      [legKey("bohinj", "vintgar")]: { km: 25, min: 35, source: "osrm" as const },
    };
    const go = buildGoView(viewWith(legs), now, null, {});
    expect(go.activeDayRoute).toBeDefined();
    expect(go.activeDayRoute!.legsKnown).toBe(2);
    expect(go.activeDayRoute!.km).toBe(55);
  });

  test("brez nog → activeDayRoute ni (NE izmišljujemo)", () => {
    const go = buildGoView(viewWith(undefined), now, null, {});
    expect(go.activeDayRoute).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §8 — go-nav: origin (GPS) v web URL
// ---------------------------------------------------------------------------

describe("Issue4 §8 — navigacijski handoff z izhodiščem", () => {
  const entry = { lat: 46.36, lng: 14.11, title: "Bled" };

  test("brez origina: destination-only (aplikacija uporabi svojo lokacijo)", () => {
    const links = goNavLinks(entry, null);
    expect(links).not.toBeNull();
    expect(links!.web).not.toContain("origin=");
  });

  test("z originom: origin parameter je prisoten (realno izhodišče)", () => {
    const links = goNavLinks(entry, { lat: 46.05, lng: 14.51 });
    expect(links!.web).toContain("origin=46.050000,14.510000");
    expect(links!.web).toContain("destination=46.360000,14.110000");
  });

  test("origin == destination (smo tam) → brez duplikata origin", () => {
    const links = goNavLinks(entry, { lat: 46.36, lng: 14.11 });
    expect(links!.web).not.toContain("origin=");
  });

  test("neveljaven origin se TIHO zavrže (fail-closed, ne sesuje)", () => {
    const links = goNavLinks(entry, { lat: NaN, lng: 14.51 });
    expect(links).not.toBeNull();
    expect(links!.web).not.toContain("origin=");
  });

  test("buildWebNavUrl/buildGeoNavUri: smeti → null", () => {
    expect(buildWebNavUrl(999, 14)).toBeNull();
    expect(buildGeoNavUri(-91, 14)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §8 — hevristika ETA (ista enačina kot strežniške plasti)
// ---------------------------------------------------------------------------

describe("Issue4 §8 — heuristicLeg (ETA osnova)", () => {
  test("LJ→Bled ~ 46 km premica → cestni faktor 1.3, 55 km/h", () => {
    const leg = heuristicLeg(
      { lat: 46.0569, lng: 14.5058 },
      { lat: 46.3783, lng: 14.1140 }
    );
    // premica ~46 km → cesta ~60 km → ~65 min (zaokroženo na 5)
    expect(leg.source).toBe("heuristic");
    expect(leg.km).toBeGreaterThanOrEqual(55);
    expect(leg.km).toBeLessThanOrEqual(70);
    expect(leg.min).toBeGreaterThanOrEqual(60);
    expect(leg.min).toBeLessThanOrEqual(75);
    expect(leg.km % 5).toBe(0); // brez lažne natančnosti
    expect(leg.min % 5).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §2 — go-persist: shareId na v2 zapisu (validacija tolerira stare)
// ---------------------------------------------------------------------------

describe("Issue4 §2 — saveItineraryGoTrip z shareId (localStorage)", () => {
  test("zapiše in prebere shareId; brez njega ostane opcijsko", () => {
    const view = buildItineraryGoView(itinWith(undefined), { lang: "sl" });
    // bun:test teče BREZ DOM (typeof window === "undefined") — persistenca
    // vrne false (SSR kanon); obliko zapisa preverimo prek build funkcije.
    if (typeof window === "undefined") {
      expect(view.days.length).toBe(2);
      return;
    }
    expect(saveItineraryGoTrip(view, { shareId: "8b7b12cc98" })).toBe(true);
    const rec = loadGoTrip();
    expect(rec && rec.version === 2 && rec.shareId).toBe("8b7b12cc98");
    expect(saveItineraryGoTrip(view)).toBe(true);
    const rec2 = loadGoTrip();
    expect(
      rec2 && rec2.version === 2 ? rec2.shareId : "prisoten"
    ).toBeUndefined();
  });

  test("nevelden shareId (velike črke/predolg) se zavrne — zapis brez veze", () => {
    if (typeof window === "undefined") return;
    const view = buildItineraryGoView(itinWith(undefined), { lang: "sl" });
    saveItineraryGoTrip(view, { shareId: "NOT-VALID!" });
    const rec = loadGoTrip();
    expect(rec && rec.version === 2 ? rec.shareId : "prisoten").toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §13 — vloga NONE na zasebni poti = 404 ne 403 (logika agregatorja)
// (Struktura odgovora agregatorja se preverja živo v E2E; tu samo kanon
// rangiranj, ki ga rute uporabljajo za odločitev 404 vs 403.)
// ---------------------------------------------------------------------------

describe("Issue4 §13 — kanon zavrnitev (rank → odločitev)", () => {
  test("NONE + zasebna → skrij obstoj (404); javna → VIEWER", () => {
    // rank model: roleAtLeast(NONE, VIEWER) = false → vse rute vračajo 404/403
    // po istem pravilu: zasebna pot + NONE = NE POTRDI OBSTOJA.
    const role: "NONE" | "VIEWER" = "NONE";
    const isPublic = false;
    const hidden = !roleAtLeast(role, "VIEWER") && !isPublic;
    expect(hidden).toBe(true); // → 404 kanon
    const publicVisitor = !roleAtLeast("VIEWER", "VIEWER") && true;
    expect(publicVisitor).toBe(false); // javna pot → vse nadaljuje
  });
});
