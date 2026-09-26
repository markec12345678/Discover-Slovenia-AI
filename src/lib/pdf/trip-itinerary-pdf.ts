/**
 * PDF izvoz itinererja poti (Issue #5 / T5-D / M8 + Issue #6 / D6-B / M8+)
 * ============================================================================
 * Generira A4 PDF shranjene poti (pdf-lib + fontkit, Liberation Sans —
 * slovenske diakritike č/š/ž; isti vzorec kot commission-invoice-pdf).
 *
 * Razlika računu: VEČSTRANSKI izpis (paginacija — dan se nikoli ne raztrga
 * čez stran; stop/notes se prelomi po vrsticah), noga na vsaki strani s
 * številčenjem.
 *
 * M8+ (Issue #6 D6-B, Phase 2):
 *  · jezik: generateTripItineraryPdf(data, lang) — "sl" (privzeto, nazaj
 *    kompatibilno) | "en"; VSI uporabniški nizi živijo v STRINGS (sl/en
 *    stolpec), datumi/številke po Intl (sl-SI / en-GB);
 *  · etape med zaporednimi postanki dneva ("→ ~X km · ~Y min") — SAMO
 *    obstoječa deterministična hevrestika (heuristicLeg = haversineKm ×
 *    ROAD_FACTOR ÷ AVG_SPEED_KMH × 60 iz src/lib/geo-distance.ts, round5 —
 *    ISTI vir številk kot povezovalnik v plannerju); manjkajoče koordinate
 *    kateregakoli postanka → izrecno "razdalja ni znana" (ne izumi);
 *  · rezervacije: SAMO CONFIRMED zapisi JourneyBooking (veza shareId), ki
 *    jih preslika ruta — provider + št. + status (iskrene oznake iz
 *    CONFIRMATION_STATUS_LABELS); brez potrdil ni razdelka (dokaz, ne napaka).
 *
 * ISKRENOST (isti kanon kot UI):
 *  · vir načrta je razkrit (deterministično / AI / rezerva);
 *  · vreme nosi oznako ocene, če je bilo ocenjeno (weatherEstimated);
 *  · km so oznaka geo-validacije (~ približek) — nikoli kanon;
 *  · manjkajoči podatki se izpustijo (ne izmišljujemo).
 *
 * PDF je POSNETEK ob izvozu — kasnejše spremembe poti ne spreminjajo
 * že prenesene datoteke.
 * ============================================================================
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "fs/promises";
import path from "path";
import { dayISOForDayNumber } from "@/lib/trip-dates";
// heuristicLeg = ČISTI kanon etape: haversineKm × ROAD_FACTOR (1,3) za km,
// (km ÷ AVG_SPEED_KMH = 55) × 60 za minute, zaokroženo na 5 (round5) — isto
// kot povezovalnik PlannerStopLeg (geo-distance je en vir konstant).
import { heuristicLeg } from "@/lib/road-routing";
import { CONFIRMATION_STATUS_LABELS } from "@/lib/journey/booking";
import type { ConfirmationStatus } from "@/lib/journey/types";
import type { Itinerary, DayPlan, LocationVisit } from "@/lib/types";

// ─── Paleta (usklajena z aplikacijo: emerald, brez modre) ──────────────────
const INK = rgb(0.12, 0.16, 0.19);
const MUTED = rgb(0.42, 0.45, 0.5);
const EMERALD = rgb(0.176, 0.416, 0.243);
const EMERALD_BG = rgb(0.941, 0.992, 0.957);
const EMERALD_BORDER = rgb(0.733, 0.969, 0.816);
const LINE = rgb(0.895, 0.905, 0.921);
const ROW_ALT = rgb(0.976, 0.976, 0.98);

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 50;
/** Spodnja meja vsebine (noga je ob vpisovanju izpusta že zarezana). */
const BOTTOM_LIMIT = 70;

// ─── Jezik izvoza (M8+ / D6-B): "sl" privzet (nazaj kompatibilno) ──────────
export type TripPdfLang = "sl" | "en";

/** Rezervacija za izvoz — preslikava CONFIRMED JourneyBooking (naredi ruta). */
export interface TripItineraryPdfReservation {
  /** Prikazno ime ponudnika (importData.providerName ?? provider slug). */
  provider: string;
  /** Št. rezervacije (providerBookingId ?? importData.reservationNumber). */
  reservationNumber: string | null;
  /** Surovi status zapisa — oznaka iz CONFIRMATION_STATUS_LABELS (sl/en). */
  status: string;
}

