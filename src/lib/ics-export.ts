import type { Itinerary } from "@/lib/types";

// ============================================================================
// ICS EXPORT (F5.2) — itinerer kot koledarska datoteka (.ics, RFC 5545)
// ============================================================================
//
// Zakaj (primerjalna analiza vs MindTrip/Layla): vsi vodilni plannerji
// omogočajo "vzeti načrt s sabo" — MindTrip ima app, mi smo web-first,
// zato je .ics (Apple Koledar / Google Calendar / Outlook) najbolj
// univerzalna pot. Dogodki so PO POSTANKIH (ne dnevi) — vsak postanek
// postane dogodek z začetkom/koncem iz time_slot, lokacijo (ime + GEO
// koordinate) in opisom (razlaga + ocena).
//
// Poštenost: če načrt nima datuma odhoda, so datumi RELATIVNI (dan 1 =
// dan izvoza) — to je izrecno zapisano v opisu vsakega dogodka, da
// uporabnik ve, da jih mora prestaviti. Brez izmišljenih datumov.
//
// Čista funkcija (string → string) — uporabna na clientu (Blob download)
// in po potrebi na strežniku. Brez knjižnice: ICS je besedilni format.
// ============================================================================

/** "2026-03-21" + "09:00" → "20260321T090000" ( lokalni čas = DTSTART brez TZ) */
function icsLocalDateTime(dateISO: string, timeHHmm: string): string {
  const d = dateISO.replace(/-/g, "");
  const t = timeHHmm.replace(":", "") + "00";
  return `${d}T${t}`;
}

/** RFC 5545 escape: backslash, podpičje, vejica, prelom vrstice. */
function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545: vrstice, daljše od 75 oktetov, se prelamljajo s " " + \r\n.
 *  TextEncoder — deluje v brskalniku IN na Node (Blok pride iz client komponente). */
const textEncoder = new TextEncoder();

function byteLength(text: string): number {
  return textEncoder.encode(text).length;
}

