// Kanonski približek meja Slovenije (deg) — ENA sama resnica za cel projekt.
//
// Zgodovina: konstanta je prvotno živela v
// src/lib/supply/providers/fsq/dataset.ts (FSQ ingest filter), a ta modul
// uvaža node:fs/promises in ZATO ne sme biti uvožen v client bundle
// (listing-geo-validation.ts ga potrebuje v owner/admin formah — TASK 85).
// Od leta 1.76.0 živi tukaj (client-safe, brez node uvozov); dataset.ts
// jo re-exporta, da vsi dosedanji uvozi ostanejo veljavni.

/** Kanonski približek meja Slovenije (deg): lat 45.4–46.9, lng 13.3–16.6. */
export const SI_BBOX = {
  latMin: 45.4,
  latMax: 46.9,
  lngMin: 13.3,
  lngMax: 16.6,
} as const;
