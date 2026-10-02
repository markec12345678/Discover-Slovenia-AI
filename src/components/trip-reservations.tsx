"use client";

// ============================================================================
// TRIP RESERVATIONS — ISSUE #4 §4 (val 3): rezervacije na /pot/[shareId]
// ============================================================================
// Seznam rezervacij poti (agregator bookingList) + "Dodaj rezervacijo":
//   1. ROČNO — obrazec (potrditev = samo dejanje vnosa, source USER);
//   2. DOKUMENT — slika/PDF/prilepljeno besedilo → STATELESS AI parse
//      (/api/journey/bookings/parse) → PREDogled (uredljiv) → uporabnik
//      POTRDI → zapis (/api/journey/bookings/import, source IMPORTED).
//
// ISKRENOST (Issue #4 §4):
//  · AI samo prebere dokument — manjkajoče ostane prazno (nikoli ne ugiba);
//  · parse, ki ni prebral ključnih polj (ponudnik / kdaj), se shrani kot
//    OSNUTEK (DRAFT) z žetonom "Čaka potrditev" — nikoli kar CONFIRMED;
//  · izvor je VEDNO razkrit: "ročni vnos" / "uvoženo iz dokumenta" /
//    "zunanja rezervacija" (legacy EXTERNAL);
//  · uporabniško potrjena rezervacija NIKOLI ni smaragdno "provider
//    potrjeno" — vijolični/amber žeton z izvorom.
//
// Površina je SL-only (enako kot ostale /pot komponente).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TicketCheck,
  Plus,
  Loader2,
  FileText,
  Image as ImageIcon,
  ClipboardType,
  PenLine,
  CircleAlert,
  CircleCheck,
  Mail,
  Copy,
  Check,
} from "lucide-react";
import { getEditToken } from "@/lib/itinerary-share";

// 1.123 (G3 — ISSUE #13): naslov za posredovanje potrdil (TripIt vzorec
// email-forward uvoza). Env-poganjan: lastnik ga nastavi, ko pripravi
// vhodni poštni kanal (npr. Cloudflare Email Workers → webhook →
// bookings/parse); BREZ nastavitve izrišemo iskreno noto "kanal v
// pripravi" (nikoli izmišljen naslov, ki ne deluje — §5 benchmarka).
// NEXT_PUBLIC_* se vdel ob buildu — varen za klient.
const RESERVATIONS_EMAIL = process.env.NEXT_PUBLIC_RESERVATIONS_EMAIL ?? "";