function icsFoldLine(line: string): string {
  if (byteLength(line) <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const ch of line) {
    const chBytes = byteLength(ch);
    if (currentBytes + chBytes > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) out.push(current);
  // Nadaljevalne vrstice se začnejo s presledkom
  return out.join("\r\n ");
}

/** "09:00-13:00" → { start: "09:00", end: "13:00" } | null (neveljaven zapis). */
function parseTimeSlot(timeSlot: string): {
  start: string;
  end: string;
} | null {
  const m = timeSlot.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const pad = (n: string) => n.padStart(2, "0");
  return {
    start: `${pad(m[1])}:${m[2]}`,
    end: `${pad(m[3])}:${m[4]}`,
  };
}

/** Lokalni datum ISO (YYYY-MM-DD) brez časovnih pasovnih pasti. */
function localDateISO(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface BuildIcsOptions {
  /** Jezik opisov dogodkov */
  lang?: "sl" | "en";
  /** Izvor načrta ( deljiva povezava) — zapiše se v DESCRIPTION/URL */
  url?: string;
}

/**
 * Zgradi VCALENDAR iz itinererja. Vrne null, če ni dni/postankov
 * (klicalnik naj pošteno sporoči "ni kaj izvoziti").
 */
export function buildItineraryICS(
  itinerary: Itinerary,
  options: BuildIcsOptions = {}
): string | null {
  const lang = options.lang === "en" ? "en" : "sl";
  const days = Array.isArray(itinerary.days) ? itinerary.days : [];
  const totalStops = days.reduce(
    (n, d) => n + (d.locations?.length ?? 0),
    0
  );
  if (days.length === 0 || totalStops === 0) return null;

  // Sidro datumov: datum odhoda načrta ali (brez njega) dan izvoza.
  // Pri relativnem sidru je to izrecno zapisano v opisu.
  const hasRealDates = Boolean(itinerary.tripStartDate);
  const anchorStart =
    itinerary.tripStartDate ?? localDateISO(0);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Discover Slovenia AI//Itinerary//SL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    icsFoldLine(
      `X-WR-CALNAME:${icsEscape(
        lang === "en"
          ? `Slovenia trip (${days.length} days)`
          : `Pot po Sloveniji (${days.length} ${days.length === 1 ? "dan" : days.length === 2 ? "dneva" : "dni"})`
      )}`
    ),
  ];

  const relativeNote =
    lang === "en"
      ? "Dates are relative (no start date in the plan) — please reschedule events in your calendar."
      : "Datumi so relativni (načrt brez datuma odhoda) — dogodke prestavi v koledarju na prave dneve.";

  let emitted = 0;
  for (const day of days) {
    for (const loc of day.locations ?? []) {
      const slot = parseTimeSlot(loc.time_slot ?? "");
      if (!slot) continue; // brez veljavnega urnika → izpusti (ne izmišljujemo)

      // Datum tega dneva = sidro + (day - 1)
      const dayDate = (() => {
        const [y, m, d] = anchorStart.split("-").map(Number);
        const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
        dt.setDate(dt.getDate() + (day.day - 1));
        const yy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, "0");
        const dd = String(dt.getDate()).padStart(2, "0");
        return `${yy}-${mm}-${dd}`;
      })();

      const uidSrc = `${dayDate}-${day.day}-${loc.destination_id}-${emitted}`;
      // Determinističen UID ( isti načrt → isti UID → koledarji ga znajo posodabiti)
      let uidHash = 0;
      for (let i = 0; i < uidSrc.length; i++) {
        uidHash = (uidHash * 31 + uidSrc.charCodeAt(i)) | 0;
      }
      const uid = `dsa-${Math.abs(uidHash).toString(36)}-${emitted}@discoverslovenia`;

      const descParts: string[] = [];
      if (loc.notes) descParts.push(loc.notes);
      if (loc.reason) {
        descParts.push(
          lang === "en" ? `Why: ${loc.reason}` : `Zakaj: ${loc.reason}`
        );
      }
      // TASK 50 (§10): estimated_cost je lahko NaN/null (strežniško
      // neverificirana cena — vir nepriključen) → v koledar NE pišemo
      // "€NaN"; neznan strošek izpustimo (opomba postanke ga pokriva).
      if (
        typeof loc.estimated_cost === "number" &&
        Number.isFinite(loc.estimated_cost)
      ) {
        descParts.push(
          lang === "en"
            ? `Estimated cost: €${loc.estimated_cost}`
            : `Ocena stroška: ${loc.estimated_cost} €`
        );
      }
      if (!hasRealDates) descParts.push(relativeNote);
      if (options.url) descParts.push(options.url);

      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${icsLocalDateTime(localDateISO(0), "00:00")}Z`,
        `DTSTART:${icsLocalDateTime(dayDate, slot.start)}`,
        `DTEND:${icsLocalDateTime(dayDate, slot.end)}`,
        icsFoldLine(
          `SUMMARY:${icsEscape(
            (lang === "en" ? `Day ${day.day}` : `Dan ${day.day}`) +
              " · " +
              (loc.destination_name ?? "")
          )}`
        ),
        icsFoldLine(`LOCATION:${icsEscape(loc.destination_name ?? "")}`),
        icsFoldLine(`DESCRIPTION:${icsEscape(descParts.join("\n"))}`),
        "END:VEVENT"
      );
      emitted++;
    }
  }

  if (emitted === 0) return null; // noben postanek ni imel veljavnega urnika

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/**
 * Ime datoteke za prenos.
 * I18N-FIX (revizija 1.33.0, 16-d P3): ime je bilo vedno SL
 * ("pot-slovenija-…") tudi pri EN izvozu — zdaj sledi jeziku izvoza.
 */
export function icsFileName(itinerary: Itinerary, lang: "sl" | "en" = "sl"): string {
  const days = itinerary.days?.length ?? 0;
  const firstStop =
    itinerary.days?.[0]?.locations?.[0]?.destination_id ?? "plan";
  return lang === "en"
    ? `trip-slovenia-${days}d-${firstStop}.ics`
    : `pot-slovenija-${days}d-${firstStop}.ics`;
}
