"use client";

// ============================================================================
// W7 — VOICE VODIČ V GO MODE: gumb z izgovorom (Issue #15, val V2)
// ============================================================================
// En gumb — dve pripovedi (ista mehanika, dva vira skripta):
//   · »Preberi postanek« (kind "stop") — skript iz buildStopNarration
//     (NASLEDNJE kartica + preostali postanki dneva);
//   · »Kaj je v bližini« (kind "nearby") — skript iz buildNearbyNarration
//     (GPS kartica; SAMO kadar ima uporabnik živi položaj).
//
// PREDVAJANJE = vzorec DayAudioButton (TASK 89/91, ISSUE #9 ZERO-AI):
//   idle → izgovori PO KOSIH (chunkNarration ≤ 960 znakov po stavčnih
//   mejah — sinteza na nekaterih platformah TIHO poreže dolge izgovore);
//   playing → ustavi (speechSynthesis.cancel — stop je stop);
//   napaka → iskrena opomba (role=alert), Go Mode dela naprej;
//   brez speechSynthesis → DOSTOPEN TEKSTOVNI PADEC (gumb pokaže
//   pripoved namesto zvoka — vsebina NE izgine).
//
// Telemetrija: OBSTOJEČI dogodek itinerary_audio_play (whitelist
// nedotaknjena — 0 novih imen; vzorec W4 »hero-seasonal« surface) z NOVO
// vrednostjo surface "go" + kind stop|nearby (doseg W7).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Square, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GO_AUDIO_LABELS } from "@/lib/journey/go-audio";
import { chunkNarration } from "@/lib/itinerary-audio";
import { speechLanguageTag, ttsSupported } from "@/lib/voice";
import { trackPlannerEvent } from "@/lib/planner-analytics";

export interface GoAudioButtonProps {
  /** Pripoved za izgovor (buildStopNarration / buildNearbyNarration) —
   *  null → gumba NI (fail-closed, iskrena odsotnost). */
  script: string | null;
  lang: "sl" | "en";
  /** "stop" (kartica postanka) | "nearby" (GPS kartica). */
  kind: "stop" | "nearby";
  /** Naslov postanka (za ARIA + telemetrijo; nearby ga ne rabi). */
  title?: string;
  /** Samo ikona (preostali postanki) ali čip z besedilom. */
  iconOnly?: boolean;
  className?: string;
}

export function GoAudioButton({
  script,
  lang,
  kind,
  title,
  iconOnly = false,
  className,
}: GoAudioButtonProps) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [showScript, setShowScript] = useState(false);
  /** Podpora TTS po hidrataciji (SSR null — isti vzorec chatbota). */
  const [speechOut, setSpeechOut] = useState<boolean | null>(null);
  /** Seja predvajanja: cancel/stop razveljavi čakajoče kose. */
  const sessionRef = useRef(0);

  const L = GO_AUDIO_LABELS[lang];

  // Fail-closed: brez uporabne pripovedi → brez gumba (0 lažnih gumbov).
  const available = script !== null && script !== "";

  // Podpora + počisti govor ob umiku (ista disciplina kot DayAudioButton).
  useEffect(() => {
    const t = setTimeout(() => setSpeechOut(ttsSupported()), 0);
    return () => {
      clearTimeout(t);
      sessionRef.current += 1;
      if (ttsSupported()) window.speechSynthesis.cancel();
    };
  }, []);

  const stopPlayback = useCallback(() => {
    sessionRef.current += 1;
    if (ttsSupported()) window.speechSynthesis.cancel();
    setPlaying(false);
  }, []);

  const startPlayback = useCallback(
    (text: string) => {
      if (!ttsSupported() || !text) return;
      window.speechSynthesis.cancel(); // en govor naenkrat
      const chunks = chunkNarration(text);
      if (chunks.length === 0) return;
      const session = ++sessionRef.current;
      const speakNext = (i: number) => {
        if (session !== sessionRef.current) return;
        if (i >= chunks.length) {
          setPlaying(false);
          return;
        }
        const utterance = new SpeechSynthesisUtterance(chunks[i]);
        utterance.lang = speechLanguageTag(lang); // sl → sl-SI, en → en-US
        utterance.rate = 1;
        utterance.onend = () => speakNext(i + 1);
        utterance.onerror = () => {
          if (session !== sessionRef.current) return;
          setError(true);
          setPlaying(false);
        };
        window.speechSynthesis.speak(utterance);
      };
      speakNext(0);
      setPlaying(true);

      // Telemetrija: obstoječi dogodek (whitelist NE-dotaknjena), nova
      // surface "go" + kind — doseg W7 glasovnega vodika.
      trackPlannerEvent("itinerary_audio_play", {
        surface: "go",
        kind,
        ...(kind === "stop" && title ? { title } : {}),
        lang,
        engine: "browser-speech-synthesis",
      });
    },
    [lang, kind, title]
  );

  const handleClick = useCallback(() => {
    if (!script) return;
    if (playing) {
      stopPlayback(); // toggle — tipka je isto dejanje uporabnika
      return;
    }
    setError(false);
    startPlayback(script);
  }, [script, playing, startPlayback, stopPlayback]);

  if (!available) return null;

  const ariaLabel =
    kind === "stop"
      ? playing
        ? L.stopPlaybackAria(title ?? "")
        : L.readStopAria(title ?? "")
      : playing
        ? L.stopNearby
        : L.nearbyAria;

  // Brskalnik brez govorne sinteze → DOSTOPEN TEKSTOVNI PADEC (vzorec
  // TASK 89: vsebina ostane dosegljiva, zvok se ne posnema).
  if (speechOut === false) {
    const textId = `go-script-${kind}-${title ?? "nearby"}`;
    return (
      <div className={className}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 gap-1.5 rounded-full text-xs font-medium print:hidden"
          onClick={() => setShowScript((v) => !v)}
          aria-expanded={showScript}
          aria-controls={textId}
        >
          {showScript ? (
            <EyeOff className="size-3.5" aria-hidden="true" />
          ) : (
            <Eye className="size-3.5" aria-hidden="true" />
          )}
          {!iconOnly && <span>{showScript ? L.hideText : L.showText}</span>}
        </Button>
        {showScript && (
          <p
            id={textId}
            className="mt-1 max-w-prose rounded-md border bg-muted/50 p-2 text-xs text-foreground print:hidden"
          >
            <span className="block text-muted-foreground">
              {L.voiceUnavailable}
            </span>
            {script}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={
          iconOnly
            ? "h-11 w-11 shrink-0 rounded-full p-0 print:hidden"
            : "h-11 gap-1.5 rounded-full text-xs font-medium print:hidden"
        }
        onClick={handleClick}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        {playing ? (
          <Square className="size-3 fill-current" aria-hidden="true" />
        ) : (
          <Volume2 className="size-3.5" aria-hidden="true" />
        )}
        {!iconOnly && (
          <span>
            {playing
              ? kind === "stop"
                ? L.stopPlayback
                : L.stopNearby
              : kind === "stop"
                ? L.readStop
                : L.nearby}
          </span>
        )}
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-muted-foreground print:hidden">
          {L.error}
        </p>
      )}
    </div>
  );
}
