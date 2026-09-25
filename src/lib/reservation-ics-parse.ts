// ============================================================================
// REZERVACIJA IZ ICS KOLEDARJA — DETERMINISTIČNI PARSER (Issue #6 / D6-B)
// ============================================================================
// NAMEN: uporabnik v zavihek Besedilo (rezervacije) prilepi vsebino .ics
// datoteke (izvoz iz Google/Apple/Outlook koledarja ali koledarski priloge
// ponudnika). Ruta /api/journey/bookings/parse jo pošlje AI-ju; ko AI ni na
// voljo (brez ključev/timeout), pade na deterministično rezervo — ta modul
// je BOLJ SPECIFIČEN parser za ICS obrazec (stroga sintaksa RFC 5545) in se
// uporabi PREJ generičnega besedilnega parserja (specifično pred splošnim).
// 0 AI, 0 DB, 0 omrežja — čista funkcija.
//
// NAČELA (ISTA disciplina kot reservation-text-parse.ts, Issue #5 / M1):
//  · NIČ NE IZMIŠLJUJEMO — polje nastane SAMO iz izrecne ICS lastnosti;
//    sicer ostane null;
//  · izhod gre ŠE VEDNO skozi normalizeParsedReservation() (isti striži,
//    kapi, needsConfirmation) — en vir resnice;
//  · DTSTART/DTEND ohranimo SUROV niz vrednosti (20260814T140000Z /
//    20260814T140000 / 20260814) — NIKOLI ne interpretiramo časovnih pasov
//    (TZID parameter se NE spoji z vrednostjo: pretvorba bi bila ugibanje);
//  · rezultat je DRAFT-grade: uporabnik v UI potrdi/uredi, zapis prek
//    /api/journey/bookings/import (source IMPORTED, nikoli samodejno).
//
// Deterministične odločitve (zapisane, da jih testi pinirajo):
//  · UID → št. rezervacije SAMO če vsebuje števko (ista iskrenostna disciplina
//    kot besedilni parser — "confirmation sent" lažni zadetki so zavrnjeni);
//    UID ohranimo V CELIOTI (z @domeno) — ne rezemo, ker ne vemo, kateri del
//    je "pravi" del številke;
//  · več VEVENT dogodkov → preberemo PRVEGA s številčnim UID (kandidat za
//    rezervacijo); število VSEH dogodkov razkriva countIcsEvents() (iskrenost);
//  · koledar BREZ števčnega UID v nobenem dogodku NI potrdilo o rezervaciji
//    (vsak izvoz koledarja ima datume — sicer bi redna srečanja postala
//    "rezervacije") → PRAZNA ekstrakcija → iskren 422 na ruti;
//  · SUMMARY je primarni signal za ponudnika (ISTI seznam PROVIDER_BRANDS
//    kot besedilni parser); znamka v opisu/lokaciji je prav tako izrecna
//    pojavnost — isti seznam, ista vrstni red;
//  · price/currency/guestName/cancellationDeadline ostanejo null: ICS nima
//    lastnosti zanje (ATTENDEE/ORGANIZER CN je organizator koledarja, ne
//    nujno gost rezervacije — ne ugibamo);
//  · URL/X-BOOKING-URL → bookingUrl SAMO če je izrecen in http(s).
// ============================================================================

import {
  normalizeParsedReservation,
  type ParsedReservation,
} from "./imported-reservation";
import { PROVIDER_BRANDS } from "./reservation-text-parse";

/** Trda kap vhoda (ista kot besedilni parser: 60 000 znakov). */
const MAX_INPUT_CHARS = 60_000;

/**
 * ICS razširitev ParsedReservation: povezava do rezervacije (URL ali
 * X-BOOKING-URL lastnost) — izrecna samo, sicer null. Razširjamo OBLIKO
 * (ne množimo polj AI poti): preostalih 11 polj gre NESPREMENJENO skozi
 * normalizeParsedReservation, odgovor rute pa ohranja identično pogodbo.
 */
export interface IcsParsedReservation extends ParsedReservation {
  bookingUrl: string | null;
}

// ---------------------------------------------------------------------------
// POMOŽNE FUNKCIJE (čiste, brez stanja)
// ----------------------------------------------------------------------------

function capLine(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.slice(0, max);
}

/** RFC 5545 §3.1 — prelomljene vrstice: CRLF/LF + presledek/tab nadaljuje
 *  prejšnjo vrstico. Odpremo PRED razrezom (dolge SUMMARY/DESCRIPTION vrstice
 *  so v izvozih koledarjev pogosto prelomljene). */
function unfoldIcs(text: string): string {
  return text.replace(/\r?\n[ \t]/g, "");
}

/** RFC 5545 §3.3.11 — escape znakov v besedilnih vrednostih:
 *  \n/\N → prelom, \, → vejica, \; → podpičje, \\ → backslash.
 *  Neznan escape (\x) → znak sam (dobesedno, brez izmišljevanja). */
