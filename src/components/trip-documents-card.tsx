"use client";

// ============================================================================
// TRIP DOCUMENTS — ISSUE #4 §15 (val 4): dokumenti poti na /pot/[shareId]
// ============================================================================
// Seznam dokumentov (type/format/source/createdAt + povezava na rezervacijo)
// + "Dodaj dokument": vrsta (potrditev/vavčer/vstopnica/račun/zapisek),
// zapis vira (pdf/slika/besedilo/povezava), naslov, zunanja https povezava,
// opomba, dan poti.
//
// ISKRENOST (Issue #4 §15):
//  · shranjujemo SAMO METAPODATKE + povezavo — datoteka ostane pri
//    uporabniku (isti vzorec kot dnevnik "brez slik" in parse "ne shrani");
//  · izvor je VEDNO razkrit: "ročni vnos" / "iz dokumenta";
//  · brisanje SAMO avtor (clientId iz localStorage — diary vzorec);
//  · OFFLINE: seznam se strežniško izriše (SW predpomni /pot HTML) → viden
//    brez signala; DODAJANJE/BRISANJE potrebuje povezavo (iskrena opomba).
//
// Površina je SL-only (enako kot ostale /pot komponente).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
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
import {
  FileText,
  Plus,
  Loader2,
  Trash2,
  ExternalLink,
  CircleAlert,
  CircleCheck,
  CloudOff,
} from "lucide-react";
import { getVoterId, getAuthorName } from "@/lib/client-identity";

interface DocumentRow {
  id: string;
  type: string;
  format: string;
  source: string;
  title: string;
  note: string | null;
  url: string | null;
  bookingId: string | null;
  dayIndex: number | null;
  authorName: string | null;
  createdAt: string;
  isAuthor?: boolean;
}

// ISSUE #24 Sklop 1 (1.164.0): L-vzorec {sl,en} — prej SL-only
const L = {
  sl: {
    /** Kanonske oznake (§15 taksonomija — SL). */
    typeLabels: {
      booking_confirmation: "Potrditev rezervacije",
      voucher: "Vavčer",
      ticket: "Vstopnica",
      receipt: "Račun",
      note: "Zapisek",
    } as Record<string, string>,
    formatLabels: {
      pdf: "PDF",
      image: "Slika",
      text: "Besedilo",
      link: "Povezava",
      none: "—",
    } as Record<string, string>,
    sourceLabels: {
      USER: "ročni vnos",
      IMPORTED: "iz dokumenta",
    } as Record<string, string>,
    errorTripNotFound: "Potovanje ni najdeno.",
    errorLoad: "Dokumentov ni bilo mogoče naložiti.",
    errorLoadOffline: "Dokumentov ni bilo mogoče naložiti (brez signala?).",
    errorTitleRequired: "Naslov dokumenta je obvezen (2–160 znakov).",
    errorSave: "Dokumenta ni bilo mogoče shraniti.",
    errorSaveOffline: "Shranjevanje ni uspelo (brez signala?).",
    errorDelete: "Brisanje ni uspelo.",
    errorDeleteOffline: "Brisanje ni uspelo (brez signala?).",
    successSaved: "Dokument shranjen.",
    cardTitle: "Dokumenti poti",
    cardDescription:
      "Potrditve, vavčerji, vstopnice, računi in zapiski — metapodatki in povezave (datoteke ostanejo pri tebi, mi jih ne shranjujemo).",
    addButton: "Dodaj dokument",
    typeLabel: "Vrsta dokumenta",
    formatLabel: "Zapis vira",
    titleLabel: "Naslov (obvezen)",
    titlePlaceholder: "npr. Vstopnica – Bled, 12. 7.",
    urlLabel: "Povezava do dokumenta (https, neobvezno)",
    noteLabel: "Opomba (neobvezno)",
    notePlaceholder: "npr. št. rezervacje, rok odpovedi …",
    dayLabel: "Dan poti (neobvezno)",
    formPrivacyNote:
      "Shranimo samo metapodatke in povezavo — datoteka ostane pri tebi. Izvor: ročni vnos (vedno razkrit).",
    saveButton: "Shrani",
    loading: "Nalaganje dokumentov …",
    emptyTitle: "Še ni nobenega dokumenta.",
    emptyNote:
      "Seznam dokumentov se izriše tudi brez signala (predpomnjen) — dodajanje in brisanje potrebujeta povezavo.",
    dayMeta: (n: number) => `· dan ${n}`,
    linkedToBooking: " · vezano na rezervacijo",
    openDocSr: "Odpri dokument",
    deleteAria: "Izbriši dokument",
    privacyFooter:
      "Privatnost deduje iz poti (javna/zasebna). Briše lahko samo avtor zapisa.",
  },
  en: {
    typeLabels: {
      booking_confirmation: "Booking confirmation",
      voucher: "Voucher",
      ticket: "Ticket",
      receipt: "Receipt",
      note: "Note",
    } as Record<string, string>,
    formatLabels: {
      pdf: "PDF",
      image: "Image",
      text: "Text",
      link: "Link",
      none: "—",
    } as Record<string, string>,
    sourceLabels: {
      USER: "manual entry",
      IMPORTED: "from a document",
    } as Record<string, string>,
    errorTripNotFound: "Trip not found.",
    errorLoad: "Documents could not be loaded.",
    errorLoadOffline: "Documents could not be loaded (no signal?).",
    errorTitleRequired: "A document title is required (2–160 characters).",
    errorSave: "The document could not be saved.",
    errorSaveOffline: "Saving failed (no signal?).",
    errorDelete: "Deleting failed.",
    errorDeleteOffline: "Deleting failed (no signal?).",
    successSaved: "Document saved.",
    cardTitle: "Trip documents",
    cardDescription:
      "Confirmations, vouchers, tickets, receipts and notes — metadata and links (the files stay with you, we never store them).",
    addButton: "Add document",
    typeLabel: "Document type",
    formatLabel: "Source format",
    titleLabel: "Title (required)",
    titlePlaceholder: "e.g. Ticket – Bled, 12 July",
    urlLabel: "Link to the document (https, optional)",
    noteLabel: "Note (optional)",
    notePlaceholder: "e.g. booking number, cancellation deadline …",
    dayLabel: "Trip day (optional)",
    formPrivacyNote:
      "We only save metadata and the link — the file stays with you. Source: manual entry (always disclosed).",
    saveButton: "Save",
    loading: "Loading documents …",
    emptyTitle: "No documents yet.",
    emptyNote:
      "The document list also renders without a signal (cached) — adding and deleting require a connection.",
    dayMeta: (n: number) => `· day ${n}`,
    linkedToBooking: " · linked to a reservation",
    openDocSr: "Open document",
    deleteAria: "Delete document",
    privacyFooter:
      "Privacy is inherited from the trip (public/private). Only the author of an entry can delete it.",
  },
} as const;

