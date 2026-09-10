"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Heart, Loader2, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ============================================================================
// TRIP SOCIAL — všečki (srčki) + komentarji na javni strani deljenega tripa
// ============================================================================
//
// Skupinsko planiranje (P1-2a): obiskovalci deljene povezave (/pot/[shareId])
// lahko potovanje označijo z "všeč" in komentirajo (npr. "vidimo se ob 9h
// pred jezerom") — Booking/Mindtrip-style social layer.
//
//  - VŠEČEK: Heart gumb → POST /api/trip-likes (toggle), optimistični UI
//    z revertom ob napaki (isti vzorec kot glasovanje v shared-trip.tsx)
//  - KOMENTARJI: obrazec + seznam → POST/GET /api/trip-comments
//
// clientId je ENAK anonimni identifikator kot pri glasovanju (VOTER_STORAGE_KEY
// v shared-trip.tsx — "discoverslovenia_voter"): isti brskalnik = isti
// obiskovalec za glasove in všečke.
// ============================================================================

// localStorage ključi — ENAK ključ kot VOTER_STORAGE_KEY v shared-trip.tsx,
// da ima isti obiskovalec isti anonimni ID za glasovanje IN všečke.
const CLIENT_ID_STORAGE_KEY = "discoverslovenia_voter";
const likeStorageKey = (shareId: string) =>
  `discoverslovenia_like_${shareId}`;
// Priročnost: ime avtorja si zapomnimo za naslednji komentar
const AUTHOR_NAME_STORAGE_KEY = "discoverslovenia_comment_name";

/** Veljaven clientId (enak vzorec kot API). */
const CLIENT_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

const AUTHOR_NAME_MAX = 60;
const COMMENT_TEXT_MAX = 500;

/** Barve avatarjev — toplo/zeleno obarvana paleta (brez modre/indigo). */
const AVATAR_COLORS = [
  "bg-emerald-600",
  "bg-amber-600",
  "bg-teal-700",
  "bg-orange-700",
  "bg-lime-700",
] as const;

export interface TripCommentItem {
  id: string;
  authorName: string;
  text: string;
  /** ISO datum objave */
  createdAt: string;
}

interface TripSocialProps {
  shareId: string;
  /** Začetni komentarji iz RSC (najnovejši najprej) */
  initialComments: TripCommentItem[];
  /** Začetno število všečkov iz RSC */
  initialLikes: number;
  /** ISO datum ustvarjanja potovanja (spodnja meja za relativen čas) */
  createdAt: string;
}

// ============================================================================
// Slovenski helperji (ednina / dvojina / množina)
// ============================================================================

/** Slovenščina: 1 → ednina, 2 → dvojina, 3–4 → množina, 5+ → splošna množina. */
function slUnit(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  const r = n % 100;
  if (r === 2) return two;
  if (r === 3 || r === 4) return few;
  return many;
}

/** "pred 2 min", "pred 3 h" — kratke oznake za manj kot uro. */
function slTimeAgo(iso: string, floorIso?: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "neznano";

  // Sanity cap: komentar ne more biti starejši od potovanja samega
  // (pokvarjeni podatki) — v tem primeru pokažemo absolutni datum.
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

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `pred ${months} ${slUnit(months, "mesecem", "mesecema", "meseci", "meseci")}`;
  }

  const years = Math.floor(days / 365);
  return `pred ${years} ${slUnit(years, "letom", "letoma", "leti", "leti")}`;
}

/** Barva avatarja iz imena (stabilna za isto ime). */
function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** Začetnica imena (varno za Unicode). */
function nameInitial(name: string): string {
  const trimmed = name.trim();
  const first = Array.from(trimmed)[0] ?? "?";
  return first.toUpperCase();
}

/** "X osebam je všeč" — dativne oblike. */
function likesLabel(n: number): string {
  if (n === 0) return "Ni še všečkov";
  const people =
    n === 1 ? "1 osebi" : n === 2 ? "2 osebama" : `${n} osebam`;
  return `${people} je to potovanje všeč`;
}

// ============================================================================
// Glavna komponenta
// ============================================================================

