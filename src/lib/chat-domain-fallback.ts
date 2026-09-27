// ============================================================================
// CHAT DOMAIN ANSWER — deterministična (PRIMARNA) plast odgovorov klepeta
// (Issue #2 §5 → Issue #9 ZERO-AI: pot AI verige je odstranjena)
// ============================================================================
// NAMEN: /api/chat odgovarja IZKLJUČNO prek te plasti — deterministično,
// brez runtime LLM klica. Modul NE generira besedila po občutku — sestavlja
// odgovor IZKLJUČNO iz realnih podatkov, ki jih pošlje klicalec (baza +
// statični DESTINATIONS + OSM kraji + Open-Meteo napoved), pošteno označen
// z source "database" na ruti.
//
// RESNIK (isti vzorec kot ask-local buildDatabaseAnswer):
//   - NIKOLI ne izmisli imena, cene, statusa ali razpoložljivosti;
//   - cene izpisuje z "od €X" (FROM_PRICE semantika);
//   - razpoložljivost: pogosto NEZNANO / NO_LIVE_DATA (brez lažnega LIVE);
//   - rezervacija: ZUNANJA pri ponudniku (nikoli "potrjeno");
//   - vreme: realna Open-Meteo napoved ALI izrecno "ni na voljo";
//   - odgovor NIKOLI ne trdi udeležbe AI (Issue #9 iskrenost vira).
//
// W1 (Issue #15 V0, 1.126.0): PLAST JE 4-JEZIČNA (sl/en/it/de) — ista
// deterministična logika, samo izpis v jeziku uporabnika (Alma STB dokazuje,
// da so IT/DE govoreči najdejavnejši vprašalci o Sloveniji). Dodatno:
// destinacijska polja (tagline/duration/activities/highlights) sedaj
// uporabljajo JEZIKOVNI OVERLAY (slovenia-data-en/-it/-de) — prej je EN
// odgovor izpisoval slovenski tagline (mešanje, P4-8 dres). Ključne besede
// namigovanja razširjene na IT/DE.
//
// ČISTOST: modul NE uvaža db/ai-client — vsi podatki pridejo prek argumentov
// (enricher callback za destinacijske poizvedbe v bazi vbrizga klicalec),
// zato je popolnoma unit-testljiv.
// ============================================================================

import { DESTINATIONS, COUNTRIES } from "@/lib/slovenia-data";
import { matchDestinationsInText, type ChatPlace } from "@/lib/geo-intent";
import {
  fetchDailyForecast,
  weatherCodeToTextFor,
  type DailyForecast,
} from "@/lib/weather-utils";
import { getEnDestination } from "@/lib/slovenia-data-en";
import { getItDestination } from "@/lib/slovenia-data-it";
import { getDeDestination } from "@/lib/slovenia-data-de";
import type { Destination } from "@/lib/types";

/** Klepetni jezik (W1: 4 javni jeziki platforme). */
export type ChatLang = "sl" | "en" | "it" | "de";

/** Izbor niza po jeziku (deterministični i18n brez next-intl odvisnosti). */
function L(lang: ChatLang, strings: Record<ChatLang, string>): string {
  return strings[lang] ?? strings.sl;
}

// ─── Vhodni tipi (podmnožice vrstic, ki jih /api/chat že pridobi) ─────────

export interface DomainListing {
  name: string;
  category: string;
  destinationName: string | null;
  description: string;
  rating: number | null;
  priceRange: string | null;
}

export interface DomainProduct {
  name: string;
  category: string;
  destinationName: string | null;
  price: number | null;
  rating: number | null;
}

export interface DomainExperience {
  name: string;
  category: string;
  destinationName: string | null;
  pricePerPerson: number | null;
  rating: number | null;
}

export interface DomainContext {
  listings: DomainListing[];
  products: DomainProduct[];
  experiences: DomainExperience[];
  /** Realni kraji iz OpenStreetMap, ki jih je ruta ŽE pridobila za geo
   * vprašanje (gostilne, tržnice …) — vrnejo se tudi na klient za mini
   * zemljevid. Prazno, kadar geo namig ni bil prepoznan. */
  osmPlaces: ChatPlace[];
}

export interface DomainAnswer {
  message: string;
  /** Pini za mini zemljevid v klepetu (T1 destinacija + OSM kraji). */
  places: ChatPlace[];
}

/** Vbrizga realne vrstice iz baze ZA ZGOLJ prepoznano destinacijo. */
export type DestinationEnricher = (destinationName: string) => Promise<{
  listings: DomainListing[];
  products: DomainProduct[];
  experiences: DomainExperience[];
} | null>;

/** Podatkovni vir vremena (injektirano za teste; privzeto Open-Meteo). */
export type WeatherFetcher = (
  lat: number,
  lng: number,
  days: number
) => Promise<DailyForecast[] | null>;

// ─── Namigovanje namena (ključne besede SL + EN + IT + DE, deterministično) ─

