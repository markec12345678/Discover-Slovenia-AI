import type { Listing } from "@prisma/client";
import { parseSeasons } from "@/lib/listing-practical";

// ============================================================================
// PROFILE COMPLETION — izračun popolnosti profila lokalca
// ============================================================================

export interface ProfileField {
  key: string;
  label: string;
  filled: boolean;
  required: boolean;
  weight: number; // % k celotni popolnosti
}

export interface ProfileCompletion {
  percentage: number;
  filledCount: number;
  totalCount: number;
  missing: ProfileField[];
  filled: ProfileField[];
}

/**
 * Izračuna popolnost profila lokalca.
 * Vrne procent + seznam manjkajočih polj.
 */
export function calculateProfileCompletion(listing: Partial<Listing>): ProfileCompletion {
  const fields: ProfileField[] = [
    {
      key: "name",
      label: "Ime lokalca",
      filled: Boolean(listing.name?.trim()),
      required: true,
      weight: 5,
    },
    {
      key: "description",
      label: "Kratek opis",
      filled: Boolean(listing.description?.trim()) && (listing.description?.length || 0) >= 20,
      required: true,
      weight: 10,
    },
    {
      key: "longDescription",
      label: "Dolgi opis",
      filled: Boolean(listing.longDescription?.trim()) && (listing.longDescription?.length || 0) >= 100,
      required: true,
      weight: 10,
    },
    {
      key: "category",
      label: "Kategorija",
      filled: Boolean(listing.category),
      required: true,
      weight: 5,
    },
    {
      key: "destinationId",
      label: "Destinacija",
      filled: Boolean(listing.destinationId),
      required: true,
      weight: 5,
    },
    {
      key: "address",
      label: "Naslov",
      filled: Boolean(listing.address?.trim()),
      required: true,
      weight: 5,
    },
    {
      key: "phone",
      label: "Telefon",
      filled: Boolean(listing.phone?.trim()),
      required: true,
      weight: 8,
    },
    {
      key: "email",
      label: "Email",
      filled: Boolean(listing.email?.trim()),
      required: false,
      weight: 5,
    },
    {
      key: "website",
      label: "Spletna stran",
      filled: Boolean(listing.website?.trim()),
      required: false,
      weight: 7,
    },
    {
      key: "images",
      label: "Fotografije (min. 1)",
      filled: (() => {
        try {
          const imgs = JSON.parse(listing.images || "[]") as string[];
          return imgs.length >= 1;
        } catch {
          return false;
        }
      })(),
      required: true,
      weight: 15,
    },
    {
      key: "openingHours",
      label: "Odpiralni čas",
      filled: Boolean(listing.openingHours?.trim()),
      required: false,
      weight: 7,
    },
    {
      key: "priceRange",
      label: "Cenovni razred",
      filled: Boolean(listing.priceRange?.trim()),
      required: false,
      weight: 5,
    },
    {
      key: "specialties",
      label: "Specialitete/Tagi",
      filled: (() => {
        try {
          const specs = JSON.parse(listing.specialties || "[]") as string[];
          return specs.length >= 3;
        } catch {
          return false;
        }
      })(),
      required: false,
      weight: 8,
    },
    // === PRAKTIČNI PODATKI (t12 faza 1) — vsa tri neobvezna ===
    // Uteži 3+1+1 dopolnijo skupno točno na 100 (prej max 95).
    {
      key: "seasons",
      label: "Sezona obratovanja",
      filled: parseSeasons(listing.seasons).length > 0,
      required: false,
      weight: 3,
    },
    {
      key: "weatherSuitability",
      label: "Ustreznost vremenu",
      filled: Boolean(listing.weatherSuitability),
      required: false,
      weight: 1,
    },
    {
      key: "parking",
      label: "Parkirišče",
      filled: Boolean(listing.parking),
      required: false,
      weight: 1,
    },
  ];

  const filled = fields.filter((f) => f.filled);
  const missing = fields.filter((f) => !f.filled);

  const percentage = filled.reduce((sum, f) => sum + f.weight, 0);

  return {
    percentage: Math.min(percentage, 100),
    filledCount: filled.length,
    totalCount: fields.length,
    missing,
    filled,
  };
}

/**
 * Preveri ali je lokal dovolj popoln za oddajo v pregled.
 * Minimum: vsa required polja morajo biti izpolnjena.
 */
export function canSubmitForReview(listing: Partial<Listing>): {
  canSubmit: boolean;
  missingRequired: ProfileField[];
} {
  const completion = calculateProfileCompletion(listing);
  const missingRequired = completion.missing.filter((f) => f.required);

  return {
    canSubmit: missingRequired.length === 0,
    missingRequired,
  };
}
