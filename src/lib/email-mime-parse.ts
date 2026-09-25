// ============================================================================
// EMAIL-MIME-PARSE — TASK 31 (Tier 1 #3): DETERMINISTIČNI RFC 5322/MIME bralnik
// ----------------------------------------------------------------------------
// VRZEL (benchmark Task 28): TripItov model „posreduj potrditveno e-pošto"
// zahteva branje SUROVE e-pošte (glava + MIME struktura). Ta modul je ČIST
// most „surova e-pošta → besedilo/priloga", ki ga nato POJEDEJO obstoječi
// deterministični parserji (parseReservationText / parseIcsReservation /
// unpdf pot v ruti) — 0 zunanjih odvisnosti, 0 AI.
//
// KAJ podpira (iskrene meje — vse ostalo vrne null, NIKOLI izjemo):
//   · glava: razpleteno (folded) polje Subject/From/To/Date;
//   · RFC 2047 kodirane besede v glavi (=?utf-8?B?…?= / ?Q?…?=) — Subject
//     „Booking.com – potrditev" v izvorni kodi je pogosto base64/QP kodiran;
//   · Content-Transfer-Encoding: 7bit/8bit (surovo), quoted-printable, base64;
//   · multipart/alternative (text/plain pred text/html — isto hierarhijo
//     prednostnih izbir kot poštni odjemalci), multipart/mixed, multipart/related,
//     multipart/* (generično rekurzivno, vgrajena globinska meja 5);
//   · priloge: ICS (Content-Type text/calendar · application/ics · ime .ics)
//     → SUROVO dekodirano besedilo; PDF (application/pdf · ime .pdf) → baza64
//     z magic preverbo %PDF- (fail-closed: pokvarjena priloga = ni priloge);
//   · charset: utf-8 privzeto; ob izrazitih nadomestnih znakih (\uFFFD)
//     iskren poskus latin1 (windows-1250/iso-8859-2 dokumentirano kot
//     „best effort" — surova resnica ostaja v odjemalčevem izvirniku).
//
// ČISTOST: modul je DETERMINISTIČEN — brez Date.now/fetch/prisma/omrežja;
// vsa vhodna vrata kapirana (MAX_RAW_EMAIL_CHARS). Nikoli ne vrže.
// ============================================================================

export interface EmailParsedMessage {
  subject: string | null;
  from: string | null;
  to: string | null;
  date: string | null;
  /** najboljši text/plain del telesa (dekodiran) */
  textBody: string | null;
  /** dekodiran text/html del (na voljo kot rezerva htmlToText) */
  htmlBody: string | null;
  /** surova dekodirana vsebina .ics priloge (BEGIN:VCALENDAR …) */
  icsAttachment: string | null;
  /** base64 (čist, brez presledkov) PDF priloge z %PDF- glavo */
  pdfAttachmentBase64: string | null;
}

export type EmailParseResult =
  | { ok: true; message: EmailParsedMessage }
  | { ok: false; reason: string };

/** Zgornja meja surove e-pošte (2 MB pokrije bazo64 priloge do ~1,4 MB). */
export const MAX_RAW_EMAIL_CHARS = 2_000_000;
/** Meje posameznih delov (iskrene — večje stvari poštni strežniki ne pošiljejo kot potrdila). */
const MAX_TEXT_BODY_CHARS = 200_000;
const MAX_ICS_CHARS = 500_000;
const MAX_PDF_BASE64_CHARS = 8 * 1024 * 1024;
/** Meja gnezdenja multipart (ščit pred roglji/pastmi mejnikov). */
const MAX_MULTIPART_DEPTH = 5;

// ── Preprosti pripomočki ───────────────────────────────────────────────────