export interface TripItineraryPdfData {
  name: string | null;
  shareId: string;
  itinerary: Itinerary;
  createdAt: string | null; // ISO
  /** CONFIRMED rezervacije poti (M8+ / D6-B) — opcijsko (nazaj kompatibilno). */
  reservations?: readonly TripItineraryPdfReservation[];
}

// ─── VSI uporabniški nizi izvoza (sl / en — en vir, M8+ / D6-B) ────────────
interface TripPdfStrings {
  defaultTitle: string;
  docTitlePrefix: string;
  docSubject: string;
  /** Prvi del glave meta vrstice: N {dan/dneva/dni | day/days}. */
  dayOne: string;
  dayTwo: string; // samo SL dvojina ("dneva"); EN = dayMany
  dayMany: string;
  stopOne: string;
  stopFew: string; // SL 2–4 ("postanki"); EN = stopFew ("stops")
  stopMany: string;
  sourcePrefix: string;
  sourceDeterministic: string;
  sourceAi: string;
  sourceFallback: string;
  sourceUnknown: string;
  budgetApprox: string;
  savedAt: string;
  dayHeading: string;
  weatherFallback: string;
  weatherEstimate: string;
  freeDay: string;
  unnamedStop: string;
  providerLabel: string;
  tipsHeading: string;
  footerTrail: string;
  footerExported: string;
  pageAbbrev: string;
  legUnknown: string;
  reservationsHeading: string;
  reservationNumberLabel: string;
}

const STRINGS: Record<TripPdfLang, TripPdfStrings> = {
  sl: {
    defaultTitle: "Potovanje po Sloveniji",
    docTitlePrefix: "Pot",
    docSubject: "Itinerer shranjene poti (izvoz PDF)",
    dayOne: "dan",
    dayTwo: "dneva",
    dayMany: "dni",
    stopOne: "postanek",
    stopFew: "postanki",
    stopMany: "postankov",
    sourcePrefix: "vir",
    sourceDeterministic: "brez AI (deterministično)",
    sourceAi: "AI načrt",
    sourceFallback: "rezervni načrt",
    sourceUnknown: "neznani vir",
    budgetApprox: "okvirni proračun",
    savedAt: "shranjeno",
    dayHeading: "DAN",
    weatherFallback: "vreme",
    weatherEstimate: "(ocena)",
    freeDay: "— prost dan (brez postankov) —",
    unnamedStop: "Neimenovan postanek",
    providerLabel: "ponudnik",
    tipsHeading: "NASVETI ZA POTOVANJE",
    footerTrail: "pot",
    footerExported: "izvoženo",
    pageAbbrev: "str.",
    legUnknown: "razdalja ni znana",
    reservationsHeading: "REZERVACIJE",
    reservationNumberLabel: "št. rezervacije",
  },
  en: {
    defaultTitle: "Trip around Slovenia",
    docTitlePrefix: "Trip",
    docSubject: "Itinerary of a saved trip (PDF export)",
    dayOne: "day",
    dayTwo: "days", // EN nima dvojine — enaka oblika kot množina
    dayMany: "days",
    stopOne: "stop",
    stopFew: "stops",
    stopMany: "stops",
    sourcePrefix: "source",
    sourceDeterministic: "no AI (deterministic)",
    sourceAi: "AI plan",
    sourceFallback: "fallback plan",
    sourceUnknown: "unknown source",
    budgetApprox: "approximate budget",
    savedAt: "saved",
    dayHeading: "DAY",
    weatherFallback: "weather",
    weatherEstimate: "(estimate)",
    freeDay: "— free day (no stops) —",
    unnamedStop: "Unnamed stop",
    providerLabel: "provider",
    tipsHeading: "TRAVEL TIPS",
    footerTrail: "trip",
    footerExported: "exported",
    pageAbbrev: "p.",
    legUnknown: "distance unknown",
    reservationsHeading: "RESERVATIONS",
    reservationNumberLabel: "reservation no.",
  },
};

/** Locale za Intl (datumi/številke): sl-SI ostaja kanon za "sl". */
const localeOf = (lang: TripPdfLang) => (lang === "sl" ? "sl-SI" : "en-GB");

