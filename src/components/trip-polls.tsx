"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import {
  BarChart3,
  Check,
  Loader2,
  Lock,
  Plus,
  Trash2,
  Vote,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
//   loadingPolls: { sl: "Nalagam ankete …", en: "Loading polls …" })
const L = {
  sl: {
    loadingPolls: "Nalagam ankete …",
    heading: "Skupinske ankete",
    openCountLabel: (n: number) =>
      `${n} ${slUnit(n, "odprta", "odprti", "odprte", "odprtih")}`,
    allClosed: "vse zaključene",
    noPolls: "še ni anket",
    close: "Zapri",
    newPoll: "Nova anketa",
    description:
      "Odločite se skupaj: postavite vprašanje (npr. „Kateri dan odpotujemo?“) in vsak član skupine odda en glas. Glas lahko prestavite, dokler je anketa odprta.",
    questionPlaceholder: "Vprašanje za skupino (npr. Kateri dan odpotujemo?)",
    questionAria: "Vprašanje ankete",
    optionPlaceholder: (letter: string) => `Možnost ${letter}`,
    optionAria: (letter: string) => `Možnost ${letter}`,
    removeOptionAria: (letter: string) => `Odstrani možnost ${letter}`,
    addOption: "Dodaj možnost",
    namePlaceholder: "Tvoje ime (opcijsko — vidno ob anketi)",
    nameAria: "Tvoje ime",
    createPoll: "Ustvari anketo",
    emptyPolls: "Še ni nobene ankete — postavi prvo vprašanje skupini!",
    // Posamezna anketa (PollCard)
    closedBadge: "Zaključena",
    voteAria: (opt: string, count: number) =>
      `Glasuj za: ${opt} (${count} ${slUnit(count, "glas", "glasa", "glasi", "glasov")})`,
    votesCount: (n: number) =>
      `${n} ${slUnit(n, "glas", "glasa", "glasi", "glasov")}`,
    yourVoteCounted: " · tvoj glas je štet",
    reopenPoll: "Znova odpri",
    closePoll: "Zaključi",
    delete: "Izbriši",
    deleteAria: "Izbriši anketo",
    // Toasti (validacija + optimistični tok)
    errQuestionTitle: "Vprašanje ni ustrezno",
    errQuestionDesc: () =>
      `Vprašanje mora imeti med 2 in ${QUESTION_MAX} znakov.`,
    errOptionsTitle: "Anketa potrebuje možnosti",
    errOptionsDesc: () =>
      `Vpiši vsaj ${OPTIONS_MIN} (največ ${OPTIONS_MAX}) neprazni možnosti.`,
    errOptionTitle: "Možnost je predolga",
    errOptionDesc: () =>
      `Posamezna možnost je lahko dolga največ ${OPTION_MAX} znakov.`,
    okCreatedTitle: "Anketa je ustvarjena",
    okCreatedDesc: "Povezavo deli s skupino in glasujte skupaj!",
    errCreateTitle: "Ankete ni bilo mogoče ustvariti",
    errVoteTitle: "Glasa ni bilo mogoče oddati",
    okClosedTitle: "Anketa je zaključena",
    okClosedDesc: "Rezultati so vidni, glasovanje pa zaprto.",
    okReopenedTitle: "Anketa je znova odprta",
    okReopenedDesc: "Skupina lahko spet glasuje.",
    errUpdateTitle: "Napaka pri posodabljanju ankete",
    okDeletedTitle: "Anketa je izbrisana",
    errDeleteTitle: "Ankete ni bilo mogoče izbrisati",
    tryAgain: "Poskusi znova.",
  },
  en: {
    loadingPolls: "Loading polls …",
    heading: "Group polls",
    openCountLabel: (n: number) => `${n} open`,
    allClosed: "all closed",
    noPolls: "no polls yet",
    close: "Close",
    newPoll: "New poll",
    description:
      "Decide together: ask a question (e.g. “Which day do we leave?”) and each group member casts one vote. You can change your vote while the poll is open.",
    questionPlaceholder: "Question for the group (e.g. Which day do we leave?)",
    questionAria: "Poll question",
    optionPlaceholder: (letter: string) => `Option ${letter}`,
    optionAria: (letter: string) => `Option ${letter}`,
    removeOptionAria: (letter: string) => `Remove option ${letter}`,
    addOption: "Add option",
    namePlaceholder: "Your name (optional — shown with the poll)",
    nameAria: "Your name",
    createPoll: "Create poll",
    emptyPolls: "No polls yet — ask the group your first question!",
    // Posamezna anketa (PollCard)
    closedBadge: "Closed",
    voteAria: (opt: string, count: number) =>
      `Vote for: ${opt} (${count} ${count === 1 ? "vote" : "votes"})`,
    votesCount: (n: number) => `${n} ${n === 1 ? "vote" : "votes"}`,
    yourVoteCounted: " · your vote is counted",
    reopenPoll: "Reopen",
    closePoll: "Close",
    delete: "Delete",
    deleteAria: "Delete poll",
    // Toasti (validacija + optimistični tok)
    errQuestionTitle: "Question is invalid",
    errQuestionDesc: () =>
      `The question must be between 2 and ${QUESTION_MAX} characters.`,
    errOptionsTitle: "The poll needs options",
    errOptionsDesc: () =>
      `Enter at least ${OPTIONS_MIN} (at most ${OPTIONS_MAX}) non-empty options.`,
    errOptionTitle: "Option is too long",
    errOptionDesc: () => `Each option can be at most ${OPTION_MAX} characters.`,
    okCreatedTitle: "Poll created",
    okCreatedDesc: "Share the link with the group and vote together!",
    errCreateTitle: "Could not create the poll",
    errVoteTitle: "Could not cast your vote",
    okClosedTitle: "Poll closed",
    okClosedDesc: "Results stay visible, voting is closed.",
    okReopenedTitle: "Poll reopened",
    okReopenedDesc: "The group can vote again.",
    errUpdateTitle: "Error updating the poll",
    okDeletedTitle: "Poll deleted",
    errDeleteTitle: "Could not delete the poll",
    tryAgain: "Try again.",
  },
} as const;