function decodeQuotedPrintable(input: string): string {
  // Mehke prelome (= na koncu vrstice) odstranimo PRE združitvi parov.
  const unfolded = input.replace(/=\r?\n/g, "");
  return unfolded.replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

function decodeBase64ToBytes(input: string): Buffer {
  // Poštni prenašalci base64 lomijo v 76-znakovne vrstice (+ komentarji
  // mejnikov) — počistimo VSE bele prostore, ne samo nova vrstica.
  const cleaned = input.replace(/[^A-Za-z0-9+/=]/g, "");
  return Buffer.from(cleaned, "base64");
}

/** Best-effort dekodiranje bajtov v besedilo: utf-8, ob izrazitih nadomestnih
 *  znakih drugi poskus latin1 (slovenska pošta 90.ih / windows-1250). */
function bytesToText(bytes: Buffer): string {
  const utf8 = bytes.toString("utf8");
  const bad = (utf8.match(/\uFFFD/g) ?? []).length;
  if (bad === 0 || bad * 8 < utf8.length) return utf8;
  return bytes.toString("latin1");
}

/** RFC 2047 kodirane besede (=?charset?B|Q?…?=) — sosednje besede se
 *  združijo brez presledka (pravilo adjacency). */
function decodeMimeWords(value: string): string {
  if (!value.includes("=?")) return value;
  const re = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;
  let previousEncoded = false;
  while ((match = re.exec(value)) !== null) {
    const between = value.slice(last, match.index);
    // Presledek MED dvema kodiranima besedama se izpusti.
    if (!(previousEncoded && /^\s*$/.test(between))) out += between;
    const charset = match[1].toLowerCase();
    const enc = match[2].toUpperCase();
    let decoded: string;
    try {
      if (enc === "B") {
        decoded = decodeBase64ToBytes(match[3]).toString(
          charset.includes("8859") || charset.includes("125") || charset.includes("latin")
            ? "latin1"
            : "utf8"
        );
      } else {
        // Q: podčrtaj = presledek, =XX heksadecimalni bajt.
        const qp = match[3].replace(/_/g, " ");
        decoded = decodeQuotedPrintable(qp);
      }
    } catch {
      decoded = match[0]; // neznana kodna shema → surovo (iskreno)
    }
    out += decoded;
    last = match.index + match[0].length;
    previousEncoded = true;
  }
  out += value.slice(last);
  return out;
}

// ── HTML → besedilo (rezervna pot multipart/alternative brez text/plain) ───

/** Odstrani skripte/stile/glavo, blokovne oznake zamenja z novimi vrsticami,
 *  dekodira entitete, stisne presledke. NAMENJENO preprosto (ne odjemalnik). */
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");
  // Blokovne oznake → prelom vrstice (br/p/div/tr/li/h1-6/table …).
  s = s.replace(/<(?:br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/table|hr)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  // Entitete (pogoste + številčne).
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    scaron: "š", Scaron: "Š", ccaron: "č", Ccaron: "Č", zcaron: "ž", Zcaron: "Ž",
  };
  s = s.replace(/&(nbsp|amp|lt|gt|quot|apos|scaron|Scaron|ccaron|Ccaron|zcaron|Zcaron);/g,
    (_, name: string) => named[name] ?? `&${name};`);
  s = s.replace(/&#(\d+);/g, (_, num: string) => {
    const code = parseInt(num, 10);
    return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : `&#${num};`;
  });
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
    const code = parseInt(hex, 16);
    return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : `&#x${hex};`;
  });
  // Stisnek presledkov, obdrži prelome vrstic.
  s = s.split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).join("\n");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

// ── MIME struktura ──────────────────────────────────────────────────────────

interface MimePart {
  headers: Map<string, string>;
  body: string;
}

interface LeafPick {
  textBody: string | null;
  htmlBody: string | null;
  icsAttachment: string | null;
  pdfAttachmentBase64: string | null;
}

function headerValue(all: string[], name: string): string | null {
  const found = all.find((line) => line.toLowerCase().startsWith(`${name}:`));
  if (!found) return null;
  return found.slice(name.length + 1).trim() || null;
}

function contentTypeOf(part: MimePart): { type: string; params: Record<string, string> } {
  const raw = part.headers.get("content-type") ?? "text/plain";
  const semi = raw.indexOf(";");
  const type = (semi === -1 ? raw : raw.slice(0, semi)).trim().toLowerCase();
  const params: Record<string, string> = {};
  // Parameter=„vrednost" ali Parameter=vrednost (brez narekovajev).
  const re = /([a-zA-Z0-9-]+)\s*=\s*(?:"([^"]*)"|([^;\s]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    params[m[1].toLowerCase()] = (m[2] ?? m[3] ?? "").trim();
  }
  return { type, params };
}

function isIcsPart(type: string, params: Record<string, string>, disposition: string | null): boolean {
  if (type === "text/calendar" || type === "application/ics") return true;
  const name = (params.name ?? params.filename ?? "").toLowerCase();
  if (name.endsWith(".ics")) return true;
  const dispFile = disposition?.match(/filename\s*=\s*(?:"([^"]*)"|([^;\s]+))/i)?.[1]
    ?? disposition?.match(/filename\s*=\s*(?:"([^"]*)"|([^;\s]+))/i)?.[2];
  return !!dispFile && dispFile.toLowerCase().endsWith(".ics");
}