export function TripSocial({
  shareId,
  initialComments,
  initialLikes,
  createdAt,
}: TripSocialProps) {
  const { toast } = useToast();

  // === Stanje — števci se inicializirajo iz server propsov (hidratacija
  // varna), lokalni všeček in clientId se naložita šele v useEffect. ===
  const [comments, setComments] = useState<TripCommentItem[]>(
    () => initialComments ?? []
  );
  const [likes, setLikes] = useState<number>(() => initialLikes ?? 0);
  const [liked, setLiked] = useState<boolean>(false);
  const [likePending, setLikePending] = useState<boolean>(false);
  const [clientId, setClientId] = useState<string>("");

  // Obrazec
  const [authorName, setAuthorName] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Relativni čas računamo šele po mountu (SSR/klient ura se razlikujeta)
  const [mounted, setMounted] = useState<boolean>(false);

  // Mount: zagotovi clientId (enak vzorec kot shared-trip glasovanje) +
  // naloži lokalni všeček + prihranjeno ime avtorja
  useEffect(() => {
    setMounted(true);
    if (!shareId) return;
    try {
      let cid = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
      if (!cid || !CLIENT_ID_RE.test(cid)) {
        cid =
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `v-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, cid);
      }
      setClientId(cid);

      setLiked(window.localStorage.getItem(likeStorageKey(shareId)) === "1");

      const savedName = window.localStorage.getItem(AUTHOR_NAME_STORAGE_KEY);
      if (savedName && savedName.trim()) setAuthorName(savedName.trim());
    } catch {
      // localStorage nedostopen (private mode) — všečki/komentarji delujejo
      // brez persistenze lastnega stanja
    }
  }, [shareId]);

  // === Všeček — toggle z optimističnim UI in revertom ob napaki ===
  const toggleLike = useCallback(async () => {
    if (!shareId || !clientId || likePending) return;

    const prevLiked = liked;
    const prevLikes = likes;
    const nextLiked = !prevLiked;

    // Optimistična posodobitev UI
    setLikePending(true);
    setLiked(nextLiked);
    setLikes((n) => Math.max(0, n + (nextLiked ? 1 : -1)));

    try {
      const res = await fetch("/api/trip-likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId, clientId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      const d = data as { liked?: unknown; count?: unknown } | null;

      // Server je avtoriteta
      if (typeof d?.liked === "boolean") setLiked(d.liked);
      if (typeof d?.count === "number" && d.count >= 0) setLikes(d.count);

      // Persistiraj lokalno stanje všečka
      try {
        if (d?.liked === true) {
          window.localStorage.setItem(likeStorageKey(shareId), "1");
        } else if (d?.liked === false) {
          window.localStorage.removeItem(likeStorageKey(shareId));
        }
      } catch {
        // private mode — ignore
      }
    } catch (err) {
      // Revert optimistične spremembe
      console.error("[trip-social] všeček neuspešen:", err);
      setLiked(prevLiked);
      setLikes(prevLikes);
      toast({
        title: "Všečka ni bilo mogoče shraniti",
        description: "Preveri povezavo in poskusi znova.",
        variant: "destructive",
      });
    } finally {
      setLikePending(false);
    }
  }, [shareId, clientId, likePending, liked, likes, toast]);

  // === Komentar — objavi (doda na vrh seznama, počisti obrazec) ===
  const submitComment = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting || !shareId) return;

      const name = authorName.trim();
      const body = text.trim();

      if (name.length < 1 || name.length > AUTHOR_NAME_MAX) {
        toast({
          title: "Vpiši svoje ime",
          description: `Ime mora imeti med 1 in ${AUTHOR_NAME_MAX} znakov.`,
          variant: "destructive",
        });
        return;
      }
      if (body.length < 2 || body.length > COMMENT_TEXT_MAX) {
        toast({
          title: "Komentar je prekratek ali predolg",
          description: `Komentar mora imeti med 2 in ${COMMENT_TEXT_MAX} znakov.`,
          variant: "destructive",
        });
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch("/api/trip-comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareId, authorName: name, text: body }),
        });
        const data: unknown = await res.json().catch(() => null);
        const d = data as { success?: unknown; comment?: unknown } | null;

        if (!res.ok || d?.success !== true || !d?.comment) {
          const error = (data as { error?: unknown } | null)?.error;
          throw new Error(
            typeof error === "string" ? error : `HTTP ${res.status}`
          );
        }

        const comment = d.comment as TripCommentItem;
        // Nov komentar lokalno na VRH seznama + počisti obrazec
        setComments((prev) => [
          {
            id: comment.id,
            authorName: comment.authorName,
            text: comment.text,
            createdAt: comment.createdAt,
          },
          ...prev,
        ]);
        setText("");

        // Prihrani ime za naslednji komentar
        try {
          window.localStorage.setItem(AUTHOR_NAME_STORAGE_KEY, name);
        } catch {
          // private mode — ignore
        }

        toast({
          title: "Komentar je objavljen",
          description: "Hvala, da deliš mnenje s skupino!",
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Poskusi znova.";
        toast({
          title: "Komentarja ni bilo mogoče objaviti",
          description: message,
          variant: "destructive",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, shareId, authorName, text, toast]
  );

  const commentCountLabel = useMemo(() => {
    const n = comments.length;
    if (n === 0) return "Ni komentarjev";
    return `${n} ${slUnit(n, "komentar", "komentarja", "komentarji", "komentarjev")}`;
  }, [comments.length]);

  return (
    <section
      aria-label="Komentarji in všečki"
      className="print-hide print:hidden"
    >
      <Card className="border-border/60">
        <CardContent className="p-4 sm:p-6">
          {/* === Naslov odseka + števec komentarjev === */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
              <MessageCircle
                className="size-5 text-primary"
                aria-hidden="true"
              />
              Komentarji in všečki
            </h2>
            <span className="text-sm text-muted-foreground">
              {commentCountLabel}
            </span>
          </div>

          {/* === Všeček (srček) === */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => void toggleLike()}
              disabled={likePending}
              aria-pressed={liked}
              aria-label={
                liked
                  ? "Odstrani všeček s tega potovanja"
                  : "Označi to potovanje z všeček"
              }
              className="group h-11 gap-2 px-5"
            >
              {likePending ? (
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <Heart
                  className={cn(
                    "size-5 transition-colors",
                    liked
                      ? "fill-current text-red-500"
                      : "text-foreground group-hover:text-red-500"
                  )}
                  aria-hidden="true"
                />
              )}
              Všeč mi
            </Button>
            <span
              className="text-sm text-muted-foreground"
              aria-live="polite"
            >
              <span className="sr-only">Število všečkov: </span>
              {likesLabel(likes)}
            </span>
          </div>

          {/* === Obrazec za nov komentar === */}
          <form
            onSubmit={(e) => void submitComment(e)}
            className="space-y-3 border-b border-border py-4"
          >
            <Input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Tvoje ime"
              required
              maxLength={AUTHOR_NAME_MAX}
              autoComplete="name"
              aria-label="Tvoje ime"
              className="h-11"
              disabled={submitting}
            />
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Deli mnenje z družino in prijatelji…"
              required
              maxLength={COMMENT_TEXT_MAX}
              rows={3}
              aria-label="Komentar"
              className="min-h-[88px] resize-y"
              disabled={submitting}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {text.length}/{COMMENT_TEXT_MAX}
              </span>
              <Button
                type="submit"
                disabled={submitting}
                className="h-11 min-w-44 gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                    Objavljam…
                  </>
                ) : (
                  <>
                    <Send className="size-4" aria-hidden="true" />
                    Objavi komentar
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* === Seznam komentarjev === */}
          {comments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <MessageCircle
                className="size-8 text-muted-foreground/50"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">
                Trenutno ni komentarjev — bodi prvi!
              </p>
              <p className="max-w-md text-xs text-muted-foreground/70">
                Deli mnenje ali se dogovori za termin, npr. »vidimo se ob 9h
                pred jezerom«.
              </p>
            </div>
          ) : (
            <ul
              className="scroll-area-custom mt-4 max-h-96 space-y-4 overflow-y-auto pr-2"
              aria-label="Seznam komentarjev"
            >
              {comments.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <div
                    className={cn(
                      "flex size-9 shrink-0 select-none items-center justify-center rounded-full text-sm font-bold text-white",
                      avatarColor(c.authorName)
                    )}
                    aria-hidden="true"
                  >
                    {nameInitial(c.authorName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-medium">{c.authorName}</span>
                      <time
                        dateTime={c.createdAt}
                        className="text-xs text-muted-foreground"
                      >
                        {mounted ? slTimeAgo(c.createdAt, createdAt) : "…"}
                      </time>
                    </p>
                    <p className="mt-1 break-words whitespace-pre-line text-sm text-foreground">
                      {c.text}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default TripSocial;