function unescapeIcsText(value: string): string {
  return value.replace(/\\(.)/g, (_all, ch: string) => {
    if (ch === "n" || ch === "N") return "\n";
    if (ch === "," || ch === ";" || ch === "\\") return ch;
    return ch;
  });
}

/** Veljavna ICS oblika vrednosti datuma/časa (RFC 5545 §3.3.5):
 *  DATE (20260814) · DATE-TIME lokalni (20260814T140000) · UTC (…Z).
 *  Vrednost, ki ne ustreza slovnici, NI datetime → null (ne izmišljujemo). */
const ICS_DATE_VALUE_RE = /^\d{8}(?:T\d{6}[Zz]?)?$/;

/** E-pošta (samo ekspliciten zadetek) — isti vzorec kot besedilni parser
 *  (reservation-text-parse.ts, korak 7). */
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/** OZNAČENA telefonska številka — isti vzorec kot besedilni parser
 *  (goli zapisi števk v opisu niso stik). */
const PHONE_LABEL_RE =
  /(?:telefon|phone|tel\.?|mobilna|kontakt|contact)\s*[:：-]\s*(\+?[\d][\d\s./-]{6,18}\d)/i;

/** Ena ICS vrstica lastnosti: IME[;param=…]:vrednost.
 *  Ime je case-insensitive (RFC 5545 §3.5) → normaliziramo na velike črke.
 *  Omejitev (dokumentirana): narekovani parameter z ":" (ATTENDEE;CN="a: b")
 *  se razume napačno — lastnosti, ki jih beremo (UID/DTSTART/SUMMARY/…),
 *  takih parametrov nimajo. */
function parsePropertyLine(
  line: string
): { name: string; value: string } | null {
  const m = line.match(/^([A-Za-z0-9-]+)[^:]*:(.*)$/);
  if (!m) return null;
  return { name: m[1].toUpperCase(), value: m[2] };
}

/** En VEVENT dogodek: prva vrednost vsake lastnosti + ne-escapirana
 *  besedila za iskanje znamk (isti seznam kot besedilni parser). */
interface IcsEvent {
  props: Map<string, string>;
  /** UID (surov) — hitri test kandidata za št. rezervacije. */
  uid: string;
  /** SUMMARY/DESCRIPTION/LOCATION/UID po unescape — za iskanje znamk. */
  text: string;
  /** SUMMARY po unescape (primarni signal ponudnika). */
  summary: string;
}

/** Razrezi odprto besedilo na VEVENT bloke. MALFORMED TOLERANCA (Issue #6 robni
 *  primeri): BEGIN:VEVENT brez END:VEVENT → zadnji odprt dogodek VSEENO
 *  preberemo (null vrednosti, ne izjeme); vrinjene komponente (VALARM) ne
 *  razbijajo bloka. */
function parseIcsEvents(unfolded: string): IcsEvent[] {
  const lines = unfolded.split(/\r?\n/);
  const events: IcsEvent[] = [];
  let props: Map<string, string> | null = null;
  let rawParts: string[] = [];

  const closeEvent = () => {
    if (!props) return;
    const unescaped = unescapeIcsText(rawParts.join("\n"));
    events.push({
      props,
      uid: props.get("UID") ?? "",
      text: unescaped,
      summary: unescapeIcsText(props.get("SUMMARY") ?? ""),
    });
    props = null;
    rawParts = [];
  };

  for (const line of lines) {
    const t = line.trim();
    if (t.toUpperCase() === "BEGIN:VEVENT") {
      closeEvent(); // dvojni BEGIN brez END → prejšnji blok zapremo (ne sesujemo se)
      props = new Map();
      rawParts = [];
      continue;
    }
    if (t.toUpperCase() === "END:VEVENT") {
      closeEvent();
      continue;
    }
    if (!props) continue; // zunaj VEVENT (VCALENDAR glava, VTODO …) — ignoriramo
    rawParts.push(line);
    const prop = parsePropertyLine(line);
    if (prop && !props.has(prop.name)) {
      // PRVA pojavnost zmaga (dvojne DTSTART vrstice → prva, deterministično).
      props.set(prop.name, prop.value);
    }
  }
  closeEvent(); // BEGIN brez END (odrezana datoteka) — vseeno preberemo

  return events;
}

/** Znamka ponudnika iz besedila (ISTI seznam kot besedilni parser — uvožen
 *  PROVIDER_BRANDS; en vir resnice, enaka prioritetnost vrstnega reda). */
function matchProviderBrand(text: string): string | null {
  for (const [brandRe, display] of PROVIDER_BRANDS) {
    if (brandRe.test(text)) return display;
  }
  return null;
}

/** Prva neprazna vrstica opisa (DOBESLEDEN citat iz dokumenta — sinteze
 *  povedi ne delamo, citata pa ne izmišljujemo; normalizator kapira na 300). */