function isPdfPart(type: string, params: Record<string, string>, disposition: string | null): boolean {
  if (type === "application/pdf") return true;
  const name = (params.name ?? params.filename ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return true;
  const dispFile = disposition?.match(/filename\s*=\s*(?:"([^"]*)"|([^;\s]+))/i)?.[1]
    ?? disposition?.match(/filename\s*=\s*(?:"([^"]*)"|([^;\s]+))/i)?.[2];
  return !!dispFile && dispFile.toLowerCase().endsWith(".pdf");
}

function pickLeaf(part: MimePart, pick: LeafPick): void {
  const { type, params } = contentTypeOf(part);
  const disposition = (part.headers.get("content-disposition") ?? "").toLowerCase();
  const isAttachment = disposition.startsWith("attachment");
  const encoding = (part.headers.get("content-transfer-encoding") ?? "7bit").trim().toLowerCase();
  const body = part.body;

  // Priloga ICS → surovo besedilo (potrdila koledar).
  if (isIcsPart(type, params, disposition) && !pick.icsAttachment) {
    const text = decodeTransfer(body, encoding);
    if (text.includes("BEGIN:VCALENDAR")) {
      pick.icsAttachment = text.slice(0, MAX_ICS_CHARS);
      return;
    }
    // „.ics" priloga brez VCALENDAR → ni potrdilo (fail-closed: prezrto).
  }

  // Priloga PDF → base64 + magic preverba (fail-closed).
  if (isPdfPart(type, params, disposition) && !pick.pdfAttachmentBase64) {
    const b64 = encoding === "base64"
      ? body.replace(/[^A-Za-z0-9+/=]/g, "")
      : decodeBase64ToBytes(body).toString("base64");
    if (b64.length > 0 && b64.length <= MAX_PDF_BASE64_CHARS) {
      const head = Buffer.from(b64.slice(0, 1024), "base64").toString("latin1");
      if (head.startsWith("%PDF-")) {
        pick.pdfAttachmentBase64 = b64;
        return;
      }
      // Brez magic glave ni PDF (škodljivi/pokvarjeni prenosi) — iskreno prezrto.
    }
  }

  // Vložno telo: text/plain ima prednost (enak vrstni red kot odjemalci).
  if (!isAttachment && type === "text/plain" && !pick.textBody) {
    const text = decodeTransfer(body, encoding);
    if (text.trim()) pick.textBody = text.slice(0, MAX_TEXT_BODY_CHARS);
    return;
  }
  if (!isAttachment && type === "text/html" && !pick.htmlBody) {
    const text = decodeTransfer(body, encoding);
    if (text.trim()) pick.htmlBody = text.slice(0, MAX_TEXT_BODY_CHARS);
    return;
  }
  // image/*, application/* ostalo: namerno prezrto (nisemo odjemalnik).
}

function decodeTransfer(body: string, encoding: string): string {
  switch (encoding) {
    case "base64":
      return bytesToText(decodeBase64ToBytes(body));
    case "quoted-printable":
      return bytesToText(Buffer.from(decodeQuotedPrintable(body), "latin1"));
    default:
      // 7bit / 8bit / binary / neznano → surovo.
      return body;
  }
}

function walkParts(
  lines: string[],
  boundary: string,
  depth: number,
  pick: LeafPick
): void {
  if (depth > MAX_MULTIPART_DEPTH) return; // meja gnezdenja — iskrena tišina
  const delim = `--${boundary}`;
  // Najdi prvi začetek mejnika; vse pred njim je prolog (ignored).
  let start = lines.findIndex((l) => l.trim() === delim);
  if (start === -1) return;
  let current: string[] | null = null;
  for (let i = start; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === delim || trimmed === `${delim}--`) {
      if (current) {
        ingestPart(current, depth, pick);
        current = null;
      }
      if (trimmed === `${delim}--`) break;
      current = [];
      continue;
    }
    if (current) current.push(lines[i]);
  }
  if (current) ingestPart(current, depth, pick); // manjkajoči zaključek — strpamo
  // Epilog brez zaključnega mejnika (brez `--boundary--`): deli so bili že
  // ločeni z začetnimi mejniki — poštni viri so obvezno zaključeni; past je
  // dokumentirana in BENIGNNA (nič se ne izgubi).
}

function ingestPart(rawLines: string[], depth: number, pick: LeafPick): void {
  // Ločitev glave/tela dela na prvi prazni vrstici.
  let splitAt = rawLines.findIndex((l) => l.trim() === "");
  if (splitAt === -1) splitAt = rawLines.length;
  const headerLines: string[] = [];
  for (let i = 0; i < splitAt; i++) {
    const line = rawLines[i];
    // Razpleteno glavo (nadaljevalne vrstice z presledkom/tab).
    if (/^[ \t]/.test(line) && headerLines.length > 0) {
      headerLines[headerLines.length - 1] += ` ${line.trim()}`;
    } else {
      headerLines.push(line);
    }
  }
  const headers = new Map<string, string>();
  for (const line of headerLines) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers.set(key, value);
  }
  const bodyLines = rawLines.slice(splitAt + 1);
  const { type, params } = contentTypeOf({ headers, body: "" });
  const boundary = params.boundary;
  if (type.startsWith("multipart/") && boundary) {
    walkParts(bodyLines, boundary, depth + 1, pick);
    return;
  }
  pickLeaf({ headers, body: bodyLines.join("\r\n") }, pick);
}

