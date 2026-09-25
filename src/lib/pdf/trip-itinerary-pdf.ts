/**
 * PDF izvoz itinererja poti (Issue #5 / T5-D / M8)
 * ============================================================================
 * Generira A4 PDF shranjene poti (pdf-lib + fontkit, Liberation Sans —
 * slovenske diakritike č/š/ž; isti vzorec kot commission-invoice-pdf).
 *
 * Razlika računu: VEČSTRANSKI izpis (paginacija — dan se nikoli ne raztrga
 * čez stran; stop/notes se prelomi po vrsticah), noga na vsaki strani s
 * številčenjem.
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
import type { Itinerary, DayPlan } from "@/lib/types";

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

export interface TripItineraryPdfData {
  name: string | null;
  shareId: string;
  itinerary: Itinerary;
  createdAt: string | null; // ISO
}

// ─── Formatiranje (sl-SI, brez pasov — datumi so lokalni ISO) ──────────────
const fmtEur = (v: number) =>
  `${v.toLocaleString("sl-SI", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

const fmtDay = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat("sl-SI", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(d);
};

/** Vir načrta — iskrena oznaka (isti kanon kot planner oznake). */
function sourceLabel(source: Itinerary["source"] | undefined): string {
  switch (source) {
    case "deterministic":
      return "brez AI (deterministično)";
    case "ai":
      return "AI načrt";
    case "fallback":
      return "rezervni načrt";
    default:
      return "neznani vir";
  }
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
  data: TripItineraryPdfData
): Promise<Uint8Array> {
  const fonts = await loadFonts();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });

  const title = data.name?.trim() || "Potovanje po Sloveniji";
  pdf.setTitle(`Pot: ${title}`);
  pdf.setSubject("Itinerer shranjene poti (izvoz PDF)");
  pdf.setCreator("Discover Slovenia AI");
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
    metaBits.push(
      `${dayCount} ${dayCount === 1 ? "dan" : dayCount === 2 ? "dneva" : "dni"}`
    );
  }
  if (stopCount > 0) {
    metaBits.push(
      `${stopCount} ${stopCount === 1 ? "postanek" : stopCount < 5 ? "postanki" : "postankov"}`
    );
  }
  metaBits.push(`vir: ${sourceLabel(it.source)}`);
  if (typeof it.total_budget === "number" && it.total_budget > 0) {
    metaBits.push(`okvirni proračun ${fmtEur(it.total_budget)}`);
  }
  if (it.tripStartDate) {
    const start = fmtDay(it.tripStartDate);
    const end = it.tripEndDate ? fmtDay(it.tripEndDate) : null;
    metaBits.push(start && end ? `${start} – ${end}` : start);
  }
  if (data.createdAt) {
    const created = fmtDay(data.createdAt);
    if (created) metaBits.push(`shranjeno ${created}`);
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
    page.drawText(`DAN ${dayNo}`, {
      x: MARGIN + 10, y: PAGE_H - y - 15, size: 11, font: bold, color: EMERALD,
    });
    // Desna stran glave: datum (iz tripStartDate) · vreme · km
    const headBits: string[] = [];
    if (it.tripStartDate) {
      const iso = dayISOForDayNumber(it.tripStartDate, dayNo);
      if (iso) {
        const label = fmtDay(iso);
        if (label) headBits.push(label);
      }
    }
    const km = dayKm(it, dayNo);
    if (km != null) headBits.push(`~${km.toFixed(0)} km`);
    const weather =
      day?.weather && typeof day.weather.temp === "number"
        ? `${day.weather.condition ?? "vreme"} ${Math.round(day.weather.temp)} °C${
            day.weatherEstimated ? " (ocena)" : ""
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
      page.drawText("— prost dan (brez postankov) —", {
        x: MARGIN + 10, y: PAGE_H - y - 10, size: 9, font: regular, color: MUTED,
      });
      y += 18;
    }

    locations.forEach((loc, i) => {
      const name =
        typeof loc?.destination_name === "string" && loc.destination_name.trim()
          ? loc.destination_name.trim()
          : "Neimenovan postanek";
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
          `${durationH.toLocaleString("sl-SI", { maximumFractionDigits: 1 })} h`
        );
      }
      if (cost) rightBits.push(fmtEur(cost));
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
        page.drawText(`ponudnik: ${provider}`, {
          x: MARGIN + 100,
          y: PAGE_H - y - 9,
          size: 8.5,
          font: regular,
          color: MUTED,
        });
        y += 12;
      }
      y += 4;
    });
    y += 8;
  });

  // ── Nasveti (kap 5 — izvoz je povzetek, ne nadomestilo UI) ──
  const tips = Array.isArray(it.tips) ? it.tips.slice(0, 5) : [];
  if (tips.length > 0) {
    ensure(40);
    y += 4;
    page.drawText("NASVETI ZA POTOVANJE", {
      x: MARGIN, y: PAGE_H - y - 10, size: 9, font: bold, color: MUTED,
    });
    y += 18;
    for (const tip of tips) {
      const t = typeof tip === "string" ? tip.trim().slice(0, 200) : "";
      if (!t) continue;
      const lines = wrapText(`• ${t}`, regular, 9, contentW - 12).slice(0, 2);
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
  const exported = new Intl.DateTimeFormat("sl-SI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(new Date());
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGIN, y: 44 },
      end: { x: PAGE_W - MARGIN, y: 44 },
      thickness: 1,
      color: LINE,
    });
    const left = `Discover Slovenia AI · pot ${data.shareId} · izvoženo ${exported}`;
    p.drawText(truncateToWidth(left, regular, 7.5, contentW - 60), {
      x: MARGIN, y: 30, size: 7.5, font: regular, color: MUTED,
    });
    const right = `str. ${i + 1}/${pages.length}`;
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
