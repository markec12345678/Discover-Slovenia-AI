"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import {
  BookOpen,
  Loader2,
  MapPin,
  NotebookPen,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
// 99-b: anonimni clientId + prihranjeno ime — deljena knjižnica
// (enkraten vir ključev; prej duplicirana v 4 socialnih komponentah)
import {
  getVoterId,
  getAuthorName,
  saveAuthorName,
} from "@/lib/client-identity";

// TASK 8 / F3-B: hydration placeholder v L-pattern (SL/EN — D8-A §13
// „Nalagam…" uhodi so trdi predpogoj za F3-E EN razširitev).
// ISSUE #24 Sklop 1 (1.164.0): L-vzorec {sl,en} razširjen na celo komponento — prej SL-only (samo nalagalni placeholder)
// (prejšnja per-ključ oblika placeholderja, iz katere je zrasel ta slovar:
//   loadingDiary: { sl: "Nalagam dnevnik …", en: "Loading diary …" })
const L = {
  sl: {
    loadingDiary: "Nalagam dnevnik …",
    heading: "Potni dnevnik",
    close: "Zapri",
    addMemory: "Zapiši spomin",
    cardIntro:
      "Skupni dnevnik vašega potovanja: vsak član lahko zapiše spomin iz določenega dne, doda kraj in oceno. Ko se poslavlja od vas,",
    cardPrintStrong: "natisnite stran",
    cardOutro:
      "(gumb zgoraj) — dnevnik je del PDF-ja, vaša papirnata spominska knjiga. Zavestno brez fotografij: vaše slike ostanejo pri vas.",
    dayLabel: "Dan",
    selectDayAria: "Izberi dan",
    generalOption: "Splošno (brez dneva)",
    placeLabel: "Kraj",
    optionalSuffix: "(opcijsko)",
    placePlaceholder: "npr. Blejski otok",
    ratingLabel: "Ocena",
    clearRating: "Počisti",
    memoryLabel: "Spomin",
    memoryPlaceholder: "Kaj se je zgodilo, da si ga boš želel-a zapomniti?",
    nameLabel: "Tvoje ime",
    nameOptional: "(opcijsko — vidno ob vpisu)",
    namePlaceholder: "npr. Ana",
    entryHint: "Vpis lahko kasneje urejaš ali izbrišeš (isti brskalnik).",
    saving: "Zapisujem…",
    emptyDiary: "Dnevnik je še prazen — zapiši prvi spomin in povabi ostale.",
    generalMemories: "Splošni spomini",
    // Vnos (EntryCard)
    anonymousAuthor: "Anonimni popotnik",
    editMemoryAria: "Uredi spomin",
    cancel: "Prekliči",
    save: "Shrani",
    edit: "Uredi",
    delete: "Izbriši",
    edited: "Urejeno",
    // Zvezdice (Stars)
    starsLabel: (n: number) =>
      `Ocena: ${n} ${slUnit(n, "zvezdica", "zvezdici", "zvezdice", "zvezdic")}`,
    noRating: "Brez ocene",
    rateLabel: (n: number) =>
      `Oceni z ${n} ${slUnit(n, "zvezdico", "zvezdicama", "zvezdicami", "zvezdicami")}`,
    // Toasti (validacija + optimistični tok)
    errTextTitle: "Spomin ni primeren",
    errTextDesc: (n: number) =>
      `Besedilo mora imeti med ${TEXT_MIN} in ${TEXT_MAX} znakov (dobljenih ${n}).`,
    errPlaceTitle: "Kraj je predolg",
    errPlaceDesc: () => `Kraj je lahko dolg največ ${PLACE_MAX} znakov.`,
    errNameTitle: "Ime je predolgo",
    errNameDesc: () => `Ime je lahko dolgo največ ${AUTHOR_NAME_MAX} znakov.`,
    okSavedTitle: "Spomin je zapisan",
    errSaveTitle: "Spomina ni bilo mogoče zapisati",
    tryAgain: "Poskusi znova.",
    errShortTitle: "Spomin je prekratek",
    errShortDesc: () => `Vsaj ${TEXT_MIN} znakov.`,
    okUpdatedTitle: "Spomin je posodobljen",
    errEditTitle: "Urejanje ni uspelo",
    okDeletedTitle: "Spomin je izbrisan",
    errDeleteTitle: "Brisanje ni uspelo",
  },
  en: {
    loadingDiary: "Loading diary …",
    heading: "Travel diary",
    close: "Close",
    addMemory: "Add a memory",
    cardIntro:
      "Your trip's shared diary: every member can record a memory from a specific day, add a place and a rating. As your trip draws to a close,",
    cardPrintStrong: "print the page",
    cardOutro:
      "(button above) — the diary is part of the PDF, your paper memory book. Deliberately no photos: your pictures stay with you.",
    dayLabel: "Day",
    selectDayAria: "Select day",
    generalOption: "General (no day)",
    placeLabel: "Place",
    optionalSuffix: "(optional)",
    placePlaceholder: "e.g. Bled Island",
    ratingLabel: "Rating",
    clearRating: "Clear",
    memoryLabel: "Memory",
    memoryPlaceholder: "What happened that you'll want to remember?",
    nameLabel: "Your name",
    nameOptional: "(optional — shown with your entry)",
    namePlaceholder: "e.g. Ana",
    entryHint: "You can edit or delete your entry later (same browser).",
    saving: "Saving…",
    emptyDiary:
      "The diary is still empty — add the first memory and invite the others.",
    generalMemories: "General entries",
    // Vnos (EntryCard)
    anonymousAuthor: "Anonymous traveller",
    editMemoryAria: "Edit memory",
    cancel: "Cancel",
    save: "Save",
    edit: "Edit",
    delete: "Delete",
    edited: "Edited",
    // Zvezdice (Stars)
    starsLabel: (n: number) => `Rating: ${n} ${n === 1 ? "star" : "stars"}`,
    noRating: "No rating",
    rateLabel: (n: number) => `Rate ${n} ${n === 1 ? "star" : "stars"}`,
    // Toasti (validacija + optimistični tok)
    errTextTitle: "Memory is invalid",
    errTextDesc: (n: number) =>
      `Text must be between ${TEXT_MIN} and ${TEXT_MAX} characters (got ${n}).`,
    errPlaceTitle: "Place name is too long",
    errPlaceDesc: () => `The place name can be at most ${PLACE_MAX} characters.`,
    errNameTitle: "Name is too long",
    errNameDesc: () => `The name can be at most ${AUTHOR_NAME_MAX} characters.`,
    okSavedTitle: "Memory saved",
    errSaveTitle: "Could not save the memory",
    tryAgain: "Try again.",
    errShortTitle: "Memory is too short",
    errShortDesc: () => `At least ${TEXT_MIN} characters.`,
    okUpdatedTitle: "Memory updated",
    errEditTitle: "Editing failed",
    okDeletedTitle: "Memory deleted",
    errDeleteTitle: "Deleting failed",
  },
} as const;

