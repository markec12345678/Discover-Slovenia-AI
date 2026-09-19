// ============================================================================
// TRAVEL SUPPLY MAP — FSQ: POGODBENE VRSTE (TASK 53, 1.58.0)
// ============================================================================
// VRSTE SO PRESLIKANE IZ JAVNO DOKUMENTIRANE sheme Foursquare Open Places
// („Places OS Data Schemas“ — docs.foursquare.com, prebrano 19. 9. 2026).
// PODATKOVNA MNOŽICA je licenčno ČISTA (Apache-2.0 z atribucijo), a je
// prenos GATED: nabor je na HuggingFace dostopen šele PO sprejetju pogojev
// (dataset snapshot zahteva izrecno strinjanje) — shema sama je javna.
// ⇒ BREZ nameščene množice je adapter iskreno prazen („no-dataset“,
// glej dataset.ts); NE izmišljujemo mest, NE simuliramo podatkov.
//
// POGOODBENA POLJA (javna shema — uporabljena podnabora):
//  - fsq_id:        niz (identifikator kraja pri viru) — KRITIČNO
//  - name:          niz — KRITIČNO
//  - latitude/longitude: števili — KRITIČNI (edini geo vir; točna lokacija)
//  - address:       objekt ALI null { address_extend?, country?,
//                   country_code?, county?, county_code?,
//                   formatted_address?, locality?, neighborhood?, po_box?,
//                   postcode?, region?, street? }
//  - categories:    seznam {id, label, name} ALI seznam ID-jev kategorij
//                   (odprta shema dopušča oboje — preslikava uporablja
//                   SAMO label; ID brez labela NI klasificabilen → poi)
//  - tel / website / email: kontakti (website → sourceUrl pri nas)
//  - hours / hours_popular: odpiralni časi (niz v shemi kraja)
//  - rating:        vrhnja ocena (NE uporabimo — glej spodaj)
//  - stats:         { rating?, rating_count?, total_photos?, … } — oceno
//                   jemljemo IZKLJUČNO odtod (stats.rating 0–5 +
//                   stats.rating_count), ker je to dokazano povezan par
//  - closed:        bool (trajno zaprto — tak kraj NE sme v ponudbo)
//  - date_created / date_refreshed: datuma (date_refreshed → lastUpdated)
//  - facebook_id / instagram_id / twitter_id: social (kanonski model jih
//                   NIMA — NE preslikamo, ostanejo v dataset plasti)
//
// Vsa polja so v shemi opcijskorazlična — validator zahteva SAMO kritična
// (fsq_id, name, lat/lng); ostala obrambno preverja mapper posamično.
// ============================================================================

import type { ProductType } from "../../types";

/** Naslov kraja (javna shema OS Places — vsa polja opcijska ali null). */
export interface FsqAddress {
  address_extend?: string;
  country?: string;
  country_code?: string;
  county?: string;
  county_code?: string;
  formatted_address?: string;
  locality?: string;
  neighborhood?: string;
  po_box?: string;
  postcode?: string;
  region?: string;
  street?: string;
}

/** Kategorija kraja (label je ČLOVEŠKO berljiva — preslikava po njej). */
export interface FsqCategory {
  id?: number;
  label?: string;
  name?: string;
}

/** En kraj iz pripravljene JSONL množice (shema OS Places). */
export interface FsqPlace {
  fsq_id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: FsqAddress | null;
  /** Seznam {id, label, name} ALI golih ID-jev (številke). */
  categories?: Array<Partial<FsqCategory> | number>;
  tel?: string;
  website?: string;
  email?: string;
  hours?: string;
  hours_popular?: string;
  /** Vrhnja ocena v shemi — NAMERNO neuporabljena (uporabimo stats.rating,
   *  dokazano povezan par z rating_count; dokumentirano v mapperju). */
  rating?: number;
  stats?: {
    rating?: number;
    rating_count?: number;
    total_photos?: number;
  };
  /** Trajno zaprt kraj → izločimo že ob nalaganju (dataset.ts). */
  closed?: boolean;
  date_created?: string;
  date_refreshed?: string;
}

// ---------------------------------------------------------------------------
// FAIL-SAFE VARNOSTNI VZORCI (isti vzorec kot viator/kiwitaxi — Task 44 §4:
// en slab zapis NE sme podreti celotne plasti)
// ---------------------------------------------------------------------------

/**
 * fsq_id: niz 1–64 znakov, URL-varno (črke/števke/_/-). Vir uporablja
 * dolge alfanumerične identifikatorje — krajše/prazne/znakovne smeti
 * ZAVRNEMO (fail-closed: identifikator je ključ nazaj pri ponudniku).
 */
export const FSQ_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Minimalna veljavnost kraja: fsq_id + name + števili lat/lng znotraj
 * zemljepisnih meja. BREZ teh polj kraj NI točka (pin laž) → zapis odpade
 * + števec skipped. Vsa ostala polja so opcijska (brez naslova/ocene/
 * telefona produkt preprosto NIMA teh polj — ne izmišljujemo).
 */
export function isFsqPlace(v: unknown): v is FsqPlace {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<FsqPlace>;
  return (
    typeof p.fsq_id === "string" &&
    FSQ_ID_RE.test(p.fsq_id.trim()) &&
    typeof p.name === "string" &&
    p.name.trim().length > 0 &&
    typeof p.latitude === "number" &&
    Number.isFinite(p.latitude) &&
    Math.abs(p.latitude) <= 90 &&
    typeof p.longitude === "number" &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.longitude) <= 180
  );
}

/** Kanonski tip produkta za index/diagnostiko (izpeljava je v dataset.ts). */
export type FsqResolvedType = { type: ProductType; subcategory?: string };
