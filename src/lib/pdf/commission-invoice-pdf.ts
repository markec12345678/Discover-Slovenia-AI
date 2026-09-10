/**
 * PDF izpis provizijskega računa (Faza 4c)
 * ============================================================================
 * Generira tiskanju prijazen A4 PDF provizijskega računa (pdf-lib + fontkit,
 * pisava Liberation Sans — podpira slovenske diakritike č/š/ž, brez domačih
 * odvisnosti; deluje tudi na Vercelu).
 *
 * Vsebina: glava (številka, datum izdaje, status), izdajatelj/prejemnik,
 * obdobje obračuna, podrobnosti atribuiranih rezervacij, povzetek
 * (osnova, stopnja, znesek) in Booking-style pojasnilo.
 *
 * Zneski na računu so POSNETEK (snapshot) ob izdaji — stopnja in višina se
 * ne spreminjata z morebitnimi kasnejšimi spremembami paketa.
 * ============================================================================
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "fs/promises";
import path from "path";

// ─── Barvna paleta (usklajena z aplikacijo: emerald, brez modre) ────────────
const INK = rgb(0.12, 0.16, 0.19); // glavno besedilo
const MUTED = rgb(0.42, 0.45, 0.5); // sekundarno besedilo
const EMERALD = rgb(0.176, 0.416, 0.243); // #2d6a3e
const EMERALD_BG = rgb(0.941, 0.992, 0.957); // #f0fdf4
const EMERALD_BORDER = rgb(0.733, 0.969, 0.816); // #bbf7d0
const AMBER = rgb(0.714, 0.353, 0.039); // #b6590a
const AMBER_BG = rgb(0.996, 0.969, 0.874); // #fef8df
const AMBER_BORDER = rgb(0.965, 0.878, 0.627); // #f6e0a0
const ROW_ALT = rgb(0.976, 0.976, 0.98); // izmenične vrstice
const LINE = rgb(0.895, 0.905, 0.921); // #e4e6eb

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 50;

// ─── Vrsta podatkov ────────────────────────────────────────────────────────
export interface InvoiceBookingDetail {
  bookingNumber: string;
  createdAt: Date;
  experienceName: string;
  guestName: string;
  groupSize: number;
  total: number;
}

export interface CommissionInvoicePdfData {
  invoiceNumber: string;
  periodStart: Date;
  periodEnd: Date; // ekskluzivna zgornja meja
  issuedAt: Date;
  paidAt: Date | null;
  status: string; // "issued" | "paid"
  bookingCount: number;
  commissionBase: number;
  rate: number;
  amount: number;
  ownerName: string;
  ownerBusinessName: string;
  ownerEmail: string;
  bookings: InvoiceBookingDetail[];
}

// ─── Formatiranje (sl-SI) ──────────────────────────────────────────────────
const fmtEur = (v: number) =>
  `${v.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const fmtDateLong = (d: Date) =>
  new Intl.DateTimeFormat("sl-SI", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);

const fmtDateShort = (d: Date) =>
  new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric" }).format(d);

// ─── Nalaganje pisav (public/fonts — vključene tudi v standalone build) ─────
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

// ─── Pomožne funkcije za risanje ───────────────────────────────────────────
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

/** Skrajša besedilo na podano širino (merjeno s pisavo). */
function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

/** Prelomi besedilo na vrstice, ki ustrezajo največji širini. */
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

