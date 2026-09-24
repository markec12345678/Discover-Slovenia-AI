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
} from "lucide-react";
import { getEditToken } from "@/lib/itinerary-share";

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

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  DRAFT: {
    label: "Osnutek — čaka potrditev",
    cls: "border-amber-500/50 text-amber-700 bg-amber-50",
  },
  CONFIRMED: {
    label: "Potrjeno (uporabniški vnos)",
    cls: "border-violet-500/50 text-violet-700 bg-violet-50",
  },
  EXTERNAL: {
    label: "Zunanja rezervacija — pri ponudniku",
    cls: "border-violet-500/40 text-violet-700",
  },
  SELECTED: { label: "Izbrano", cls: "border-border text-muted-foreground" },
  CANCELLED: { label: "Preklicano", cls: "border-border text-muted-foreground" },
  FAILED: { label: "Spodletelo", cls: "border-destructive/40 text-destructive" },
};

const SOURCE_LABELS: Record<string, string> = {
  USER: "ročni vnos",
  IMPORTED: "uvoženo iz dokumenta",
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
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Parse tok (dokument)
  const [parsing, setParsing] = useState(false);
  const [parseVia, setParseVia] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
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
        setLoadError(`Napaka ${r.status}`);
        return;
      }
      const data = (await r.json()) as { bookingList?: BookingRow[] };
      setBookings(data.bookingList ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(errText(e));
    }
  }, [shareId]);

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
      setParseError("Podprta je slika (JPEG/PNG/WebP) ali PDF.");
      return;
    }
    if (f.size > (isImage ? 4.5 * 1024 * 1024 : 6 * 1024 * 1024)) {
      setParseError("Datoteka je prevelika (slika do 4,5 MB / PDF do 6 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFileData(typeof reader.result === "string" ? reader.result : null);
      setFileName(f.name);
      setFileKind(isImage ? "image" : "pdf");
    };
    reader.onerror = () => setParseError("Datoteke ni bilo mogoče prebrati.");
    reader.readAsDataURL(f);
  }, []);

  // ── Parse (stateless — 0 zapisov) ────────────────────────────────────
  const parseDocument = useCallback(async () => {
    if (!fileData && rawText.trim().length < 20) {
      setParseError(
        "Prilepi besedilo potrditve (vsaj 20 znakov) ali izberi datoteko."
      );
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
        error?: string;
      } | null;
      if (!r.ok || !data?.fields) {
        setParseError(data?.error ?? `Napaka ${r.status}`);
        return;
      }
      setFields(data.fields);
      setParseVia(data.via ?? null);
      setFromParse(true);
    } catch (e) {
      setParseError(errText(e));
    } finally {
      setParsing(false);
    }
  }, [fileData, fileKind, rawText]);

  // ── Zapis (ročni vnos USER / uvožen IMPORTED) ───────────────────────
  const saveReservation = useCallback(
    async (status: "DRAFT" | "CONFIRMED") => {
      if (!fields.providerName?.trim()) {
        setParseError("Ime ponudnika je obvezno.");
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
          setParseError(data?.error ?? `Napaka ${r.status}`);
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
        setFileData(null);
        setFileName(null);
        setFileKind(null);
        setParseVia(null);
        setFormOpen(false);
        setParseError(null);
        await load();
      } catch (e) {
        setParseError(errText(e));
      } finally {
        setBusy(false);
      }
    },
    [editToken, fields, fromParse, load, shareId]
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
          Rezervacije
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
                ({ label: b.status, cls: "border-border" } as const);
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
                      {badge.label}
                    </Badge>
                    {b.source && SOURCE_LABELS[b.source] ? (
                      <span className="text-[11px] text-muted-foreground">
                        ({SOURCE_LABELS[b.source]})
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {b.summary.reservationNumber ? (
                      <div>Št. rezervacije: {b.summary.reservationNumber}</div>
                    ) : null}
                    {b.summary.startDateTime ? (
                      <div>Kdaj: {b.summary.startDateTime}</div>
                    ) : null}
                    {b.summary.locationName ? (
                      <div>Kje: {b.summary.locationName}</div>
                    ) : null}
                    {b.confirmedPrice != null ? (
                      <div className="font-medium text-foreground">
                        Znesek: {Math.round(b.confirmedPrice)} {b.currency}
                      </div>
                    ) : null}
                    {b.summary.cancellationDeadline ? (
                      <div className="text-amber-700">
                        Odpoved do: {b.summary.cancellationDeadline}
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
                        Potrdi rezervacijo
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
                        Prekliči
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Še ni rezervacij. Dodaj ročno ali uvozi potrdilo ponudnika
            (slika/PDF/e-pošta).
          </p>
        )}

        {/* ── Obrazec: dodaj rezervacijo ───────────────────────────── */}
        {formOpen ? (
          <div className="space-y-3 rounded-lg border p-3">
            <Tabs defaultValue="manual">
              <TabsList className="mb-2">
                <TabsTrigger value="manual" className="gap-1.5">
                  <PenLine className="size-3.5" aria-hidden /> Ročno
                </TabsTrigger>
                <TabsTrigger value="doc" className="gap-1.5">
                  <FileText className="size-3.5" aria-hidden /> Dokument
                </TabsTrigger>
                <TabsTrigger value="text" className="gap-1.5">
                  <ClipboardType className="size-3.5" aria-hidden /> Besedilo
                </TabsTrigger>
              </TabsList>

              <TabsContent value="manual">
                <p className="mb-2 text-xs text-muted-foreground">
                  Vnesi podatke svoje rezervacije. Zapis je tvoj vnos
                  (izrecno označen) — nikoli providerjeva potrditev prek naše
                  integracije.
                </p>
              </TabsContent>

              <TabsContent value="doc" className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Naloži potrdilo ponudnika — AI prebere SAMO podatke, ki so v
                  njem; ti jih pred shranjevanjem pregledaš in potrdiš.
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
                  Izberi sliko ali PDF
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
                  Preberi dokument
                </Button>
              </TabsContent>

              <TabsContent value="text" className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Prilepi besedilo potrditvene e-pošte (rezervacija, let,
                  vstopnica …).
                </p>
                <Textarea
                  aria-label="Besedilo potrditve rezervacije"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Primer: GetYourGuide — št. rezervacije GYG-123456, Bled, 12.07.2026 10:00, 2 osebi, 58 EUR …"
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
                  Preberi besedilo
                </Button>
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
                Prebrano z AI ({parseVia}) — preveri polja pred potrditvijo.
              </p>
            ) : null}

            {/* Predogled — uredljiva polja (ista forma za ročni vnos) */}
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="res-provider">Ponudnik *</Label>
                <Input
                  id="res-provider"
                  value={fields.providerName ?? ""}
                  onChange={(e) => set("providerName", e.target.value)}
                  placeholder="npr. GetYourGuide"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-number">Št. rezervacije</Label>
                <Input
                  id="res-number"
                  value={fields.reservationNumber ?? ""}
                  onChange={(e) => set("reservationNumber", e.target.value)}
                  placeholder="npr. GYG-123456"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-start">Datum/čas (od)</Label>
                <Input
                  id="res-start"
                  value={fields.startDateTime ?? ""}
                  onChange={(e) => set("startDateTime", e.target.value)}
                  placeholder="npr. 12.07.2026 10:00"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-end">Do (opcijsko)</Label>
                <Input
                  id="res-end"
                  value={fields.endDateTime ?? ""}
                  onChange={(e) => set("endDateTime", e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-location">Kraj/lokacija</Label>
                <Input
                  id="res-location"
                  value={fields.locationName ?? ""}
                  onChange={(e) => set("locationName", e.target.value)}
                  placeholder="npr. Bled"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-guest">Gost/potnik</Label>
                <Input
                  id="res-guest"
                  value={fields.guestName ?? ""}
                  onChange={(e) => set("guestName", e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-price">Znesek</Label>
                <Input
                  id="res-price"
                  value={fields.price != null ? String(fields.price) : ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(",", ".");
                    const n = Number(v);
                    set("price", v !== "" && Number.isFinite(n) ? n : null);
                  }}
                  inputMode="decimal"
                  placeholder="npr. 58"
                  maxLength={12}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-currency">Valuta</Label>
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
                <Label htmlFor="res-cancel">Rok za brezplačno odpoved</Label>
                <Input
                  id="res-cancel"
                  value={fields.cancellationDeadline ?? ""}
                  onChange={(e) => set("cancellationDeadline", e.target.value)}
                  placeholder="npr. 24 h pred začetkom"
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
                Potrdi in shrani rezervacijo
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void saveReservation("DRAFT")}
                disabled={busy}
              >
                Shrani kot osnutek
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
                Prekliči
              </Button>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              S shranjevanjem potrjuješ, da so podatki iz tvojega potrdila
              ponudnika. Zapis je vedno označen z izvorom (ročni vnos /
              uvoženo) — nikoli kot providerjeva potrditev prek naše
              integracije.
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
            Dodaj rezervacijo
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