// ─── Formatiranje (brez pasov — datumi so lokalni ISO) ─────────────────────
const fmtEur = (v: number, locale: string) =>
  `${v.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

const fmtDay = (iso: string, locale: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
        // Revizija #8 (P1 — precedens commission-invoice-pdf): lokalni ISO
        // datum dneva se izpiše po LJ pasu NE glede na sistemski TZ procesa
        // (drugace bi strežnik v drugem pasu izpisal napačen dan).
        timeZone: "Europe/Ljubljana",
      }).format(d);
};

/** Vir načrta — iskrena oznaka (isti kanon kot planner oznake). */
function sourceLabel(
  source: Itinerary["source"] | undefined,
  t: TripPdfStrings
): string {
  switch (source) {
    case "deterministic":
      return t.sourceDeterministic;
    case "ai":
      return t.sourceAi;
    case "fallback":
      return t.sourceFallback;
    default:
      return t.sourceUnknown;
  }
}

/** Oznaka statusa rezervacije — iskrene dvojezične oznake (journey/booking);
 *  neznan status ostane surova vrednost (nikoli ne prevajamo ugibanj). */
function statusLabelOf(status: unknown, lang: TripPdfLang): string {
  if (typeof status !== "string" || status === "") return "";
  const labels = CONFIRMATION_STATUS_LABELS[status as ConfirmationStatus];
  return labels ? labels[lang] : status;
}

/** Veljavne koordinate postanka (lat/lng sta opcijski — stari načrti). */
function coordOf(
  loc: LocationVisit | undefined
): { lat: number; lng: number } | null {
  return loc &&
    typeof loc.lat === "number" &&
    Number.isFinite(loc.lat) &&
    typeof loc.lng === "number" &&
    Number.isFinite(loc.lng)
    ? { lat: loc.lat, lng: loc.lng }
    : null;
}

// ─── Pisave (public/fonts — vključene v standalone build) ───────────────────
let fontsCache: { regular: Uint8Array; bold: Uint8Array } | null = null;

async function loadFonts() {
  if (fontsCache) return fontsCache;
  const dir = path.join(process.cwd(), "public", "fonts");
  const [regular, bold] = await Promise.all([
    readFile(path.join(dir, "LiberationSans-Regular.ttf")),
    readFile(path.join(dir, "LiberationSans-Bold.ttf")),
  ]);
  fontsCache = { regular: new Uint8Array(regular), bold: new Uint8Array(bold) };
  return fontsCache;
}

// ─── Pomožne (iste kot commission-invoice-pdf — en vir vzorca) ─────────────
function drawTextRight(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  rightX: number,
  yTop: number,
  color = INK
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y: PAGE_H - yTop, size, font, color });
}

function truncateToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Km/geominuti za dan (iz geo-validacije — ISTI vir kot značke v UI). */
function dayKm(it: Itinerary, dayNumber: number): number | null {
  const days = it.geoValidation?.days;
  if (!Array.isArray(days)) return null;
  const entry = days.find((d) => d && d.day === dayNumber);
  return typeof entry?.km === "number" && entry.km > 0 ? entry.km : null;
}

// ─── Glavni generator ──────────────────────────────────────────────────────
export async function generateTripItineraryPdf(
  data: TripItineraryPdfData,
  lang: TripPdfLang = "sl"
): Promise<Uint8Array> {
  const t = STRINGS[lang];
  const locale = localeOf(lang);

  const fonts = await loadFonts();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });

  const title = data.name?.trim() || t.defaultTitle;
  pdf.setTitle(`${t.docTitlePrefix}: ${title}`);
  pdf.setSubject(t.docSubject);
  pdf.setCreator("Discover Slovenia AI");
  // DETERMINIZEM (pdf-lib lastnost): PDFDocument.create() (updateInfoDict)
  // nastavi ModDate na TRENUTEK create z sekundno resolucijo → dva izvoza
  // istega vhoda čez mejo sekunde nista bajtno enaka (v /Info objektu).
  // Datuma dokumenta zato vežemo na VHODNI createdAt poti — isti vir
  // vsebine = bajtno enak PDF. Vidni „izvoženo <datum>" v nogi ostaja
  // new Date() (nameren, prikazan uporabniku; fiksni pas LJ zgoraj).
  const stableDate = data.createdAt ? new Date(data.createdAt) : new Date(0);
  if (!Number.isNaN(stableDate.getTime())) {
    pdf.setCreationDate(stableDate);
    pdf.setModificationDate(stableDate);
  }
  pdf.setProducer("Discover Slovenia AI");

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = MARGIN; // odmik od zgornjega roba

  const contentW = PAGE_W - 2 * MARGIN;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = MARGIN;
  };
  const ensure = (needed: number) => {
    if (y + needed > PAGE_H - BOTTOM_LIMIT) newPage();
  };

  // ── Glava ──
  const titleLines = wrapText(title, bold, 20, contentW).slice(0, 2);
  for (const line of titleLines) {
    ensure(26);
    page.drawText(line, {
      x: MARGIN, y: PAGE_H - y - 22, size: 20, font: bold, color: INK,
    });
    y += 26;
  }

  const it = data.itinerary;
  const dayCount = Array.isArray(it.days) ? it.days.length : 0;
  const stopCount =
    Array.isArray(it.days)
      ? it.days.reduce(
          (n, d) => n + (Array.isArray(d?.locations) ? d.locations.length : 0),
          0
        )
      : 0;

  const metaBits: string[] = [];
  if (dayCount > 0) {
    // SL slovnica: 1 dan / 2 dneva / 3+ dni; EN: 1 day / N days.
    const dayWord =
      lang === "sl"
        ? dayCount === 1
          ? t.dayOne
          : dayCount === 2
            ? t.dayTwo
            : t.dayMany
        : dayCount === 1
          ? t.dayOne
          : t.dayMany;
    metaBits.push(`${dayCount} ${dayWord}`);
  }
  if (stopCount > 0) {
    // SL slovnica: 1 postanek / 2–4 postanki / 5+ postankov; EN: stops.
    const stopWord =
      lang === "sl"
        ? stopCount === 1
          ? t.stopOne
          : stopCount < 5
            ? t.stopFew
            : t.stopMany
        : stopCount === 1
          ? t.stopOne
          : t.stopFew;
    metaBits.push(`${stopCount} ${stopWord}`);
  }
  metaBits.push(`${t.sourcePrefix}: ${sourceLabel(it.source, t)}`);
  if (typeof it.total_budget === "number" && it.total_budget > 0) {
    metaBits.push(`${t.budgetApprox} ${fmtEur(it.total_budget, locale)}`);
  }
  if (it.tripStartDate) {
    const start = fmtDay(it.tripStartDate, locale);
    const end = it.tripEndDate ? fmtDay(it.tripEndDate, locale) : null;
    metaBits.push(start && end ? `${start} – ${end}` : start);
  }
  if (data.createdAt) {
    const created = fmtDay(data.createdAt, locale);
    if (created) metaBits.push(`${t.savedAt} ${created}`);
  }
  const metaLines = wrapText(metaBits.join(" · "), regular, 9.5, contentW);
  for (const line of metaLines.slice(0, 2)) {
    ensure(14);
    page.drawText(line, {
      x: MARGIN, y: PAGE_H - y - 10, size: 9.5, font: regular, color: MUTED,
    });
    y += 13;
  }
  y += 6;
  ensure(14);
  page.drawLine({
    start: { x: MARGIN, y: PAGE_H - y },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - y },
    thickness: 1,
    color: LINE,
  });
  y += 16;

  // ── Dnevi ──
  const days: DayPlan[] = Array.isArray(it.days) ? it.days.slice(0, 30) : [];
  days.forEach((day, dayIdx) => {
    const dayNo = typeof day?.day === "number" ? day.day : dayIdx + 1;
    const locations = Array.isArray(day?.locations) ? day.locations : [];

    // Glava dneva (drži skupaj z vsaj prvim stopom)
    ensure(46);
    // Ozadje glave
    page.drawRectangle({
      x: MARGIN,
      y: PAGE_H - y - 22,
      width: contentW,
      height: 22,
      color: EMERALD_BG,
      borderColor: EMERALD_BORDER,
      borderWidth: 1,
    });
    page.drawText(`${t.dayHeading} ${dayNo}`, {
      x: MARGIN + 10, y: PAGE_H - y - 15, size: 11, font: bold, color: EMERALD,
    });
    // Desna stran glave: datum (iz tripStartDate) · vreme · km
    const headBits: string[] = [];
    if (it.tripStartDate) {
      const iso = dayISOForDayNumber(it.tripStartDate, dayNo);
      if (iso) {
        const label = fmtDay(iso, locale);
        if (label) headBits.push(label);
      }
    }
    const km = dayKm(it, dayNo);
    if (km != null) headBits.push(`~${km.toFixed(0)} km`);
    const weather =
      day?.weather && typeof day.weather.temp === "number"
        ? `${day.weather.condition ?? t.weatherFallback} ${Math.round(day.weather.temp)} °C${
            day.weatherEstimated ? ` ${t.weatherEstimate}` : ""
          }`
        : null;
    if (weather) headBits.push(weather);
    if (headBits.length > 0) {
      drawTextRight(
        page,
        truncateToWidth(headBits.join(" · "), regular, 8.5, contentW - 90),
        regular,
        8.5,
        PAGE_W - MARGIN - 10,
        y - 15,
        MUTED
      );
    }
    y += 30;

    if (locations.length === 0) {
      ensure(16);
      page.drawText(t.freeDay, {
        x: MARGIN + 10, y: PAGE_H - y - 10, size: 9, font: regular, color: MUTED,
      });
      y += 18;
    }

    locations.forEach((loc, i) => {
      const name =
        typeof loc?.destination_name === "string" && loc.destination_name.trim()
          ? loc.destination_name.trim()
          : t.unnamedStop;
      const slot =
        typeof loc?.time_slot === "string" ? loc.time_slot.trim() : "";
      const durationH =
        typeof loc?.duration === "number" && loc.duration > 0
          ? loc.duration
          : null;
      const cost =
        typeof loc?.estimated_cost === "number" && loc.estimated_cost > 0
          ? loc.estimated_cost
          : null;
      const notes =
        typeof loc?.notes === "string" ? loc.notes.trim().slice(0, 300) : "";
      const provider =
        typeof loc?.booking_provider === "string" && loc.booking_provider
          ? loc.booking_provider
          : null;

      const noteLines = notes
        ? wrapText(notes, regular, 8.5, contentW - 110).slice(0, 3)
        : [];
      const stopH =
        18 + noteLines.length * 11 + (provider ? 12 : 0) + 4;

      // Izmenična podloga vrstice (po dnevu, ne globalno — mirna berljivost)
      if (i % 2 === 1) {
        page.drawRectangle({
          x: MARGIN,
          y: PAGE_H - y - stopH + 6,
          width: contentW,
          height: stopH,
          color: ROW_ALT,
        });
      }

      ensure(stopH + 2);

      // Čas (fiksna širina) + ime
      if (slot) {
        page.drawText(
          truncateToWidth(slot, bold, 9, 86),
          { x: MARGIN + 6, y: PAGE_H - y - 13, size: 9, font: bold, color: INK }
        );
      }
      page.drawText(
        truncateToWidth(name, bold, 10, contentW - 120),
        {
          x: MARGIN + 100,
          y: PAGE_H - y - 13,
          size: 10,
          font: bold,
          color: INK,
        }
      );
      // Desno: trajanje + cena
      const rightBits: string[] = [];
      if (durationH) {
        rightBits.push(
          `${durationH.toLocaleString(locale, { maximumFractionDigits: 1 })} h`
        );
      }
      if (cost) rightBits.push(fmtEur(cost, locale));
      if (rightBits.length > 0) {
        drawTextRight(
          page,
          rightBits.join(" · "),
          regular,
          9,
          PAGE_W - MARGIN - 6,
          y - 13,
          MUTED
        );
      }
      y += 18;

      for (const nl of noteLines) {
        page.drawText(nl, {
          x: MARGIN + 100,
          y: PAGE_H - y - 9,
          size: 8.5,
          font: regular,
          color: MUTED,
        });
        y += 11;
      }
      if (provider) {
        page.drawText(`${t.providerLabel}: ${provider}`, {
          x: MARGIN + 100,
          y: PAGE_H - y - 9,
          size: 8.5,
          font: regular,
          color: MUTED,
        });
        y += 12;
      }
      y += 4;

      // ── M8+ (D6-B): etapa do NASLEDNJEGA postanka (med zaporednima) ──
      // ISTA deterministična hevrestika kot povezovalnik v plannerju
      // (haversine × 1,3 ÷ 55 km/h, round5 — vir številk je en). Manjka
      // katerakoli koordinata → izrecno priznanje, ne izum ("razdalja
      // ni znana" / "distance unknown").
      if (i < locations.length - 1) {
        const a = coordOf(loc);
        const b = coordOf(locations[i + 1]);
        const leg = a && b ? heuristicLeg(a, b) : null;
        const legText = leg
          ? `→ ~${leg.km} km · ~${leg.min} min`
          : `→ ${t.legUnknown}`;
        ensure(12);
        page.drawText(legText, {
          x: MARGIN + 100,
          y: PAGE_H - y - 8,
          size: 8,
          font: regular,
          color: MUTED,
        });
        y += 12;
      }
    });
    y += 8;
  });

  // ── Nasveti (kap 5 — izvoz je povzetek, ne nadomestilo UI) ──
  const tips = Array.isArray(it.tips) ? it.tips.slice(0, 5) : [];
  if (tips.length > 0) {
    ensure(40);
    y += 4;
    page.drawText(t.tipsHeading, {
      x: MARGIN, y: PAGE_H - y - 10, size: 9, font: bold, color: MUTED,
    });
    y += 18;
    for (const tip of tips) {
      const tp = typeof tip === "string" ? tip.trim().slice(0, 200) : "";
      if (!tp) continue;
      const lines = wrapText(`• ${tp}`, regular, 9, contentW - 12).slice(0, 2);
      ensure(lines.length * 12 + 4);
      for (const line of lines) {
        page.drawText(line, {
          x: MARGIN + 6, y: PAGE_H - y - 10, size: 9, font: regular, color: INK,
        });
        y += 12;
      }
      y += 2;
    }
  }

  // ── M8+ (D6-B): Rezervacije — SAMO CONFIRMED zapisi, ki jih prinese ruta ──
  // (provider + št. + status). Brez zapisa NI razdelka: prazna tabela je
  // dokaz "ni še potrjenih rezervacij", ne napaka (iskrena arhitektura §19).
  const reservations = Array.isArray(data.reservations)
    ? data.reservations.slice(0, 20)
    : [];
  if (reservations.length > 0) {
    ensure(40);
    y += 4;
    page.drawText(t.reservationsHeading, {
      x: MARGIN, y: PAGE_H - y - 10, size: 9, font: bold, color: MUTED,
    });
    y += 18;
    for (const r of reservations) {
      const provider =
        typeof r?.provider === "string" ? r.provider.trim().slice(0, 100) : "";
      const num =
        typeof r?.reservationNumber === "string"
          ? r.reservationNumber.trim().slice(0, 60)
          : "";
      const status = statusLabelOf(r?.status, lang);
      const bits = [
        ...(provider ? [provider] : []),
        ...(num ? [`${t.reservationNumberLabel} ${num}`] : []),
        ...(status ? [status] : []),
      ];
      if (bits.length === 0) continue; // prazen zapis se ne izriše (ne šumi)
      const lines = wrapText(
        `• ${bits.join(" · ")}`,
        regular,
        9,
        contentW - 12
      ).slice(0, 2);
      ensure(lines.length * 12 + 4);
      for (const line of lines) {
        page.drawText(line, {
          x: MARGIN + 6, y: PAGE_H - y - 10, size: 9, font: regular, color: INK,
        });
        y += 12;
      }
      y += 2;
    }
  }

  // ── Noge na VSEH straneh (zapisano zadnje — skupno število je znano) ──
  const pages = pdf.getPages();
  const exported = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    // Revizija #8 (P1 — precedens commission-invoice-pdf): datum izvoza po
    // LJ pasu NE glede na sistemski TZ. Odpravlja tudi flaky determinizem v
    // Bun ≥ 1.4 vzporednem test runnerju (process.env.TZ mutacije sočasnih
    // testov ne smejo vplivati na bajtno enakost PDF-a).
    timeZone: "Europe/Ljubljana",
  }).format(new Date());
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGIN, y: 44 },
      end: { x: PAGE_W - MARGIN, y: 44 },
      thickness: 1,
      color: LINE,
    });
    const left = `Discover Slovenia AI · ${t.footerTrail} ${data.shareId} · ${t.footerExported} ${exported}`;
    p.drawText(truncateToWidth(left, regular, 7.5, contentW - 60), {
      x: MARGIN, y: 30, size: 7.5, font: regular, color: MUTED,
    });
    const right = `${t.pageAbbrev} ${i + 1}/${pages.length}`;
    const rightW = regular.widthOfTextAtSize(right, 7.5);
    p.drawText(right, {
      x: PAGE_W - MARGIN - rightW,
      y: 30,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
  });

  return pdf.save();
}