function has(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

const isGreeting = (q: string) =>
  has(q, [
    "zdravo",
    "pozdravljen",
    "živjo",
    "dober dan",
    "lep pozdrav",
    "hello",
    " hi ",
    "hey",
    "good morning",
    "good evening",
    // W1 IT
    "ciao",
    "buongiorno",
    "buonasera",
    "buon giorno",
    "buona sera",
    "salve",
    // W1 DE
    "hallo",
    "guten tag",
    "guten morgen",
    "guten abend",
    "grüß gott",
    "gruß gott",
    "servus",
  ]);

const isRestaurant = (q: string) =>
  has(q, [
    // STEMI usklajeni z geo-intent CATEGORY_MATCHERS.food ("jede" pokriva
    // jedem/jedla/jedeš …) — isti jezikovni doseg kot OSM iskanje rute.
    "jede",
    "jest",
    "restavrac",
    "gostiln",
    "gostisc",
    "picer",
    "burger",
    "pizza",
    "hran",
    "večerj",
    "vecerj",
    "kosil",
    "zajtrk",
    "kav",
    "pijač",
    "pijac",
    "bar ",
    "restaurant",
    "where to eat",
    "eat",
    "food",
    "dinner",
    "lunch",
    "breakfast",
    "drink",
    "cafe",
    // W1 IT
    "ristorant",
    "trattoria",
    "osteria",
    "pizzeria",
    "mangiare",
    "mangi ",
    "dove mangiare",
    "cucina",
    "pranzo",
    "cena ",
    "colazion",
    "caffè",
    "caffe",
    "aperitiv",
    // W1 DE
    "essen",
    "gasthaus",
    "gasthof",
    "wirtshaus",
    "küche",
    "kueche",
    "frühstück",
    "fruehstueck",
    "mittagessen",
    "abendessen",
    "kaffe",
    "trinken",
    "speisen",
  ]);

const isAccommodation = (q: string) =>
  has(q, [
    "hotel",
    "nastanit",
    "spat",
    "spanj",
    "apartm",
    "hostel",
    "sobe",
    "accommodation",
    "sleep",
    "stay",
    "rooms",
    // W1 IT
    "albergo",
    "alloggi",
    "dormire",
    "camere",
    "pernottament",
    "pensione",
    "agriturismo",
    // W1 DE
    "unterkunft",
    "übernacht",
    "uebernacht",
    "schlafen",
    "zimmer",
    "herberge",
    "ferienwohnung",
  ]);

const isActivity = (q: string) =>
  has(q, [
    "aktivnost",
    "kaj delati",
    "kaj početi",
    "kaj videti",
    "zanimiv",
    "dogodk",
    "izkušnj",
    "doživetj",
    "activities",
    "things to do",
    "what to do",
    "what to see",
    "visit",
    "experience",
    "events",
    // W1 IT
    "attività",
    "attivita",
    "cosa fare",
    "cosa vedere",
    "cose da fare",
    "esperienz",
    "eventi",
    "visitare",
    // W1 DE
    "was tun",
    "was machen",
    "was sehen",
    "sehenswürdig",
    "sehenswuerdig",
    "erlebnis",
    "veranstaltung",
    "unternehm",
    "besichtigen",
  ]);

const isPrice = (q: string) =>
  has(q, [
    "cena",
    "cene",
    "koliko",
    "stane",
    "drag",
    "poceni",
    "proračun",
    "price",
    "cost",
    "how much",
    "expensive",
    "cheap",
    "budget",
    // W1 IT
    "prezzo",
    "prezzi",
    "quanto costa",
    "quanto costano",
    "costo",
    "caro",
    "economico",
    "preventiv",
    // W1 DE
    "preis",
    "kostet",
    "kosten",
    "wie viel",
    "wieviel",
    "teuer",
    "günstig",
    "guenstig",
    "budget", // že zgoraj (EN)
  ]);

const isWeather = (q: string) =>
  has(q, [
    "vreme",
    "napoved",
    " dež",
    "dežev",
    "neviht",
    "temperatur",
    "toplo",
    "hladno",
    "sneg",
    "weather",
    "forecast",
    "rain",
    "temperature",
    "sunny",
    "snow",
    // W1 IT
    "meteo",
    "che tempo",
    "previsioni",
    "pioggia",
    "piovg",
    "temperatura",
    "caldo",
    "freddo",
    "neve",
    "vento",
    // W1 DE
    "wetter",
    "vorhersage",
    "regen",
    "temperatur",
    "schnee",
    "sonnig",
    "windig",
    "bewölkt",
    "bewoelkt",
  ]);

const isItinerary = (q: string) =>
  has(q, [
    "itinerar",
    "načrt",
    "planir",
    "pot po",
    "program potovanja",
    "itinerary",
    " plan",
    "planning",
    "travel plan",
    "schedule",
    // W1 IT
    "itinerario",
    "piano di viaggio",
    "programma",
    "pianificar",
    "programmazione",
    // W1 DE
    "reiseplan",
    "reiseroute",
    "planen",
    "reiseplanung",
    "zeitplan",
  ]);

const isJourney = (q: string) =>
  has(q, [
    "prevoz",
    "transfer",
    "potovanj",
    "avtobus",
    "vlak",
    "taksi",
    "kako priti",
    "transport",
    "journey",
    "bus",
    "train",
    "taxi",
    "how to get",
    "getting there",
    // W1 IT (avtobus/taxi pokrijeta "autobus"/"taxi" prek podnizov)
    "trasporto",
    "trasferiment",
    "treno",
    "come arrivare",
    "arrivare",
    "viaggio",
    "autobus",
    // W1 DE
    "zug",
    "anreise",
    "hinfahrt",
    "wie komme ich",
    "beförderung",
    "befoerderung",
    "fahrt",
  ]);

const isBookingOrMyTrip = (q: string) =>
  has(q, [
    "moja pot",
    "rezervac",
    "naročil",
    "naroči",
    "status",
    "potrditev",
    "booking",
    "reservation",
    "my trip",
    "booked",
    "confirmation",
    // W1 IT
    "prenotazion",
    "prenotare",
    "il mio viaggio",
    "conferma",
    "stato della prenot",
    // W1 DE
    "buchung",
    "reservierung",
    "reservieren",
    "meine reise",
    "bestätigung",
    "bestaetigung",
  ]);

const isAvailability = (q: string) =>
  has(q, [
    "razpoložlj",
    "prost",
    "zaseden",
    "termin",
    "available",
    "availability",
    "free slot",
    "vacancy",
    // W1 IT
    "disponibilità",
    "disponibilita",
    "disponibil",
    "libero",
    "occupato",
    "slot liber",
    // W1 DE
    "verfügbar",
    "verfuegbar",
    "verfügbarkeit",
    "verfuegbarkeit",
    "frei",
    "ausgebucht",
    "termin",
  ]);

// ─── Pomožne (formatiranje realnih podatkov) ──────────────────────────────

const COUNTRY_LABELS: Record<ChatLang, Record<string, string>> = {
  sl: {},
  en: { SI: "Slovenia", HR: "Croatia", ME: "Montenegro", AL: "Albania" },
  it: { SI: "Slovenia", HR: "Croazia", ME: "Montenegro", AL: "Albania" },
  de: { SI: "Slowenien", HR: "Kroatien", ME: "Montenegro", AL: "Albanien" },
};

function countryLabel(d: Destination, lang: ChatLang): string {
  const c = COUNTRIES.find((x) => x.value === d.country);
  if (!c) return d.country;
  // Jezikovne oznake držav (W1: 4 jeziki) — SL uporabi slovensko oznako
  // (c.label), ostali svoje prevode s fallbackom na EN ime.
  const localized = COUNTRY_LABELS[lang]?.[d.country];
  if (localized) return localized;
  if (lang === "en") {
    return COUNTRY_LABELS.en[d.country] ?? c.label;
  }
  return c.label;
}

/**
 * W1: lokaliziran pogled na destinacijo — tagline/description/highlights/
 * activities/duration v jeziku ODGOVORA (overlay po id; fallback SL
 * izvirnik). Popravlja tudi prejšnje mešanje pri EN (slovenski tagline v
 * angleškem odgovoru). Imena/slug/ocene/cene/koordinate so jezikovno
 * nevtralni in ostanejo izvirni.
 */
function localizedDest(d: Destination, lang: ChatLang): Destination {
  const overlay =
    lang === "en"
      ? getEnDestination(d.id)
      : lang === "it"
        ? getItDestination(d.id)
        : lang === "de"
          ? getDeDestination(d.id)
          : null;
  return overlay ? { ...d, ...overlay } : d;
}

function fmtPriceRange(range: string | null): string {
  if (!range) return "";
  return ` (${range})`;
}

const RATING_WORD: Record<ChatLang, string> = {
  sl: "ocena",
  en: "rating",
  it: "valutazione",
  de: "Bewertung",
};

function listingLine(l: DomainListing, lang: ChatLang): string {
  return `• ${l.name}${l.destinationName ? ` — ${l.destinationName}` : ""}${fmtPriceRange(l.priceRange)}${l.rating != null ? `, ${RATING_WORD[lang]} ${l.rating}/5` : ""}`;
}

const FROM_PRICE_PER_PERSON: Record<ChatLang, (eur: number) => string> = {
  sl: (eur) => `od €${eur}/osebo`,
  en: (eur) => `from €${eur} per person`,
  it: (eur) => `da €${eur} a persona`,
  de: (eur) => `ab €${eur} pro Person`,
};

function experienceLine(e: DomainExperience, lang: ChatLang): string {
  return `• ${e.name}${e.destinationName ? ` — ${e.destinationName}` : ""}${e.pricePerPerson != null ? `, ${FROM_PRICE_PER_PERSON[lang](e.pricePerPerson)}` : ""}`;
}

function osmLine(p: ChatPlace): string {
  return `• ${p.name}${p.detail ? ` (${p.detail})` : ""}`;
}

function minPrice(nums: Array<number | null | undefined>): number | null {
  const valid = nums.filter((n): n is number => typeof n === "number" && n > 0);
  return valid.length > 0 ? Math.min(...valid) : null;
}

// ─── Glavna funkcija ──────────────────────────────────────────────────────

export async function buildDomainAnswer(
  question: string,
  lang: ChatLang,
  context: DomainContext,
  options?: {
    enrich?: DestinationEnricher;
    weather?: WeatherFetcher;
  }
): Promise<DomainAnswer> {
  const q = ` ${question.toLowerCase()} `;
  const weatherFetch = options?.weather ?? fetchDailyForecast;

  // Ujemanje destinacij enkrat (t1 pini + primarna destinacija iz istega klica).
  const matchedPlaces = matchDestinationsInText(question);
  const dest =
    matchedPlaces.length > 0
      ? (DESTINATIONS.find((d) => d.slug === matchedPlaces[0].slug) ?? null)
      : null;

  // ── 1. VPRAŠANJE ZA DESTINACIJO (najbogatejši odgovor) ────────────────
  if (dest) {
    // W1: lokaliziran izpis destinacije (tagline/duration/activities/…).
    const d = localizedDest(dest, lang);

    // Vbrizgaj realne vrstice za TO destinacijo (če je enricher podan).
    let listings = context.listings;
    let products = context.products;
    let experiences = context.experiences;
    if (options?.enrich) {
      const extra = await options.enrich(dest.name).catch(() => null);
      if (extra) {
        const mergeUnique = <T extends { name: string }>(
          priority: T[],
          base: T[]
        ): T[] => {
          const seen = new Set(priority.map((x) => x.name));
          return [...priority, ...base.filter((x) => !seen.has(x.name))];
        };
        listings = mergeUnique(extra.listings, context.listings);
        products = mergeUnique(extra.products, context.products);
        experiences = mergeUnique(extra.experiences, context.experiences);
      }
    }

    const destListings = listings.filter((l) => l.destinationName === dest.name);
    const destProducts = products.filter((p) => p.destinationName === dest.name);
    const destExperiences = experiences.filter(
      (e) => e.destinationName === dest.name
    );

    const lines: string[] = [];
    const places: ChatPlace[] = [matchedPlaces[0]];

    // Osnovni realni podatki o destinaciji.
    lines.push(
      L(lang, {
        sl: `${dest.name} (${countryLabel(dest, "sl")}): ${d.tagline}. Ocena ${dest.rating}/5, priporočen obisk: ${d.duration.toLowerCase()}, strošek okvirno od €${dest.costPerPerson}/osebo.`,
        en: `${dest.name} (${countryLabel(dest, "en")}): ${d.tagline}. Rated ${dest.rating}/5, recommended visit: ${d.duration.toLowerCase()}, estimated cost from €${dest.costPerPerson} per person.`,
        it: `${dest.name} (${countryLabel(dest, "it")}): ${d.tagline}. Valutazione ${dest.rating}/5, visita consigliata: ${d.duration.toLowerCase()}, costo indicativo da €${dest.costPerPerson} a persona.`,
        de: `${dest.name} (${countryLabel(dest, "de")}): ${d.tagline}. Bewertung ${dest.rating}/5, empfohlener Besuch: ${d.duration.toLowerCase()}, geschätzte Kosten ab €${dest.costPerPerson} pro Person.`,
      })
    );

    // Vreme — realna napoved Open-Meteo ALI izrecno "ni na voljo".
    if (isWeather(q)) {
      const forecast = await weatherFetch(dest.coords.lat, dest.coords.lng, 2);
      if (forecast && forecast.length > 0) {
        const today = forecast[0];
        const wmo = weatherCodeToTextFor(lang, today.weatherCode);
        const p = today.precipitationProbabilityMax;
        const rain =
          p != null
            ? L(lang, {
                sl: `, verjetnost padavin ${p}%`,
                en: `, precipitation probability ${p}%`,
                it: `, probabilità di precipitazioni ${p}%`,
                de: `, Niederschlagswahrscheinlichkeit ${p}%`,
              })
            : "";
        lines.push(
          L(lang, {
            sl: `Napoved (${today.date}, Open-Meteo): ${wmo}, do ${today.tempMax} °C${rain}.`,
            en: `Forecast (${today.date}, Open-Meteo): ${wmo}, up to ${today.tempMax} °C${rain}.`,
            it: `Previsioni (${today.date}, Open-Meteo): ${wmo}, fino a ${today.tempMax} °C${rain}.`,
            de: `Vorhersage (${today.date}, Open-Meteo): ${wmo}, bis ${today.tempMax} °C${rain}.`,
          })
        );
      } else {
        lines.push(
          L(lang, {
            sl: "Vremenske napovedi trenutno ni uspelo pridobiti — živo vreme vidiš v načrtu in na zemljevidu.",
            en: "Could not retrieve the forecast right now — live weather is shown in the itinerary and on the map.",
            it: "Al momento non è stato possibile recuperare le previsioni — il meteo aggiornato è visibile nell'itinerario e sulla mappa.",
            de: "Die Vorhersage konnte gerade nicht abgerufen werden — aktuelles Wetter siehst du im Reisplan und auf der Karte.",
          })
        );
      }
    }

    // Restavracije/gostilne — realni OSM kraji (ruta jih je že pridobila).
    if (isRestaurant(q)) {
      const near = context.osmPlaces.slice(0, 4);
      if (near.length > 0) {
        places.push(...near);
        lines.push(
          L(lang, {
            sl: `Kraji v bližini (OpenStreetMap — skupnostni vir, NI uradno preverjeno):\n${near.map(osmLine).join("\n")}`,
            en: `Places nearby (OpenStreetMap — community data, NOT officially verified):\n${near.map(osmLine).join("\n")}`,
            it: `Luoghi nelle vicinanze (OpenStreetMap — dati della community, NON verificati ufficialmente):\n${near.map(osmLine).join("\n")}`,
            de: `Orte in der Nähe (OpenStreetMap — Community-Daten, NICHT offiziell verifiziert):\n${near.map(osmLine).join("\n")}`,
          })
        );
      } else {
        // Kraj je bil POVEDAN, a OSM (Overpass) ni vrnil rezultatov —
        // izrecno priznamo ( NE vprašamo po kraju, ki ga uporabnik ravno
        // zdaj imenoval) in ponudimo bazo lokalov spodaj.
        lines.push(
          L(lang, {
            sl: `Gostiln v bližini trenutno ni uspelo pridobiti (OpenStreetMap) — poskusi kasneje znova.`,
            en: `Couldn't retrieve nearby places right now (OpenStreetMap) — try again later.`,
            it: `Al momento non è stato possibile recuperare i luoghi nelle vicinanze (OpenStreetMap) — riprova più tardi.`,
            de: `Die Orte in der Nähe konnten gerade nicht abgerufen werden (OpenStreetMap) — versuche es später erneut.`,
          })
        );
      }
      if (destListings.length > 0) {
        lines.push(
          L(lang, {
            sl: `Iz naše baze lokalov:\n${destListings.slice(0, 3).map((l) => listingLine(l, lang)).join("\n")}`,
            en: `From our local provider database:\n${destListings.slice(0, 3).map((l) => listingLine(l, lang)).join("\n")}`,
            it: `Dal nostro database di fornitori locali:\n${destListings.slice(0, 3).map((l) => listingLine(l, lang)).join("\n")}`,
            de: `Aus unserer Datenbank lokaler Anbieter:\n${destListings.slice(0, 3).map((l) => listingLine(l, lang)).join("\n")}`,
          })
        );
      }
    }

    // Aktivnosti/izkušnje.
    if (isActivity(q)) {
      lines.push(
        L(lang, {
          sl: `Aktivnosti: ${d.activities.slice(0, 5).join(", ")}. Najbolj znano za: ${d.highlights.slice(0, 3).join(", ")}.`,
          en: `Activities: ${d.activities.slice(0, 5).join(", ")}. Best known for: ${d.highlights.slice(0, 3).join(", ")}.`,
          it: `Attività: ${d.activities.slice(0, 5).join(", ")}. Nota soprattutto per: ${d.highlights.slice(0, 3).join(", ")}.`,
          de: `Aktivitäten: ${d.activities.slice(0, 5).join(", ")}. Am bekanntesten für: ${d.highlights.slice(0, 3).join(", ")}.`,
        })
      );
      if (destExperiences.length > 0) {
        lines.push(
          L(lang, {
            sl: `Izkušnje iz naše baze:\n${destExperiences.slice(0, 3).map((e) => experienceLine(e, lang)).join("\n")}`,
            en: `Experiences from our database:\n${destExperiences.slice(0, 3).map((e) => experienceLine(e, lang)).join("\n")}`,
            it: `Esperienze dal nostro database:\n${destExperiences.slice(0, 3).map((e) => experienceLine(e, lang)).join("\n")}`,
            de: `Erlebnisse aus unserer Datenbank:\n${destExperiences.slice(0, 3).map((e) => experienceLine(e, lang)).join("\n")}`,
          })
        );
      }
    }

    // Nastanitev.
    if (isAccommodation(q) && destListings.length > 0) {
      lines.push(
        L(lang, {
          sl: `Lokalni ponudniki (nastanitev in ostalo):\n${destListings.slice(0, 3).map((l) => listingLine(l, lang)).join("\n")}`,
          en: `Local providers (accommodation and more):\n${destListings.slice(0, 3).map((l) => listingLine(l, lang)).join("\n")}`,
          it: `Fornitori locali (alloggio e altro):\n${destListings.slice(0, 3).map((l) => listingLine(l, lang)).join("\n")}`,
          de: `Lokale Anbieter (Unterkunft und mehr):\n${destListings.slice(0, 3).map((l) => listingLine(l, lang)).join("\n")}`,
        })
      );
    }

    // Cene — samo realne cene, "od €X".
    if (isPrice(q)) {
      const expMin = minPrice(destExperiences.map((e) => e.pricePerPerson));
      const prodMin = minPrice(destProducts.map((p) => p.price));
      const parts: string[] = [];
      if (expMin != null)
        parts.push(L(lang, {
          sl: `izkušnje od €${expMin}/osebo`,
          en: `experiences from €${expMin} per person`,
          it: `esperienze da €${expMin} a persona`,
          de: `Erlebnisse ab €${expMin} pro Person`,
        }));
      if (prodMin != null)
        parts.push(L(lang, {
          sl: `izdelki od €${prodMin}`,
          en: `products from €${prodMin}`,
          it: `prodotti da €${prodMin}`,
          de: `Produkte ab €${prodMin}`,
        }));
      const priceLine =
        parts.length > 0
          ? L(lang, {
              sl: `Naši podatki za ${dest.name}: ${parts.join(", ")} — natančne (žive) cene so vidne na straneh posameznih ponudb.`,
              en: `Our data for ${dest.name}: ${parts.join(", ")} — exact (live) prices are shown on each offer's page.`,
              it: `I nostri dati per ${dest.name}: ${parts.join(", ")} — i prezzi esatti (aggiornati) sono visibili sulla pagina di ogni singola offerta.`,
              de: `Unsere Daten für ${dest.name}: ${parts.join(", ")} — genaue (Live-)Preise siehst du auf der Seite jedes einzelnen Angebots.`,
            })
          : L(lang, {
              sl: `Okvirni strošek obiska ${dest.name} je od €${dest.costPerPerson}/osebo (naša ocena, ne živa cena).`,
              en: `Estimated cost of visiting ${dest.name} is from €${dest.costPerPerson} per person (our estimate, not a live price).`,
              it: `Il costo indicativo della visita a ${dest.name} è da €${dest.costPerPerson} a persona (nostra stima, non un prezzo aggiornato).`,
              de: `Die geschätzten Kosten für einen Besuch von ${dest.name} liegen ab €${dest.costPerPerson} pro Person (unsere Schätzung, kein Live-Preis).`,
            });
      lines.push(priceLine);
    }

    // Prevozi do destinacije — usmeritev na Journey (realna funkcija).
    if (isJourney(q)) {
      lines.push(
        L(lang, {
          sl: `Prevoze in transferje do ${dest.name} (npr. od letališča ali sosednjih mest) načrtuješ na /potovanje — ponudbe prevozov z "od €X" cenami in zunanjo rezervacijo pri ponudniku.`,
          en: `Plan transfers to ${dest.name} (e.g. from the airport or nearby cities) at /potovanje — transfer offers with "from €X" prices and external booking with the provider.`,
          it: `I trasferimenti verso ${dest.name} (ad es. dall'aeroporto o dalle città vicine) li pianifichi su /potovanje — offerte di transfer con prezzi "da €X" e prenotazione esterna presso il fornitore.`,
          de: `Transfers nach ${dest.name} (z. B. vom Flughafen oder aus Nachbarstädten) planst du auf /potovanje — Transferangebote mit „ab €X“-Preisen und externer Buchung beim Anbieter.`,
        })
      );
    }

    lines.push(
      L(lang, {
        sl: `Več o ${dest.name}: /destinacija/${dest.slug}; načrt potovanja: /nacrtuj.`,
        en: `More about ${dest.name}: /destinacija/${dest.slug}; trip planning: /nacrtuj.`,
        it: `Altro su ${dest.name}: /destinacija/${dest.slug}; pianificazione del viaggio: /nacrtuj.`,
        de: `Mehr über ${dest.name}: /destinacija/${dest.slug}; Reiseplanung: /nacrtuj.`,
      })
    );

    return { message: `${lines.join("\n")}`, places };
  }

  // ── 2. NAMENSKA VPRAŠANJA BREZ DESTINACIJE ────────────────────────────

  if (isGreeting(q) && q.trim().length < 40) {
    return {
      message: L(lang, {
        sl: `Pozdravljen! 🇸🇮 Lahko ti pomagam z informacijami o ${DESTINATIONS.length} destinacijah, lokalnih ponudnikih, izdelkih in izkušnjah. Vprašaj npr. »Kaj lahko vidim v Piranu?«, »Kje lahko jedem v Ljubljani?« ali »Kakšno bo vreme na Bledu?«`,
        en: `Hello! 🇸🇮 I can help with information about ${DESTINATIONS.length} destinations, local providers, products and experiences. Try asking e.g. "What can I see in Piran?", "Where can I eat in Ljubljana?" or "What's the weather like at Bled?"`,
        it: `Ciao! 🇸🇮 Posso aiutarti con informazioni su ${DESTINATIONS.length} destinazioni, fornitori locali, prodotti ed esperienze. Prova a chiedere ad es. «Cosa posso vedere a Pirano?», «Dove posso mangiare a Lubiana?» o «Che tempo fa a Bled?»`,
        de: `Hallo! 🇸🇮 Ich helfe mit Informationen zu ${DESTINATIONS.length} Destinationen, lokalen Anbietern, Produkten und Erlebnissen. Frag z. B. „Was kann ich in Piran sehen?“, „Wo kann ich in Ljubljana essen?“ oder „Wie ist das Wetter am Bled?“`,
      }),
      places: [],
    };
  }

  if (isRestaurant(q)) {
    const near = context.osmPlaces.slice(0, 4);
    if (near.length > 0) {
      return {
        message: L(lang, {
          sl: `Kraji v bližini (OpenStreetMap — skupnostni vir):\n${near.map(osmLine).join("\n")}`,
          en: `Places nearby (OpenStreetMap — community data):\n${near.map(osmLine).join("\n")}`,
          it: `Luoghi nelle vicinanze (OpenStreetMap — dati della community):\n${near.map(osmLine).join("\n")}`,
          de: `Orte in der Nähe (OpenStreetMap — Community-Daten):\n${near.map(osmLine).join("\n")}`,
        }),
        places: [...near],
      };
    }
    const foodish = context.listings.slice(0, 3);
    if (foodish.length > 0) {
      return {
        message: L(lang, {
          sl: `Lokalni ponudniki iz naše baze:\n${foodish.map((l) => listingLine(l, lang)).join("\n")}\nPovej destinacijo, in ti poiščem gostilne v bližini.`,
          en: `Local providers from our database:\n${foodish.map((l) => listingLine(l, lang)).join("\n")}\nName a destination and I'll look up nearby places.`,
          it: `Fornitori locali dal nostro database:\n${foodish.map((l) => listingLine(l, lang)).join("\n")}\nDimmi una destinazione e cerco i luoghi nelle vicinanze.`,
          de: `Lokale Anbieter aus unserer Datenbank:\n${foodish.map((l) => listingLine(l, lang)).join("\n")}\nNenne eine Destination und ich suche Orte in der Nähe.`,
        }),
        places: [],
      };
    }
    return {
      message: L(lang, {
        sl: `Povej, kateri kraj te zanima, in ti poiščem gostilne ter restavracije v bližini (OpenStreetMap).`,
        en: `Tell me which place you're interested in and I'll look up nearby restaurants and inns (OpenStreetMap).`,
        it: `Dimmi quale luogo ti interessa e cerco ristoranti e osterie nelle vicinanze (OpenStreetMap).`,
        de: `Sag mir, welcher Ort dich interessiert, und ich suche Restaurants und Gasthäuser in der Nähe (OpenStreetMap).`,
      }),
      places: [],
    };
  }

  if (isWeather(q)) {
    return {
      message: L(lang, {
        sl: `Za konkretno napoved mi povej kraj (npr. »Kakšno bo vreme na Bledu?«). Živo vreme je sicer vgrajeno v vsak načrt (/nacrtuj) in na zemljevidu (/zemljevid) — vir Open-Meteo, brez API ključa.`,
        en: `Name a place for a concrete forecast (e.g. "What's the weather at Bled?"). Live weather is otherwise built into every itinerary (/nacrtuj) and shown on the map (/zemljevid) — source Open-Meteo, no API key needed.`,
        it: `Per una previsione concreta dimmi un luogo (ad es. «Che tempo fa a Bled?»). Il meteo aggiornato è comunque integrato in ogni itinerario (/nacrtuj) e visibile sulla mappa (/zemljevid) — fonte Open-Meteo, senza chiave API.`,
        de: `Für eine konkrete Vorhersage nenne mir einen Ort (z. B. „Wie ist das Wetter am Bled?“). Live-Wetter ist ohnehin in jeden Reisplan (/nacrtuj) eingebaut und auf der Karte (/zemljevid) sichtbar — Quelle Open-Meteo, ohne API-Schlüssel.`,
      }),
      places: [],
    };
  }

  if (isPrice(q)) {
    const prodMin = minPrice(context.products.map((p) => p.price));
    const expMin = minPrice(context.experiences.map((e) => e.pricePerPerson));
    const parts: string[] = [];
    if (expMin != null)
      parts.push(L(lang, {
        sl: `izkušnje od €${expMin}/osebo`,
        en: `experiences from €${expMin} per person`,
        it: `esperienze da €${expMin} a persona`,
        de: `Erlebnisse ab €${expMin} pro Person`,
      }));
    if (prodMin != null)
      parts.push(L(lang, {
        sl: `izdelki od €${prodMin}`,
        en: `products from €${prodMin}`,
        it: `prodotti da €${prodMin}`,
        de: `Produkte ab €${prodMin}`,
      }));
    const listingRanges = context.listings
      .map((l) => l.priceRange)
      .filter((r): r is string => !!r)
      .slice(0, 3);
    const intro = L(lang, {
      sl: `${parts.length > 0 ? `Iz naše baze: ${parts.join(", ")}` : "Cenovnih podatkov trenutno ni v bazi."}`,
      en: `${parts.length > 0 ? `From our database: ${parts.join(", ")}` : "No pricing data in the database right now."}`,
      it: `${parts.length > 0 ? `Dal nostro database: ${parts.join(", ")}` : "Al momento non ci sono dati sui prezzi nel database."}`,
      de: `${parts.length > 0 ? `Aus unserer Datenbank: ${parts.join(", ")}` : "Aktuell sind keine Preisdaten in der Datenbank."}`,
    });
    const ranges =
      listingRanges.length > 0
        ? L(lang, {
            sl: ` Lokalni cenovni razponi: ${listingRanges.join(", ")}.`,
            en: ` Local price ranges: ${listingRanges.join(", ")}.`,
            it: ` Fasce di prezzo locali: ${listingRanges.join(", ")}.`,
            de: ` Lokale Preisspannen: ${listingRanges.join(", ")}.`,
          })
        : "";
    const outro = L(lang, {
      sl: ` Natančne cene so vedno na strani posamezne ponudbe — pri ponudnikih, ki ne objavijo cene, prikažemo NEZNANO (nikoli izmišljene).`,
      en: ` Exact prices are always on each offer's page — where a provider hasn't published a price we show UNKNOWN (never invented).`,
      it: ` I prezzi esatti sono sempre sulla pagina di ogni offerta — dove un fornitore non ha pubblicato un prezzo mostriamo SCONOSCIUTO (mai inventato).`,
      de: ` Genaue Preise stehen immer auf der Seite jedes Angebots — hat ein Anbieter keinen Preis veröffentlicht, zeigen wir UNBEKANNT (nie erfunden).`,
    });
    return {
      message: `${intro}${ranges}${outro}`,
      places: [],
    };
  }

  if (isItinerary(q)) {
    return {
      message: L(lang, {
        sl: `Načrt potovanja zgradiš na /nacrtuj — podaj proračun, število dni, interese in sezono; načrtovalec sestavi dnevni red z realnimi postanki, prevozi (OSRM), vremenom (Open-Meteo) in oceno stroškov. Trenutno shranjen načrt in MOJA POT sta ti na voljo po ponovnem obisku strani.`,
        en: `Build your travel plan at /nacrtuj — set budget, days, interests and season; the planner produces a daily schedule with real stops, transfers (OSRM), weather (Open-Meteo) and a cost estimate. Your saved plan and MY TRIP are restored when you return.`,
        it: `Costruisci il piano di viaggio su /nacrtuj — indica budget, giorni, interessi e stagione; il pianificatore crea un programma giornaliero con tappe reali, trasferimenti (OSRM), meteo (Open-Meteo) e stima dei costi. Il piano salvato e IL MIO VIAGGIO vengono ripristinati al tuo ritorno.`,
        de: `Deinen Reiseplan erstellst du auf /nacrtuj — gib Budget, Tage, Interessen und Saison an; der Planer erzeugt ein Tagesprogramm mit echten Stopps, Transfers (OSRM), Wetter (Open-Meteo) und Kostenschätzung. Dein gespeicherter Plan und MEINE REISE werden bei deinem nächsten Besuch wiederhergestellt.`,
      }),
      places: [],
    };
  }

  if (isJourney(q)) {
    return {
      message: L(lang, {
        sl: `Prevoze in transferje načrtuješ na /potovanje — iskanje ponudb prevozov (npr. KiwiTaxi), dodajanje v načrt in zunanja rezervacija pri ponudniku. Cene prevozov so "od €X" (od-cene) — končna cena se potrdi pri ponudniku.`,
        en: `Plan transfers and transport at /potovanje — search transfer offers (e.g. KiwiTaxi), add them to your plan and book externally with the provider. Transfer prices are "from €X" — the final price is confirmed at the provider.`,
        it: `Trasferimenti e trasporti li pianifichi su /potovanje — ricerca di offerte di transfer (ad es. KiwiTaxi), aggiunta al piano e prenotazione esterna presso il fornitore. I prezzi dei transfer sono «da €X» — il prezzo finale si conferma presso il fornitore.`,
        de: `Transfers und Transporte planst du auf /potovanje — Suche nach Transferangeboten (z. B. KiwiTaxi), Hinzufügen zum Plan und externe Buchung beim Anbieter. Transferpreise sind „ab €X“ — der endgültige Preis wird beim Anbieter bestätigt.`,
      }),
      places: [],
    };
  }

  if (isBookingOrMyTrip(q)) {
    return {
      message: L(lang, {
        sl: `MOJA POT (na /potovanje) prikazuje tvoje postanke in statuse rezervacij. Rezervacija poteka PRI PONUDNIKU (zunanja rezervacija) — status v aplikaciji je ZUNANJA REZERVACIJA, NIKOLI "potrjeno", dokler ponudnik ne potrdi. Živih booking API-jev trenutno ni v produkciji, zato statusov ne izmišljujemo.`,
        en: `MY TRIP (at /potovanje) shows your stops and booking statuses. Booking happens WITH THE PROVIDER (external booking) — the in-app status is EXTERNAL, never "confirmed" until the provider confirms. There are no live booking APIs in production, so we never invent statuses.`,
        it: `IL MIO VIAGGIO (su /potovanje) mostra le tue tappe e gli stati delle prenotazioni. La prenotazione avviene PRESSO IL FORNITORE (prenotazione esterna) — lo stato nell'app è ESTERNA, mai «confermata» finché il fornitore non conferma. Non ci sono API di prenotazione live in produzione, quindi non inventiamo stati.`,
        de: `MEINE REISE (auf /potovanje) zeigt deine Stopps und Buchungsstatus. Die Buchung erfolgt BEIM ANBIETER (externe Buchung) — der Status in der App ist EXTERN, nie „bestätigt“, bis der Anbieter bestätigt. Es gibt keine Live-Buchungs-APIs in Produktion, deshalb erfinden wir keine Status.`,
      }),
      places: [],
    };
  }

  if (isAvailability(q)) {
    return {
      message: L(lang, {
        sl: `Razpoložljivost posameznih terminov žal ne moremo preverjati v živo — pri ponudbah prikazujemo NEZNANO oz. "ni živih podatkov" in ne izmišljujemo prostih terminov. Končno razpoložljivost vedno potrdiš pri ponudniku (zunanja rezervacija).`,
        en: `We cannot check live availability of specific slots — offers show UNKNOWN / "no live data" and we never invent free slots. Final availability is always confirmed with the provider (external booking).`,
        it: `Purtroppo non possiamo verificare in tempo reale la disponibilità dei singoli slot — le offerte mostrano SCONOSCIUTO o «nessun dato live» e non inventiamo mai slot liberi. La disponibilità finale si conferma sempre presso il fornitore (prenotazione esterna).`,
        de: `Die Verfügbarkeit einzelner Termine können wir leider nicht live prüfen — Angebote zeigen UNBEKANNT bzw. „keine Live-Daten“ und wir erfinden nie freie Termine. Die endgültige Verfügbarkeit bestätigst du immer beim Anbieter (externe Buchung).`,
      }),
      places: [],
    };
  }

  if (isActivity(q) && context.experiences.length > 0) {
    return {
      message: L(lang, {
        sl: `Izkušnje iz naše baze:\n${context.experiences.slice(0, 3).map((e) => experienceLine(e, lang)).join("\n")}\nZa konkreten kraj povej destinacijo.`,
        en: `Experiences from our database:\n${context.experiences.slice(0, 3).map((e) => experienceLine(e, lang)).join("\n")}\nName a destination for specific suggestions.`,
        it: `Esperienze dal nostro database:\n${context.experiences.slice(0, 3).map((e) => experienceLine(e, lang)).join("\n")}\nDimmi una destinazione per suggerimenti specifici.`,
        de: `Erlebnisse aus unserer Datenbank:\n${context.experiences.slice(0, 3).map((e) => experienceLine(e, lang)).join("\n")}\nNenne eine Destination für konkrete Vorschläge.`,
      }),
      places: [],
    };
  }

  if (isAccommodation(q) && context.listings.length > 0) {
    return {
      message: L(lang, {
        sl: `Lokalni ponudniki iz naše baze:\n${context.listings.slice(0, 3).map((l) => listingLine(l, lang)).join("\n")}\nZa konkreten kraj povej destinacijo.`,
        en: `Local providers from our database:\n${context.listings.slice(0, 3).map((l) => listingLine(l, lang)).join("\n")}\nName a destination for specific suggestions.`,
        it: `Fornitori locali dal nostro database:\n${context.listings.slice(0, 3).map((l) => listingLine(l, lang)).join("\n")}\nDimmi una destinazione per suggerimenti specifici.`,
        de: `Lokale Anbieter aus unserer Datenbank:\n${context.listings.slice(0, 3).map((l) => listingLine(l, lang)).join("\n")}\nNenne eine Destination für konkrete Vorschläge.`,
      }),
      places: [],
    };
  }

  // ── 3. BREZ ZADETEKA — pošteno, z realnimi primeri ────────────────────
  const top3 = [...DESTINATIONS]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3)
    .map((raw) => {
      const d = localizedDest(raw, lang);
      return `• ${raw.name} — ${d.tagline} (${raw.rating}/5)`;
    });
  return {
    message: L(lang, {
      sl: `Na to vprašanje nimam pripravljenega odgovora iz naših podatkov — raje ne ugibam. Lahko pa ti pomagam z: destinacijami (kaj videti, aktivnosti), gostilnami in restavracijami v bližini kraja, vremenom za konkreten kraj, cenami izdelkov in izkušenj ter načrtovanjem potovanja.\nNajbolje ocenjene destinacije:\n${top3.join("\n")}`,
      en: `I don't have an answer from our data for this question — I'd rather not guess. I can help with: destinations (what to see, activities), nearby restaurants and inns, weather for a specific place, product and experience prices, and trip planning.\nOur top-rated destinations:\n${top3.join("\n")}`,
      it: `Non ho una risposta dai nostri dati per questa domanda — preferisco non tirare a indovinare. Posso però aiutarti con: destinazioni (cosa vedere, attività), ristoranti e osterie nelle vicinanze, meteo per un luogo specifico, prezzi di prodotti ed esperienze e pianificazione del viaggio.\nDestinazioni con le valutazioni più alte:\n${top3.join("\n")}`,
      de: `Für diese Frage habe ich keine Antwort aus unseren Daten — ich rate lieber nicht. Helfen kann ich dir mit: Destinationen (was sehen, Aktivitäten), Restaurants und Gasthäusern in der Nähe, Wetter für einen bestimmten Ort, Produkt- und Erlebnispreisen sowie Reiseplanung.\nUnsere am besten bewerteten Destinationen:\n${top3.join("\n")}`,
    }),
    places: [],
  };
}
