// ============================================================================
// TASK 47 — TESTI: STREŽNIŠKA REVALIDACIJA AI SUPPLY REFERENC
// (§7/§12/§15/§17 — price/availability/provider-ID integriteta)
// ============================================================================
// AI izhod nikoli ni zaupan: vsak supply sklic mora obstajati v znanem
// kanonskem supplyju (uporabnikove izbire ∪ strežni kontekst). Neznan →
// DROP (nikoli silent). Znan → REBIND (cena/geo/notes iz supply sloja).
// ============================================================================

import { describe, expect, test } from "bun:test";
import {
  buildKnownSupplyIndex,
  revalidateSupplyStops,
  isSupplyRef,
  canonicalSupplyNotes,
  type KnownSupplyEntry,
} from "@/lib/supply/itinerary-supply-validation";
import { toAiSupplyContextSafe } from "./task47-test-helpers";
import type { Itinerary, LocationVisit } from "@/lib/types";
import type { SelectedProviderProduct } from "@/lib/supply/types";

// ---------------------------------------------------------------------------
// Gradnice
// ---------------------------------------------------------------------------

const ktEntry: KnownSupplyEntry = {
  provider: "kiwitaxi",
  providerProductId: "49540",
  title: "Ljubljana Train Station → Bled",
  type: "transfer",
  lat: 46.05845,
  lng: 14.51269,
  price: { amount: 51, currency: "EUR", unit: "per_transfer", fromPrice: true },
  availability: { status: "not_supported" },
  source: "KiwiTaxi Partner Data API (CSV)",
  bookingMode: "affiliate_redirect",
  selectionState: "fixed",
};

const gygEntry: KnownSupplyEntry = {
  provider: "getyourguide",
  providerProductId: "66985",
  title: "Ljubljana: Castle Ticket",
  type: "activity",
  lat: 46.0489,
  lng: 14.5058,
  price: { amount: 29, currency: "EUR", unit: "per_person", fromPrice: true },
  availability: { status: "unknown" },
  source: "GetYourGuide Partner API",
  bookingMode: "affiliate_redirect",
  selectionState: "suggested",
};

function knownIndex(entries: KnownSupplyEntry[]): Map<string, KnownSupplyEntry> {
  return new Map(entries.map((e) => [`${e.provider}:${e.providerProductId}`, e]));
}

function stop(over: Partial<LocationVisit> = {}): LocationVisit {
  return {
    destination_id: "kiwitaxi:49540",
    destination_name: "AI izmišljen naslov",
    time_slot: "10:00-11:00",
    duration: 1,
    estimated_cost: 999,
    notes: "AI halucinirana opomba",
    ...over,
  };
}

function itinerary(locations: LocationVisit[], dayCount = 1): Itinerary {
  return {
    days: Array.from({ length: dayCount }, (_, i) => ({
      day: i + 1,
      locations: i === 0 ? locations : [],
      weather: { condition: "sončno", temp: 22 },
    })),
    total_budget: 500,
    recommendations: [],
    tips: [],
    source: "ai",
  };
}

// ---------------------------------------------------------------------------
// isSupplyRef — meja: kaj JE supply sklic
// ---------------------------------------------------------------------------

