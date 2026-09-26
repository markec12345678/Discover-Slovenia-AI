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
// ČISTOST: modul NE uvaža db/ai-client — vsi podatki pridejo prek argumentov
// (enricher callback za destinacijske poizvedbe v bazi vbrizga klicalec),
// zato je popolnoma unit-testljiv.
// ============================================================================

import { DESTINATIONS, COUNTRIES } from "@/lib/slovenia-data";
import { matchDestinationsInText, type ChatPlace } from "@/lib/geo-intent";
import {
  fetchDailyForecast,
  weatherCodeToText,
  weatherCodeToTextEn,
  type DailyForecast,
} from "@/lib/weather-utils";
import type { Destination } from "@/lib/types";

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

// ─── Namigovanje namena (ključne besede SL + EN, deterministično) ─────────

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
    "transfer",
    "bus",
    "train",
    "taxi",
    "how to get",
    "getting there",
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
  ]);

// ─── Pomožne (formatiranje realnih podatkov) ──────────────────────────────

function countryLabel(d: Destination, lang: "sl" | "en"): string {
  const c = COUNTRIES.find((x) => x.value === d.country);
  if (!c) return d.country;
  // EN oznake držav so kratke in enake ISO razširitvam — uporabimo
  // slovensko oznako le za SL, sicer angleško ime.
  if (lang === "en") {
    return (
      { SI: "Slovenia", HR: "Croatia", ME: "Montenegro", AL: "Albania" } as Record<
        string,
        string
      >
    )[d.country] ?? c.label;
  }
  return c.label;
}

function fmtPriceRange(range: string | null): string {
  if (!range) return "";
  return ` (${range})`;
}

function listingLine(l: DomainListing): string {
  return `• ${l.name}${l.destinationName ? ` — ${l.destinationName}` : ""}${fmtPriceRange(l.priceRange)}${l.rating != null ? `, ocena ${l.rating}/5` : ""}`;
}

