// ADRIA-1e — atribucije hero fotografij (Wikimedia Commons).
// Licence CC BY / CC BY-SA zahtevajo navedbo avtorja — kredit je viden
// pod hero sliko vsakega vodnika (zakonito in pošteno).

export interface HeroCredit {
  title: string;
  author: string;
  license: string;
  source: string;
  descurl: string;
}

/** delani prikaz imena avtorja (brez wiki smeti) */
function cleanAuthor(a: string): string {
  return a
    .replace(/^User:/, "")
    .replace(/\s*\(talk\)/i, "")
    .trim();
}

export const HERO_CREDITS: Record<string, HeroCredit> = {
  "ljubljana-dubrovnik-road-trip": {
    title: "Casco viejo de Dubrovnik, Croacia",
    author: "Diego Delso",
    license: "CC BY-SA 3.0",
    source: "Wikimedia Commons",
    descurl:
      "https://commons.wikimedia.org/wiki/File:Casco_viejo_de_Dubrovnik,_Croacia,_2014-04-14,_DD_04.JPG",
  },
  "slovenija-hrvaska-10-dni": {
    title: "Bled Island and Bled Castle, Slovenia",
    author: "Jakub Hałun",
    license: "CC BY 4.0",
    source: "Wikimedia Commons",
    descurl:
      "https://commons.wikimedia.org/wiki/File:Bled_Island_and_Bled_Castle,_Slovenia,_20240504_0908_8342.jpg",
  },
  "bled-plitvice-split": {
    title: "The Big Waterfall (Veliki Slap), Plitvice Lakes",
    author: "dronepicr",
    license: "CC BY 2.0",
    source: "Wikimedia Commons",
    descurl:
      "https://commons.wikimedia.org/wiki/File:The_Big_Waterfall_(Veliki_Slap)_in_Plitvice_Lakes_National_Park,_Croatia.jpg",
  },
  "istria-vikend-iz-slovenije": {
    title: "Aerial view to Motovun",
    author: "Ekaterina Polischuk",
    license: "CC BY-SA 4.0",
    source: "Wikimedia Commons",
    descurl: "https://commons.wikimedia.org/wiki/File:Aerial_view_to_Motovun.jpg",
  },
  "hrvaska-obala-prakticni-vodnik": {
    title: "Adriatic Sea, Croatia",
    author: "tomkennedyastro",
    license: "CC BY-SA 4.0",
    source: "Wikimedia Commons",
    descurl: "https://commons.wikimedia.org/wiki/File:Adriatic_Sea_Croatia.jpg",
  },
  "najem-avta-cross-border": {
    title: "Pelješac Bridge (Pelješki most)",
    author: "kallerna",
    license: "CC BY-SA 4.0",
    source: "Wikimedia Commons",
    descurl: "https://commons.wikimedia.org/wiki/File:Pelje%C5%A1ac_Bridge_1.jpg",
  },
  "kotor-crna-gora-iz-slovenije": {
    title: "Crkva Gospa od Zdravlja, Kotor Bay",
    author: "Ggia",
    license: "CC BY-SA 3.0",
    source: "Wikimedia Commons",
    descurl:
      "https://commons.wikimedia.org/wiki/File:20090719_Crkva_Gospa_od_Zdravlja_Kotor_Bay_Montenegro.jpg",
  },
  "albanija-z-avtom-iz-slovenije": {
    title: "Ksamil, Albania",
    author: "Jerzy Czernik",
    license: "CC BY 3.0",
    source: "Wikimedia Commons",
    descurl:
      "https://commons.wikimedia.org/wiki/File:Ksamil_Albania_-_panoramio_(16).jpg",
  },
  "sarajevo-mostar-iz-slovenije": {
    title: "Mostar Old Town Panorama",
    author: "Ramirez",
    license: "CC BY-SA 4.0",
    source: "Wikimedia Commons",
    descurl:
      "https://commons.wikimedia.org/wiki/File:Mostar_Old_Town_Panorama_2007.jpg",
  },
  "hrvaski-otoki-iz-slovenije": {
    title: "Golden Horn beach (Zlatni rat), Bol",
    author: "Jules Verne Times Two",
    license: "CC BY-SA 4.0",
    source: "Wikimedia Commons",
    descurl:
      "https://commons.wikimedia.org/wiki/File:Panoramic_view_of_the_Golden_Horn_beach,_Bol,_Croatia_(PPL3-Alternative_Theo_Allofs).jpg",
  },
};

/** Vrne atribucijo za slug (ali undefined). */
export function getHeroCredit(slug: string): HeroCredit | undefined {
  const c = HERO_CREDITS[slug];
  if (!c) return undefined;
  return { ...c, author: cleanAuthor(c.author) };
}