function firstNonEmptyLine(text: string): string | null {
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GLAVNE FUNKCIJE
// ----------------------------------------------------------------------------

/**
 * Deterministično preberi potrdilo o rezervaciji iz ICS besedila.
 * Čista funkcija: enak vhod → enak izhod; nikoli ne vrže izjeme
 * (malformed vhod → iskrene null vrednosti). Vrne NORMALIZIRAN
 * IcsParsedReservation (isti striži/kapi kot AI pot) + bookingUrl.
 */
export function parseIcsReservation(rawText: string): IcsParsedReservation {
  const text =
    typeof rawText === "string" ? rawText.slice(0, MAX_INPUT_CHARS) : "";
  const events = parseIcsEvents(unfoldIcs(text));

  // Izbira dogodka: PRVI VEVENT s številčnim UID (kandidat za št. rezervacije
  // — ista disciplina kot besedilni parser: brez števk ni številke).
  const selected = events.find((ev) => /\d/.test(ev.uid));

  // Koledar BREZ kandidata NI potrdilo o rezervaciji: sicer bi vsak izvoz
  // koledarja (srečanja, rojstni dnevi — VSI imajo datume!) postal
  // "rezervacija". Iskrena prazna ekstrakcija → ruta odgovori 422.
  if (!selected) {
    return { ...normalizeParsedReservation({}), bookingUrl: null };
  }

  // UID → št. rezervacije: SUROVA vrednost V CELIOTI (z @domeno) — ≥1 števka.
  const reservationNumber = /\d/.test(selected.uid)
    ? capLine(selected.uid, 200)
    : null;

  // Ponudnik: SUMMARY je primarni signal; znamka v opisu/lokaciji/UID je
  // prav tako izrecna pojavnost — isti seznam, isti vrstni red.
  const providerName =
    matchProviderBrand(selected.summary) ??
    matchProviderBrand(selected.text);

  // DTSTART/DTEND → SUROVI nizi vrednosti (Z oblika ohrani Z, lokalna ne
  // dobi izmišljenega pripona; TZID parametra NE spojimo — pasovna pretvorba
  // bi bila ugibanje). Neveljavna oblika → null.
  const dtStart = (selected.props.get("DTSTART") ?? "").trim();
  const dtEnd = (selected.props.get("DTEND") ?? "").trim();
  const startDateTime = ICS_DATE_VALUE_RE.test(dtStart) ? dtStart : null;
  const endDateTime = ICS_DATE_VALUE_RE.test(dtEnd) ? dtEnd : null;

  // LOCATION → lokacija (unescape vejic/podpičij/prelomov, kap).
  const locationValue = unescapeIcsText(
    selected.props.get("LOCATION") ?? ""
  );
  const locationName = capLine(locationValue, 200) || null;

  // DESCRIPTION → stik: najprej e-pošta, sicer OZNAČENA telefonska številka
  // (samo eksplicitni zadetki — isti vzorci kot besedilni parser).
  const description = unescapeIcsText(
    selected.props.get("DESCRIPTION") ?? ""
  );
  let contact: string | null = null;
  const email = description.match(EMAIL_RE);
  if (email) {
    contact = capLine(email[0], 200);
  } else {
    const phone = description.match(PHONE_LABEL_RE);
    if (phone) contact = capLine(phone[1], 200);
  }

  // notes: DOBESLEDEN citat — prva neprazna vrstica opisa (izrecna vsebina
  // dokumenta; besedilni parser sintetizira NIC, tu citiramo besedilo).
  const notes = firstNonEmptyLine(description);

  // X-BOOKING-URL (bolj specifična) pred URL — SAMO izrecen http(s) zapis.
  const rawUrl = (
    selected.props.get("X-BOOKING-URL") ??
    selected.props.get("URL") ??
    ""
  ).trim();
  const bookingUrl = /^https?:\/\//i.test(rawUrl) ? capLine(rawUrl, 300) : null;

  return {
    ...normalizeParsedReservation({
      providerName,
      reservationNumber,
      startDateTime,
      endDateTime,
      locationName,
      // ICS nima poštenega vira za ta polja → null (ne izmišljujemo):
      guestName: null,
      price: null,
      currency: null,
      cancellationDeadline: null,
      contact,
      notes,
    }),
    bookingUrl,
  };
}

/** Število VEVENT dogodkov v (potencialno večji) .ics datoteki — ISKRENOST:
 *  ko preberemo samo prvega kandidata, UI/tests vidijo, da jih je več
 *  (uporabnik jih uvozi posamično). Isto štetje kot izbira parserja. */
export function countIcsEvents(rawText: string): number {
  const text =
    typeof rawText === "string" ? rawText.slice(0, MAX_INPUT_CHARS) : "";
  return parseIcsEvents(unfoldIcs(text)).length;
}

/**
 * Hevristika vhoda (Issue #6 D6-B): ali besedilo VIDETI kot ICS koledar?
 * Preprosto in deterministično: vsebuje "BEGIN:VCALENDAR" (case-insensitive,
 * CRLF/LF enakovredno). Samo PLAIN-TEXT ICS — base64/quoted-printable ovojnice
 * NE podpiramo (iskrenost: nerazpakiran vhod ni koledar).
 */
export function isIcsInput(text: string): boolean {
  return typeof text === "string" && /BEGIN:VCALENDAR/i.test(text);
}
