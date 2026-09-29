import { describe, expect, test } from "bun:test";
import {
  GMAPS_MAX_STOPS,
  gmapsDayUrl,
} from "@/lib/gmaps-day-export";
import type { DayPlan, LocationVisit } from "@/lib/types";

// ============================================================================
// W11-A „DAN V ŽEPU" — pogodbe izvoza dneva v Google Maps navigacijsko
// povezavo (1.141.0). Testira: T1 razreševanje, lastne koordinate, null
// island, prag 2 postankov, waypoints format (%7C), zdravo mejo 11.
// ============================================================================

/** Delni LocationVisit (ostala polja so za URL nebistvena). */
function visit(
  destination_id: string,
  lat?: number,
  lng?: number
): LocationVisit {
  return {
    destination_id,
    destination_name: destination_id,
    time_slot: "jutro",
    duration: 60,
    estimated_cost: 10,
    notes: "",
    ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
  };
}

/** T1 ID, ki sigurno obstaja v datasetu (Ljubljana). */
function t1Lj(): LocationVisit {
  return visit("ljubljana");
}

describe("gmapsDayUrl — prag veljavnosti", () => {
  test("0 postankov → null (ni česa navigirati)", () => {
    const r = gmapsDayUrl({ locations: [] });
    expect(r.url).toBeNull();
    expect(r.stops).toBe(0);
    expect(r.truncated).toBe(false);
  });

  test("1 postanek → null (Google Maps za eno točko ne sestavi poti)", () => {
    const r = gmapsDayUrl({ locations: [t1Lj()] });
    expect(r.url).toBeNull();
    expect(r.stops).toBe(0);
  });

  test("2 znana postanka → origin + destination, BREZ waypoints", () => {
    const r = gmapsDayUrl({ locations: [t1Lj(), visit("bled")] });
    expect(r.url).not.toBeNull();
    expect(r.url).toContain("maps/dir/?api=1");
    expect(r.url).toMatch(/origin=-?\d+\.\d+,-?\d+\.\d+/);
    expect(r.url).toMatch(/destination=-?\d+\.\d+,-?\d+\.\d+/);
    expect(r.url).not.toContain("waypoints=");
    expect(r.stops).toBe(2);
    expect(r.skipped).toBe(0);
  });
});

describe("gmapsDayUrl — viri koordinat", () => {
  test("T1 dataset razreši koordinate brez lastnih lat/lng", () => {
    const r = gmapsDayUrl({ locations: [t1Lj(), visit("bled")] });
    // Bled ni na (0,0) in Ljubljana ni na (0,0) — T1 je dal realne vrednosti
    expect(r.url).not.toBeNull();
    expect(r.skipped).toBe(0);
  });

  test("lastne koordinate (supply/klepet postanki) delujejo brez T1", () => {
    const r = gmapsDayUrl({
      locations: [
        visit("osm-node-123", 46.051, 14.506),
        visit("osm-node-456", 46.368, 14.106),
      ],
    });
    expect(r.url).toContain("origin=46.051000,14.506000");
    expect(r.url).toContain("destination=46.368000,14.106000");
  });

  test("null island (0,0) je iskreno preskočen — ne absurdna pot", () => {
    const r = gmapsDayUrl({
      locations: [
        t1Lj(),
        visit("bad-ai-echo", 0, 0),
        visit("bled"),
      ],
    });
    expect(r.url).not.toBeNull();
    expect(r.skipped).toBe(1);
    expect(r.url).not.toContain("0.000000,0.000000");
  });

  test("samo 1 veljavna koordinata med več → null (ni poti)", () => {
    const r = gmapsDayUrl({
      locations: [t1Lj(), visit("neznan-id")],
    });
    expect(r.url).toBeNull();
    expect(r.skipped).toBe(1);
  });
});

describe("gmapsDayUrl — format waypoints", () => {
  test("3 postanki → 1 waypoint, %7C ločen (uradni Maps URLs API)", () => {
    const r = gmapsDayUrl({
      locations: [t1Lj(), visit("bled"), visit("bohinj")],
    });
    expect(r.url).toContain("waypoints=");
    // natanko 1 waypoint → brez ločila
    expect(r.url).not.toContain("%7C");
    expect(r.stops).toBe(3);
  });

  test("4 postanki → 2 waypoints ločena z %7C", () => {
    const r = gmapsDayUrl({
      locations: [
        visit("osm-a", 46.0, 14.5),
        visit("osm-b", 46.1, 14.5),
        visit("osm-c", 46.2, 14.5),
        visit("osm-d", 46.3, 14.5),
      ],
    });
    expect(r.url).toContain("waypoints=46.100000,14.500000%7C46.200000,14.500000");
    expect(r.stops).toBe(4);
  });

  test("fiksno 6 decimalk (toFixed) — brez znanstvene notacije", () => {
    const r = gmapsDayUrl({
      locations: [
        visit("osm-a", 46.056947, 14.505751),
        visit("osm-b", 46.368327, 14.106577),
      ],
    });
    expect(r.url).toContain("origin=46.056947,14.505751");
    expect(r.url).not.toContain("e-");
  });
});

describe("gmapsDayUrl — zdrava meja (Google Maps URL API: max 9 vmesnih)", () => {
  test("več kot GMAPS_MAX_STOPS postankov → prvih 10 + zadnji, truncated", () => {
    const locations = Array.from({ length: 15 }, (_, i) =>
      visit(`osm-${i}`, 46.0 + i * 0.01, 14.5)
    );
    const r = gmapsDayUrl({ locations });
    expect(r.truncated).toBe(true);
    expect(r.stops).toBe(GMAPS_MAX_STOPS);
    // zadnji postanek (index 14 → 46.14) MORA ostati cilj („kje končam dan")
    expect(r.url).toContain("destination=46.140000,14.500000");
    // origin je prvi postanek
    expect(r.url).toContain("origin=46.000000,14.500000");
    // izrezani sredinski (index 10..13 → 46.10..46.13) NE sme biti waypoint
    expect(r.url).not.toContain("46.130000,14.500000");
  });

  test("natanko GMAPS_MAX_STOPS → brez krajšanja", () => {
    const locations = Array.from({ length: GMAPS_MAX_STOPS }, (_, i) =>
      visit(`osm-${i}`, 46.0 + i * 0.01, 14.5)
    );
    const r = gmapsDayUrl({ locations });
    expect(r.truncated).toBe(false);
    expect(r.stops).toBe(GMAPS_MAX_STOPS);
  });
});

describe("gmapsDayUrl — DayPlan kompatibilnost", () => {
  test("sprejme poln DayPlan (Pick tip) brez runtime napake", () => {
    const day = {
      day: 1,
      locations: [t1Lj(), visit("bled")],
    } as unknown as DayPlan;
    const r = gmapsDayUrl(day);
    expect(r.url).not.toBeNull();
  });
});
