// ============================================================================
// ISSUE #4 §5 — BOOKING PROVIDER LAYER: CAPABILITY MATRIX TESTI (1.96.0)
// ============================================================================
// Invariante iskrenosti (naročnik §5): „Vsak status mora biti preverljiv.
// Nikoli ne uporabljaj LIVE, če ni dejanskega live provider odgovora."
//
// Vsa pravila so IZPELJANA iz strojno berljivih virov (registry →
// production-matrix → affiliate/booking) — testi varujejo izpeljavo proti
// driftu in lažnim LIVE celicam.
// ============================================================================

import { describe, expect, it } from "bun:test";
import {
  bookingCapabilityMatrix,
  getBookingCapabilityRow,
  CAPABILITY_CELL_LABELS,
  CAPABILITY_COLUMN_LABELS,
  type BookingCapabilityRow,
} from "@/lib/supply/capability-matrix";
import { PROVIDER_REGISTRY } from "@/lib/supply/registry";
import {
  getProductionMatrixEntry,
  providerEnvAccess,
} from "@/lib/supply/production-matrix";

const ROWS = bookingCapabilityMatrix();
const bySlug = new Map<string, BookingCapabilityRow>(
  ROWS.map((r) => [r.slug, r])
);

describe("§5 capability matrika — struktura", () => {
  it("ima vrstico za vsak provider registra + manual (drift nemogoč)", () => {
    const registrySlugs = PROVIDER_REGISTRY.map((p) => p.slug);
    for (const slug of registrySlugs) {
      expect(bySlug.has(slug), `manjka vrstica za ${slug}`).toBe(true);
    }
    expect(bySlug.has("manual")).toBe(true);
    expect(ROWS.length).toBe(registrySlugs.length + 1);
  });

  it("ni podvojenih vrstic", () => {
    expect(new Set(ROWS.map((r) => r.slug)).size).toBe(ROWS.length);
  });

  it("celice so iz dovoljenega nabora (tip je prevajan)", () => {
    const allowed = new Set(Object.keys(CAPABILITY_CELL_LABELS));
    const columns = [
      "discovery",
      "affiliate",
      "apiSearch",
      "quote",
      "booking",
      "cancellation",
      "webhook",
      "refund",
      "e2e",
    ] as const;
    for (const row of ROWS) {
      for (const col of columns) {
        expect(allowed.has(row[col])).toBe(true);
      }
    }
  });

  it("vsi stolpci naročnika §5 imajo dvojezične naslove", () => {
    const expected = [
      "provider",
      "discovery",
      "affiliate",
      "apiSearch",
      "quote",
      "booking",
      "cancellation",
      "webhook",
      "refund",
      "credentials",
      "e2e",
    ] as const;
    expect(Object.keys(CAPABILITY_COLUMN_LABELS).sort()).toEqual(
      [...expected].sort()
    );
    for (const v of Object.values(CAPABILITY_COLUMN_LABELS)) {
      expect(v.sl.length).toBeGreaterThan(0);
      expect(v.en.length).toBeGreaterThan(0);
    }
  });
});

describe("§5 capability matrika — PRAVILO LIVE (nikoli brez živega odgovora)", () => {
  it("quote LIVE ⟺ price === LIVE_PRICE v produkciji matriki", () => {
    for (const row of ROWS) {
      const m = getProductionMatrixEntry(row.slug);
      if (!m) continue;
      if (row.quote === "LIVE") {
        expect(m.price, `${row.slug}: LIVE citat a cena ${m.price}`).toBe(
          "LIVE_PRICE"
        );
      }
      if (m.price !== "LIVE_PRICE" && row.slug !== "manual") {
        expect(row.quote).not.toBe("LIVE");
      }
    }
  });

  it("NIČEN provider nima živega citata danes (0 LIVE_PRICE v matriki)", () => {
    const liveQuotes = ROWS.filter((r) => r.quote === "LIVE");
    expect(liveQuotes.map((r) => r.slug)).toEqual([]);
  });

  it("affiliate LIVE samo za komercialne vir z affiliate zmožnostjo registra", () => {
    for (const row of ROWS) {
      const reg = PROVIDER_REGISTRY.find((p) => p.slug === row.slug);
      if (!reg) continue; // manual
      if (row.affiliate === "LIVE") {
        expect(
          reg.capabilities.affiliate,
          `${row.slug}: affiliate LIVE a register pravi ne`
        ).toBe(true);
        expect(reg.group).toBe("commercial");
      }
    }
    // lokalni odprti viri NIKOLI affiliate
    for (const slug of ["osm", "fsq", "sto"]) {
      expect(bySlug.get(slug)?.affiliate).toBe("NOT_SUPPORTED");
    }
  });

  it("booking USER_ATTESTED samo kjer je rezervacija dejansko uporabnikova izjava", () => {
    for (const row of ROWS) {
      if (row.booking === "USER_ATTESTED") {
        const m = getProductionMatrixEntry(row.slug);
        // affiliate_redirect (pri ponudniku) ali manual — NIKOLI own/info
        expect(
          row.slug === "manual" || m?.cta === "affiliate_redirect",
          `${row.slug}: USER_ATTESTED a cta=${m?.cta}`
        ).toBe(true);
      }
    }
  });

  it("cancellation/webhook/refund: NIČELA živih (0 provider API kanalov)", () => {
    for (const col of ["cancellation", "webhook", "refund"] as const) {
      const live = ROWS.filter((r) => r[col] === "LIVE");
      expect(live, `${col}: nepričakovani LIVE`).toEqual([]);
    }
  });

  it("e2e LIVE samo za izvedene browser dokaze (osm/fsq/kiwitaxi/viator + manual uvoz)", () => {
    const proven = new Set(["osm", "fsq", "kiwitaxi", "viator", "manual"]);
    for (const row of ROWS) {
      if (row.e2e === "LIVE") {
        expect(proven.has(row.slug)).toBe(true);
      }
    }
    // ostali iskreno NOT_RUN (manual ima val 3 E2E dokaz uvoza)
    for (const row of ROWS) {
      if (!proven.has(row.slug)) {
        expect(row.e2e).toBe("NOT_RUN");
      }
    }
  });
});

