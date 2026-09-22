"use client";

// ============================================================================
// TASK 89 — ZVOČNI POVZETEK DNEVA: gumb »Poslušaj« (1.80.0)
// ============================================================================
//
// DayAudioButton se izriše v glavi vsakega dneva z uporabnimi postanki
// (TripTimeline — rezultati načrtovalnika sl/en; SharedTrip — javni
// deljeni načrt, sl-only). Klik:
//
//   idle → POST /api/tts (strukturirani podatki dneva) → blob → predvajaj
//   playing → ustavi
//   napaka → iskrena opomba (role=alert) — časovnica poti dela naprej
//
// Klientni predpomnilnik blob URL-jev po istem ključu kot strežniški LRU
// (narrationCacheKey — ista čista lib): ponovno poslušanje istega dneva
// NE povzroči nove zahteve. Poganjanje: HTMLAudioElement (brez vizualnega
// plejerja — dan je kratek poslušalni povzetek, ne glasbeni predvajalnik).
//
// ISKRENOST: gumb se NE izriše, če dan nima uporabnih postankov
// (fail-closed na obeh koncih — prav tako /api/tts zavrne). Loading je
// viden (TTS traja merjeno 2–12 s), odpoved je jasna, ne tiha.
// print:hidden — natisnjen dokument ostane dejstva, ne zvok.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NARRATION_LABELS,
  narrationCacheKey,
  type NarrationStopInput,
  type NarrationLang,
} from "@/lib/itinerary-audio";
import { trackPlannerEvent } from "@/lib/planner-analytics";

// ── Klientni predpomnilnik blob URL-jev (LRU, cap 12 dni) ─────────────────

interface CachedAudio {
  url: string;
  at: number;
}

const BLOB_CACHE_MAX = 12;
const blobCache = new Map<string, CachedAudio>(); // insertion order = LRU

function cachedUrlFor(key: string): string | null {
  const hit = blobCache.get(key);
  if (!hit) return null;
  blobCache.delete(key);
  blobCache.set(key, hit); // osveži LRU pozicijo
  return hit.url;
}

function rememberBlob(key: string, url: string): void {
  if (blobCache.has(key)) {
    const old = blobCache.get(key)!;
    blobCache.delete(key);
    URL.revokeObjectURL(old.url);
  }
  blobCache.set(key, { url, at: Date.now() });
  while (blobCache.size > BLOB_CACHE_MAX) {
    const oldestKey = blobCache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    const evicted = blobCache.get(oldestKey);
    blobCache.delete(oldestKey);
    if (evicted) URL.revokeObjectURL(evicted.url);
  }
}

// ── Gumb ──────────────────────────────────────────────────────────────────

type AudioState = "idle" | "loading" | "playing";

export interface DayAudioButtonProps {
  dayNumber: number;
  /** Lokaliziran datum dneva (npr. „četrtek, 24. septembra") ali null. */
  dateLabel?: string | null;
  /** Postanki dneva (preslikani iz day.locations — narrationStopsFromDay). */
  stops: ReadonlyArray<NarrationStopInput>;
  lang: NarrationLang;
  /** Površina za analitiko: planner | shared | mytrip (TASK 91). */
  surface: "planner" | "shared" | "mytrip";
  className?: string;
}

export function DayAudioButton({
  dayNumber,
  dateLabel,
  stops,
  lang,
  surface,
  className,
}: DayAudioButtonProps) {
  const [state, setState] = useState<AudioState>("idle");
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Blob URL, ki ga JE ustvaril ta gumb (za počistenje ob unmountu). */
  const ownUrlRef = useRef<string | null>(null);
  /** Ključ za katerega teče trenutno stanje (zastareli odgovori ne štejejo). */
  const requestKeyRef = useRef<string | null>(null);

  const L = NARRATION_LABELS[lang];
  // Fail-closed: dan brez uporabnih postankov → brez gumba (0 lažnih gumbov).
  const usableStops = stops.filter(
    (s) => typeof s.name === "string" && s.name.trim() !== ""
  );
  const cacheKey = narrationCacheKey(
    { dayNumber, dateLabel: dateLabel ?? null, stops: usableStops },
    lang
  );
  const available = usableStops.length > 0;

  // Ustavi predvajanje ob odhodu s strani (ne predvajaj v prazno).
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      // Blob ostaja v modulnem predpomnilniku (deli se med dnevi/gumbi);
      // počisti se ob LRU izmetu — tukaj le ustavimo predvajanje.
    };
  }, []);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setState("idle");
  }, []);

  const startPlayback = useCallback(
    (url: string) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.addEventListener("ended", () => {
        if (audioRef.current === audio) audioRef.current = null;
        setState("idle");
      });
      audio.addEventListener("error", () => {
        if (audioRef.current === audio) audioRef.current = null;
        setState("idle");
        setError(true);
      });
      void audio.play().catch(() => {
        // Avtopredvajanje blokirano / kodek — iskrena napaka.
        if (audioRef.current === audio) audioRef.current = null;
        setState("idle");
        setError(true);
      });
      setState("playing");
    },
    []
  );

  const handleClick = useCallback(async () => {
    // Ustavi, če že predvaja (toggle — tipka je isto dejanje uporabnika).
    if (state === "playing") {
      stopPlayback();
      return;
    }
    if (state === "loading") return; // klik med nalaganjem ne restarta

    setError(false);
    setState("loading");
    requestKeyRef.current = cacheKey;

    // 1) Klientni predpomnilnik — 0 zahtev.
    const cached = cachedUrlFor(cacheKey);
    if (cached) {
      startPlayback(cached);
      return;
    }

    // 2) Strežniška generacija iz strukturiranih podatkov dneva.
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang,
          day: {
            dayNumber,
            dateLabel: dateLabel ?? null,
            stops: usableStops,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (blob.size === 0) throw new Error("prazen odgovor");

      // Zastareli odgovor (dan se je med nalaganjem spremenil) → ne
      // predvajaj neveljavnega zvoka.
      if (requestKeyRef.current !== cacheKey) return;

      const url = URL.createObjectURL(blob);
      ownUrlRef.current = url;
      rememberBlob(cacheKey, url);
      startPlayback(url);

      // Analitika: uspešen začetek poslušanja (enkrat na klik).
      trackPlannerEvent("itinerary_audio_play", {
        day: dayNumber,
        lang,
        surface,
        bytes: blob.size,
      });
    } catch {
      if (requestKeyRef.current !== cacheKey) return;
      setState("idle");
      setError(true);
    }
  }, [
    state,
    cacheKey,
    lang,
    dayNumber,
    dateLabel,
    usableStops,
    startPlayback,
    stopPlayback,
  ]);

  if (!available) return null;

  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 rounded-full text-xs font-medium print:hidden"
        onClick={() => void handleClick()}
        aria-label={
          state === "playing"
            ? L.stopButtonAria(dayNumber)
            : L.buttonAria(dayNumber)
        }
        disabled={state === "loading"}
      >
        {state === "loading" ? (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            <span className="hidden sm:inline">{L.loading}</span>
            <span className="sr-only">{L.buttonAria(dayNumber)}</span>
          </>
        ) : state === "playing" ? (
          <>
            <Square className="size-3 fill-current" aria-hidden="true" />
            <span>{L.stopButton}</span>
          </>
        ) : (
          <>
            <Volume2 className="size-3.5" aria-hidden="true" />
            <span>{L.button}</span>
          </>
        )}
      </Button>
      {error && (
        <p
          role="alert"
          className="mt-1 text-xs text-muted-foreground print:hidden"
        >
          {L.error}
        </p>
      )}
    </div>
  );
}
