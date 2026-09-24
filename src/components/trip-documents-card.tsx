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

/** Kanonske oznake (§15 taksonomija — SL). */
const TYPE_LABELS: Record<string, string> = {
  booking_confirmation: "Potrditev rezervacije",
  voucher: "Vavčer",
  ticket: "Vstopnica",
  receipt: "Račun",
  note: "Zapisek",
};

const FORMAT_LABELS: Record<string, string> = {
  pdf: "PDF",
  image: "Slika",
  text: "Besedilo",
  link: "Povezava",
  none: "—",
};

const SOURCE_LABELS: Record<string, string> = {
  USER: "ročni vnos",
  IMPORTED: "iz dokumenta",
};

/** Vrsta dokumenta → prikazna barva (iskrenost: barva IZPELJANA iz vrste). */
const TYPE_BADGE_CLASS: Record<string, string> = {
  booking_confirmation: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  voucher: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  ticket: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  receipt: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  note: "bg-muted text-muted-foreground",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("sl-SI");
  } catch {
    return iso.slice(0, 10);
  }
}

export function TripDocumentsCard({ shareId }: { shareId: string }) {
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
          res.status === 404
            ? "Potovanje ni najdeno."
            : "Dokumentov ni bilo mogoče naložiti."
        );
        setDocs([]);
        return;
      }
      const data = (await res.json()) as { documents: DocumentRow[] };
      setDocs(data.documents ?? []);
      setError(null);
    } catch {
      setError("Dokumentov ni bilo mogoče naložiti (brez signala?).");
      setDocs([]);
    }
  }, [shareId, clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addDocument() {
    if (!title.trim()) {
      setError("Naslov dokumenta je obvezen (2–160 znakov).");
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
        setError(data.error ?? "Dokumenta ni bilo mogoče shraniti.");
        return;
      }
      setDocs((prev) => [...(prev ?? []), data.document as DocumentRow]);
      setTitle("");
      setUrl("");
      setNote("");
      setDayIndex("");
      setFormOpen(false);
      setSuccess("Dokument shranjen.");
      window.setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Shranjevanje ni uspelo (brez signala?).");
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
        setError(data.error ?? "Brisanje ni uspelo.");
        return;
      }
      setDocs((prev) => (prev ?? []).filter((d) => d.id !== id));
    } catch {
      setError("Brisanje ni uspelo (brez signala?).");
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
              Dokumenti poti
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Potrditve, vavčerji, vstopnice, računi in zapiski — metapodatki
              in povezave (datoteke ostanejo pri tebi, mi jih ne shranjujemo).
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Dodaj dokument
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
                <Label htmlFor="doc-type">Vrsta dokumenta</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="doc-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-format">Zapis vira</Label>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger id="doc-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FORMAT_LABELS)
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
              <Label htmlFor="doc-title">Naslov (obvezen)</Label>
              <Input
                id="doc-title"
                value={title}
                maxLength={160}
                placeholder="npr. Vstopnica – Bled, 12. 7."
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-url">Povezava do dokumenta (https, neobvezno)</Label>
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
                <Label htmlFor="doc-note">Opomba (neobvezno)</Label>
                <Textarea
                  id="doc-note"
                  value={note}
                  maxLength={2000}
                  rows={2}
                  placeholder="npr. št. rezervacje, rok odpovedi …"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-day">Dan poti (neobvezno)</Label>
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
                Shranimo samo metapodatke in povezavo — datoteka ostane pri
                tebi. Izvor: ročni vnos (vedno razkrit).
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
                Shrani
              </Button>
            </div>
          </div>
        )}

        {docs === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Nalaganje dokumentov …
          </div>
        ) : docs.length === 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
            <CloudOff className="mt-0.5 h-4 w-4" aria-hidden />
            <div>
              <p>Še ni nobenega dokumenta.</p>
              <p className="mt-1 text-xs">
                Seznam dokumentov se izriše tudi brez signala (predpomnjen) —
                dodajanje in brisanje potrebujeta povezavo.
              </p>
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
                        {TYPE_LABELS[d.type] ?? d.type}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {FORMAT_LABELS[d.format] ?? d.format} ·{" "}
                        {d.source && SOURCE_LABELS[d.source]
                          ? `(${SOURCE_LABELS[d.source]})`
                          : ""}
                      </span>
                      {d.dayIndex != null && (
                        <span className="text-[10px] text-muted-foreground">
                          · dan {d.dayIndex + 1}
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
                      {formatDate(d.createdAt)}
                      {d.authorName ? ` · ${d.authorName}` : ""}
                      {d.bookingId ? " · vezano na rezervacijo" : ""}
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
                          <span className="sr-only">Odpri dokument</span>
                        </a>
                      </Button>
                    )}
                    {d.isAuthor && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void deleteDocument(d.id)}
                        disabled={deleting === d.id}
                        aria-label="Izbriši dokument"
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

        <p className="text-xs text-muted-foreground">
          Privatnost deduje iz poti (javna/zasebna). Briše lahko samo avtor
          zapisa.
        </p>
      </CardContent>
    </Card>
  );
}
