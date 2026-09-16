import { DESTINATIONS } from "@/lib/slovenia-data";
import {
  PATTERNS,
  BESTFOR_TO_INTEREST,
  normalizeText,
} from "@/lib/url-ingest";
import { haversineKm } from "@/lib/stop-insights";

// ============================================================================
// PINS INGEST — "Uvozi shranjene točke" (F14, Mindtrip "Google Pins")
// ============================================================================
//
// Konkurenčna referenca: Mindtripov "Google Pins" — uvoz shranjenih točk
// Google Zemljevidov ("Maps → Saved") v načrt. Naša izvedba je DETERMINISTIČNA
// (nič AI žetonov) in deluje na TREH vhodnih oblikah:
//
//   1. Google Takeout izvoz "Saved Places.json" (GeoJSON FeatureCollection)
//   2. KML izvoz (<Placemark> z <name> in <coordinates>lng,lat</coordinates>)
//   3. Navaden besedilni seznam (ena točka na vrstico)
//
// Ujemanje z našimi 22 destinacijami ( en vir resnice — PATTERNS iz
// url-ingest):
//   - PO IMENU: besedne meje, diakritika-neobčutljivo, najdaljši vzorec zmaga
//     ("Hotel Triglav Bled" → koordinate odločijo, brez njih pa daljši vzorec)
//   - PO KOORDINATAH: kadar ima točka lat/lng, zmaga najbližja destinacija
//     v polmeru 25 km (točka je lahko hotel/restavracija, ne samo kraj)
//
// Načelo znamke ( enako kot pri povezavah/slikah): neizpodrivan razpon je
// javen — pinsUnmatched se VRNE in izpiše ("N točk izven naših 22"), nič
// se ne izmišljuje.
// ============================================================================

/** Mejna razdalja ( km) za ujemanje točke z destinacijo po koordinatah. */
export const PIN_COORD_RADIUS_KM = 25;

/** Največje število točk, ki jih obravnavamo ( meja proti zlorabi). */
export const MAX_PINS = 2000;

export interface PinItem {
  /** Naslov točke ( Takeout "Title", KML <name>, vrstica besedila) */
  title: string;
  /** Geografska širina ( če je izvoz vsebuje) */
  lat: number | null;
  /** Geografska dolžina ( če je izvoz vsebuje) */
  lng: number | null;
}

export type PinsFormat = "geojson" | "kml" | "text";

export interface PinMatch {
  id: string;
  name: string;
  slug: string;
  /** Koliko shranjenih točk se nanaša na to destinacijo */
  pinCount: number;
  /** Naslovi točk, ki so pripadle tej destinaciji ( prikaz, prvih 3) */
  matchedTitles: string[];
  /** Najmanjša razdalja do destinacije ( km) — samo pri ujemanju po koordinatah */
  nearestKm: number | null;
  /** true = ujemanje po imenu; false = ujemanje po bližini ( koordinate) */
  viaName: boolean;
}

export interface PinsSuggestion {
  /** Predlagani interesi ( kanonični INTERESTS) */
  interests: string[];
  /** Predlagano število dni ( ~2 destinaciji na dan, 1–7) */
  days: number;
  /** ID-ji prepoznanih destinacij ( po številu točk) */
  preferredDestinations: string[];
}

export interface PinsResult {
  format: PinsFormat;
  pinsTotal: number;
  pinsUnmatched: number;
  matches: PinMatch[];
  suggestion: PinsSuggestion;
}

// ---------------------------------------------------------------------------
// PARSER — surovo besedilo → PinItem[]
// ---------------------------------------------------------------------------

interface ParsedPins {
  format: PinsFormat;
  pins: PinItem[];
}