interface BookingRow {
  provider: string;
  providerProductId?: string;
  status: string;
  source: string | null;
  providerBookingId: string | null;
  confirmedPrice: number | null;
  currency: string;
  summary: {
    providerName: string | null;
    reservationNumber: string | null;
    startDateTime: string | null;
    locationName: string | null;
    guestName: string | null;
    cancellationDeadline: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

interface ParsedFields {
  providerName: string | null;
  reservationNumber: string | null;
  startDateTime: string | null;
  endDateTime: string | null;
  locationName: string | null;
  guestName: string | null;
  price: number | null;
  currency: string | null;
  cancellationDeadline: string | null;
  contact: string | null;
  notes: string | null;
}

// ISSUE #24 Sklop 1 (1.164.0): L-vzorec {sl,en} — prej SL-only
// (per-ključna oblika {sl,en} po vzorcu journey-planner/journey-trip;
// interpolacijske vrednosti so čiste funkcije).
const L = {
  httpError: {
    sl: (status: number) => `Napaka ${status}`,
    en: (status: number) => `Error ${status}`,
  },
  title: { sl: "Rezervacije", en: "Reservations" },
  statusDraft: {
    sl: "Osnutek — čaka potrditev",
    en: "Draft — awaiting confirmation",
  },
  statusConfirmed: {
    sl: "Potrjeno (uporabniški vnos)",
    en: "Confirmed (user entry)",
  },
  statusExternal: {
    sl: "Zunanja rezervacija — pri ponudniku",
    en: "External booking — at the provider",
  },
  statusSelected: { sl: "Izbrano", en: "Selected" },
  statusCancelled: { sl: "Preklicano", en: "Cancelled" },
  statusFailed: { sl: "Spodletelo", en: "Failed" },
  sourceUser: { sl: "ročni vnos", en: "manual entry" },
  sourceImported: {
    sl: "uvoženo iz dokumenta",
    en: "imported from a document",
  },
  bookingNo: {
    sl: (n: string) => `Št. rezervacije: ${n}`,
    en: (n: string) => `Booking no.: ${n}`,
  },
  when: {
    sl: (v: string) => `Kdaj: ${v}`,
    en: (v: string) => `When: ${v}`,
  },
  where: {
    sl: (v: string) => `Kje: ${v}`,
    en: (v: string) => `Where: ${v}`,
  },
  amount: {
    sl: (v: string) => `Znesek: ${v}`,
    en: (v: string) => `Amount: ${v}`,
  },
  cancelBy: {
    sl: (v: string) => `Odpoved do: ${v}`,
    en: (v: string) => `Cancel by: ${v}`,
  },
  confirmReservation: { sl: "Potrdi rezervacijo", en: "Confirm reservation" },
  cancel: { sl: "Prekliči", en: "Cancel" },
  empty: {
    sl: "Še ni rezervacij. Dodaj ročno ali uvozi potrdilo ponudnika (slika/PDF/e-pošta).",
    en: "No reservations yet. Add one manually or import a provider confirmation (image/PDF/email).",
  },
  tabManual: { sl: "Ročno", en: "Manual" },
  tabDoc: { sl: "Dokument", en: "Document" },
  tabText: { sl: "Besedilo", en: "Text" },
  tabEmail: { sl: "E-pošta", en: "Email" },
  manualNote: {
    sl: "Vnesi podatke svoje rezervacije. Zapis je tvoj vnos (izrecno označen) — nikoli providerjeva potrditev prek naše integracije.",
    en: "Enter your reservation details. The record is your own entry (explicitly labelled) — never a provider confirmation through our integration.",
  },
  docNote: {
    sl: "Naloži potrdilo ponudnika — AI prebere SAMO podatke, ki so v njem; ti jih pred shranjevanjem pregledaš in potrdiš.",
    en: "Upload a provider confirmation — the AI reads ONLY the data in it; you review and confirm it before saving.",
  },
  chooseFile: { sl: "Izberi sliko ali PDF", en: "Choose an image or PDF" },
  readDocument: { sl: "Preberi dokument", en: "Read document" },
  textNote: {
    sl: "Prilepi besedilo potrditvene e-pošte (rezervacija, let, vstopnica …).",
    en: "Paste the text of a confirmation email (booking, flight, ticket …).",
  },
  textAria: {
    sl: "Besedilo potrditve rezervacije",
    en: "Reservation confirmation text",
  },
  textPlaceholder: {
    sl: "Primer: GetYourGuide — št. rezervacije GYG-123456, Bled, 12.07.2026 10:00, 2 osebi, 58 EUR …",
    en: "Example: GetYourGuide — booking no. GYG-123456, Bled, 12.07.2026 10:00, 2 people, 58 EUR …",
  },
  readText: { sl: "Preberi besedilo", en: "Read text" },
  emailPastePrefix: { sl: "Prilepi ", en: "Paste " },
  emailRawStrong: {
    sl: "surovo potrditveno e-pošto",
    en: "the raw confirmation email",
  },
  emailPasteMid: {
    sl: " (celotna izvorna koda, ne vidni del): v Gmailu",
    en: " (the entire source code, not just the visible part): in Gmail",
  },
  emailGmailItem: { sl: "⋮ → Pokaži izvorno kodo", en: "⋮ → Show original" },
  emailOutlookMid: {
    sl: ", v Outlooku shrani kot",
    en: ", in Outlook save it as",
  },
  emailOutlookMid2: {
    sl: " in odpri z urejevalnikom besedila, v Apple Mail pa ",
    en: " and open it in a text editor; in Apple Mail ",
  },
  emailAppleItem: {
    sl: "Pogled → Sporočilo → Izvorna koda",
    en: "View → Message → Raw Source",
  },
  emailReaderNote: {
    sl: ". Bralnik razbere glavo, telo in priloge (.ics / .pdf).",
    en: ". The reader parses the header, body and attachments (.ics / .pdf).",
  },
  emailAria: {
    sl: "Surova e-pošta s potrditvijo rezervacije",
    en: "Raw reservation confirmation email",
  },
  emailPlaceholder: {
    sl: "From: potrditve@getyourguide.com\r\nSubject: GetYourGuide — potrditev GYG-123456\r\nContent-Type: text/plain …\r\n\r\nVaša rezervacija je potrjena …",
    en: "From: confirmations@getyourguide.com\r\nSubject: GetYourGuide — confirmation GYG-123456\r\nContent-Type: text/plain …\r\n\r\nYour booking is confirmed …",
  },
  readEmail: { sl: "Preberi e-pošto", en: "Read email" },
  forwardTo: {
    sl: "Potrdila lahko posreduješ na naslov:",
    en: "You can forward confirmations to:",
  },
  copyAddressAria: {
    sl: "Kopiraj naslov za posredovanje potrdil",
    en: "Copy the address for forwarding confirmations",
  },
  copied: { sl: "Skopirano", en: "Copied" },
  copy: { sl: "Kopiraj", en: "Copy" },
  forwardingPrefix: {
    sl: "Samodejno posredovanje (naslov ",
    en: "Automatic forwarding (the address ",
  },
  forwardingAddress: { sl: "rezervacije@…", en: "reservations@…" },
  forwardingSuffix: {
    sl: ", kamor posreduješ potrdila) bo omogočeno, ko aktiviramo vhodni poštni kanal — danes deluje ročno lepljenje.",
    en: " you forward confirmations to) will be enabled once we activate the inbound mail channel — for now, pasting manually works.",
  },
  parsedDeterministic: {
    sl: "Prebrano z vgrajenim bralnikom (brez AI) — preveri polja pred potrditvijo.",
    en: "Read with the built-in reader (no AI) — check the fields before confirming.",
  },
  parsedAi: {
    sl: (parseVia: string) =>
      `Prebrano z AI (${parseVia}) — preveri polja pred potrditvijo.`,
    en: (parseVia: string) =>
      `Read with AI (${parseVia}) — check the fields before confirming.`,
  },
  fileUnsupported: {
    sl: "Podprta je slika (JPEG/PNG/WebP) ali PDF.",
    en: "An image (JPEG/PNG/WebP) or a PDF is supported.",
  },
  fileTooLarge: {
    sl: "Datoteka je prevelika (slika do 4,5 MB / PDF do 6 MB).",
    en: "The file is too large (image up to 4.5 MB / PDF up to 6 MB).",
  },
  fileUnreadable: {
    sl: "Datoteke ni bilo mogoče prebrati.",
    en: "The file could not be read.",
  },
  needTextOrFile: {
    sl: "Prilepi besedilo potrditve (vsaj 20 znakov) ali izberi datoteko.",
    en: "Paste the confirmation text (at least 20 characters) or choose a file.",
  },
  needRawEmail: {
    sl: "Prilepi SUROVO e-pošto (glava s Subject/From + telo — vsaj 40 znakov).",
    en: "Paste the RAW email (header with Subject/From + body — at least 40 characters).",
  },
  providerRequired: {
    sl: "Ime ponudnika je obvezno.",
    en: "The provider name is required.",
  },
  providerLabel: { sl: "Ponudnik *", en: "Provider *" },
  providerPlaceholder: { sl: "npr. GetYourGuide", en: "e.g. GetYourGuide" },
  numberLabel: { sl: "Št. rezervacije", en: "Booking no." },
  numberPlaceholder: { sl: "npr. GYG-123456", en: "e.g. GYG-123456" },
  startLabel: { sl: "Datum/čas (od)", en: "Date/time (from)" },
  startPlaceholder: { sl: "npr. 12.07.2026 10:00", en: "e.g. 12.07.2026 10:00" },
  endLabel: { sl: "Do (opcijsko)", en: "To (optional)" },
  locationLabel: { sl: "Kraj/lokacija", en: "Place/location" },
  locationPlaceholder: { sl: "npr. Bled", en: "e.g. Bled" },
  guestLabel: { sl: "Gost/potnik", en: "Guest/traveller" },
  priceLabel: { sl: "Znesek", en: "Amount" },
  pricePlaceholder: { sl: "npr. 58", en: "e.g. 58" },
  currencyLabel: { sl: "Valuta", en: "Currency" },
  cancelDeadlineLabel: {
    sl: "Rok za brezplačno odpoved",
    en: "Free cancellation deadline",
  },
  cancelDeadlinePlaceholder: {
    sl: "npr. 24 h pred začetkom",
    en: "e.g. 24 h before start",
  },
  confirmAndSave: {
    sl: "Potrdi in shrani rezervacijo",
    en: "Confirm and save the reservation",
  },
  saveDraft: { sl: "Shrani kot osnutek", en: "Save as draft" },
  saveNote: {
    sl: "S shranjevanjem potrjuješ, da so podatki iz tvojega potrdila ponudnika. Zapis je vedno označen z izvorom (ročni vnos / uvoženo) — nikoli kot providerjeva potrditev prek naše integracije.",
    en: "By saving, you confirm the data comes from your provider's confirmation. The record is always labelled with its origin (manual entry / imported) — never as a provider confirmation through our integration.",
  },
  addReservation: { sl: "Dodaj rezervacijo", en: "Add a reservation" },
} as const;

// ISSUE #24 Sklop 1 (1.164.0): oznake statusov/izvorov {sl,en} — razred
// (cls) ostaja skupen (jezikovno nevtralen), besedilo prihaja iz L.
const STATUS_BADGES: Record<
  string,
  { label: { sl: string; en: string }; cls: string }
> = {
  DRAFT: {
    label: L.statusDraft,
    cls: "border-amber-500/50 text-amber-700 bg-amber-50",
  },
  CONFIRMED: {
    label: L.statusConfirmed,
    cls: "border-violet-500/50 text-violet-700 bg-violet-50",
  },
  EXTERNAL: {
    label: L.statusExternal,
    cls: "border-violet-500/40 text-violet-700",
  },
  SELECTED: { label: L.statusSelected, cls: "border-border text-muted-foreground" },
  CANCELLED: { label: L.statusCancelled, cls: "border-border text-muted-foreground" },
  FAILED: { label: L.statusFailed, cls: "border-destructive/40 text-destructive" },
};

const SOURCE_LABELS: Record<string, { sl: string; en: string }> = {
  USER: L.sourceUser,
  IMPORTED: L.sourceImported,
};

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function apiJson(
  url: string,
  init: RequestInit & { editToken?: string | null }
): Promise<Response> {
  const { editToken, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (editToken) headers.set("x-dsa-edit-token", editToken);
  if (rest.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(url, { ...rest, headers });
}

export function TripReservations({ shareId }: { shareId: string }) {
  // ISSUE #24 Sklop 1 (1.164.0): jezik površine ({sl,en} — SL privzeto).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Parse tok (dokument)
  const [parsing, setParsing] = useState(false);
  const [parseVia, setParseVia] = useState<string | null>(null);
  // M1 (T5-D): "ai" | "deterministic" — vgrajeni bralnik razkrit iskreno.
  const [parseMethod, setParseMethod] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  // TASK 31 (Tier 1 #3): surova e-pošta (izvorna koda / .eml) — čist MIME
  // bralnik na strežniku razširi glavo + priloge (ICS/PDF) v polja.
  const [rawEmail, setRawEmail] = useState("");
  // 1.123 (G3): povratna zanka "Kopiraj" naslova (2 s potrditev).
  const [emailCopied, setEmailCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileKind, setFileKind] = useState<"image" | "pdf" | null>(null);
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Predogled (iz parse ali prazna forma za ročni vnos)
  const [fields, setFields] = useState<ParsedFields>({
    providerName: null,
    reservationNumber: null,
    startDateTime: null,
    endDateTime: null,
    locationName: null,
    guestName: null,
    price: null,
    currency: null,
    cancellationDeadline: null,
    contact: null,
    notes: null,
  });
  const [fromParse, setFromParse] = useState(false);

  const editToken = useMemo(
    () => (typeof window === "undefined" ? null : getEditToken(shareId)),
    [shareId]
  );

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/trip/${encodeURIComponent(shareId)}`, {
        cache: "no-store",
      });
      if (r.status === 404) {
        setBookings([]);
        return;
      }
      if (!r.ok) {
        setLoadError(L.httpError[lang](r.status));
        return;
      }
      const data = (await r.json()) as { bookingList?: BookingRow[] };
      setBookings(data.bookingList ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(errText(e));
    }
  }, [shareId, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Dokument: izbira datoteke → dataURL ─────────────────────────────
  const onFile = useCallback((f: File | null) => {
    setParseError(null);
    setFileData(null);
    setFileName(null);
    setFileKind(null);
    if (!f) return;
    const isImage = /^image\/(jpeg|png|webp)$/.test(f.type);
    const isPdf = f.type === "application/pdf";
    if (!isImage && !isPdf) {
      setParseError(L.fileUnsupported[lang]);
      return;
    }
    if (f.size > (isImage ? 4.5 * 1024 * 1024 : 6 * 1024 * 1024)) {
      setParseError(L.fileTooLarge[lang]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFileData(typeof reader.result === "string" ? reader.result : null);
      setFileName(f.name);
      setFileKind(isImage ? "image" : "pdf");
    };
    reader.onerror = () => setParseError(L.fileUnreadable[lang]);
    reader.readAsDataURL(f);
  }, [lang]);

  // ── Parse (stateless — 0 zapisov) ────────────────────────────────────
  const parseDocument = useCallback(async () => {
    if (!fileData && rawText.trim().length < 20) {
      setParseError(L.needTextOrFile[lang]);
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const body: Record<string, string> = {};
      if (fileData) {
        body[fileKind === "image" ? "image" : "pdf"] = fileData;
      } else {
        body.text = rawText.trim().slice(0, 20_000);
      }
      const r = await fetch("/api/journey/bookings/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await r.json().catch(() => null)) as {
        fields?: ParsedFields;
        via?: string;
        method?: string;
        error?: string;
      } | null;
      if (!r.ok || !data?.fields) {
        setParseError(data?.error ?? L.httpError[lang](r.status));
        return;
      }
      setFields(data.fields);
      setParseVia(data.via ?? null);
      setParseMethod(data.method ?? null);
      setFromParse(true);
    } catch (e) {
      setParseError(errText(e));
    } finally {
      setParsing(false);
    }
  }, [fileData, fileKind, rawText, lang]);

  // ── Parse e-pošte (TASK 31: surova RFC 5322 → MIME → polja) ────────
  const parseRawEmail = useCallback(async () => {
    if (rawEmail.trim().length < 40) {
      setParseError(L.needRawEmail[lang]);
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const r = await fetch("/api/journey/bookings/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: rawEmail.slice(0, 2_000_000) }),
      });
      const data = (await r.json().catch(() => null)) as {
        fields?: ParsedFields;
        via?: string;
        method?: string;
        error?: string;
      } | null;
      if (!r.ok || !data?.fields) {
        setParseError(data?.error ?? L.httpError[lang](r.status));
        return;
      }
      setFields(data.fields);
      setParseVia(data.via ?? null);
      setParseMethod(data.method ?? null);
      setFromParse(true);
    } catch (e) {
      setParseError(errText(e));
    } finally {
      setParsing(false);
    }
  }, [rawEmail, lang]);

  // ── Zapis (ročni vnos USER / uvožen IMPORTED) ───────────────────────
  const saveReservation = useCallback(
    async (status: "DRAFT" | "CONFIRMED") => {
      if (!fields.providerName?.trim()) {
        setParseError(L.providerRequired[lang]);
        return;
      }
      setBusy(true);
      try {
        const r = await apiJson("/api/journey/bookings/import", {
          method: "POST",
          editToken,
          body: JSON.stringify({
            shareId,
            source: fromParse ? "IMPORTED" : "USER",
            status,
            providerName: fields.providerName?.trim() ?? null,
            reservationNumber: fields.reservationNumber?.trim() || null,
            startDateTime: fields.startDateTime?.trim() || null,
            endDateTime: fields.endDateTime?.trim() || null,
            locationName: fields.locationName?.trim() || null,
            guestName: fields.guestName?.trim() || null,
            price:
              typeof fields.price === "number" && fields.price > 0
                ? fields.price
                : null,
            currency: fields.currency ?? null,
            cancellationDeadline: fields.cancellationDeadline?.trim() || null,
            contact: fields.contact?.trim() || null,
            notes: fields.notes?.trim() || null,
          }),
        });
        const data = (await r.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!r.ok) {
          setParseError(data?.error ?? L.httpError[lang](r.status));
          return;
        }
        // Počisti formo + osveži seznam
        setFields({
          providerName: null,
          reservationNumber: null,
          startDateTime: null,
          endDateTime: null,
          locationName: null,
          guestName: null,
          price: null,
          currency: null,
          cancellationDeadline: null,
          contact: null,
          notes: null,
        });
        setFromParse(false);
        setRawText("");
        setRawEmail("");
        setFileData(null);
        setFileName(null);
        setFileKind(null);
        setParseVia(null);
        setParseMethod(null);
        setFormOpen(false);
        setParseError(null);
        await load();
      } catch (e) {
        setParseError(errText(e));
      } finally {
        setBusy(false);
      }
    },
    [editToken, fields, fromParse, load, shareId, lang]
  );

  // ── Potrditev/preklic obstoječega osnutka ───────────────────────────
  const transition = useCallback(
    async (
      status: "CONFIRMED" | "CANCELLED",
      provider: string,
      productId: string | undefined
    ) => {
      // poišči id prek bookings GET (agregator ne vrača id-jev)
      setBusy(true);
      try {
        const g = await fetch(
          `/api/journey/bookings?shareId=${encodeURIComponent(shareId)}`,
          { cache: "no-store" }
        );
        if (!g.ok) return;
        const data = (await g.json()) as {
          bookings?: Array<{
            id: string;
            provider: string;
            providerProductId: string;
          }>;
        };
        const hit = (data.bookings ?? []).find(
          (b) =>
            b.provider === provider &&
            (productId == null || b.providerProductId === productId)
        );
        if (!hit) return;
        const r = await apiJson("/api/journey/bookings/import", {
          method: "POST",
          editToken,
          body: JSON.stringify({
            id: hit.id,
            status,
            source: "IMPORTED",
            shareId,
          }),
        });
        if (r.ok) await load();
      } finally {
        setBusy(false);
      }
    },
    [editToken, load, shareId]
  );

  const set = <K extends keyof ParsedFields>(k: K, v: ParsedFields[K]) =>
    setFields((f) => ({ ...f, [k]: v }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TicketCheck className="size-5 text-primary" aria-hidden />
          {L.title[lang]}
          {bookings.length > 0 ? (
            <Badge variant="secondary" className="ml-1 font-normal">
              {bookings.length}
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : null}

        {/* ── Seznam rezervacij ─────────────────────────────────────── */}
        {bookings.length > 0 ? (
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {bookings.map((b, i) => {
              const badge =
                STATUS_BADGES[b.status] ??
                ({
                  label: { sl: b.status, en: b.status },
                  cls: "border-border",
                } as const);
              return (
                <li
                  key={`${b.provider}-${b.createdAt}-${i}`}
                  className="rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">
                      {b.summary.providerName ?? b.provider}
                    </span>
                    <Badge variant="outline" className={badge.cls}>
                      {badge.label[lang]}
                    </Badge>
                    {b.source && SOURCE_LABELS[b.source] ? (
                      <span className="text-[11px] text-muted-foreground">
                        ({SOURCE_LABELS[b.source][lang]})
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {b.summary.reservationNumber ? (
                      <div>{L.bookingNo[lang](b.summary.reservationNumber)}</div>
                    ) : null}
                    {b.summary.startDateTime ? (
                      <div>{L.when[lang](b.summary.startDateTime)}</div>
                    ) : null}
                    {b.summary.locationName ? (
                      <div>{L.where[lang](b.summary.locationName)}</div>
                    ) : null}
                    {b.confirmedPrice != null ? (
                      <div className="font-medium text-foreground">
                        {L.amount[lang](
                          `${Math.round(b.confirmedPrice)} ${b.currency}`
                        )}
                      </div>
                    ) : null}
                    {b.summary.cancellationDeadline ? (
                      <div className="text-amber-700">
                        {L.cancelBy[lang](b.summary.cancellationDeadline)}
                      </div>
                    ) : null}
                  </div>
                  {b.status === "DRAFT" ? (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void transition(
                            "CONFIRMED",
                            b.provider,
                            b.providerProductId
                          )
                        }
                        disabled={busy}
                        className="gap-1.5"
                      >
                        <CircleCheck className="size-4" aria-hidden />
                        {L.confirmReservation[lang]}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void transition(
                            "CANCELLED",
                            b.provider,
                            b.providerProductId
                          )
                        }
                        disabled={busy}
                      >
                        {L.cancel[lang]}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {L.empty[lang]}
          </p>
        )}

        {/* ── Obrazec: dodaj rezervacijo ───────────────────────────── */}
        {formOpen ? (
          <div className="space-y-3 rounded-lg border p-3">
            <Tabs defaultValue="manual">
              <TabsList className="mb-2">
                <TabsTrigger value="manual" className="gap-1.5">
                  <PenLine className="size-3.5" aria-hidden /> {L.tabManual[lang]}
                </TabsTrigger>
                <TabsTrigger value="doc" className="gap-1.5">
                  <FileText className="size-3.5" aria-hidden /> {L.tabDoc[lang]}
                </TabsTrigger>
                <TabsTrigger value="text" className="gap-1.5">
                  <ClipboardType className="size-3.5" aria-hidden /> {L.tabText[lang]}
                </TabsTrigger>
                <TabsTrigger value="email" className="gap-1.5">
                  <Mail className="size-3.5" aria-hidden /> {L.tabEmail[lang]}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="manual">
                <p className="mb-2 text-xs text-muted-foreground">
                  {L.manualNote[lang]}
                </p>
              </TabsContent>

              <TabsContent value="doc" className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {L.docNote[lang]}
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  className="gap-1.5"
                >
                  <ImageIcon className="size-4" aria-hidden />
                  {L.chooseFile[lang]}
                </Button>
                {fileName ? (
                  <p className="text-xs text-muted-foreground">
                    {fileKind === "image" ? "🖼" : "📄"} {fileName}
                  </p>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => void parseDocument()}
                  disabled={parsing || !fileData}
                  className="gap-1.5"
                >
                  {parsing ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  {L.readDocument[lang]}
                </Button>
              </TabsContent>

              <TabsContent value="text" className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {L.textNote[lang]}
                </p>
                <Textarea
                  aria-label={L.textAria[lang]}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={L.textPlaceholder[lang]}
                  rows={5}
                  maxLength={20000}
                />
                <Button
                  size="sm"
                  onClick={() => void parseDocument()}
                  disabled={parsing || rawText.trim().length < 20}
                  className="gap-1.5"
                >
                  {parsing ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  {L.readText[lang]}
                </Button>
              </TabsContent>

              <TabsContent value="email" className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {L.emailPastePrefix[lang]}
                  <strong>{L.emailRawStrong[lang]}</strong>
                  {L.emailPasteMid[lang]}{" "}
                  <em>{L.emailGmailItem[lang]}</em>
                  {L.emailOutlookMid[lang]}{" "}
                  <em>.eml</em>
                  {L.emailOutlookMid2[lang]}
                  <em>{L.emailAppleItem[lang]}</em>
                  {L.emailReaderNote[lang]}
                </p>
                <Textarea
                  aria-label={L.emailAria[lang]}
                  value={rawEmail}
                  onChange={(e) => setRawEmail(e.target.value)}
                  placeholder={L.emailPlaceholder[lang]}
                  rows={7}
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  onClick={() => void parseRawEmail()}
                  disabled={parsing || rawEmail.trim().length < 40}
                  className="gap-1.5"
                >
                  {parsing ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Mail className="size-4" aria-hidden />
                  )}
                  {L.readEmail[lang]}
                </Button>
                {/* 1.123 (G3 — ISSUE #13): email-forward vstopna točka —
                    NASLOV se prikaže SAMO ko je env nastavljen (lastnik
                    pripravi vhodni kanal → naslov takoj zaživi, brez
                    deploya kode). Brez nastavitve ostane iskrena nota
                    "kanal v pripravi" ( obstoječe stanje) — nikoli
                    izmišljen, neobstoječ naslov. Kopiraj gumb = clipboard
                    + 2 s potrditev ( CircleCheck vzorec po cele strani). */}
                {RESERVATIONS_EMAIL ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
                    <span>{L.forwardTo[lang]}</span>
                    <code
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                    >
                      {RESERVATIONS_EMAIL}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard
                          ?.writeText(RESERVATIONS_EMAIL)
                          .then(() => {
                            setEmailCopied(true);
                            setTimeout(() => setEmailCopied(false), 2000);
                          })
                          .catch(() => {
                            /* clipboard zavrnjen ( permission) — naslov
                               ostane označljiv ročno */
                          });
                      }}
                      className="inline-flex min-h-6 items-center gap-1 rounded-md border border-border px-1.5 py-0.5 font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={L.copyAddressAria[lang]}
                    >
                      {emailCopied ? (
                        <Check className="size-3 text-emerald-600" aria-hidden />
                      ) : (
                        <Copy className="size-3" aria-hidden />
                      )}
                      {emailCopied ? L.copied[lang] : L.copy[lang]}
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {L.forwardingPrefix[lang]}
                    <em>{L.forwardingAddress[lang]}</em>
                    {L.forwardingSuffix[lang]}
                  </p>
                )}
              </TabsContent>
            </Tabs>

            {parseError ? (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {parseError}
              </p>
            ) : null}

            {parseVia ? (
              <p className="text-[11px] text-muted-foreground">
                {parseMethod === "deterministic"
                  ? L.parsedDeterministic[lang]
                  : L.parsedAi[lang](parseVia)}
              </p>
            ) : null}

            {/* Predogled — uredljiva polja (ista forma za ročni vnos) */}
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="res-provider">{L.providerLabel[lang]}</Label>
                <Input
                  id="res-provider"
                  value={fields.providerName ?? ""}
                  onChange={(e) => set("providerName", e.target.value)}
                  placeholder={L.providerPlaceholder[lang]}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-number">{L.numberLabel[lang]}</Label>
                <Input
                  id="res-number"
                  value={fields.reservationNumber ?? ""}
                  onChange={(e) => set("reservationNumber", e.target.value)}
                  placeholder={L.numberPlaceholder[lang]}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-start">{L.startLabel[lang]}</Label>
                <Input
                  id="res-start"
                  value={fields.startDateTime ?? ""}
                  onChange={(e) => set("startDateTime", e.target.value)}
                  placeholder={L.startPlaceholder[lang]}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-end">{L.endLabel[lang]}</Label>
                <Input
                  id="res-end"
                  value={fields.endDateTime ?? ""}
                  onChange={(e) => set("endDateTime", e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-location">{L.locationLabel[lang]}</Label>
                <Input
                  id="res-location"
                  value={fields.locationName ?? ""}
                  onChange={(e) => set("locationName", e.target.value)}
                  placeholder={L.locationPlaceholder[lang]}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-guest">{L.guestLabel[lang]}</Label>
                <Input
                  id="res-guest"
                  value={fields.guestName ?? ""}
                  onChange={(e) => set("guestName", e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-price">{L.priceLabel[lang]}</Label>
                <Input
                  id="res-price"
                  value={fields.price != null ? String(fields.price) : ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(",", ".");
                    const n = Number(v);
                    set("price", v !== "" && Number.isFinite(n) ? n : null);
                  }}
                  inputMode="decimal"
                  placeholder={L.pricePlaceholder[lang]}
                  maxLength={12}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-currency">{L.currencyLabel[lang]}</Label>
                <Input
                  id="res-currency"
                  value={fields.currency ?? ""}
                  onChange={(e) =>
                    set("currency", e.target.value.toUpperCase().slice(0, 3))
                  }
                  placeholder="EUR"
                  maxLength={3}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="res-cancel">{L.cancelDeadlineLabel[lang]}</Label>
                <Input
                  id="res-cancel"
                  value={fields.cancellationDeadline ?? ""}
                  onChange={(e) => set("cancellationDeadline", e.target.value)}
                  placeholder={L.cancelDeadlinePlaceholder[lang]}
                  maxLength={200}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => void saveReservation("CONFIRMED")}
                disabled={busy}
                className="gap-1.5"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <CircleCheck className="size-4" aria-hidden />
                )}
                {L.confirmAndSave[lang]}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void saveReservation("DRAFT")}
                disabled={busy}
              >
                {L.saveDraft[lang]}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFormOpen(false);
                  setParseError(null);
                }}
                disabled={busy}
              >
                {L.cancel[lang]}
              </Button>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {L.saveNote[lang]}
            </p>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFormOpen(true)}
            className="gap-1.5"
          >
            <Plus className="size-4" aria-hidden />
            {L.addReservation[lang]}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