// ============================================================================
// TRIP DIARY — skupinski potni dnevnik na javni strani deljenega tripa (F12)
// ============================================================================
//
// Vrzel #3 (Stippl "travel reel / photobook"): naš pošteni pristop je
// TEKSTOVNI dnevnik brez računov na /pot/[shareId]. Vsak obiskovalec
// (anonimni clientId iz localStorage — ENAK ID kot za glasovanje/ankete/
// komentARJE) lahko:
//   - zapiše spomin: dan iz načrta (opcijsko) + kraj (opcijsko) + oceno
//     1–5 zvezdic (opcijsko) + besedilo
//   - svoj vpis ureja ali izbriše
//
// Zavestno BREZ slik/fotografij: upload bi pomenil zasebne fotografije +
// stroške shrambe. Natisnjena stran (Natisni → PDF) = naš "photobook".
//
// API: /api/diary (GET/POST/PATCH/DELETE).
// Optimistični UI z revertom ob napaki (isti vzorec kot trip-social/polls).
// ============================================================================

// Anonimni clientId + prihranjeno ime avtorja prihajata iz deljene
// knjižnice src/lib/client-identity.ts (99-b — enkraten vir: isti
// brskalnik = isti anonimni obiskovalec za glasovanje, všečke,
// komentarje, ankete IN dnevnik).

const TEXT_MAX = 2000;
const TEXT_MIN = 2;
const PLACE_MAX = 80;
const AUTHOR_NAME_MAX = 60;