// ============================================================================
// TRIP POLLS — skupinske ankete na javni strani deljenega tripa (F11)
// ============================================================================
//
// MindTrip vrzel #2: brez-računa skupinsko odločanje na /pot/[shareId].
// Vsak obiskovalec (anonimni clientId iz localStorage — ENAK ID kot za
// glasovanje/všečke/komantarje) lahko:
//   - ustvari anketo (vprašanje + 2–6 možnosti, ime opcijsko)
//   - glasuje (klik na možnost) ali prestavi glas (zadnji velja)
//   - avtor ankete jo lahko zaključi ali izbriše
//
// API: /api/poll (GET/POST/PATCH/DELETE) + /api/poll/vote (POST).
// Optimistični UI z revertom ob napaki (isti vzorec kot trip-social).
// ============================================================================

// Anonimni clientId + prihranjeno ime avtorja prihajata iz deljene
// knjižnice src/lib/client-identity.ts (99-b — enkraten vir: isti
// brskalnik = isti anonimni obiskovalec povsod).

const QUESTION_MAX = 200;
const OPTION_MAX = 80;
const OPTIONS_MIN = 2;
const OPTIONS_MAX = 6;
const AUTHOR_NAME_MAX = 60;

export interface TripPollItem {
  id: string;
  question: string;
  options: string[];
  authorName: string | null;
  closed: boolean;
  createdAt: string;
  counts: number[];
  total: number;
  myVote: number | null;
  isAuthor: boolean;
}

interface TripPollsProps {
  shareId: string;
  /** Začetne ankete iz RSC (brez myVote — ta pride s klientom). */
  initialPolls: Omit<TripPollItem, "myVote" | "isAuthor">[];
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

  // Sanity cap: anketa ne more biti starejša od potovanja (pokvarjeni podatki)
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

