// TASK 85 — geo koordinate na listing formah (owner + admin portal).
//
// Vzorcna zgradba po TASK 82 (planner-field-validation):
//  1. UNIT: čiste funkcije iz src/lib/listing-geo-validation.ts
//  2. SOURCE-CONTRACT: dejanske odposlane datoteke vsebujejo ključne
//     vrata (zod ±90/±180 + refine obe-ali-nobena, contentChanged geo,
//     aria-invalid/role="alert", payload lat/lng) — varovalka pred
//     nehote odstranjeno validacijo.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  GEO_ERROR_MESSAGES,
  GEO_SI_HINT,
  isLatValid,
  isLngValid,
  isWithinSloveniaBbox,
  parseCoordinate,
  parseGeoInput,
} from "@/lib/listing-geo-validation";
import { SI_BBOX } from "@/lib/slovenia-bbox";

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

// ---------------------------------------------------------------------------
// 1. UNIT — parseCoordinate
// ---------------------------------------------------------------------------

describe("TASK 85: parseCoordinate", () => {
  test("veljavne decimalne vrednosti", () => {
    expect(parseCoordinate("46.3625")).toBe(46.3625);
    expect(parseCoordinate("-13.5")).toBe(-13.5);
    expect(parseCoordinate("  14.0936  ")).toBe(14.0936); // trim
    expect(parseCoordinate("0")).toBe(0);
  });

  test("slovenska decimalna vejica (46,3625 → 46.3625)", () => {
    expect(parseCoordinate("46,3625")).toBe(46.3625);
    expect(parseCoordinate("14,09")).toBe(14.09);
  });

  test("prazno in delni vnosi → null (izpraznjeno = odstrani pin)", () => {
    expect(parseCoordinate("")).toBeNull();
    expect(parseCoordinate("   ")).toBeNull();
    expect(parseCoordinate(".")).toBeNull();
    expect(parseCoordinate("-")).toBeNull();
  });

  test("neštevilski vnos → null", () => {
    expect(parseCoordinate("abc")).toBeNull();
    expect(parseCoordinate("46.36.25")).toBeNull(); // dve piki ni število
    expect(parseCoordinate("N/A")).toBeNull();
  });

  test("eksponentna notacija je veljavno število (ulovi jo meja ±90/±180)", () => {
    expect(parseCoordinate("1e2")).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 2. UNIT — isLatValid / isLngValid (meje enake own adapter fail-closed)
// ---------------------------------------------------------------------------

describe("TASK 85: isLatValid / isLngValid", () => {
  test("lat meje ±90 vključno", () => {
    expect(isLatValid(90)).toBe(true);
    expect(isLatValid(-90)).toBe(true);
    expect(isLatValid(0)).toBe(true);
    expect(isLatValid(90.0001)).toBe(false);
    expect(isLatValid(-90.0001)).toBe(false);
  });

  test("lng meje ±180 vključno", () => {
    expect(isLngValid(180)).toBe(true);
    expect(isLngValid(-180)).toBe(true);
    expect(isLngValid(180.0001)).toBe(false);
    expect(isLngValid(-180.0001)).toBe(false);
  });

  test("ne-končne vrednosti so neveljavne (fail-closed)", () => {
    expect(isLatValid(Number.NaN)).toBe(false);
    expect(isLatValid(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isLngValid(Number.NaN)).toBe(false);
    expect(isLngValid(Number.NEGATIVE_INFINITY)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. UNIT — parseGeoInput (trda vrata: obe ali nobena)
// ---------------------------------------------------------------------------

describe("TASK 85: parseGeoInput", () => {
  test("obe prazni → brez geo, brez napake", () => {
    expect(parseGeoInput("", "")).toEqual({
      lat: null,
      lng: null,
      error: null,
    });
  });

  test("samo ena izpolnjena → both_required (pin zahteva obe)", () => {
    expect(parseGeoInput("46.3625", "").error).toBe("both_required");
    expect(parseGeoInput("", "14.0936").error).toBe("both_required");
    expect(parseGeoInput("   ", "14.0936").error).toBe("both_required");
  });

  test("veljaven par (Bled) → številki, brez napake", () => {
    expect(parseGeoInput("46.3625", "14.0936")).toEqual({
      lat: 46.3625,
      lng: 14.0936,
      error: null,
    });
  });

  test("vejica kot decimalno ločilo v obeh poljih", () => {
    expect(parseGeoInput("46,3625", "14,0936")).toEqual({
      lat: 46.3625,
      lng: 14.0936,
      error: null,
    });
  });

  test("presežena meja lat → lat_invalid (napaka ne pade v both_required)", () => {
    expect(parseGeoInput("91", "14").error).toBe("lat_invalid");
    expect(parseGeoInput("-91", "14").error).toBe("lat_invalid");
  });

  test("presežena meja lng → lng_invalid", () => {
    expect(parseGeoInput("46", "181").error).toBe("lng_invalid");
    expect(parseGeoInput("46", "-181").error).toBe("lng_invalid");
  });

  test("neštevilo v enem polju → napaka tega polja (ne zavajujoče both_required)", () => {
    expect(parseGeoInput("abc", "14").error).toBe("lat_invalid");
    expect(parseGeoInput("46", "xyz").error).toBe("lng_invalid");
  });

  test("zamenjava lat↔lng (14.09, 46.36) je svetovno veljavna — ulovi jo SI hint", () => {
    const swapped = parseGeoInput("14.09", "46.36");
    expect(swapped.error).toBeNull();
    expect(swapped.lat).toBe(14.09);
    // hint je ločena plast (mehka, ne blokira):
    expect(isWithinSloveniaBbox(swapped.lat!, swapped.lng!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. UNIT — isWithinSloveniaBbox (isti kanonski pravokotnik kot FSQ ingest)
// ---------------------------------------------------------------------------

describe("TASK 85: isWithinSloveniaBbox", () => {
  test("slovenski kraji so znotraj", () => {
    expect(isWithinSloveniaBbox(46.3625, 14.0936)).toBe(true); // Bled
    expect(isWithinSloveniaBbox(46.0569, 14.5058)).toBe(true); // Ljubljana
    expect(isWithinSloveniaBbox(46.5547, 15.6459)).toBe(true); // Maribor
    expect(isWithinSloveniaBbox(45.5433, 13.7294)).toBe(true); // Piran
  });

  test("robni kraji sosednjih držav ostanejo znotraj (namerna toleranca bbox)", () => {
    // Trst (IT) in Zagreb (HR) padeta v pravokotnik — znano, pošteno
    expect(isWithinSloveniaBbox(45.6486, 13.7768)).toBe(true); // Trst
    expect(isWithinSloveniaBbox(45.815, 15.9819)).toBe(true); // Zagreb
  });

  test("oddaljene točke so zunaj (hint se prikaže)", () => {
    expect(isWithinSloveniaBbox(48.2082, 16.3738)).toBe(false); // Dunaj
    expect(isWithinSloveniaBbox(45.4642, 9.19)).toBe(false); // Milano
    expect(isWithinSloveniaBbox(41.9028, 12.4964)).toBe(false); // Rim
  });

  test("meje bbox-a so vključujoče", () => {
    expect(isWithinSloveniaBbox(SI_BBOX.latMin, SI_BBOX.lngMin)).toBe(true);
    expect(isWithinSloveniaBbox(SI_BBOX.latMax, SI_BBOX.lngMax)).toBe(true);
    expect(isWithinSloveniaBbox(SI_BBOX.latMax + 0.001, SI_BBOX.lngMax)).toBe(
      false
    );
  });
});

// ---------------------------------------------------------------------------
// 5. UNIT — sporočila (ena resnica za obe formi)
// ---------------------------------------------------------------------------

describe("TASK 85: GEO_ERROR_MESSAGES / GEO_SI_HINT", () => {
  test("vsi trije ključi imajo neprazno slovensko sporočilo", () => {
    expect(Object.keys(GEO_ERROR_MESSAGES).sort()).toEqual([
      "both_required",
      "lat_invalid",
      "lng_invalid",
    ]);
    for (const msg of Object.values(GEO_ERROR_MESSAGES)) {
      expect(msg.length).toBeGreaterThan(10);
      expect(msg).not.toMatch(/^error/i);
    }
  });

  test("SI hint omenja zamenjavo koordinat", () => {
    expect(GEO_SI_HINT).toContain("zamenjani");
    expect(GEO_SI_HINT).toContain("Slovenije");
  });
});

// ---------------------------------------------------------------------------
// 6. SOURCE-CONTRACT — validacijska lib je prilepljena na kanonski SI_BBOX
//    (client-safe: fsq/dataset uvaža node:fs in NE SME biti v client bundle)
// ---------------------------------------------------------------------------

describe("TASK 85: source-contract — SI_BBOX single source of truth", () => {
  const validationSrc = source("src/lib/listing-geo-validation.ts");
  const bboxSrc = source("src/lib/slovenia-bbox.ts");
  const datasetSrc = source("src/lib/supply/providers/fsq/dataset.ts");

  test("listing-geo-validation uvaža SI_BBOX iz client-safe slovenia-bbox.ts", () => {
    expect(validationSrc).toContain('from "@/lib/slovenia-bbox"');
    // NE SME uvažati fsq/dataset (node:fs/promises bi zlomil client bundle)
    expect(validationSrc).not.toContain("fsq/dataset");
  });

  test("slovenia-bbox.ts je client-safe (ni node: uvozov)", () => {
    expect(bboxSrc).not.toMatch(/from\s+"node:/);
    expect(bboxSrc).toContain("latMin: 45.4");
    expect(bboxSrc).toContain("lngMax: 16.6");
  });

  test("fsq/dataset re-exporta isti SI_BBOX (nazajna kompatibilnost uvozov)", () => {
    expect(datasetSrc).toContain('from "@/lib/slovenia-bbox"');
    expect(datasetSrc).toContain("export { SI_BBOX }");
  });
});

// ---------------------------------------------------------------------------
// 7. SOURCE-CONTRACT — tipi + owner API
// ---------------------------------------------------------------------------

describe("TASK 85: source-contract — listings-types.ts", () => {
  const src = source("src/lib/listings-types.ts");

  test("Listing ima neobvezni lat/lng (null = ni vnosa)", () => {
    expect(src).toContain("lat?: number | null");
    expect(src).toContain("lng?: number | null");
  });
});

describe("TASK 85: source-contract — owner create API", () => {
  const src = source("src/app/api/owner/listings/route.ts");

  test("zod vrata: lat ±90, lng ±180, finite, nullable", () => {
    expect(src).toContain("lat: z");
    expect(src).toContain(".min(-90");
    expect(src).toContain(".max(90");
    expect(src).toContain(".min(-180");
    expect(src).toContain(".max(180");
    expect(src).toContain(".finite()");
  });

  test("refine: obe koordinati ali nobena", () => {
    expect(src).toContain(".refine(");
    expect(src).toContain("d.lat === undefined || d.lat === null");
    expect(src).toContain("d.lng === undefined || d.lng === null");
  });

  test("persistanca: lat/lng gresta v create data (null = brez pina)", () => {
    expect(src).toContain("lat: data.lat ?? null");
    expect(src).toContain("lng: data.lng ?? null");
  });
});

describe("TASK 85: source-contract — owner update API", () => {
  const src = source("src/app/api/owner/listings/[id]/route.ts");

  test("updateSchema ima ista geo vrata + refine", () => {
    expect(src).toContain(".min(-90");
    expect(src).toContain(".max(180");
    expect(src).toContain(".refine(");
  });

  test("geo sprememba šteje kot VSEBINSKA (re-moderacija published/pending)", () => {
    expect(src).toContain("data.lat !== undefined");
    expect(src).toContain("(data.lat ?? null) !== (listing.lat ?? null)");
    expect(src).toContain("(data.lng ?? null) !== (listing.lng ?? null)");
  });

  test("update data vsebuje lat/lng (null = izbris)", () => {
    expect(src).toContain("...(data.lat !== undefined && { lat: data.lat ?? null })");
    expect(src).toContain("...(data.lng !== undefined && { lng: data.lng ?? null })");
  });
});

// ---------------------------------------------------------------------------
// 8. SOURCE-CONTRACT — owner forma (inline validacija po vzoru TASK 82)
// ---------------------------------------------------------------------------

describe("TASK 85: source-contract — owner ListingFormDialog", () => {
  const src = source("src/components/owner/listing-form.tsx");

  test("uporablja čiste helperje iz listing-geo-validation", () => {
    expect(src).toContain("parseGeoInput");
    expect(src).toContain("GEO_ERROR_MESSAGES");
    expect(src).toContain("GEO_SI_HINT");
    expect(src).toContain("isWithinSloveniaBbox");
  });

  test("touched vzorec TASK 82: onBlur + aria-invalid + role=alert", () => {
    expect(src).toContain("setGeoTouched(true)");
    expect(src).toContain("onBlur={() => setGeoTouched(true)}");
    expect(src).toContain('aria-invalid={geoError !== null}');
    expect(src).toContain('role="alert"');
    expect(src).toContain('id="lf-geo-error"');
    expect(src).toContain('aria-describedby={geoError ? "lf-geo-error" : undefined}');
  });

  test("številska vrata na inputu (step=any tolerira paste, min/max)", () => {
    expect(src).toContain('id="lf-lat"');
    expect(src).toContain('id="lf-lng"');
    // step="any" (E2E najdba): step=0.000001 bi ZAVRNIL Google Maps paste
    // (7+ decimalk) — trdi obseg ±90/±180 živi v JS validaciji + min/max
    expect(src).toContain('step="any"');
    expect(src).toContain("min={-90}");
    expect(src).toContain("min={-180}");
  });

  test("prefill iz listinga + payload pošlje parse (null = izbris)", () => {
    expect(src).toContain('listing.lat != null ? String(listing.lat) : ""');
    expect(src).toContain('listing.lng != null ? String(listing.lng) : ""');
    expect(src).toContain("lat: geoParse.lat");
    expect(src).toContain("lng: geoParse.lng");
  });

  test("submit zavrne ob trdi geo napaki (block pred fetch)", () => {
    expect(src).toContain("if (geoParse.error !== null) {");
    expect(src).toContain("setGeoTouched(true);");
  });

  test("rumeni SI hint se pokaže samo ko ni trde napake", () => {
    expect(src).toContain("{!geoError && showSiHint && (");
    expect(src).toContain("text-amber-600");
  });
});

// ---------------------------------------------------------------------------
// 9. SOURCE-CONTRACT — admin API + admin forma
// ---------------------------------------------------------------------------

describe("TASK 85: source-contract — admin listings API (oba)", () => {
  const post = source("src/app/api/admin/listings/route.ts");
  const put = source("src/app/api/admin/listings/[id]/route.ts");

  test("oba uvažata isti čisti helper (isLatValid/isLngValid)", () => {
    expect(post).toContain('from "@/lib/listing-geo-validation"');
    expect(put).toContain('from "@/lib/listing-geo-validation"');
    expect(post).toContain("isLatValid");
    expect(put).toContain("isLngValid");
  });

  test("oba zavrneta polovičen vnos z izrecnim sporočilom (400)", () => {
    for (const src of [post, put]) {
      expect(src).toContain("(latRaw !== null) !== (lngRaw !== null)");
      expect(src).toContain("Vnesite obe koordinati");
    }
  });

  test("oba zavrjeta presežene meje (izrecno, brez tihega clamp-a)", () => {
    for (const src of [post, put]) {
      expect(src).toContain("Geo širina mora biti med -90 in 90");
      expect(src).toContain("Geo dolžina mora biti med -180 in 180");
    }
  });

  test("oba persistata lat/lng", () => {
    expect(post).toContain("        lat,");
    expect(post).toContain("        lng,");
    expect(put).toContain("        lat,");
    expect(put).toContain("        lng,");
  });
});

describe("TASK 85: source-contract — admin ListingForm", () => {
  const src = source("src/components/admin/listing-form.tsx");

  test("AdminListing tip + state + prefill", () => {
    expect(src).toContain("lat?: number | null");
    expect(src).toContain('listing.lat != null ? String(listing.lat) : ""');
    expect(src).toContain('listing.lng != null ? String(listing.lng) : ""');
  });

  test("isti čisti helperji in trda vrata ob submitu", () => {
    expect(src).toContain("parseGeoInput");
    expect(src).toContain("GEO_ERROR_MESSAGES");
    expect(src).toContain("lat: geoParse.lat");
    expect(src).toContain("lng: geoParse.lng");
  });

  test("inline napaka + rumeni SI hint", () => {
    expect(src).toContain('role="alert"');
    expect(src).toContain("aria-invalid={geoParse.error !== null}");
    expect(src).toContain("showSiHint");
    expect(src).toContain("text-amber-600");
  });
});