export interface DiaryEntry {
  id: string;
  dayIndex: number | null;
  placeName: string | null;
  rating: number | null;
  text: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  isAuthor: boolean;
}

interface TripDiaryProps {
  shareId: string;
  /** Začetni vpisi iz RSC (brez isAuthor — ta pride s klientom). */
  initialEntries: Omit<DiaryEntry, "isAuthor">[];
  /**
   * Oznake dni iz načrta (index 0 = Dan 1): "Dan 1 — Bled".
   * Prazno polje → izbirnik dneva se ne pokaže (samo splošni vpisi).
   */
  dayLabels: string[];
  /** ISO datum ustvarjanja potovanja (spodnja meja relativnega časa). */
  createdAt: string;
}

// ============================================================================
// Slovenski helperji (ednina / dvojina / množina)
// ============================================================================

function slUnit(
  n: number,
  one: string,
  two: string,
  few: string,
  many: string
): string {
  if (n === 1) return one;
  const r = n % 100;
  if (r === 2) return two;
  if (r === 3 || r === 4) return few;
  return many;
}

/** "pred 2 min", "pred 3 h" — relativni čas z varnostnim stropom. */
function slTimeAgo(iso: string, floorIso?: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "neznano";

  // Sanity cap: vpis ne more biti starejši od potovanja
  if (floorIso) {
    const floor = Date.parse(floorIso);
    if (!Number.isNaN(floor) && ms < floor) {
      return new Date(ms).toLocaleDateString("sl-SI", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  }

  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 45) return "pravkar";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `pred ${minutes} ${slUnit(minutes, "minuto", "minutama", "minutami", "minutami")}`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `pred ${hours} ${slUnit(hours, "uro", "urama", "urami", "urami")}`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `pred ${days} ${slUnit(days, "dnem", "dnevoma", "dnevi", "dnevi")}`;
  }
  return new Date(ms).toLocaleDateString("sl-SI", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** EN dvojnik slTimeAgo ("2 min ago") — isti varnostni strop, "en-GB" datumi. */
function enTimeAgo(iso: string, floorIso?: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "unknown";

  // Sanity cap: vpis ne more biti starejši od potovanja
  if (floorIso) {
    const floor = Date.parse(floorIso);
    if (!Number.isNaN(floor) && ms < floor) {
      return new Date(ms).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  }

  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 45) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** ISSUE #24 Sklop 1 (1.164.0): jezikovni dispenser — SL pot ostane
 *  byte-identična (slTimeAgo), EN gre po enTimeAgo. */
function timeAgo(
  iso: string,
  floorIso: string | undefined,
  lang: "sl" | "en"
): string {
  return lang === "en" ? enTimeAgo(iso, floorIso) : slTimeAgo(iso, floorIso);
}

/** "3 spomini" / "3 memories" — pravilne oblike po jeziku (SL dual/množina). */
function entriesLabel(n: number, lang: "sl" | "en" = "sl"): string {
  if (n === 0)
    return lang === "en" ? "no memories yet" : "še ni spominov";
  return lang === "en"
    ? `${n} ${n === 1 ? "memory" : "memories"}`
    : `${n} ${slUnit(n, "spomin", "spomina", "spomini", "spominov")}`;
}

// ============================================================================
// ZVEZDICE (ocena 1–5) — skupna za obrazec in prikaz
// ============================================================================

interface StarsProps {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}

function Stars({ value, onChange, size = "sm", ariaLabel }: StarsProps) {
  // ISSUE #24 Sklop 1 (1.164.0): privzete aria oznake zvezdic po locale gledalca.
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const t = L[lang];
  const interactive = onChange !== undefined;
  const cls = size === "md" ? "size-5" : "size-4";
  return (
    <div
      className={cn(
        "flex items-center gap-0.5",
        interactive && "print:hidden"
      )}
      role={interactive ? "radiogroup" : "img"}
      aria-label={
        ariaLabel ?? (value > 0 ? t.starsLabel(value) : t.noRating)
      }
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!interactive}
          onClick={interactive ? () => onChange(value === i ? 0 : i) : undefined}
          className={cn(
            "rounded transition-colors",
            interactive &&
              "cursor-pointer hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !interactive && "cursor-default"
          )}
          aria-label={interactive ? t.rateLabel(i) : undefined}
          aria-checked={interactive ? value === i : undefined}
          role={interactive ? "radio" : undefined}
        >
          <Star
            className={cn(
              cls,
              i <= value
                ? "fill-amber-500 text-amber-500"
                : "text-muted-foreground/40"
            )}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// EN VNOS DNEVNIKA
// ============================================================================

interface EntryCardProps {
  entry: DiaryEntry;
  dayLabel: string | null;
  tripCreatedAt: string;
  pending: boolean;
  onSaveEdit: (entryId: string, text: string) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
}

function EntryCard({
  entry,
  dayLabel,
  tripCreatedAt,
  pending,
  onSaveEdit,
  onDelete,
}: EntryCardProps) {
  // ISSUE #24 Sklop 1 (1.164.0): besedila vpisa po locale gledalca (L-vzorec).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const t = L[lang];
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(entry.text);
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setEditText(entry.text);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSaveEdit(entry.id, editText);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={cn(
        "rounded-lg border border-border bg-background p-3 sm:p-4",
        pending && "opacity-60"
      )}
    >
      {/* Glava: avtor + čas + ocena */}
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-medium text-foreground">
          {entry.authorName || t.anonymousAuthor}
        </span>
        <span className="text-muted-foreground" aria-hidden="true">·</span>
        <time
          className="text-muted-foreground"
          dateTime={entry.createdAt}
          title={new Date(entry.createdAt).toLocaleString(
            lang === "en" ? "en-GB" : "sl-SI"
          )}
        >
          {timeAgo(entry.createdAt, tripCreatedAt, lang)}
        </time>
        {entry.rating !== null && entry.rating > 0 && (
          <Stars value={entry.rating} />
        )}
      </div>

      {/* Kontekst: dan + kraj */}
      {(dayLabel || entry.placeName) && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {dayLabel && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium">
              {dayLabel}
            </span>
          )}
          {entry.placeName && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              <MapPin className="size-3" aria-hidden="true" />
              {entry.placeName}
            </span>
          )}
        </div>
      )}

      {/* Besedilo (ali urejanje) */}
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            maxLength={TEXT_MAX}
            rows={4}
            className="resize-y"
            aria-label={t.editMemoryAria}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {editText.length}/{TEXT_MAX}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={busy}
              >
                {t.cancel}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void saveEdit()}
                disabled={busy || editText.trim().length < TEXT_MIN}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  t.save
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {entry.text}
        </p>
      )}

      {/* Avtorske kontrole — samo lastnik vpisa */}
      {entry.isAuthor && !editing && (
        <div className="mt-2 flex gap-2 print:hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={startEdit}
            disabled={pending}
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-3" aria-hidden="true" /> {t.edit}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void onDelete(entry.id)}
            disabled={pending}
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3" aria-hidden="true" /> {t.delete}
          </Button>
        </div>
      )}

      {/* Urejeno-opomba (če se je besedilo spreminjalo) */}
      {entry.updatedAt !== entry.createdAt && !editing && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t.edited} {timeAgo(entry.updatedAt, tripCreatedAt, lang)}
        </p>
      )}
    </article>
  );
}