// ─── Glavni generator ──────────────────────────────────────────────────────
export async function generateCommissionInvoicePdf(
  data: CommissionInvoicePdfData
): Promise<Uint8Array> {
  const fonts = await loadFonts();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });

  pdf.setTitle(`Račun ${data.invoiceNumber}`);
  pdf.setSubject("Provizijski račun za rezervacije iz AI konzultacij");
  pdf.setCreator("Discover Slovenia AI");
  pdf.setProducer("Discover Slovenia AI");

  const page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = MARGIN; // odmik od zgornjega roba

  // ── Emerald trak na vrhu ──
  page.drawRectangle({ x: 0, y: PAGE_H - 6, width: PAGE_W, height: 6, color: EMERALD });
  y += 14;

  // ── Glava: RAČUN + številka ──
  page.drawText("RAČUN", {
    x: MARGIN, y: PAGE_H - y - 26, size: 26, font: bold, color: INK,
  });
  y += 30;
  page.drawText("Provizijski račun za rezervacije iz AI konzultacij", {
    x: MARGIN, y: PAGE_H - y - 10, size: 10, font: regular, color: MUTED,
  });
  y += 16;

  const numSize = 12;
  drawTextRight(page, data.invoiceNumber, bold, numSize, PAGE_W - MARGIN, y - numSize + 2);
  drawTextRight(
    page,
    `Datum izdaje: ${fmtDateLong(data.issuedAt)}`,
    regular,
    9,
    PAGE_W - MARGIN,
    y + 4,
    MUTED
  );
  y += 14;

  // ── Status ──
  const paid = data.status === "paid";
  const statusText = paid
    ? `PLAČANO${data.paidAt ? ` · ${fmtDateLong(data.paidAt)}` : ""}`
    : "ZA PLAČILO";
  const statusW = bold.widthOfTextAtSize(statusText, 9) + 16;
  page.drawRectangle({
    x: PAGE_W - MARGIN - statusW,
    y: PAGE_H - y - 18,
    width: statusW,
    height: 18,
    color: paid ? EMERALD_BG : AMBER_BG,
    borderColor: paid ? EMERALD_BORDER : AMBER_BORDER,
    borderWidth: 1,
  });
  page.drawText(statusText, {
    x: PAGE_W - MARGIN - statusW + 8,
    y: PAGE_H - y - 13,
    size: 9,
    font: bold,
    color: paid ? EMERALD : AMBER,
  });
  y += 34;

  page.drawLine({
    start: { x: MARGIN, y: PAGE_H - y },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - y },
    thickness: 1,
    color: LINE,
  });
  y += 18;

  // ── Izdajatelj / Prejemnik ──
  const colW = (PAGE_W - 2 * MARGIN - 16) / 2;
  const boxH = 74;
  const boxes = [
    {
      title: "IZDAJATELJ",
      lines: [
        "Discover Slovenia AI",
        "Turistična platforma — vodnik po Sloveniji",
        "E-pošta: podpora@discoverslovenia.si",
      ],
    },
    {
      title: "PREJEMNIK",
      lines: [
        data.ownerBusinessName || data.ownerName,
        data.ownerName,
        `E-pošta: ${data.ownerEmail}`,
      ],
    },
  ];
  boxes.forEach((box, i) => {
    const x = MARGIN + i * (colW + 16);
    page.drawRectangle({
      x, y: PAGE_H - y - boxH, width: colW, height: boxH,
      color: rgb(0.98, 0.98, 0.988),
      borderColor: LINE, borderWidth: 1,
    });
    page.drawText(box.title, {
      x: x + 10, y: PAGE_H - y - 16, size: 8, font: bold, color: MUTED,
    });
    box.lines.forEach((line, j) => {
      const isLast = j === box.lines.length - 1;
      page.drawText(truncateToWidth(line, regular, 9, colW - 20), {
        x: x + 10,
        y: PAGE_H - y - 32 - j * 13,
        size: 9,
        font: j === 0 ? bold : regular,
        color: isLast ? MUTED : INK,
      });
    });
  });
  y += boxH + 20;

  // ── Obdobje obračuna ──
  const periodStr = `${fmtDateLong(data.periodStart)} – ${fmtDateLong(
    new Date(data.periodEnd.getTime() - 1)
  )}`;
  page.drawText("Obdobje obračuna", {
    x: MARGIN, y: PAGE_H - y - 9, size: 8, font: bold, color: MUTED,
  });
  drawTextRight(page, periodStr, bold, 11, PAGE_W - MARGIN, y - 11);
  y += 26;

  // ── Tabela podrobnosti rezervacij ──
  const tableX = MARGIN;
  const tableW = PAGE_W - 2 * MARGIN;
  // stolpci: Datum | Št. rezervacije | Izkušnja | Osebe | Znesek
  const cDate = tableX + 4;
  const cNum = tableX + 66;
  const cExp = tableX + 158;
  const cPax = tableX + tableW - 96;
  const cTot = tableX + tableW - 4;

  page.drawRectangle({
    x: tableX, y: PAGE_H - y - 20, width: tableW, height: 20, color: rgb(0.955, 0.96, 0.965),
  });
  const headers: [string, number][] = [
    ["Datum", cDate],
    ["Št. rezervacije", cNum],
    ["Izkušnja", cExp],
    ["Osebe", cPax],
    ["Znesek", cTot],
  ];
  for (const [h, x] of headers) {
    const isRight = h === "Znesek" || h === "Osebe";
    if (isRight) {
      drawTextRight(page, h, bold, 8, x + 4, y + 14, MUTED);
    } else {
      page.drawText(h, { x, y: PAGE_H - y - 14, size: 8, font: bold, color: MUTED });
    }
  }
  y += 24;

  const MAX_ROWS = 20;
  const shown = data.bookings.slice(0, MAX_ROWS);
  shown.forEach((b, i) => {
    const rowH = 16;
    if (i % 2 === 1) {
      page.drawRectangle({
        x: tableX, y: PAGE_H - y - rowH + 4, width: tableW, height: rowH, color: ROW_ALT,
      });
    }
    const rowY = y + 11;
    page.drawText(fmtDateShort(b.createdAt), {
      x: cDate, y: PAGE_H - rowY, size: 9, font: regular, color: INK,
    });
    page.drawText(b.bookingNumber, {
      x: cNum, y: PAGE_H - rowY, size: 9, font: regular, color: INK,
    });
    page.drawText(truncateToWidth(b.experienceName, regular, 9, cPax - cExp - 14), {
      x: cExp, y: PAGE_H - rowY, size: 9, font: regular, color: INK,
    });
    drawTextRight(page, String(b.groupSize), regular, 9, cPax + 4, rowY);
    drawTextRight(page, fmtEur(b.total), regular, 9, cTot + 4, rowY);
    y += rowH;
  });

  if (data.bookings.length > MAX_ROWS) {
    const rest = data.bookings.length - MAX_ROWS;
    page.drawText(
      `… in ${rest} ${rest === 1 ? "dodatna rezervacija" : "dodatnih rezervacij"} (skupaj ${data.bookingCount})`,
      { x: cDate, y: PAGE_H - y - 6, size: 8, font: regular, color: MUTED }
    );
    y += 16;
  }
  y += 6;

  // ── Povzetek ──
  page.drawLine({
    start: { x: PAGE_W - MARGIN - 230, y: PAGE_H - y },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - y },
    thickness: 1,
    color: LINE,
  });
  y += 18;
  const summaryRows: [string, string][] = [
    ["Osnova (vrednost rezervacij):", fmtEur(data.commissionBase)],
    ["Provizijska stopnja:", `${Math.round(data.rate * 100)} %`],
  ];
  for (const [label, value] of summaryRows) {
    drawTextRight(page, label, regular, 10, PAGE_W - MARGIN - 80, y - 10, MUTED);
    drawTextRight(page, value, bold, 10, PAGE_W - MARGIN, y - 10);
    y += 16;
  }
  y += 2;
  drawTextRight(page, "Znesek za plačilo:", bold, 13, PAGE_W - MARGIN - 90, y - 13);
  drawTextRight(page, fmtEur(data.amount), bold, 15, PAGE_W - MARGIN, y - 13, EMERALD);
  y += 26;

  // ── Pojasnilo (Booking-style) ──
  const noteText =
    "Turist plača polno ceno neposredno ponudniku. Ta račun zajema izključno provizijo " +
    `(${Math.round(data.rate * 100)} %) za rezervacije, ki jih je v navedenem obdobju prinesla ` +
    "brezplačna AI konzultacija. Rezervacije iz drugih kanalov ostanejo brez provizije.";
  const noteW = PAGE_W - 2 * MARGIN;
  const noteLines = wrapText(noteText, regular, 9, noteW - 24);

  const noteH = 14 + noteLines.length * 12 + 8;
  page.drawRectangle({
    x: MARGIN, y: PAGE_H - y - noteH, width: noteW, height: noteH,
    color: EMERALD_BG, borderColor: EMERALD_BORDER, borderWidth: 1,
  });
  noteLines.forEach((l, i) => {
    page.drawText(l, {
      x: MARGIN + 12, y: PAGE_H - y - 24 - i * 12, size: 9, font: regular, color: INK,
    });
  });
  y += noteH + 26;

  // ── Noga ──
  page.drawLine({
    start: { x: MARGIN, y: PAGE_H - y },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - y },
    thickness: 1,
    color: LINE,
  });
  const footer =
    "Discover Slovenia AI · račun izdan samodejno · " +
    `${data.invoiceNumber} · zneski so posnetek ob izdaji računa`;
  const footerW = regular.widthOfTextAtSize(footer, 7.5);
  page.drawText(footer, {
    x: (PAGE_W - footerW) / 2, y: 28, size: 7.5, font: regular, color: MUTED,
  });

  return pdf.save();
}