describe("TASK 47: isSupplyRef (meja supply sklica)", () => {
  test("registriran provider + id → supply sklic", () => {
    expect(isSupplyRef("kiwitaxi:49540")).toBe(true);
    expect(isSupplyRef("viator:227717P1")).toBe(true);
    expect(isSupplyRef("getyourguide:66985")).toBe(true);
    expect(isSupplyRef("osm:node-123")).toBe(true);
  });

  test("NEREgistriran provider → NI supply sklic (splošna sanitize pot)", () => {
    expect(isSupplyRef("fakeprovider:123")).toBe(false);
    expect(isSupplyRef("evil:456")).toBe(false);
  });

  test("T1 destinacije / chat OSM mesta / ostali formati → NEDOTIKNJENI", () => {
    expect(isSupplyRef("bled")).toBe(false);
    expect(isSupplyRef("ljubljana")).toBe(false);
    expect(isSupplyRef("osm-node-123")).toBe(false); // chat-dodano mesto (pomišljaj)
    expect(isSupplyRef("")).toBe(false);
    expect(isSupplyRef("kiwitaxi:")).toBe(false); // prazen id
    expect(isSupplyRef("KiwiTaxi:123")).toBe(false); // velike črke niso slug
    expect(isSupplyRef(":123")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §12-D SECURITY — drop halucinacij
// ---------------------------------------------------------------------------

describe("TASK 47 §12-D: security (drop haluciniranih supply referenc)", () => {
  test("neznan product ID (getyourguide:12345) → ODSTRANJEN + poročilo (nikoli silent)", () => {
    const it = itinerary([stop({ destination_id: "getyourguide:12345" })]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    expect(r.itinerary.days[0].locations.length).toBe(0);
    expect(r.dropped.length).toBe(1);
    expect(r.dropped[0].id).toBe("getyourguide:12345");
    expect(r.dropped[0].reason).toBe("unknown-supply-ref");
    expect(r.rebound).toBe(0);
  });

  test("neznan provider v sklicu (fake:123) → NI supply sklic → splošna pot (obstoječa)", () => {
    const it = itinerary([stop({ destination_id: "fake:123", destination_name: "Izmišljeni lokal" })]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    expect(r.itinerary.days[0].locations.length).toBe(1); // ni supply ref
    expect(r.dropped.length).toBe(0);
  });

  test("provider injection (getyourguide:123 OR 1=1) → drop (id ni v znanem supplyju)", () => {
    const it = itinerary([stop({ destination_id: "getyourguide:123 OR 1=1" })]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    expect(r.itinerary.days[0].locations.length).toBe(0);
    expect(r.dropped[0].id).toBe("getyourguide:123 OR 1=1");
  });

  test("OSM haluciniran node (osm:way-999) → drop (osm JE registriran, produkt pa ne poznan)", () => {
    const it = itinerary([stop({ destination_id: "osm:way-999" })]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    expect(r.itinerary.days[0].locations.length).toBe(0);
    expect(r.dropped[0].id).toBe("osm:way-999");
  });

  test("več halucinacij v različnih dneh → vse odstranjene, poročilo celotno", () => {
    const it = itinerary(
      [
        stop({ destination_id: "viator:FAKE1" }),
        stop({ destination_id: "kiwitaxi:49540" }),
      ],
      2
    );
    it.days[1].locations = [stop({ destination_id: "getyourguide:FAKE2" })];
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    expect(r.dropped.length).toBe(2);
    expect(r.itinerary.days[0].locations.length).toBe(1);
    expect(r.itinerary.days[1].locations.length).toBe(0);
  });

  test("prazen known supply → vsi supply sklici drop (brez kanona ni izhoda)", () => {
    const it = itinerary([stop()]);
    const r = revalidateSupplyStops(it, new Map(), "sl");
    expect(r.itinerary.days[0].locations.length).toBe(0);
    expect(r.dropped.length).toBe(1);
  });

  test("NIKOLI ne ustvari fallback produkta (drop = izpust, ne substitucija)", () => {
    const it = itinerary([stop({ destination_id: "getyourguide:12345" })]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    const flat = JSON.stringify(r.itinerary);
    expect(flat).not.toContain("getyourguide:12345");
    expect(r.itinerary.days[0].locations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §5/§12 — CENA (rebind na kanonsko, enota vedno v notes)
// ---------------------------------------------------------------------------

describe("TASK 47 §5: price integrity (rebind)", () => {
  test("AI fake cena €999 → REBIND na kanonskih €51 (per_transfer)", () => {
    const it = itinerary([stop({ estimated_cost: 999 })]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    const s = r.itinerary.days[0].locations[0];
    expect(r.rebound).toBe(1);
    expect(s.estimated_cost).toBe(51);
    expect(s.notes).toContain("od 51 € (per transfer)");
    expect(s.notes).not.toContain("999");
  });

  test("per_transfer NIKOLI ne postane per person (enota je del cene)", () => {
    const it = itinerary([stop()]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    expect(r.itinerary.days[0].locations[0].notes).toContain("(per transfer)");
    expect(r.itinerary.days[0].locations[0].notes).not.toContain("per person");
    expect(r.itinerary.days[0].locations[0].notes).not.toContain("na osebo");
  });

  test("per_person (GYG €29) → notes „od 29 € (per person)“ + cost 29", () => {
    const it = itinerary([stop({ destination_id: "getyourguide:66985" })]);
    const r = revalidateSupplyStops(it, knownIndex([gygEntry]), "sl");
    const s = r.itinerary.days[0].locations[0];
    expect(s.estimated_cost).toBe(29);
    expect(s.notes).toContain("od 29 € (per person)");
  });

  test("fromPrice:true NIKOLI ne postane potrjena cena („od“ ostane)", () => {
    const it = itinerary([stop()]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    expect(r.itinerary.days[0].locations[0].notes).toContain("od 51");
  });

  test("fromPrice:false → gola kanonska cena €X (enota) brez „od“", () => {
    const entry: KnownSupplyEntry = {
      ...ktEntry,
      price: { amount: 50, currency: "EUR", unit: "total" },
    };
    const it = itinerary([stop()]);
    const r = revalidateSupplyStops(it, knownIndex([entry]), "sl");
    expect(r.itinerary.days[0].locations[0].notes).toContain("cena: 50 € (total)");
  });

  test("brez cene → 0 (NIKOLI izmišljena) + brez cenovne vrstice", () => {
    const entry: KnownSupplyEntry = { ...ktEntry, price: undefined };
    const it = itinerary([stop({ estimated_cost: 77 })]);
    const r = revalidateSupplyStops(it, knownIndex([entry]), "sl");
    const s = r.itinerary.days[0].locations[0];
    expect(s.estimated_cost).toBe(0);
    expect(s.notes).not.toContain("cena:");
  });

  test("EN: from €51 (per transfer)", () => {
    const it = itinerary([stop()]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "en");
    expect(r.itinerary.days[0].locations[0].notes).toContain("price: from €51 (per transfer)");
  });

  test("per_night / per_day / per_vehicle enote preživijo kanonsko", () => {
    for (const unit of ["per_night", "per_day", "per_vehicle"] as const) {
      const entry: KnownSupplyEntry = {
        ...ktEntry,
        price: { amount: 80, currency: "EUR", unit, fromPrice: true },
      };
      const it = itinerary([stop()]);
      const r = revalidateSupplyStops(it, knownIndex([entry]), "sl");
      expect(r.itinerary.days[0].locations[0].notes).toContain(
        `cena: od 80 € (${unit.replace(/_/g, " ")})`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// §6/§15 — RAZPOLOŽLJIVOST (ločena od cene, negotovost ohranjena)
// ---------------------------------------------------------------------------

describe("TASK 47 §6/§15: availability integrity", () => {
  test("not_supported → „preveri pri ponudniku“ (KiwiTaxi CSV nima koncepta)", () => {
    const it = itinerary([stop()]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    expect(r.itinerary.days[0].locations[0].notes).toContain(
      "razpoložljivost: preveri pri ponudniku"
    );
  });

  test("unknown → „ni preverjena“ — NIKOLI „na voljo za tvoj datum“", () => {
    const it = itinerary([
      stop({
        destination_id: "getyourguide:66985",
        notes: "Transfer je na voljo za tvoj datum, rezerviraj zdaj!",
      }),
    ]);
    const r = revalidateSupplyStops(it, knownIndex([gygEntry]), "sl");
    const notes = r.itinerary.days[0].locations[0].notes;
    expect(notes).toContain("razpoložljivost: ni preverjena");
    expect(notes).not.toContain("na voljo za tvoj datum");
    expect(notes).not.toContain("rezerviraj zdaj");
  });

  test("EN unknown → „not verified“ — ne „available for your date“", () => {
    const it = itinerary([
      stop({
        destination_id: "getyourguide:66985",
        notes: "Available for your date!",
      }),
    ]);
    const r = revalidateSupplyStops(it, knownIndex([gygEntry]), "en");
    const notes = r.itinerary.days[0].locations[0].notes;
    expect(notes).toContain("availability: not verified");
    expect(notes).not.toContain("Available for your date");
  });

  test("live_available → „živo potrjena“ (edina izražljiva razpoložljivost)", () => {
    const entry: KnownSupplyEntry = { ...ktEntry, availability: { status: "live_available" } };
    const it = itinerary([stop()]);
    const r = revalidateSupplyStops(it, knownIndex([entry]), "sl");
    expect(r.itinerary.days[0].locations[0].notes).toContain("razpoložljivost: živo potrjena");
  });

  test("live_unavailable → „živo NI na voljo“", () => {
    const entry: KnownSupplyEntry = { ...ktEntry, availability: { status: "live_unavailable" } };
    const it = itinerary([stop()]);
    const r = revalidateSupplyStops(it, knownIndex([entry]), "sl");
    expect(r.itinerary.days[0].locations[0].notes).toContain("razpoložljivost: živo NI na voljo");
  });

  test("§15 dvojna: cena obstaja + razpoložljivost unknown → oboje iskreno", () => {
    const it = itinerary([stop({ destination_id: "getyourguide:66985" })]);
    const r = revalidateSupplyStops(it, knownIndex([gygEntry]), "sl");
    const notes = r.itinerary.days[0].locations[0].notes;
    expect(notes).toContain("od 29 € (per person)");
    expect(notes).toContain("razpoložljivost: ni preverjena");
  });

  test("§15 dvojna: cena obstaja + not_supported → „od €X“ + „preveri pri ponudniku“", () => {
    const it = itinerary([stop()]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    const notes = r.itinerary.days[0].locations[0].notes;
    expect(notes).toContain("od 51 € (per transfer)");
    expect(notes).toContain("razpoložljivost: preveri pri ponudniku");
    expect(notes).not.toContain("živo");
  });

  test("brez razpoložljivosti + LOKALNI vir (info_only) → brez vrstice (ne izmišljujemo)", () => {
    const entry: KnownSupplyEntry = {
      ...ktEntry,
      availability: undefined,
      bookingMode: "info_only",
      provider: "osm",
      providerProductId: "node-77",
    };
    const it = itinerary([stop({ destination_id: "osm:node-77" })]);
    const r = revalidateSupplyStops(it, knownIndex([entry]), "sl");
    expect(r.itinerary.days[0].locations[0].notes).not.toContain("razpoložljivost");
  });

  test("ODSOTNA razpoložljivost + KOMERCIALNI vir → izpeljana „preveri pri ponudniku“ (odsotno = not_supported)", () => {
    // Kanonska semantika: odsotno polje pomeni not_supported — pri komercialnem
    // viru (KiwiTaxi izbira po sanitize) to izpišemo iskreno, ne izpustimo.
    const entry: KnownSupplyEntry = { ...ktEntry, availability: undefined };
    const it = itinerary([stop()]);
    const r = revalidateSupplyStops(it, knownIndex([entry]), "sl");
    expect(r.itinerary.days[0].locations[0].notes).toContain(
      "razpoložljivost: preveri pri ponudniku"
    );
  });
});

// ---------------------------------------------------------------------------
// §7/§13 — PROVIDER-ID INTEGRITETA + PROVENANCE
// ---------------------------------------------------------------------------

describe("TASK 47 §7/§13: provider-ID integrity + provenance", () => {
  test("destination_id ostane NATANČNO provider:id (AI ga ne more spremeniti)", () => {
    const it = itinerary([stop()]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    expect(r.itinerary.days[0].locations[0].destination_id).toBe("kiwitaxi:49540");
  });

  test("destination_name → KANONSKI naslov (AI izmišljen naslov zamenjan)", () => {
    const it = itinerary([stop({ destination_name: "Popolnoma drug naslov" })]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    expect(r.itinerary.days[0].locations[0].destination_name).toBe(
      "Ljubljana Train Station → Bled"
    );
  });

  test("geo REBIND: AI premaknjen pin → kanonske koordinate", () => {
    const it = itinerary([stop({ lat: 1, lng: 2 })]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    const s = r.itinerary.days[0].locations[0];
    expect(s.lat).toBe(46.05845);
    expect(s.lng).toBe(14.51269);
  });

  test("AI halucinirane koordinate se POČISTIJO, ko kanonski vnos nima geo", () => {
    const entry: KnownSupplyEntry = { ...ktEntry, lat: undefined, lng: undefined };
    const it = itinerary([stop({ lat: 40, lng: 40 })]);
    const r = revalidateSupplyStops(it, knownIndex([entry]), "sl");
    const s = r.itinerary.days[0].locations[0];
    expect(s.lat).toBeUndefined();
    expect(s.lng).toBeUndefined();
  });

  test("notes nosijo VIR (provenance: KiwiTaxi Partner Data API (CSV))", () => {
    const it = itinerary([stop()]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    expect(r.itinerary.days[0].locations[0].notes).toContain(
      "vir: KiwiTaxi Partner Data API (CSV)"
    );
  });

  test("EN: source: GetYourGuide Partner API", () => {
    const it = itinerary([stop({ destination_id: "getyourguide:66985" })]);
    const r = revalidateSupplyStops(it, knownIndex([gygEntry]), "en");
    expect(r.itinerary.days[0].locations[0].notes).toContain(
      "source: GetYourGuide Partner API"
    );
  });

  test("category → „supply“ (prepoznavnost plasti)", () => {
    const it = itinerary([stop({ category: "attraction" })]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    expect(r.itinerary.days[0].locations[0].category).toBe("supply");
  });

  test("AI semantika se OHRANI: time_slot + duration ostaneta AI-jeva", () => {
    const it = itinerary([stop({ time_slot: "08:30-09:30", duration: 1.5 })]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    const s = r.itinerary.days[0].locations[0];
    expect(s.time_slot).toBe("08:30-09:30");
    expect(s.duration).toBe(1.5);
  });

  test("NE-supply postanki so NEDOTIKNJENI (T1 + chat OSM mesto)", () => {
    const it = itinerary([
      {
        destination_id: "bled",
        destination_name: "Bled",
        time_slot: "09:00-13:00",
        duration: 4,
        estimated_cost: 60,
        notes: "Jutranji obisk",
      },
      {
        destination_id: "osm-node-123",
        destination_name: "Chat dodano mesto",
        time_slot: "14:00-15:00",
        duration: 1,
        estimated_cost: 0,
        notes: "iz klepeta",
        lat: 46.1,
        lng: 14.6,
      },
    ]);
    const r = revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    expect(r.itinerary.days[0].locations.length).toBe(2);
    expect(r.itinerary.days[0].locations[0].notes).toBe("Jutranji obisk");
    expect(r.itinerary.days[0].locations[0].estimated_cost).toBe(60);
    expect(r.itinerary.days[0].locations[1].destination_id).toBe("osm-node-123");
    expect(r.rebound).toBe(0);
    expect(r.dropped.length).toBe(0);
  });

  test("ne-mutira vhodnega itinererja (čista funkcija)", () => {
    const it = itinerary([stop()]);
    const snapshot = JSON.stringify(it);
    revalidateSupplyStops(it, knownIndex([ktEntry]), "sl");
    expect(JSON.stringify(it)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// BUILD KNOWN INDEX — izbire ∪ kontekst
// ---------------------------------------------------------------------------

describe("TASK 47: buildKnownSupplyIndex (izbire ∪ strežni kontekst)", () => {
  test("uporabnikova izbira + strežni kontekst → skupni indeks po provider:id", () => {
    const selection: SelectedProviderProduct = {
      provider: "osm",
      providerProductId: "node-77",
      type: "museum",
      title: "Muzej na Bledu",
      lat: 46.37,
      lng: 14.12,
      source: "OpenStreetMap",
      selectionState: "fixed",
    };
    const context = toAiSupplyContextSafe();
    const index = buildKnownSupplyIndex([selection], context);
    expect(index.size).toBe(2);
    expect(index.has("osm:node-77")).toBe(true);
    expect(index.has("kiwitaxi:49540")).toBe(true);
  });

  test("PRIORITETA: ista referenca v izbiri IN kontekstu → izbira zmagá (cena uporabnika)", () => {
    const selection: SelectedProviderProduct = {
      provider: "kiwitaxi",
      providerProductId: "49540",
      type: "transfer",
      title: "Izbira uporabnika (naslov s seznama)",
      lat: 46.05845,
      lng: 14.51269,
      price: { amount: 55, currency: "EUR", unit: "per_transfer", fromPrice: true },
      source: "KiwiTaxi Partner Data API (CSV)",
      selectionState: "fixed",
    };
    const index = buildKnownSupplyIndex([selection], toAiSupplyContextSafe());
    const entry = index.get("kiwitaxi:49540")!;
    expect(entry.title).toBe("Izbira uporabnika (naslov s seznama)");
    expect(entry.price?.amount).toBe(55);
    expect(entry.selectionState).toBe("fixed");
  });

  test("prazni vhodi → prazen indeks (brez supplyja ni revalidacije)", () => {
    expect(buildKnownSupplyIndex([], []).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CANONICAL NOTES — enotska oblika
// ---------------------------------------------------------------------------

describe("TASK 47: canonicalSupplyNotes", () => {
  test("opis ≤ 120 znakov + cena + razpoložljivost + vir, ločeni s „ · “", () => {
    const entry: KnownSupplyEntry = {
      ...ktEntry,
      description: "x".repeat(300),
    };
    const notes = canonicalSupplyNotes(entry, "sl");
    const parts = notes.split(" · ");
    expect(parts[0].length).toBeLessThanOrEqual(120);
    expect(notes).toContain("cena: od 51 € (per transfer)");
    expect(notes).toContain("razpoložljivost: preveri pri ponudniku");
    expect(notes).toContain("vir: KiwiTaxi Partner Data API (CSV)");
  });
});