// ── Glavni vhod ─────────────────────────────────────────────────────────────

/**
 * Parsed surovo RFC 5322 sporočilo. DETERMINISTIČNO: nikoli ne vrže;
 * { ok:false, reason } pomeni „to ni prepoznavna struktura e-pošte" (ruta
 * odpove iskreno 422 z nasvetom — uporabnik naj uporabi zavihek Besedilo).
 */
export function parseEmailSource(raw: string): EmailParseResult {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (raw.length > MAX_RAW_EMAIL_CHARS) {
    return { ok: false, reason: "preveliko" };
  }
  // Nadzorni znaki (razen TAB/CR/LF) v prvih 4 KB → fail-closed.
  const FORBIDDEN_CTRL = new RegExp(
    "[" +
      String.fromCharCode(0) + "-" + String.fromCharCode(8) +
      String.fromCharCode(11) + String.fromCharCode(12) +
      String.fromCharCode(14) + "-" + String.fromCharCode(31) +
      "]"
  );
  if (FORBIDDEN_CTRL.test(raw.slice(0, 4096))) {
    return { ok: false, reason: "nadzorni-znaki" };
  }
  // Normalizacija vrstic (prilepljena pošta ima pogosto samo LF).
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Ločitev glave od telesa na prvi prazni vrstici.
  const headerEnd = lines.findIndex((l) => l.trim() === "");
  if (headerEnd === -1) {
    return { ok: false, reason: "ni-glave" };
  }
  // Razpleti (unfold) glavo.
  const headerLines: string[] = [];
  for (let i = 0; i < headerEnd; i++) {
    const line = lines[i];
    if (/^[ \t]/.test(line) && headerLines.length > 0) {
      headerLines[headerLines.length - 1] += ` ${line.trim()}`;
    } else {
      headerLines.push(line);
    }
  }
  // Vsaj ena prepoznavna glava (Subject/From/To/Date/MIME-Version) — sicer
  // je to samo besedilo brez strukture (uporabnik naj izbere zavihek Besedilo).
  const recognizable = headerLines.some((l) =>
    /^(subject|from|to|date|mime-version|content-type|received|return-path|message-id):/i.test(l)
  );
  if (!recognizable) {
    return { ok: false, reason: "ni-glave" };
  }

  const bodyLines = lines.slice(headerEnd + 1);
  const pick: LeafPick = {
    textBody: null,
    htmlBody: null,
    icsAttachment: null,
    pdfAttachmentBase64: null,
  };

  // Vrhnja raven: multipart ali list?
  const topTypeRaw = headerValue(headerLines, "content-type") ?? "text/plain";
  const semi = topTypeRaw.indexOf(";");
  const topType = (semi === -1 ? topTypeRaw : topTypeRaw.slice(0, semi))
    .trim()
    .toLowerCase();
  const topBoundary = topTypeRaw.match(/boundary\s*=\s*(?:"([^"]*)"|([^;\s]+))/i);
  if (topType.startsWith("multipart/") && topBoundary) {
    walkParts(bodyLines, topBoundary[1] ?? topBoundary[2], 1, pick);
  } else {
    const headers = new Map<string, string>();
    for (const line of headerLines) {
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
    }
    pickLeaf({ headers, body: bodyLines.join("\r\n") }, pick);
  }

  return {
    ok: true,
    message: {
      subject: decodeMimeWords(headerValue(headerLines, "subject") ?? "") || null,
      from: decodeMimeWords(headerValue(headerLines, "from") ?? "") || null,
      to: decodeMimeWords(headerValue(headerLines, "to") ?? "") || null,
      date: headerValue(headerLines, "date"),
      textBody: pick.textBody,
      htmlBody: pick.htmlBody,
      icsAttachment: pick.icsAttachment,
      pdfAttachmentBase64: pick.pdfAttachmentBase64,
    },
  };
}

/**
 * Kaskadno besedilo za obstoječe parserje: From (TripItov signal ponudnika —
 * domena pošiljatelja je znamka), Subject (pogosto nosi ponudnika + št.
 * rezervacije) + najboljše telo (text/plain pred html→text).
 * Vrne null, če ni nič uporabnega (potem ostane samo priloga).
 */
export function emailTextForParsing(m: EmailParsedMessage): string | null {
  const body = m.textBody ?? (m.htmlBody ? htmlToText(m.htmlBody) : null);
  const parts: string[] = [];
  if (m.from) parts.push(`From: ${m.from}`);
  if (m.subject) parts.push(m.subject);
  if (body && body.trim()) parts.push(body.trim());
  const joined = parts.join("\n\n");
  return joined.trim() ? joined : null;
}
