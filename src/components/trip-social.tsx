"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  Heart,
  Landmark,
  Loader2,
  MapPin,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
// W2 (Issue #15, 1.131.0): skupinski klepet z @AI — živost (polling + socket)
import { useTripChat, type TripChatItem } from "@/hooks/use-trip-chat";
// W2: čisti helperji @AI (omemba, rezervirano ime, JSON priloga)
import { AI_ADVISOR_NAME, isAiMention, parseAiPayload } from "@/lib/trip-chat";
// W2: "Dodaj v pot" — ISTI kanon kot klepet "+" (addChatPlaceToItinerary)
import {
  addChatPlaceToItinerary,
  isValidChatPlace,
} from "@/lib/chat-add-place";
import type { ChatPlace } from "@/lib/geo-intent";
// W2: CAS posodobitev deljene poti na mestu (+ editToken iz localStorage)
import { getEditToken, updateItinerary } from "@/lib/itinerary-share";
import type { Itinerary } from "@/lib/types";
import type { StoCitation } from "@/lib/rag/types";
// W2: telemetrija skupinskega klepeta (isti vir kot planner dogodki)
import { trackPlannerEvent } from "@/lib/planner-analytics";

// ============================================================================
// TRIP SOCIAL — všečki (srčki) + SKUPINSKI KLEPET Z @AI na /pot/[shareId]
// ============================================================================
//
// W2 (Issue #15, 1.131.0) — Mindtripov vzorec "skupinski klepet z @AI",
// po našem kanonu:
//   - obstoječi KOMENTARJI (P1-2a) postanejo ZGODOVINA KLEPETA (ista tabela
//     TripComment — ZERO FEATURE LOSS, brez migracije vsebine);
//   - živost: inkrementalni polling (6 s, viden zavihek) + socket pospešitev
//     (chat:new — mini-service 3003; mrtv service → polling prevzame);
//   - @AI svetovalec: omemba v sporočilu → STREŽNIŠKO izstavljen odgovor
//     (isAI vrstica; isti deterministični pogon kot osebni klepet — 0
//     runtime LLM, pošteno groundan na bazi/STO/OSM);
//   - AI PREDLAGA, človek ODLOČA: predlogi krajev iz priloge imajo gumb
//     "Dodaj v pot" (CAS PATCH — isti čisti algoritem kot klepet "+");
//   - VŠEČKI: nespremenjeni (Heart toggle → /api/trip-likes).
//
// Iskrenost: značka AI je strežniška (navaden POST zavrne rezervirana
// imena); povezava "živo / osveževanje" je poštena (socket je kozmetičen);
// napake AI se izpišejo, sporočilo uporabnika ostane objavljeno.
// ============================================================================

// Ključ všečka je LASTNOST te komponente (ločen seznam na deljeni pot);
// anonimni ID in ime avtorja prihajata iz client-identity lib-a.
const likeStorageKey = (shareId: string) =>
  `discoverslovenia_like_${shareId}`;

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

interface TripSocialProps {
  shareId: string;
  /** Začetne vrstice iz RSC (najnovejše prve — DESC; hook jih obrne). */
  initialComments: TripChatItem[];
  /** Začetno število všečkov iz RSC */
  initialLikes: number;
  /** ISO datum ustvarjanja potovanja (spodnja meja za relativen čas) */
  createdAt: string;
}

// ============================================================================
// Slovenski helperji (ednina / dvojina / množina) — /pot je SL-only (P4-8)
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
// AI mehurček — odgovor svetovalca s predlogi krajev + viri
// ============================================================================