/** Vrsta dokumenta → prikazna barva (iskrenost: barva IZPELJANA iz vrste). */
const TYPE_BADGE_CLASS: Record<string, string> = {
  booking_confirmation: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  voucher: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  ticket: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  receipt: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  note: "bg-muted text-muted-foreground",
};

function formatDate(iso: string, locale: "sl" | "en"): string {
  try {
    return new Date(iso).toLocaleDateString(
      locale === "en" ? "en-GB" : "sl-SI"
    );
  } catch {
    return iso.slice(0, 10);
  }
}

export function TripDocumentsCard({ shareId }: { shareId: string }) {
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const t = L[lang];
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // Obrazec (§15: type/format/source/title/url/note/dayIndex)
  const [type, setType] = useState("booking_confirmation");
  const [format, setFormat] = useState("pdf");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [dayIndex, setDayIndex] = useState("");

  const [clientId, setClientId] = useState("");

  useEffect(() => {
    // 99-b: enoten vir anonimne identitete (isti ID kot všečki/komentarji/
    // dnevnik/ankete — zasebni način vrne null, klici brez njega odklonijo)
    setClientId(getVoterId() ?? "");
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/trip/${shareId}/documents?clientId=${encodeURIComponent(clientId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        setError(
          res.status === 404 ? t.errorTripNotFound : t.errorLoad
        );
        setDocs([]);
        return;
      }
      const data = (await res.json()) as { documents: DocumentRow[] };
      setDocs(data.documents ?? []);
      setError(null);
    } catch {
      setError(t.errorLoadOffline);
      setDocs([]);
    }
  }, [shareId, clientId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addDocument() {
    if (!title.trim()) {
      setError(t.errorTitleRequired);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/trip/${shareId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          format,
          source: "USER",
          title: title.trim(),
          url: url.trim() || undefined,
          note: note.trim() || undefined,
          dayIndex: dayIndex ? Number(dayIndex) : undefined,
          authorName: (getAuthorName() ?? "").trim() || undefined,
          clientId,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        document?: DocumentRow;
      };
      if (!res.ok || !data.success || !data.document) {
        setError(data.error ?? t.errorSave);
        return;
      }
      setDocs((prev) => [...(prev ?? []), data.document as DocumentRow]);
      setTitle("");
      setUrl("");
      setNote("");
      setDayIndex("");
      setFormOpen(false);
      setSuccess(t.successSaved);
      window.setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError(t.errorSaveOffline);
    } finally {
      setSaving(false);
    }
  }

  async function deleteDocument(id: string) {
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/trip/${shareId}/documents`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: id, clientId }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? t.errorDelete);
        return;
      }
      setDocs((prev) => (prev ?? []).filter((d) => d.id !== id));
    } catch {
      setError(t.errorDeleteOffline);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" aria-hidden />
              {t.cardTitle}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.cardDescription}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t.addButton}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {success && (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
            <CircleCheck className="h-4 w-4" aria-hidden />
            {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <CircleAlert className="h-4 w-4" aria-hidden />
            {error}
          </div>
        )}

        {formOpen && (
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="doc-type">{t.typeLabel}</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="doc-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(t.typeLabels).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-format">{t.formatLabel}</Label>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger id="doc-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(t.formatLabels)
                      .filter(([v]) => v !== "none")
                      .map(([v, l]) => (
                        <SelectItem key={v} value={v}>
                          {l}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">{t.titleLabel}</Label>
              <Input
                id="doc-title"
                value={title}
                maxLength={160}
                placeholder={t.titlePlaceholder}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-url">{t.urlLabel}</Label>
              <Input
                id="doc-url"
                value={url}
                maxLength={500}
                placeholder="https://…"
                inputMode="url"
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <div className="space-y-1.5">
                <Label htmlFor="doc-note">{t.noteLabel}</Label>
                <Textarea
                  id="doc-note"
                  value={note}
                  maxLength={2000}
                  rows={2}
                  placeholder={t.notePlaceholder}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-day">{t.dayLabel}</Label>
                <Input
                  id="doc-day"
                  value={dayIndex}
                  inputMode="numeric"
                  placeholder="1"
                  onChange={(e) =>
                    setDayIndex(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {t.formPrivacyNote}
              </p>
              <Button
                size="sm"
                onClick={() => void addDocument()}
                disabled={saving || title.trim().length < 2}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <FileText className="h-4 w-4" aria-hidden />
                )}
                {t.saveButton}
              </Button>
            </div>
          </div>
        )}

        {docs === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t.loading}
          </div>
        ) : docs.length === 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
            <CloudOff className="mt-0.5 h-4 w-4" aria-hidden />
            <div>
              <p>{t.emptyTitle}</p>
              <p className="mt-1 text-xs">{t.emptyNote}</p>
            </div>
          </div>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {docs.map((d) => (
              <li
                key={d.id}
                className="rounded-lg border border-border p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          TYPE_BADGE_CLASS[d.type] ?? TYPE_BADGE_CLASS.note
                        }`}
                      >
                        {t.typeLabels[d.type] ?? d.type}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {t.formatLabels[d.format] ?? d.format} ·{" "}
                        {d.source && t.sourceLabels[d.source]
                          ? `(${t.sourceLabels[d.source]})`
                          : ""}
                      </span>
                      {d.dayIndex != null && (
                        <span className="text-[10px] text-muted-foreground">
                          {t.dayMeta(d.dayIndex + 1)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-medium">{d.title}</p>
                    {d.note && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {d.note}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground/80">
                      {formatDate(d.createdAt, lang)}
                      {d.authorName ? ` · ${d.authorName}` : ""}
                      {d.bookingId ? t.linkedToBooking : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {d.url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        asChild
                      >
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden />
                          <span className="sr-only">{t.openDocSr}</span>
                        </a>
                      </Button>
                    )}
                    {d.isAuthor && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void deleteDocument(d.id)}
                        disabled={deleting === d.id}
                        aria-label={t.deleteAria}
                      >
                        {deleting === d.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-4 w-4" aria-hidden />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">{t.privacyFooter}</p>
      </CardContent>
    </Card>
  );
}