function experienceLine(e: DomainExperience): string {
  return `• ${e.name}${e.destinationName ? ` — ${e.destinationName}` : ""}${e.pricePerPerson != null ? `, od €${e.pricePerPerson}/osebo` : ""}`;
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
  lang: "sl" | "en",
  context: DomainContext,
  options?: {
    enrich?: DestinationEnricher;
    weather?: WeatherFetcher;
  }
): Promise<DomainAnswer> {
  const q = ` ${question.toLowerCase()} `;
  const sl = lang === "sl";
  const weatherFetch = options?.weather ?? fetchDailyForecast;

  // Ujemanje destinacij enkrat (t1 pini + primarna destinacija iz istega klica).
  const matchedPlaces = matchDestinationsInText(question);
  const dest =
    matchedPlaces.length > 0
      ? (DESTINATIONS.find((d) => d.slug === matchedPlaces[0].slug) ?? null)
      : null;

  // ── 1. VPRAŠANJE ZA DESTINACIJO (najbogatejši odgovor) ────────────────
  if (dest) {
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
      sl
        ? `${dest.name} (${countryLabel(dest, "sl")}): ${dest.tagline}. Ocena ${dest.rating}/5, priporočen obisk: ${dest.duration.toLowerCase()}, strošek okvirno od €${dest.costPerPerson}/osebo.`
        : `${dest.name} (${countryLabel(dest, "en")}): ${dest.tagline}. Rated ${dest.rating}/5, recommended visit: ${dest.duration.toLowerCase()}, estimated cost from €${dest.costPerPerson} per person.`
    );

    // Vreme — realna napoved Open-Meteo ALI izrecno "ni na voljo".
    if (isWeather(q)) {
      const forecast = await weatherFetch(dest.coords.lat, dest.coords.lng, 2);
      if (forecast && forecast.length > 0) {
        const today = forecast[0];
        const wmo = sl
          ? weatherCodeToText(today.weatherCode)
          : weatherCodeToTextEn(today.weatherCode);
        const rain =
          today.precipitationProbabilityMax != null
            ? sl
              ? `, verjetnost padavin ${today.precipitationProbabilityMax}%`
              : `, precipitation probability ${today.precipitationProbabilityMax}%`
            : "";
        lines.push(
          sl
            ? `Napoved (${today.date}, Open-Meteo): ${wmo}, do ${today.tempMax} °C${rain}.`
            : `Forecast (${today.date}, Open-Meteo): ${wmo}, up to ${today.tempMax} °C${rain}.`
        );
      } else {
        lines.push(
          sl
            ? "Vremenske napovedi trenutno ni uspelo pridobiti — živo vreme vidiš v načrtu in na zemljevidu."
            : "Could not retrieve the forecast right now — live weather is shown in the itinerary and on the map."
        );
      }
    }

    // Restavracije/gostilne — realni OSM kraji (ruta jih je že pridobila).
    if (isRestaurant(q)) {
      const near = context.osmPlaces.slice(0, 4);
      if (near.length > 0) {
        places.push(...near);
        lines.push(
          sl
            ? `Kraji v bližini (OpenStreetMap — skupnostni vir, NI uradno preverjeno):\n${near.map(osmLine).join("\n")}`
            : `Places nearby (OpenStreetMap — community data, NOT officially verified):\n${near.map(osmLine).join("\n")}`
        );
      } else {
        // Kraj je bil POVEDAN, a OSM (Overpass) ni vrnil rezultatov —
        // izrecno priznamo ( NE vprašamo po kraju, ki ga uporabnik ravno
        // zdaj imenoval) in ponudimo bazo lokalov spodaj.
        lines.push(
          sl
            ? `Gostiln v bližini trenutno ni uspelo pridobiti (OpenStreetMap) — poskusi kasneje znova.`
            : `Couldn't retrieve nearby places right now (OpenStreetMap) — try again later.`
        );
      }
      if (destListings.length > 0) {
        lines.push(
          sl
            ? `Iz naše baze lokalov:\n${destListings.slice(0, 3).map(listingLine).join("\n")}`
            : `From our local provider database:\n${destListings.slice(0, 3).map(listingLine).join("\n")}`
        );
      }
    }

    // Aktivnosti/izkušnje.
    if (isActivity(q)) {
      lines.push(
        sl
          ? `Aktivnosti: ${dest.activities.slice(0, 5).join(", ")}. Najbolj znano za: ${dest.highlights.slice(0, 3).join(", ")}.`
          : `Activities: ${dest.activities.slice(0, 5).join(", ")}. Best known for: ${dest.highlights.slice(0, 3).join(", ")}.`
      );
      if (destExperiences.length > 0) {
        lines.push(
          sl
            ? `Izkušnje iz naše baze:\n${destExperiences.slice(0, 3).map(experienceLine).join("\n")}`
            : `Experiences from our database:\n${destExperiences.slice(0, 3).map(experienceLine).join("\n")}`
        );
      }
    }

    // Nastanitev.
    if (isAccommodation(q) && destListings.length > 0) {
      lines.push(
        sl
          ? `Lokalni ponudniki (nastanitev in ostalo):\n${destListings.slice(0, 3).map(listingLine).join("\n")}`
          : `Local providers (accommodation and more):\n${destListings.slice(0, 3).map(listingLine).join("\n")}`
      );
    }

    // Cene — samo realne cene, "od €X".
    if (isPrice(q)) {
      const expMin = minPrice(destExperiences.map((e) => e.pricePerPerson));
      const prodMin = minPrice(destProducts.map((p) => p.price));
      const parts: string[] = [];
      if (expMin != null)
        parts.push(sl ? `izkušnje od €${expMin}/osebo` : `experiences from €${expMin} per person`);
      if (prodMin != null)
        parts.push(sl ? `izdelki od €${prodMin}` : `products from €${prodMin}`);
      const priceLine =
        parts.length > 0
          ? sl
            ? `Naši podatki za ${dest.name}: ${parts.join(", ")} — natančne (žive) cene so vidne na straneh posameznih ponudb.`
            : `Our data for ${dest.name}: ${parts.join(", ")} — exact (live) prices are shown on each offer's page.`
          : sl
            ? `Okvirni strošek obiska ${dest.name} je od €${dest.costPerPerson}/osebo (naša ocena, ne živa cena).`
            : `Estimated cost of visiting ${dest.name} is from €${dest.costPerPerson} per person (our estimate, not a live price).`;
      lines.push(priceLine);
    }

    // Prevozi do destinacije — usmeritev na Journey (realna funkcija).
    if (isJourney(q)) {
      lines.push(
        sl
          ? `Prevoze in transferje do ${dest.name} (npr. od letališča ali sosednjih mest) načrtuješ na /potovanje — ponudbe prevozov z "od €X" cenami in zunanjo rezervacijo pri ponudniku.`
          : `Plan transfers to ${dest.name} (e.g. from the airport or nearby cities) at /potovanje — transfer offers with "from €X" prices and external booking with the provider.`
      );
    }

    lines.push(
      sl
        ? `Več o ${dest.name}: /destinacija/${dest.slug}; načrt potovanja: /nacrtuj.`
        : `More about ${dest.name}: /destinacija/${dest.slug}; trip planning: /nacrtuj.`
    );

    return { message: `${lines.join("\n")}`, places };
  }

  // ── 2. NAMENSKA VPRAŠANJA BREZ DESTINACIJE ────────────────────────────

  if (isGreeting(q) && q.trim().length < 40) {
    return {
      message: sl
        ? `Pozdravljen! 🇸🇮 Lahko ti pomagam z informacijami o ${DESTINATIONS.length} destinacijah, lokalnih ponudnikih, izdelkih in izkušnjah. Vprašaj npr. »Kaj lahko vidim v Piranu?«, »Kje lahko jedem v Ljubljani?« ali »Kakšno bo vreme na Bledu?«`
        : `Hello! 🇸🇮 I can help with information about ${DESTINATIONS.length} destinations, local providers, products and experiences. Try asking e.g. "What can I see in Piran?", "Where can I eat in Ljubljana?" or "What's the weather like at Bled?"`,
      places: [],
    };
  }

  if (isRestaurant(q)) {
    const near = context.osmPlaces.slice(0, 4);
    if (near.length > 0) {
      return {
        message: `${sl ? `Kraji v bližini (OpenStreetMap — skupnostni vir):\n${near.map(osmLine).join("\n")}` : `Places nearby (OpenStreetMap — community data):\n${near.map(osmLine).join("\n")}`}`,
        places: [...near],
      };
    }
    const foodish = context.listings.slice(0, 3);
    if (foodish.length > 0) {
      return {
        message: `${sl ? `Lokalni ponudniki iz naše baze:\n${foodish.map(listingLine).join("\n")}\nPovej destinacijo, in ti poiščem gostilne v bližini.` : `Local providers from our database:\n${foodish.map(listingLine).join("\n")}\nName a destination and I'll look up nearby places.`}`,
        places: [],
      };
    }
    return {
      message: sl
        ? `Povej, kateri kraj te zanima, in ti poiščem gostilne ter restavracije v bližini (OpenStreetMap).`
        : `Tell me which place you're interested in and I'll look up nearby restaurants and inns (OpenStreetMap).`,
      places: [],
    };
  }

  if (isWeather(q)) {
    return {
      message: sl
        ? `Za konkretno napoved mi povej kraj (npr. »Kakšno bo vreme na Bledu?«). Živo vreme je sicer vgrajeno v vsak načrt (/nacrtuj) in na zemljevidu (/zemljevid) — vir Open-Meteo, brez API ključa.`
        : `Name a place for a concrete forecast (e.g. "What's the weather at Bled?"). Live weather is otherwise built into every itinerary (/nacrtuj) and shown on the map (/zemljevid) — source Open-Meteo, no API key needed.`,
      places: [],
    };
  }

  if (isPrice(q)) {
    const prodMin = minPrice(context.products.map((p) => p.price));
    const expMin = minPrice(context.experiences.map((e) => e.pricePerPerson));
    const parts: string[] = [];
    if (expMin != null)
      parts.push(sl ? `izkušnje od €${expMin}/osebo` : `experiences from €${expMin} per person`);
    if (prodMin != null)
      parts.push(sl ? `izdelki od €${prodMin}` : `products from €${prodMin}`);
    const listingRanges = context.listings
      .map((l) => l.priceRange)
      .filter((r): r is string => !!r)
      .slice(0, 3);
    return {
      message: sl
        ? `${parts.length > 0 ? `Iz naše baze: ${parts.join(", ")}` : "Cenovnih podatkov trenutno ni v bazi."}${listingRanges.length > 0 ? ` Lokalni cenovni razponi: ${listingRanges.join(", ")}.` : ""} Natančne cene so vedno na strani posamezne ponudbe — pri ponudnikih, ki ne objavijo cene, prikažemo NEZNANO (nikoli izmišljene).`
        : `${parts.length > 0 ? `From our database: ${parts.join(", ")}` : "No pricing data in the database right now."}${listingRanges.length > 0 ? ` Local price ranges: ${listingRanges.join(", ")}.` : ""} Exact prices are always on each offer's page — where a provider hasn't published a price we show UNKNOWN (never invented).`,
      places: [],
    };
  }

  if (isItinerary(q)) {
    return {
      message: sl
        ? `Načrt potovanja zgradiš na /nacrtuj — podaj proračun, število dni, interese in sezono; načrtovalec sestavi dnevni red z realnimi postanki, prevozi (OSRM), vremenom (Open-Meteo) in oceno stroškov. Trenutno shranjen načrt in MOJA POT sta ti na voljo po ponovnem obisku strani.`
        : `Build your travel plan at /nacrtuj — set budget, days, interests and season; the planner produces a daily schedule with real stops, transfers (OSRM), weather (Open-Meteo) and a cost estimate. Your saved plan and MY TRIP are restored when you return.`,
      places: [],
    };
  }

  if (isJourney(q)) {
    return {
      message: sl
        ? `Prevoze in transferje načrtuješ na /potovanje — iskanje ponudb prevozov (npr. KiwiTaxi), dodajanje v načrt in zunanja rezervacija pri ponudniku. Cene prevozov so "od €X" (od-cene) — končna cena se potrdi pri ponudniku.`
        : `Plan transfers and transport at /potovanje — search transfer offers (e.g. KiwiTaxi), add them to your plan and book externally with the provider. Transfer prices are "from €X" — the final price is confirmed at the provider.`,
      places: [],
    };
  }

  if (isBookingOrMyTrip(q)) {
    return {
      message: sl
        ? `MOJA POT (na /potovanje) prikazuje tvoje postanke in statuse rezervacij. Rezervacija poteka PRI PONUDNIKU (zunanja rezervacija) — status v aplikaciji je ZUNANJA REZERVACIJA, NIKOLI "potrjeno", dokler ponudnik ne potrdi. Živih booking API-jev trenutno ni v produkciji, zato statusov ne izmišljujemo.`
        : `MY TRIP (at /potovanje) shows your stops and booking statuses. Booking happens WITH THE PROVIDER (external booking) — the in-app status is EXTERNAL, never "confirmed" until the provider confirms. There are no live booking APIs in production, so we never invent statuses.`,
      places: [],
    };
  }

  if (isAvailability(q)) {
    return {
      message: sl
        ? `Razpoložljivost posameznih terminov žal ne moremo preverjati v živo — pri ponudbah prikazujemo NEZNANO oz. "ni živih podatkov" in ne izmišljujemo prostih terminov. Končno razpoložljivost vedno potrdiš pri ponudniku (zunanja rezervacija).`
        : `We cannot check live availability of specific slots — offers show UNKNOWN / "no live data" and we never invent free slots. Final availability is always confirmed with the provider (external booking).`,
      places: [],
    };
  }

  if (isActivity(q) && context.experiences.length > 0) {
    return {
      message: `${sl ? `Izkušnje iz naše baze:\n${context.experiences.slice(0, 3).map(experienceLine).join("\n")}\nZa konkreten kraj povej destinacijo.` : `Experiences from our database:\n${context.experiences.slice(0, 3).map(experienceLine).join("\n")}\nName a destination for specific suggestions.`}`,
      places: [],
    };
  }

  if (isAccommodation(q) && context.listings.length > 0) {
    return {
      message: `${sl ? `Lokalni ponudniki iz naše baze:\n${context.listings.slice(0, 3).map(listingLine).join("\n")}\nZa konkreten kraj povej destinacijo.` : `Local providers from our database:\n${context.listings.slice(0, 3).map(listingLine).join("\n")}\nName a destination for specific suggestions.`}`,
      places: [],
    };
  }

  // ── 3. BREZ ZADETEKA — pošteno, z realnimi primeri ────────────────────
  const top3 = [...DESTINATIONS]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3)
    .map((d) => `• ${d.name} — ${d.tagline} (${d.rating}/5)`);
  return {
    message: sl
      ? `Na to vprašanje nimam pripravljenega odgovora iz naših podatkov — raje ne ugibam. Lahko pa ti pomagam z: destinacijami (kaj videti, aktivnosti), gostilnami in restavracijami v bližini kraja, vremenom za konkreten kraj, cenami izdelkov in izkušenj ter načrtovanjem potovanja.\nNajbolje ocenjene destinacije:\n${top3.join("\n")}`
      : `I don't have an answer from our data for this question — I'd rather not guess. I can help with: destinations (what to see, activities), nearby restaurants and inns, weather for a specific place, product and experience prices, and trip planning.\nOur top-rated destinations:\n${top3.join("\n")}`,
    places: [],
  };
}