/** Veljavna geo-pozicija ( zavrne 0,0 in nesmiselne vrednosti). */
function saneCoord(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false; // prazen GeoJSON fallback
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** GeoJSON: {features:[{properties:{Title|name|…}, geometry:{coordinates:[lng,lat]}}]}
 *  Google Takeout "Saved Places.json" uporablja properties.Title; druge
 *  izvoze (Maps "My places") pokrijemo z name/title spodaj. */
function parseGeoJson(root: unknown): PinItem[] {
  const pins: PinItem[] = [];
  if (typeof root !== "object" || root === null) return pins;
  const features = (root as { features?: unknown }).features;
  if (!Array.isArray(features)) return pins;

  for (const f of features.slice(0, MAX_PINS)) {
    if (typeof f !== "object" || f === null) continue;
    const props = (f as { properties?: Record<string, unknown> }).properties;
    const geom = (f as { geometry?: { coordinates?: unknown } }).geometry;

    // Naslov: Title (Takeout) | title | name — prvi prisoten niz
    let title = "";
    if (props && typeof props === "object") {
      for (const key of ["Title", "title", "name", "Name"]) {
        const v = props[key];
        if (typeof v === "string" && v.trim().length > 0) {
          title = v.trim().slice(0, 200);
          break;
        }
      }
    }

    // Koordinate: GeoJSON vrstni red [lng, lat]; alternativa location {lat,lng}
    let lat: number | null = null;
    let lng: number | null = null;
    const coords = geom?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const [cLng, cLat] = [Number(coords[0]), Number(coords[1])];
      if (saneCoord(cLat, cLng)) {
        lat = cLat;
        lng = cLng;
      }
    } else if (
      props &&
      typeof props === "object" &&
      typeof (props as { location?: { latitude?: unknown; longitude?: unknown } })
        .location === "object"
    ) {
      const loc = (props as { location: { latitude?: unknown; longitude?: unknown } }).location;
      const [pLat, pLng] = [Number(loc.latitude), Number(loc.longitude)];
      if (saneCoord(pLat, pLng)) {
        lat = pLat;
        lng = pLng;
      }
    }

    if (title || (lat !== null && lng !== null)) {
      pins.push({ title, lat, lng });
    }
  }
  return pins;
}

/** KML: <Placemark><name>…</name><Point><coordinates>lng,lat[,alt]</coordinates>…
 *  ( omejitev: ExtendedData/naslavi ne razbiramo — naslov zadošča). */
function parseKml(xml: string): PinItem[] {
  const pins: PinItem[] = [];
  const placemarks = xml.match(/<Placemark[\s>][\s\S]*?<\/Placemark>/gi) ?? [];
  for (const pm of placemarks.slice(0, MAX_PINS)) {
    const nameMatch = pm.match(/<name[^>]*>([\s\S]{0,300}?)<\/name>/i);
    const title = nameMatch
      ? nameMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#0?39;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200)
      : "";

    const coordMatch = pm.match(
      /<coordinates>\s*(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/i
    );
    let lat: number | null = null;
    let lng: number | null = null;
    if (coordMatch) {
      // KML vrstni red: lng,lat[,alt]
      const [cLng, cLat] = [
        Number(coordMatch[1]),
        Number(coordMatch[2]),
      ];
      if (saneCoord(cLat, cLng)) {
        lat = cLat;
        lng = cLng;
      }
    }
    if (title || (lat !== null && lng !== null)) {
      pins.push({ title, lat, lng });
    }
  }
  return pins;
}

/** Navaden besedilni seznam: vsaka neprazna vrstica = ena točka ( ovenemo
 *  oznake seznama "1.", "-", "•" na začetku vrstice). */
function parseTextList(raw: string): PinItem[] {
  const pins: PinItem[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const cleaned = line
      .replace(/^\s*(?:[•\-*·]|\d{1,3}[.)])\s+/, "")
      .trim()
      .slice(0, 200);
    if (cleaned.length > 0) {
      pins.push({ title: cleaned, lat: null, lng: null });
      if (pins.length >= MAX_PINS) break;
    }
  }
  return pins;
}

/** Prepoznaj obliko vnosnega besedila in razbij na točke. */
export function parsePins(raw: string): ParsedPins {
  const trimmed = raw.trim();

  // 1) JSON ( GeoJSON FeatureCollection iz Takeout-a)
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const root: unknown = JSON.parse(trimmed);
      const pins = parseGeoJson(root);
      // Validna oblika = vsaj 1 točka ali prava FeatureCollection struktura
      if (pins.length > 0) return { format: "geojson", pins };
    } catch {
      // pokvarjen JSON → pošteno pademo na besedilni seznam
    }
  }

  // 2) KML/XML
  if (
    trimmed.startsWith("<?xml") ||
    /^<!DOCTYPE\s+kml/i.test(trimmed) ||
    /<kml[\s>]/i.test(trimmed) ||
    /<Placemark[\s>]/i.test(trimmed)
  ) {
    const pins = parseKml(trimmed);
    if (pins.length > 0) return { format: "kml", pins };
  }

  // 3) Besedilni seznam ( tudi fallback za pokvarjen JSON)
  return { format: "text", pins: parseTextList(trimmed) };
}

// ---------------------------------------------------------------------------
// MATCHER — točke → destinacije ( deterministično)
// ---------------------------------------------------------------------------

/** Zadetek imena na enem naslovu ( najdaljši vzorec zmaga). */
interface NameMatch {
  id: string;
  pattern: string;
}