// ============================================================================
// GLAVNA KOMPONENTA
// ============================================================================

export function TripDiary({
  shareId,
  initialEntries,
  dayLabels,
  createdAt,
}: TripDiaryProps) {
  const { toast } = useToast();
  // TASK 8 / F3-B: jezik za L-pattern placeholder nalaganja (SL privzeto).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const t = L[lang];

  const [clientId, setClientId] = useState<string>("");
  const [mounted, setMounted] = useState<boolean>(false);
  const [entries, setEntries] = useState<DiaryEntry[]>(() =>
    (initialEntries ?? []).map((e) => ({ ...e, isAuthor: false }))
  );

  // Obrazec za nov vpis
  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [dayValue, setDayValue] = useState<string>("general");
  const [place, setPlace] = useState<string>("");
  const [rating, setRating] = useState<number>(0);
  const [text, setText] = useState<string>("");
  const [authorName, setAuthorName] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);

  const [actionPending, setActionPending] = useState<string | null>(null);

  /** Znova pridobi vpise z isAuthor (GET /api/diary?clientId=). */
  const refreshEntries = useCallback(
    async (cid: string) => {
      try {
        const res = await fetch(
          `/api/diary?shareId=${encodeURIComponent(shareId)}&clientId=${encodeURIComponent(cid)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as {
          entries?: DiaryEntry[];
        } | null;
        if (Array.isArray(data?.entries)) {
          setEntries(data.entries);
        }
      } catch {
        // Off-line / napaka — ohranimo trenutno stanje
      }
    },
    [shareId]
  );

  // Mount: clientId (isti ID kot ostale socialne funkcije) + prihranjeno ime
  useEffect(() => {
    setMounted(true);
    if (!shareId) return;
    try {
      // 99-b: read-or-create anonimni ID (private mode → null → stanje
      // ostane nedotaknjeno, dnevnik ostane berljiv)
      const cid = getVoterId();
      if (cid) {
        setClientId(cid);

        // Prihranjeno ime (skupno s komentarji in anketami)
        const savedName = getAuthorName() ?? "";
        if (savedName) setAuthorName(savedName);

        // Dopolni isAuthor (server-side podatki ga ne poznajo)
        void refreshEntries(cid);
      }
    } catch {
      // private mode — dnevnik ostane berljiv, brez urejanja
    }
  }, [shareId, refreshEntries]);

  // ========================================================================
  // Dodaj vpis
  // ========================================================================
  const submitEntry = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (creating || !shareId || !clientId) return;

      const txt = text.trim();
      const p = place.trim();
      const a = authorName.trim();

      if (txt.length < TEXT_MIN || txt.length > TEXT_MAX) {
        toast({
          title: t.errTextTitle,
          description: t.errTextDesc(txt.length),
          variant: "destructive",
        });
        return;
      }
      if (p.length > PLACE_MAX) {
        toast({
          title: t.errPlaceTitle,
          description: t.errPlaceDesc(),
          variant: "destructive",
        });
        return;
      }
      if (a.length > AUTHOR_NAME_MAX) {
        toast({
          title: t.errNameTitle,
          description: t.errNameDesc(),
          variant: "destructive",
        });
        return;
      }

      const dayIndex =
        dayValue === "general" ? null : Number(dayValue) || null;

      // Prihrani ime za naslednjič (skupno s komentarji; defenzivno —
      // private mode se mirno preskoči znotraj lib-a)
      if (a) {
        saveAuthorName(a);
      }

      // Optimistični vpis (začasen id, negativen)
      const optimisticId = `tmp-${Date.now()}`;
      const optimistic: DiaryEntry = {
        id: optimisticId,
        dayIndex,
        placeName: p || null,
        rating: rating > 0 ? rating : null,
        text: txt,
        authorName: a || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isAuthor: true,
      };
      setEntries((all) => [...all, optimistic]);
      setCreating(true);

      try {
        const res = await fetch("/api/diary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shareId,
            dayIndex,
            placeName: p || undefined,
            rating: rating > 0 ? rating : undefined,
            text: txt,
            authorName: a || undefined,
            clientId,
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          success?: unknown;
          entry?: Omit<DiaryEntry, "isAuthor">;
          error?: string;
        } | null;

        if (!res.ok || data?.success !== true || !data?.entry) {
          throw new Error(data?.error ?? `HTTP ${res.status}`);
        }

        // Zamenjaj optimistični z pravim (server čas + id)
        setEntries((all) =>
          all.map((en) =>
            en.id === optimisticId
              ? { ...data.entry!, isAuthor: true }
              : en
          )
        );
        toast({ title: t.okSavedTitle });

        // Počisti obrazec (ime ostane)
        setText("");
        setPlace("");
        setRating(0);
        setDayValue("general");
        setFormOpen(false);
      } catch (err) {
        // Revert optimističnega vpisa
        setEntries((all) => all.filter((en) => en.id !== optimisticId));
        toast({
          title: t.errSaveTitle,
          description: err instanceof Error ? err.message : t.tryAgain,
          variant: "destructive",
        });
      } finally {
        setCreating(false);
      }
    },
    [
      creating,
      shareId,
      clientId,
      text,
      place,
      authorName,
      rating,
      dayValue,
      toast,
      t,
    ]
  );

  // ========================================================================
  // Uredi svoj vpis
  // ========================================================================
  const saveEdit = useCallback(
    async (entryId: string, newText: string) => {
      if (!clientId || entryId.startsWith("tmp-")) return;
      const txt = newText.trim();
      if (txt.length < TEXT_MIN) {
        toast({
          title: t.errShortTitle,
          description: t.errShortDesc(),
          variant: "destructive",
        });
        return;
      }

      setActionPending(entryId);
      const before = entries.find((e) => e.id === entryId)?.text;
      // Optimistična sprememba
      setEntries((all) =>
        all.map((e) => (e.id === entryId ? { ...e, text: txt } : e))
      );
      try {
        const res = await fetch("/api/diary", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryId, text: txt, clientId }),
        });
        const data = (await res.json().catch(() => null)) as {
          success?: unknown;
          error?: string;
        } | null;
        if (!res.ok || data?.success !== true) {
          throw new Error(data?.error ?? `HTTP ${res.status}`);
        }
        toast({ title: t.okUpdatedTitle });
      } catch (err) {
        // Revert
        setEntries((all) =>
          all.map((e) =>
            e.id === entryId && before !== undefined ? { ...e, text: before } : e
          )
        );
        toast({
          title: t.errEditTitle,
          description: err instanceof Error ? err.message : t.tryAgain,
          variant: "destructive",
        });
      } finally {
        setActionPending(null);
      }
    },
    [clientId, entries, toast, t]
  );

  // ========================================================================
  // Izbriši svoj vpis
  // ========================================================================
  const deleteEntry = useCallback(
    async (entryId: string) => {
      if (!clientId || entryId.startsWith("tmp-")) return;
      setActionPending(entryId);
      const snapshot = entries;
      // Optimistična odstranitev
      setEntries((all) => all.filter((e) => e.id !== entryId));
      try {
        const res = await fetch("/api/diary", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryId, clientId }),
        });
        const data = (await res.json().catch(() => null)) as {
          success?: unknown;
          error?: string;
        } | null;
        if (!res.ok || data?.success !== true) {
          throw new Error(data?.error ?? `HTTP ${res.status}`);
        }
        toast({ title: t.okDeletedTitle });
      } catch (err) {
        // Revert
        setEntries(snapshot);
        toast({
          title: t.errDeleteTitle,
          description: err instanceof Error ? err.message : t.tryAgain,
          variant: "destructive",
        });
      } finally {
        setActionPending(null);
      }
    },
    [clientId, entries, toast, t]
  );

  // ========================================================================
  // RAZVRSTITEV PO DNEVIH (kronološko, "splošno" na koncu)
  // ========================================================================
  const grouped = useMemo(() => {
    const groups: {
      key: number | null;
      label: string;
      items: DiaryEntry[];
    }[] = [];

    // Zaporedni dnevi iz načrta (tudi če so prazni — vrstni red!)
    dayLabels.forEach((label, i) => {
      groups.push({ key: i + 1, label, items: [] });
    });

    // Splošni vpisi (brez dneva) — zadnja skupina
    const general = { key: null as number | null, label: t.generalMemories, items: [] as DiaryEntry[] };

    for (const e of entries) {
      const g =
        e.dayIndex !== null
          ? groups.find((gr) => gr.key === e.dayIndex)
          : undefined;
      if (g) g.items.push(e);
      else general.items.push(e);
    }

    // Skupine z dnevi: vse iz načrta (prazne preskočimo pri renderu)
    const dayGroups = groups.filter((g) => g.items.length > 0);
    const generalGroup =
      general.items.length > 0 ? [general] : [];

    return [...dayGroups, ...generalGroup];
  }, [entries, dayLabels, t]);

  // Dnevnik se NATISNE (to je naš "photobook") — skriti so samo obrazec,
  // kontrole in interaktivne zvezdice (spodaj s print:hidden).
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold">{t.heading}</h2>
            <span className="text-sm text-muted-foreground">
              {entriesLabel(entries.length, lang)}
            </span>
          </div>
          <Button
            type="button"
            variant={formOpen ? "outline" : "default"}
            size="sm"
            onClick={() => setFormOpen((o) => !o)}
            aria-expanded={formOpen}
            aria-controls="diary-form"
            className="gap-1.5 print:hidden"
          >
            {formOpen ? (
              <>
                <X className="size-4" aria-hidden="true" /> {t.close}
              </>
            ) : (
              <>
                <Plus className="size-4" aria-hidden="true" /> {t.addMemory}
              </>
            )}
          </Button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          {t.cardIntro}{" "}
          <strong className="font-medium text-foreground">
            {t.cardPrintStrong}
          </strong>{" "}
          {t.cardOutro}
        </p>

        {/* === Obrazec za nov vpis === */}
        {formOpen && (
          <form
            id="diary-form"
            onSubmit={(e) => void submitEntry(e)}
            className="mb-6 space-y-3 rounded-lg border border-border bg-muted/30 p-4 print:hidden"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Dan (samo če načrt ima dneve) */}
              {dayLabels.length > 0 && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="diary-day"
                    className="text-sm font-medium leading-none"
                  >
                    {t.dayLabel}
                  </label>
                  <Select
                    value={dayValue}
                    onValueChange={setDayValue}
                  >
                    <SelectTrigger id="diary-day" aria-label={t.selectDayAria}>
                      <SelectValue placeholder={t.generalOption} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">
                        {t.generalOption}
                      </SelectItem>
                      {dayLabels.map((label, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Kraj (opcijsko) */}
              <div className="space-y-1.5">
                <label
                  htmlFor="diary-place"
                  className="text-sm font-medium leading-none"
                >
                  {t.placeLabel}{" "}
                  <span className="text-muted-foreground">
                    {t.optionalSuffix}
                  </span>
                </label>
                <div className="relative">
                  <MapPin
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="diary-place"
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                    maxLength={PLACE_MAX}
                    placeholder={t.placePlaceholder}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            {/* Ocena (opcijsko) */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium leading-none">
                {t.ratingLabel} <span className="text-muted-foreground">{t.optionalSuffix}</span>
              </span>
              <Stars value={rating} onChange={setRating} size="md" />
              {rating > 0 && (
                <button
                  type="button"
                  onClick={() => setRating(0)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  {t.clearRating}
                </button>
              )}
            </div>

            {/* Besedilo spomina */}
            <div className="space-y-1.5">
              <label
                htmlFor="diary-text"
                className="text-sm font-medium leading-none"
              >
                {t.memoryLabel}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({text.length}/{TEXT_MAX})
                </span>
              </label>
              <Textarea
                id="diary-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={TEXT_MAX}
                rows={4}
                required
                placeholder={t.memoryPlaceholder}
                className="resize-y"
              />
            </div>

            {/* Ime (opcijsko, deljeno s komentarji) */}
            <div className="space-y-1.5">
              <label
                htmlFor="diary-name"
                className="text-sm font-medium leading-none"
              >
                {t.nameLabel}{" "}
                <span className="text-muted-foreground">
                  {t.nameOptional}
                </span>
              </label>
              <Input
                id="diary-name"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                maxLength={AUTHOR_NAME_MAX}
                placeholder={t.namePlaceholder}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {t.entryHint}
              </p>
              <Button type="submit" disabled={creating} className="gap-1.5">
                {creating ? (
                  <>
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />{" "}
                    {t.saving}
                  </>
                ) : (
                  <>
                    <NotebookPen className="size-4" aria-hidden="true" />{" "}
                    {t.addMemory}
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* === VNOSI (razvrščeni po dneh) === */}
        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <NotebookPen
              className="mx-auto mb-2 size-6 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              {mounted ? t.emptyDiary : t.loadingDiary}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map((group) => (
              <section
                key={group.key === null ? "general" : `day-${group.key}`}
                aria-label={group.label}
              >
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <span
                    className="inline-block size-1.5 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  {group.label}
                  <span className="font-normal normal-case tracking-normal">
                    ({entriesLabel(group.items.length, lang)})
                  </span>
                </h3>
                <div className="space-y-3">
                  {group.items.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      dayLabel={
                        entry.dayIndex === null
                          ? null
                          : (dayLabels[entry.dayIndex - 1] ?? null)
                      }
                      tripCreatedAt={createdAt}
                      pending={actionPending === entry.id}
                      onSaveEdit={saveEdit}
                      onDelete={deleteEntry}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