  // Sanity cap: anketa ne more biti starejša od potovanja (pokvarjeni podatki)
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

/** "3 glasovi" / "3 votes" — pravilne oblike po jeziku (SL dual/množina). */
function votesLabel(n: number, lang: "sl" | "en" = "sl"): string {
  if (n === 0)
    return lang === "en" ? "No votes yet" : "Ni še glasov";
  return lang === "en"
    ? `${n} ${n === 1 ? "vote" : "votes"}`
    : `${n} ${slUnit(n, "glas", "glasa", "glasi", "glasov")}`;
}

// ============================================================================
// GLAVNA KOMPONENTA
// ============================================================================
export function TripPolls({ shareId, initialPolls, createdAt }: TripPollsProps) {
  const { toast } = useToast();
  // TASK 8 / F3-B: jezik za L-pattern placeholder nalaganja (SL privzeto).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const t = L[lang];

  const [clientId, setClientId] = useState<string>("");
  const [mounted, setMounted] = useState<boolean>(false);
  const [polls, setPolls] = useState<TripPollItem[]>(() =>
    (initialPolls ?? []).map((p) => ({ ...p, myVote: null, isAuthor: false }))
  );

  // Obrazec za novo anketo
  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [question, setQuestion] = useState<string>("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [authorName, setAuthorName] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);

  // Za katero anketo trenutno poteka oddaja glasu (pollId → optionIdx)
  const [votePending, setVotePending] = useState<Record<string, number>>({});
  const [actionPending, setActionPending] = useState<string | null>(null);

  /** Znova pridobi ankete z mojim glasom (GET /api/poll?voterId=). */
  const refreshPolls = useCallback(
    async (cid: string) => {
      try {
        const res = await fetch(
          `/api/poll?shareId=${encodeURIComponent(shareId)}&voterId=${encodeURIComponent(cid)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as {
          polls?: TripPollItem[];
        } | null;
        if (Array.isArray(data?.polls)) {
          setPolls(data.polls);
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
      // ostane nedotaknjeno, ankete ostanejo berljive)
      const cid = getVoterId();
      if (cid) {
        setClientId(cid);

        // Prihranjeno ime (skupno s komentarji)
        const savedName = getAuthorName() ?? "";
        if (savedName) setAuthorName(savedName);

        // Dopolni myVote/isAuthor (server-side podatki jih ne poznajo)
        void refreshPolls(cid);
      }
    } catch {
      // private mode — ankete ostanejo berljive, brez mojega glasu
    }
  }, [shareId, refreshPolls]);

  // ========================================================================
  // Ustvari anketo
  // ========================================================================
  const submitPoll = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (creating || !shareId || !clientId) return;

      const q = question.trim();
      const opts = options.map((o) => o.trim()).filter((o) => o.length > 0);

      if (q.length < 2 || q.length > QUESTION_MAX) {
        toast({
          title: t.errQuestionTitle,
          description: t.errQuestionDesc(),
          variant: "destructive",
        });
        return;
      }
      if (opts.length < OPTIONS_MIN || opts.length > OPTIONS_MAX) {
        toast({
          title: t.errOptionsTitle,
          description: t.errOptionsDesc(),
          variant: "destructive",
        });
        return;
      }
      if (opts.some((o) => o.length > OPTION_MAX)) {
        toast({
          title: t.errOptionTitle,
          description: t.errOptionDesc(),
          variant: "destructive",
        });
        return;
      }

      setCreating(true);
      try {
        const res = await fetch("/api/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shareId,
            question: q,
            options: opts,
            authorName: authorName.trim(),
            clientId,
          }),
        });
        const data: unknown = await res.json().catch(() => null);
        const d = data as { success?: unknown; poll?: unknown } | null;

        if (!res.ok || d?.success !== true || !d?.poll) {
          const error = (data as { error?: unknown } | null)?.error;
          throw new Error(
            typeof error === "string" ? error : `HTTP ${res.status}`
          );
        }

        const poll = d.poll as TripPollItem;
        setPolls((prev) => [poll, ...prev]);
        setQuestion("");
        setOptions(["", ""]);
        setFormOpen(false);

        // Prihrani ime (skupno s komentarji; defenzivno — private mode
        // se mirno preskoči znotraj lib-a)
        saveAuthorName(authorName.trim());

        toast({
          title: t.okCreatedTitle,
          description: t.okCreatedDesc,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : t.tryAgain;
        toast({
          title: t.errCreateTitle,
          description: message,
          variant: "destructive",
        });
      } finally {
        setCreating(false);
      }
    },
    [creating, shareId, clientId, question, options, authorName, toast, t]
  );

  // ========================================================================
  // Glasuj / prestavi glas (optimistično z revertom)
  // ========================================================================
  const castVote = useCallback(
    async (pollId: string, optionIdx: number) => {
      if (!clientId || !shareId) return;
      const poll = polls.find((p) => p.id === pollId);
      if (!poll || poll.closed) return;
      if (votePending[pollId] !== undefined) return; // že v teku
      if (poll.myVote === optionIdx) return; // klik na svoj glas = no-op

      // Optimistični update: prestavi moj glas med opcijami
      const prev = poll;
      const next: TripPollItem = {
        ...poll,
        counts: poll.counts.map((c, i) => {
          if (i === optionIdx) return c + 1;
          if (poll.myVote === i) return Math.max(0, c - 1);
          return c;
        }),
        total: poll.myVote === null ? poll.total + 1 : poll.total,
        myVote: optionIdx,
      };
      setPolls((all) => all.map((p) => (p.id === pollId ? next : p)));
      setVotePending((v) => ({ ...v, [pollId]: optionIdx }));

      try {
        const res = await fetch("/api/poll/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pollId, voterId: clientId, optionIdx }),
        });
        const data: unknown = await res.json().catch(() => null);
        const d = data as
          | { success?: unknown; counts?: unknown; total?: unknown; myVote?: unknown }
          | null;

        if (
          !res.ok ||
          d?.success !== true ||
          !Array.isArray(d?.counts) ||
          typeof d?.total !== "number"
        ) {
          throw new Error(
            (data as { error?: unknown } | null)?.error instanceof Error
              ? String((data as { error?: unknown }).error)
              : `HTTP ${res.status}`
          );
        }

        // Strežniško stanje je resnica (ali izgladi lokalne razlike)
        setPolls((all) =>
          all.map((p) =>
            p.id === pollId
              ? {
                  ...p,
                  counts: d.counts as number[],
                  total: d.total as number,
                  myVote:
                    typeof d.myVote === "number" ? (d.myVote as number) : null,
                }
              : p
          )
        );
      } catch (err) {
        // Revert na prejšnje stanje
        setPolls((all) => all.map((p) => (p.id === pollId ? prev : p)));
        const message = err instanceof Error ? err.message : t.tryAgain;
        toast({
          title: t.errVoteTitle,
          description: message,
          variant: "destructive",
        });
      } finally {
        setVotePending((v) => {
          const copy = { ...v };
          delete copy[pollId];
          return copy;
        });
      }
    },
    [clientId, shareId, polls, votePending, toast, t]
  );

  // ========================================================================
  // Zaključi / ponovno odpri (samo avtor)
  // ========================================================================
  const toggleClose = useCallback(
    async (pollId: string, closed: boolean) => {
      if (!clientId || actionPending) return;
      setActionPending(pollId);
      try {
        const res = await fetch("/api/poll", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pollId, clientId, closed }),
        });
        const data: unknown = await res.json().catch(() => null);
        const d = data as { success?: unknown; poll?: unknown } | null;
        if (!res.ok || d?.success !== true || !d?.poll) {
          throw new Error(
            (data as { error?: unknown } | null)?.error instanceof Error
              ? String((data as { error?: unknown }).error)
              : `HTTP ${res.status}`
          );
        }
        const poll = d.poll as TripPollItem;
        setPolls((all) => all.map((p) => (p.id === pollId ? poll : p)));
        toast({
          title: closed ? t.okClosedTitle : t.okReopenedTitle,
          description: closed ? t.okClosedDesc : t.okReopenedDesc,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : t.tryAgain;
        toast({
          title: t.errUpdateTitle,
          description: message,
          variant: "destructive",
        });
      } finally {
        setActionPending(null);
      }
    },
    [clientId, actionPending, toast, t]
  );

  // ========================================================================
  // Izbriši (samo avtor)
  // ========================================================================
  const deletePoll = useCallback(
    async (pollId: string) => {
      if (!clientId || actionPending) return;
      setActionPending(pollId);
      try {
        const res = await fetch("/api/poll", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pollId, clientId }),
        });
        const data: unknown = await res.json().catch(() => null);
        const d = data as { success?: unknown } | null;
        if (!res.ok || d?.success !== true) {
          throw new Error(
            (data as { error?: unknown } | null)?.error instanceof Error
              ? String((data as { error?: unknown }).error)
              : `HTTP ${res.status}`
          );
        }
        setPolls((all) => all.filter((p) => p.id !== pollId));
        toast({ title: t.okDeletedTitle });
      } catch (err) {
        const message = err instanceof Error ? err.message : t.tryAgain;
        toast({
          title: t.errDeleteTitle,
          description: message,
          variant: "destructive",
        });
      } finally {
        setActionPending(null);
      }
    },
    [clientId, actionPending, toast, t]
  );

  const openCount = useMemo(
    () => polls.filter((p) => !p.closed).length,
    [polls]
  );

  // ========================================================================
  // RENDER
  // ========================================================================
  return (
    <Card className="print-hide print:hidden overflow-hidden">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Vote className="size-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold">{t.heading}</h2>
            <span className="text-sm text-muted-foreground">
              {openCount > 0
                ? t.openCountLabel(openCount)
                : polls.length > 0
                  ? t.allClosed
                  : t.noPolls}
            </span>
          </div>
          <Button
            type="button"
            variant={formOpen ? "outline" : "default"}
            size="sm"
            onClick={() => setFormOpen((o) => !o)}
            aria-expanded={formOpen}
            aria-controls="poll-form"
            className="gap-1.5"
          >
            {formOpen ? (
              <>
                <X className="size-4" aria-hidden="true" /> {t.close}
              </>
            ) : (
              <>
                <Plus className="size-4" aria-hidden="true" /> {t.newPoll}
              </>
            )}
          </Button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">{t.description}</p>

        {/* === Obrazec za novo anketo === */}
        {formOpen && (
          <form
            id="poll-form"
            onSubmit={(e) => void submitPoll(e)}
            className="mb-6 space-y-3 rounded-lg border border-border bg-muted/30 p-4"
          >
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t.questionPlaceholder}
              required
              maxLength={QUESTION_MAX}
              minLength={2}
              aria-label={t.questionAria}
              className="h-11"
              disabled={creating}
            />

            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={`opt-${i}`} className="flex items-center gap-2">
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                    aria-hidden="true"
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <Input
                    value={opt}
                    onChange={(e) =>
                      setOptions((prev) =>
                        prev.map((o, j) => (j === i ? e.target.value : o))
                      )
                    }
                    placeholder={t.optionPlaceholder(String.fromCharCode(65 + i))}
                    maxLength={OPTION_MAX}
                    aria-label={t.optionAria(String.fromCharCode(65 + i))}
                    className="h-11"
                    disabled={creating}
                  />
                  {options.length > OPTIONS_MIN && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setOptions((prev) => prev.filter((_, j) => j !== i))
                      }
                      aria-label={t.removeOptionAria(String.fromCharCode(65 + i))}
                      disabled={creating}
                      className="size-9 shrink-0"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              ))}
              {options.length < OPTIONS_MAX && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOptions((prev) => [...prev, ""])}
                  disabled={creating}
                  className="gap-1.5"
                >
                  <Plus className="size-4" aria-hidden="true" /> {t.addOption}
                </Button>
              )}
            </div>

            <Input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder={t.namePlaceholder}
              maxLength={AUTHOR_NAME_MAX}
              aria-label={t.nameAria}
              className="h-11"
              disabled={creating}
            />

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {question.trim().length}/{QUESTION_MAX}
              </span>
              <Button type="submit" disabled={creating} className="gap-1.5">
                {creating ? (
                  <Loader2
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <BarChart3 className="size-4" aria-hidden="true" />
                )}
                {t.createPoll}
              </Button>
            </div>
          </form>
        )}

        {/* === Seznam anket === */}
        {polls.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {mounted ? t.emptyPolls : t.loadingPolls}
          </p>
        ) : (
          <ul className="space-y-4" aria-live="polite">
            {polls.map((poll) => (
              <li
                key={poll.id}
                className="rounded-lg border border-border p-4"
              >
                <PollCard
                  poll={poll}
                  mounted={mounted}
                  tripCreatedAt={createdAt}
                  votePendingIdx={
                    votePending[poll.id] !== undefined
                      ? votePending[poll.id]
                      : null
                  }
                  actionPending={actionPending === poll.id}
                  onVote={(idx) => void castVote(poll.id, idx)}
                  onToggleClose={() =>
                    void toggleClose(poll.id, !poll.closed)
                  }
                  onDelete={() => void deletePoll(poll.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// POSAMEZNA ANKETA
// ============================================================================
interface PollCardProps {
  poll: TripPollItem;
  mounted: boolean;
  tripCreatedAt: string;
  /** Index opcije, katere glas je v teku (null = nič). */
  votePendingIdx: number | null;
  actionPending: boolean;
  onVote: (optionIdx: number) => void;
  onToggleClose: () => void;
  onDelete: () => void;
}

function PollCard({
  poll,
  mounted,
  tripCreatedAt,
  votePendingIdx,
  actionPending,
  onVote,
  onToggleClose,
  onDelete,
}: PollCardProps) {
  // ISSUE #24 Sklop 1 (1.164.0): besedila ankete po locale gledalca (L-vzorec).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const t = L[lang];
  const maxCount = Math.max(1, ...poll.counts);
  const total = poll.total;

  return (
    <div>
      {/* Vprašanje + meta */}
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-snug">{poll.question}</h3>
        {poll.closed && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Lock className="size-3" aria-hidden="true" />
            {t.closedBadge}
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {poll.authorName ? `${poll.authorName} · ` : ""}
        {mounted ? timeAgo(poll.createdAt, tripCreatedAt, lang) : ""}
      </p>

      {/* Možnosti — klikljive vrstice z rezultati */}
      <div className="space-y-2">
        {poll.options.map((opt, i) => {
          const count = poll.counts[i] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isMyVote = poll.myVote === i;
          const isPending = votePendingIdx === i;
          const widthPct = total > 0 ? Math.round((count / maxCount) * 100) : 0;

          return (
            <button
              key={`${poll.id}-opt-${i}`}
              type="button"
              onClick={() => onVote(i)}
              disabled={poll.closed || isPending}
              aria-pressed={isMyVote}
              aria-label={t.voteAria(opt, count)}
              className={cn(
                "relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default",
                !poll.closed &&
                  "hover:border-primary/50 focus-visible:border-primary/50",
                isMyVote
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border bg-background",
                poll.closed && "cursor-default opacity-90"
              )}
            >
              {/* Progress fill (za tekstom, širina glede na zmagovalca) */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-0 left-0 transition-[width] duration-500",
                  isMyVote ? "bg-primary/15" : "bg-muted"
                )}
                style={{ width: `${widthPct}%` }}
              />

              <span className="relative z-10 flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                    isMyVote
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground"
                  )}
                  aria-hidden="true"
                >
                  {isMyVote ? (
                    <Check className="size-3" aria-hidden="true" />
                  ) : (
                    String.fromCharCode(65 + i)
                  )}
                </span>
                <span className="min-w-0 truncate">{opt}</span>
              </span>

              <span className="relative z-10 flex shrink-0 items-center gap-2 text-xs">
                {isPending && (
                  <Loader2
                    className="size-3.5 animate-spin text-primary"
                    aria-hidden="true"
                  />
                )}
                <span className="text-muted-foreground" aria-hidden="true">
                  {pct}%
                </span>
                <span
                  className={cn(
                    "min-w-6 text-right font-semibold tabular-nums",
                    isMyVote ? "text-primary" : "text-foreground"
                  )}
                  aria-hidden="true"
                >
                  {count}
                </span>
                <span className="sr-only">{t.votesCount(count)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Noga: skupno + avtorska dejanja */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {votesLabel(total, lang)}
          {poll.myVote !== null && t.yourVoteCounted}
        </span>
        {poll.isAuthor && (
          <span className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onToggleClose}
              disabled={actionPending}
              className="h-8 gap-1.5 px-2.5 text-xs"
            >
              {actionPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Lock className="size-3.5" aria-hidden="true" />
              )}
              {poll.closed ? t.reopenPoll : t.closePoll}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={actionPending}
              aria-label={t.deleteAria}
              className="h-8 gap-1.5 px-2.5 text-xs text-destructive hover:text-destructive"
            >
              {actionPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3.5" aria-hidden="true" />
              )}
              {t.delete}
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}

export default TripPolls;