function matchPinTitle(title: string): NameMatch | null {
  if (!title) return null;
  const normalized = normalizeText(title);
  let best: NameMatch | null = null;
  for (const [id, patterns] of Object.entries(PATTERNS)) {
    for (const pattern of patterns) {
      const escaped = normalizeText(pattern).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );
      // Meja besed na obeh straneh ( "soca" ne ujame "socca") — enako kot
      // url-ingest; en vir vzorcev, ena semantika
      if (new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(normalized)) {
        if (!best || pattern.length > best.pattern.length) {
          best = { id, pattern };
        }
      }
    }
  }
  return best;
}

/** Združi točke v zadetke po destinacijah. */
export function matchPins(pins: PinItem[]): Omit<PinsResult, "format"> {
  const byDest = new Map<
    string,
    {
      dest: (typeof DESTINATIONS)[number];
      pinCount: number;
      matchedTitles: string[];
      nearestKm: number | null;
      viaName: boolean;
    }
  >();

  let unmatched = 0;

  for (const pin of pins) {
    let attributedId: string | null = null;
    let viaName = false;
    let pinKm: number | null = null;

    // 1) KOORDINATE imajo prednost ( hoteli/restavracije blizu destinacije)
    if (pin.lat !== null && pin.lng !== null) {
      let nearestId: string | null = null;
      let nearestKm = Infinity;
      for (const dest of DESTINATIONS) {
        const km = haversineKm(pin.lat, pin.lng, dest.coords.lat, dest.coords.lng);
        if (km < nearestKm) {
          nearestKm = km;
          nearestId = dest.id;
        }
      }
      if (nearestId !== null && nearestKm <= PIN_COORD_RADIUS_KM) {
        attributedId = nearestId;
        viaName = false;
        pinKm = nearestKm;
      }
    }

    // 2) Brez koordinat ( ali izven polmera) → ujemanje po imenu
    if (attributedId === null) {
      const nameMatch = matchPinTitle(pin.title);
      if (nameMatch) {
        attributedId = nameMatch.id;
        viaName = true;
      }
    }

    if (attributedId === null) {
      unmatched += 1;
      continue;
    }

    const dest = DESTINATIONS.find((d) => d.id === attributedId);
    if (!dest) continue;

    const entry = byDest.get(dest.id) ?? {
      dest,
      pinCount: 0,
      matchedTitles: [],
      nearestKm: null,
      viaName: false, // true, če je KATERA KOLI točka padla po imenu
    };
    entry.pinCount += 1;
    if (pin.title && entry.matchedTitles.length < 3) {
      entry.matchedTitles.push(pin.title);
    }
    if (pinKm !== null) {
      entry.nearestKm =
        entry.nearestKm === null ? pinKm : Math.min(entry.nearestKm, pinKm);
    }
    if (viaName) entry.viaName = true;
    byDest.set(dest.id, entry);
  }

  const matches: PinMatch[] = [...byDest.values()]
    .map((e) => ({
      id: e.dest.id,
      name: e.dest.name,
      slug: e.dest.slug,
      pinCount: e.pinCount,
      matchedTitles: e.matchedTitles,
      nearestKm:
        e.nearestKm !== null ? Math.round(e.nearestKm * 10) / 10 : null,
      viaName: e.viaName,
    }))
    // Več točk = močnejši signal; izenačenost → imenski zadetki pred bližino
    .sort(
      (a, b) =>
        b.pinCount - a.pinCount ||
        Number(b.viaName) - Number(a.viaName) ||
        (a.nearestKm ?? Infinity) - (b.nearestKm ?? Infinity)
    );

  // Predlog dni: ~2 destinaciji na dan ( 1–7) — deterministično, prikazano
  const days = Math.min(7, Math.max(1, Math.ceil(matches.length / 2)));

  // Predlog interesov: union bestFor zadetih ( največ 4) — enaka preslikava
  // kot url-ingest ( en vir resnice)
  const interestSet: string[] = [];
  for (const m of matches) {
    const dest = DESTINATIONS.find((d) => d.id === m.id);
    if (!dest) continue;
    for (const bf of dest.bestFor) {
      const canonical = BESTFOR_TO_INTEREST[bf];
      if (canonical && !interestSet.includes(canonical)) {
        interestSet.push(canonical);
      }
    }
  }

  return {
    pinsTotal: pins.length,
    pinsUnmatched: unmatched,
    matches,
    suggestion: {
      interests: interestSet.slice(0, 4),
      days,
      preferredDestinations: matches.slice(0, 8).map((m) => m.id),
    },
  };
}

/** Pogon celotnega pinša ( parse + match) — čista funkcija za API/tests. */
export function ingestPins(raw: string): PinsResult {
  const { format, pins } = parsePins(raw);
  const result = matchPins(pins);
  return { format, ...result };
}