describe("§5 capability matrika — izpeljava iz virov", () => {
  it("credentials so enake providerEnvAccess (Boolean, imena brez vrednosti)", () => {
    for (const row of ROWS) {
      const env = providerEnvAccess(row.slug);
      expect(row.credentials.productionConfigured).toBe(
        env.productionConfigured
      );
      const expected = [...env.affiliate, ...env.api]
        .filter((c) => !c.present)
        .map((c) => c.envVar);
      expect(row.credentials.missingEnvVars).toEqual(expected);
    }
  });

  it("manual vrstica: uporabnikova izjava, nikoli vir", () => {
    const manual = bySlug.get("manual");
    expect(manual).toBeDefined();
    expect(manual?.discovery).toBe("NOT_APPLICABLE");
    expect(manual?.apiSearch).toBe("NOT_APPLICABLE");
    expect(manual?.affiliate).toBe("NOT_APPLICABLE");
    expect(manual?.booking).toBe("USER_ATTESTED");
    expect(manual?.webhook).toBe("NOT_APPLICABLE");
    expect(manual?.credentials).toEqual({
      productionConfigured: false,
      missingEnvVars: [],
    });
  });

  it("getBookingCapabilityRow najde posamezno vrstico", () => {
    expect(getBookingCapabilityRow("kiwitaxi")?.discovery).toBe("LIVE");
    expect(getBookingCapabilityRow("ne-obstaja")).toBeUndefined();
  });

  it("osm/fsq: odkrivanje živo, brez komercialnih stolpcev", () => {
    for (const slug of ["osm", "fsq"]) {
      const row = bySlug.get(slug);
      expect(row?.discovery).toBe("LIVE");
      expect(row?.apiSearch).toBe("LIVE");
      expect(row?.booking).toBe("NOT_SUPPORTED");
      expect(row?.cancellation).toBe("NOT_SUPPORTED");
    }
  });

  it("own: rezervacija kodirana (Stripe tržnica), webhook kodiran, refund arhitektura", () => {
    const own = bySlug.get("own");
    expect(own?.booking).toBe("CODE_READY");
    expect(own?.cancellation).toBe("CODE_READY");
    expect(own?.webhook).toBe("CODE_READY");
    expect(own?.refund).toBe("ARCHITECTURE");
    expect(own?.affiliate).toBe("NOT_APPLICABLE");
  });

  it("CODE_READY adapterji (brez poverilnic): odkrivanje kodirano, citat kodiran", () => {
    for (const slug of [
      "viator",
      "getyourguide",
      "tiqets",
      "booking",
      "skyscanner",
      "airalo",
      "travelpayouts",
    ]) {
      const row = bySlug.get(slug);
      expect(row?.discovery, `${slug} discovery`).toBe("CODE_READY");
      expect(row?.apiSearch, `${slug} apiSearch`).toBe("CODE_READY");
      expect(row?.quote, `${slug} quote`).toBe("CODE_READY");
    }
  });

  it("affiliate-only brez adapterja (discovercars/omio/worldnomads/safetywing)", () => {
    for (const slug of ["discovercars", "omio", "worldnomads", "safetywing"]) {
      const row = bySlug.get(slug);
      expect(row?.discovery).toBe("NOT_SUPPORTED");
      expect(row?.apiSearch).toBe("NOT_SUPPORTED");
      expect(row?.affiliate).toBe("LIVE");
    }
  });

  it("kiwitaxi: odkrivanje živo (statični feed), citat NI podprt (objavljene cene)", () => {
    const kt = bySlug.get("kiwitaxi");
    expect(kt?.discovery).toBe("LIVE");
    expect(kt?.apiSearch).toBe("LIVE");
    expect(kt?.quote).toBe("NOT_SUPPORTED");
    expect(kt?.note).toContain("CSV");
  });
});