/** Znakovni del gumba predloga (lokalno stanje po uspešnem dodajanju). */
function PlaceSuggestion({
  place,
  added,
  pending,
  onAdd,
}: {
  place: ChatPlace;
  added: boolean;
  pending: boolean;
  onAdd: (place: ChatPlace) => void;
}) {
  // Isti čisti varovali kot klepet "+": T2 uradni vir (članek) ni fizični
  // postanek — predloga izrišemo, gumba NE (1.44 kanon).
  const isStop =
    place.provenance !== "t2" && place.category !== "source";

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 py-2">
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground" title={place.name}>
        <MapPin className="mr-1 inline size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        {place.name}
      </span>
      {isStop ? (
        added ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-600/10 px-2 py-1 text-[11px] font-semibold text-emerald-700"
            aria-live="polite"
          >
            <Check className="size-3" aria-hidden="true" />
            V poti
          </span>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-[11px]"
            onClick={() => onAdd(place)}
            disabled={pending}
            aria-label={`Dodaj ${place.name} v pot`}
          >
            {pending ? (
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-3" aria-hidden="true" />
            )}
            Dodaj v pot
          </Button>
        )
      ) : (
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
          uradni vir
        </span>
      )}
    </li>
  );
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

  // === Klepet (W2): vrstice kronološko + živost + AI vprašanje ===
  const {
    comments,
    connected,
    aiPending,
    appendLocal,
    emitChatSignal,
    askAi,
  } = useTripChat(shareId, initialComments);

  // === Stanje — števci se inicializirajo iz server propsov (hidratacija
  // varna), lokalni všeček in clientId se naložita šele v useEffect. ===
  const [likes, setLikes] = useState<number>(() => initialLikes ?? 0);
  const [liked, setLiked] = useState<boolean>(false);
  const [likePending, setLikePending] = useState<boolean>(false);
  const [clientId, setClientId] = useState<string>("");

  // Obrazec
  const [authorName, setAuthorName] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // "Dodaj v pot" — en predlog naenkrat (CAS zaporedno, brez dirk)
  const [addingPlaceId, setAddingPlaceId] = useState<string | null>(null);
  const [addedPlaceIds, setAddedPlaceIds] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );

  // Relativni čas računamo šele po mountu (SSR/klient ura se razlikujeta)
  const [mounted, setMounted] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Mount: zagotovi clientId (enak vzorec kot shared-trip glasovanje) +
  // naloži lokalni všeček + prihranjeno ime avtorja
  useEffect(() => {
    setMounted(true);
    if (!shareId) return;
    try {
      // 99-b: read-or-create anonimni ID (private mode → null, stanje
      // ostane nedotaknjeno — isto kot prejšnji try/catch vzorec)
      const cid = getVoterId();
      if (cid) setClientId(cid);

      setLiked(window.localStorage.getItem(likeStorageKey(shareId)) === "1");

      const savedName = getAuthorName();
      if (savedName && savedName.trim()) setAuthorName(savedName.trim());
    } catch {
      // localStorage nedostopen (private mode) — všečki/komentarji delujejo
      // brez persistenze lastnega stanja
    }
  }, [shareId]);

  // === Samodejni drs na dno ob novi vrstici (če je uporabnik že ob dnu —
  // ne smemo mu puliti brskalnika, če bere zgodovino) ===
  const stickToBottomRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottomRef.current =
        el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const lastCount = useRef(comments.length);
  useEffect(() => {
    const grew = comments.length > lastCount.current;
    lastCount.current = comments.length;
    if (!grew) return;
    if (!stickToBottomRef.current) return; // uporabnik bere višje — ne puli
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length, aiPending]);

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

  // === @AI žeton — vstavi na položaj kazalca v vnosno polje ===
  const insertAiMention = useCallback(() => {
    const el = textareaRef.current;
    const value = text;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const insert = `${needsSpace ? " " : ""}@AI `;
    const next = `${before}${insert}${after}`;
    setText(next);
    // Fokus + kazalec za žetonom (naslednja slika — textarea se še rendra)
    requestAnimationFrame(() => {
      el?.focus();
      const pos = (before + insert).length;
      el?.setSelectionRange(pos, pos);
    });
  }, [text]);

  // === Objava sporočila (+ morebitno vprašanje @AI svetovalcu) ===
  const submitComment = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting || !shareId) return;

      const name = authorName.trim();
      const body = text.trim();
      const wantsAi = isAiMention(body);

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
          title: "Sporočilo je prekratko ali predolgo",
          description: `Sporočilo mora imeti med 2 in ${COMMENT_TEXT_MAX} znakov.`,
          variant: "destructive",
        });
        return;
      }

      setSubmitting(true);
      stickToBottomRef.current = true; // svoja vrstica → drs na dno
      try {
        // 1. Sporočilo se vedno objavi (vidno vsem — tudi če AI kasneje
        // odpove; iskrenost: napaka AI ne poje uporabnikovega sporočila).
        const res = await fetch("/api/trip-comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareId, authorName: name, text: body }),
        });
        const data: unknown = await res.json().catch(() => null);
        const d = data as { success?: unknown; comment?: unknown; error?: unknown } | null;

        if (!res.ok || d?.success !== true || !d?.comment) {
          const error = typeof d?.error === "string" ? d.error : null;
          throw new Error(error ?? `HTTP ${res.status}`);
        }

        const comment = d.comment as TripChatItem;
        appendLocal({
          id: comment.id,
          authorName: comment.authorName,
          text: comment.text,
          isAI: comment.isAI === true,
          payload: comment.payload ?? null,
          createdAt: comment.createdAt,
        });
        emitChatSignal(comment.id);
        setText("");

        // Prihrani ime za naslednje sporočilo (defenzivno — private mode
        // se mirno preskoči znotraj lib-a)
        saveAuthorName(name);

        if (!wantsAi) {
          toast({
            title: "Sporočilo je objavljeno",
            description: "Hvala, da deliš mnenje s skupino!",
          });
          return;
        }

        // 2. Vprašanje @AI — strežniški odgovor (isti pogon kot /api/chat).
        // Indikator tipkanja je LOKALEN (aiPending) — prisotni vidijo
        // vrstico prek svojega pollinga/chat:new.
        trackPlannerEvent("chat_group_ai_asked", {
          question_len: body.length,
          surface: "trip-chat",
        });
        try {
          await askAi(body);
          // Odgovor se doda prek appendLocal znotraj askAi — mehurček je
          // povratna informacija, toast bi bil odvečen.
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Poskusi znova.";
          toast({
            title: "AI svetovalec trenutno ne more odgovoriti",
            description: message,
            variant: "destructive",
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Poskusi znova.";
        toast({
          title: "Sporočila ni bilo mogoče objaviti",
          description: message,
          variant: "destructive",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, shareId, authorName, text, toast, appendLocal, emitChatSignal, askAi]
  );

  // === "Dodaj v pot" — ISTI kanon kot klepet "+" (čisti algoritem +
  // CAS PATCH deljene poti; AI samo PREDLAGA, človek odloča) ===
  const addPlaceToTrip = useCallback(
    async (place: ChatPlace) => {
      if (!shareId || addingPlaceId) return;
      if (!isValidChatPlace(place)) return;

      setAddingPlaceId(place.id);
      try {
        // 1. Sveža vsebina + verzija z strežnika (?warm=1 → NE šteje ogled).
        //    Zasebna pot: editToken glavo pošlje lastnikov brskalnik;
        //    prijavljeni uredniki gredo prek seje (isti kanon kot PDF).
        const token = getEditToken(shareId);
        const r = await fetch(
          `/api/itinerary/shared/${encodeURIComponent(shareId)}?warm=1`,
          {
            cache: "no-store",
            ...(token ? { headers: { "x-dsa-edit-token": token } } : {}),
          }
        );
        if (!r.ok) {
          throw new Error(
            r.status === 404
              ? "Pot ni javna ali ne obstaja."
              : `Napaka ${r.status} pri branju poti.`
          );
        }
        const data: unknown = await r.json().catch(() => null);
        const d = data as
          | { success?: unknown; itinerary?: unknown; contentVersion?: unknown }
          | null;
        const it = d?.itinerary as Itinerary | undefined;
        const version = d?.contentVersion;
        if (
          d?.success !== true ||
          !it ||
          !Array.isArray(it.days) ||
          it.days.length === 0 ||
          typeof version !== "number"
        ) {
          throw new Error("Pot ni bilo mogoče prebrati — poskusi znova.");
        }

        // 2. Čisti dodajalni algoritem (identičen klepetu "+" na /nacrtuj).
        const result = addChatPlaceToItinerary(it, place, { locale: "sl" });
        if (!result.ok) {
          if (result.reason === "duplicate") {
            setAddedPlaceIds((prev) => new Set(prev).add(place.id));
            toast({
              title: "Kraj je že v poti",
              description: `${place.name} je že načrtovan.`,
            });
            return;
          }
          // no-days / not-a-stop — iskrena meja brez ugibanja
          toast({
            title: "Kraja ni bilo mogoče dodati",
            description:
              result.reason === "not-a-stop"
                ? "Uradni vir je članek, ne fizični postanek."
                : "Pot nima dni, kamor bi dodali kraj.",
            variant: "destructive",
          });
          return;
        }

        // 3. CAS posodobitev na mestu (409 = sočasno urejanje — iskreno).
        await updateItinerary(shareId, result.itinerary, version);

        trackPlannerEvent("chat_group_place_added", {
          provenance: place.provenance,
          day: result.day,
          surface: "trip-chat",
        });

        setAddedPlaceIds((prev) => new Set(prev).add(place.id));
        toast({
          title: "Dodano v pot",
          description: `${place.name} je dodan v dan ${result.day}. Osvežujem stran …`,
        });
        // RSC stran /pot — celotna osvežitev pobere svežo vsebino (isti
        // vzorec kot obnova revizije v TripCollaboration).
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Poskusi znova.";
        toast({
          title: "Kraja ni bilo mogoče dodati v pot",
          description: message.includes("sočasno urejanje")
            ? "Pot je bila med tem spremenjena — poskusi znova."
            : message,
          variant: "destructive",
        });
      } finally {
        setAddingPlaceId(null);
      }
    },
    [shareId, addingPlaceId, toast]
  );

  const messageCountLabel = useMemo(() => {
    const n = comments.length;
    if (n === 0) return "Ni sporočil";
    return `${n} ${slUnit(n, "sporočilo", "sporočili", "sporočila", "sporočil")}`;
  }, [comments.length]);

  return (
    <section
      aria-label="Skupinski klepet in všečki"
      className="print-hide print:hidden"
    >
      <Card className="border-border/60">
        <CardContent className="p-4 sm:p-6">
          {/* === Naslov odseka + živost + števec === */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
              <MessageCircle
                className="size-5 text-primary"
                aria-hidden="true"
              />
              Skupinski klepet
            </h2>
            <div className="flex items-center gap-2">
              {/* Iskren indikator živosti: socket je KOZMETIČNA pospešitev
                  nad pollingom — prazen prostor ne laže. */}
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  connected
                    ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700"
                    : "border-border/70 bg-muted/50 text-muted-foreground"
                )}
                aria-live="polite"
              >
                {connected ? (
                  <>
                    <span
                      className="size-1.5 rounded-full bg-emerald-600 motion-safe:animate-pulse"
                      aria-hidden="true"
                    />
                    v živo
                  </>
                ) : (
                  "osveževanje vsakih 6 s"
                )}
              </span>
              <span className="text-sm text-muted-foreground">
                {messageCountLabel}
              </span>
            </div>
          </div>

          {/* === Všeček (srček) — nespremenjena P1-2a funkcija === */}
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

          {/* === @AI pas — vzorec W9 (povedano je točno to, kar se zgodi) === */}
          <div className="flex items-start gap-2.5 border-b border-border py-3">
            <span
              className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <Bot className="size-4" />
            </span>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Omeni <strong className="font-semibold text-foreground">@AI</strong> v
              sporočilu in vprašaj npr.{" "}
              <em className="italic">
                »@AI kje lahko večerjamo v Bledu?«
              </em>{" "}
              — svetovalec odgovarja vsem v klepetu, iz podatkov platforme
              (deterministično, z viri). Predlagane kraje doda v pot tisti, ki
              ureja pot.
            </p>
          </div>

          {/* === Klepet — kronološki seznam z drsom === */}
          <div
            ref={scrollRef}
            className="scroll-area-custom mt-4 max-h-96 space-y-4 overflow-y-auto pr-2"
            aria-label="Zgodovina klepeta"
          >
            {comments.length === 0 && !aiPending ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <MessageCircle
                  className="size-8 text-muted-foreground/50"
                  aria-hidden="true"
                />
                <p className="text-sm text-muted-foreground">
                  Trenutno ni sporočil — bodi prvi!
                </p>
                <p className="max-w-md text-xs text-muted-foreground/70">
                  Deli mnenje, se dogovori za termin (»vidimo se ob 9h pred
                  jezerom«) ali vprašaj <strong>@AI</strong> svetovalca.
                </p>
              </div>
            ) : (
              <ul className="space-y-4" aria-live="polite" aria-atomic="false">
                {comments.map((c) => {
                  // AI vrstica — značka je strežniška (isAI), prilogo
                  // (predlogi/viri) klient znova validira (parseAiPayload).
                  const aiPayload =
                    c.isAI && c.payload ? parseAiPayload(c.payload) : null;
                  return (
                    <li key={c.id} className="flex gap-3">
                      {c.isAI ? (
                        // AI avatar — enoten, primarni (nikoli barva po imenu)
                        <div
                          className="flex size-9 shrink-0 select-none items-center justify-center rounded-full bg-primary text-primary-foreground"
                          aria-hidden="true"
                        >
                          <Bot className="size-4" />
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "flex size-9 shrink-0 select-none items-center justify-center rounded-full text-sm font-bold text-white",
                            avatarColor(c.authorName)
                          )}
                          aria-hidden="true"
                        >
                          {nameInitial(c.authorName)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          {c.isAI ? (
                            <>
                              <span className="font-semibold text-primary">
                                {AI_ADVISOR_NAME}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                <Sparkles className="size-2.5" aria-hidden="true" />
                                deterministično · iz podatkov platforme
                              </span>
                            </>
                          ) : (
                            <span className="font-medium">{c.authorName}</span>
                          )}
                          <time
                            dateTime={c.createdAt}
                            className="text-xs text-muted-foreground"
                          >
                            {mounted ? slTimeAgo(c.createdAt, createdAt) : "…"}
                          </time>
                        </p>
                        <p
                          className={cn(
                            "mt-1 break-words whitespace-pre-line text-sm text-foreground",
                            c.isAI &&
                              "rounded-2xl rounded-tl-sm border border-primary/20 bg-primary/5 px-3.5 py-2.5"
                          )}
                        >
                          {c.text}
                        </p>

                        {/* AI PREDLOGI KRAJEV — gumb "Dodaj v pot" (isti
                            kanon kot klepet "+"); AI samo predlaga. */}
                        {aiPayload && aiPayload.places.length > 0 ? (
                          <ul className="mt-2 space-y-1.5" aria-label="Predlogi krajev AI svetovalca">
                            {aiPayload.places.map((place) => (
                              <PlaceSuggestion
                                key={place.id}
                                place={place}
                                added={addedPlaceIds.has(place.id)}
                                pending={addingPlaceId === place.id}
                                onAdd={(p) => void addPlaceToTrip(p)}
                              />
                            ))}
                          </ul>
                        ) : null}

                        {/* Citati uradnih virov STO (T2) — isti vzorec
                            značk kot osebni klepet. */}
                        {aiPayload && aiPayload.sources.length > 0 ? (
                          <div className="mt-2 border-t border-border/60 pt-2">
                            <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              <Landmark className="size-3" aria-hidden="true" />
                              Uradni viri
                            </p>
                            <ul className="space-y-1.5">
                              {aiPayload.sources.map(
                                (s: StoCitation) => (
                                  <li
                                    key={s.url}
                                    className="min-w-0"
                                  >
                                    {/* BLOCK + break-words (NE truncate): nowrap
                                        bi razširil intrinsično širino flex
                                        itema (635px preliv na 375); naslov
                                        vira se POŠTENO prelomi v novo vrstico
                                        (cel naslov viden — provenance). */}
                                    <a
                                      href={s.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block max-w-full break-words rounded-md bg-background px-2 py-1 text-[11px] font-medium text-foreground underline decoration-border underline-offset-2 transition-colors hover:decoration-primary"
                                      title={`${s.title} — slovenia.info`}
                                    >
                                      {s.title}
                                    </a>
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}

                {/* Indikator tipkanja AI — LOKALEN (vidi ga vpraševalec,
                    dokler strežnik ne izstavi vrstice). */}
                {aiPending ? (
                  <li className="flex gap-3" aria-live="polite">
                    <div
                      className="flex size-9 shrink-0 select-none items-center justify-center rounded-full bg-primary text-primary-foreground"
                      aria-hidden="true"
                    >
                      <Bot className="size-4" />
                    </div>
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-primary/20 bg-primary/5 px-3.5 py-2.5">
                      <span className="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:0ms]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:150ms]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:300ms]" />
                      <span className="ml-1 text-xs text-muted-foreground">
                        {AI_ADVISOR_NAME} piše …
                      </span>
                    </div>
                  </li>
                ) : null}
              </ul>
            )}
          </div>

          {/* === Obrazec za novo sporočilo === */}
          <form
            onSubmit={(e) => void submitComment(e)}
            className="space-y-3 border-t border-border pt-4"
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
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Deli mnenje z družino in prijatelji … ali vprašaj @AI"
              required
              maxLength={COMMENT_TEXT_MAX}
              rows={3}
              aria-label="Sporočilo v skupinski klepet"
              className="min-h-[88px] resize-y"
              disabled={submitting}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 px-2.5 text-xs"
                  onClick={insertAiMention}
                  disabled={submitting}
                  aria-label="Vstavi omembo @AI svetovalca v sporočilo"
                  title="Vstavi @AI — svetovalec bo odgovoril v klepetu"
                >
                  <Bot className="size-3.5 text-primary" aria-hidden="true" />
                  @AI
                </Button>
                <span className="text-xs text-muted-foreground">
                  {text.length}/{COMMENT_TEXT_MAX}
                </span>
              </div>
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
                    Pošiljam…
                  </>
                ) : (
                  <>
                    <Send className="size-4" aria-hidden="true" />
                    Pošlji
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

export default TripSocial;
