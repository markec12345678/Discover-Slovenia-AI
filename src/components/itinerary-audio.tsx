"use client";

// ============================================================================
// ISSUE #9 / GROUP C — ZVOČNI POVZETEK DNEVA: BRKALNIŠKI TTS (ZERO-AI)
// ============================================================================
//
// DayAudioButton se izriše v glavi vsakega dneva z uporabnimi postanki
// (TripTimeline — rezultati načrtovalnika sl/en; SharedTrip — javni
// deljeni načrt sl-only; JourneyTrip/MY TRIP — TASK 91).
//
// ISSUE #9 (ZERO-AI/deterministic-first): strežniški TTS (obe ruti za
// zvočni povzetek + skupno jedro tts-engine) je ODSTRANJEN. Isto pripoved
// povedo BRKALNIŠKI GLAS (Web Speech API — window.speechSynthesis), enako
// kot glasovni klepet chatbota (Issue #2 §7):
//
//   idle    → zgradi skript NA KLIENTU (ista čista lib funkcija) → izgovori
//   playing → ustavi (speechSynthesis.cancel)
//   napaka  → iskrena opomba (role=alert) — časovnica poti dela naprej
//
// DOLGI skripti se izgovorijo PO KOSIH (chunkNarration — ≤ 960 znakov po
// stavčnih mejah, 0 izgube vsebine): sinteza na nekaterih platformah
// (Chrome/Android, Safari) TIHO poreže posamezne dolge izgovore — razrez
// po stavkih + zaporedna vrsta izgovorov poskrbi, da se povede CELA
// pripoved (ZERO FEATURE LOSS glede na nekdanjo strežniško pot, ki je
// razrezala po isti funkciji).
//
// ISKRENOST:
//  - skript pripovedi je 100 % determinističen (buildDayNarrationScript iz
//    čiste lib plasti — 0 omrežja, 0 AI žetonov, 0 podatkov na strežnik);
//  - dan brez uporabnih postankov → gumb se NE izriše (fail-closed);
//  - brskalnik brez speechSynthesis → dostopen tekstovni padec (gumb
//    »Prikaži besedilo« pokaže pripoved namesto zvoka — vsebina NE izgine);
//  - print:hidden — natisnjen dokument ostane dejstva, ne zvok.
//
// Nove UI vrstice (i18n ključi za prihodnjo selitev v src/i18n/messages —
// src/i18n/** je v tem nalogi nerazmerljiv, zato živijo tu po vzorcu
// NARRATION_LABELS, en vir resnice na jezik):
//   audio.showScript      SL "Prikaži besedilo"               EN "Show text"
//   audio.hideScript      SL "Skrij besedilo"                  EN "Hide text"
//   audio.voiceUnavailable SL "Računalniški glas ni na voljo — besedilo je
//                             prikazano spodaj."
//                          EN "Computer voice unavailable — the text is
//                              shown below."
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NARRATION_LABELS,
  buildDayNarrationScript,
  chunkNarration,
  type NarrationStopInput,
  type NarrationLang,
} from "@/lib/itinerary-audio";
import { speechLanguageTag, ttsSupported } from "@/lib/voice";
import { trackPlannerEvent } from "@/lib/planner-analytics";

// ── Tekstovni padec (brskalnik brez govorne sinteze) ──────────────────────
// (isti dvojezični vzorec kot NARRATION_LABELS v lib plasti)

const SCRIPT_FALLBACK_LABELS: Record<
  NarrationLang,
  { show: string; hide: string; voiceUnavailable: string }
> = {
  sl: {
    show: "Prikaži besedilo",
    hide: "Skrij besedilo",
    voiceUnavailable:
      "Računalniški glas ni na voljo — besedilo je prikazano spodaj.",
  },
  en: {
    show: "Show text",
    hide: "Hide text",
    voiceUnavailable:
      "Computer voice unavailable — the text is shown below.",
  },
};

// ── Gumb ──────────────────────────────────────────────────────────────────

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
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [showScript, setShowScript] = useState(false);
  /**
   * Podpora govorne sinteze se preverja PO hidrataciji (server=false,
   * klient=true bi bil hydration mismatch — isti vzorec kot chatbot).
   * null = še neznano (SSR/prvi render → zvok, dokler ni dokazano drugače).
   */
  const [speechOut, setSpeechOut] = useState<boolean | null>(null);
  /** Skript trenutno predvajanja (zastareli odgovori ne štejejo). */
  const spokenScriptRef = useRef<string | null>(null);
  /** Seja predvajanja: cancel/stop razveljavi vse čakajoče kose (onend
   *  zastarega kosa NE sme sprožiti naslednjega — sicer bi »Ustavi«
   *  nadaljeval z branjem). */
  const sessionRef = useRef(0);

  const L = NARRATION_LABELS[lang];
  const F = SCRIPT_FALLBACK_LABELS[lang];

  // Skript zgradi KLIENT iz strukturiranih podatkov dneva — ISTA čista
  // funkcija, ki jo je prej pognal strežnik (0 omrežja, 0 AI).
  const script = buildDayNarrationScript(
    { dayNumber, dateLabel: dateLabel ?? null, stops },
    lang
  );
  // Fail-closed: dan brez uporabnih postankov → brez gumba (0 lažnih gumbov).
  const available = script !== null && script !== "";

  // Podpora + počisti govor ob odhodu s strani (ne predvajaj v prazno).
  // setSpeechOut teče v mikrotasku (reakta pravilo: NE klicati setState
  // sinhrono v efektu) — enak vzorec feature-detekcije kot chatbot.tsx.
  useEffect(() => {
    const t = setTimeout(() => setSpeechOut(ttsSupported()), 0);
    return () => {
      clearTimeout(t);
      sessionRef.current += 1; // umik s strani razveljavi sejo
      if (ttsSupported()) window.speechSynthesis.cancel();
    };
  }, []);

  const stopPlayback = useCallback(() => {
    sessionRef.current += 1; // v tekoči kosi → onend/onerror tiho končajo
    if (ttsSupported()) window.speechSynthesis.cancel();
    spokenScriptRef.current = null;
    setPlaying(false);
  }, []);

  const startPlayback = useCallback(
    (text: string) => {
      if (!ttsSupported() || !text) return;
      // Vsak nov začetek prekine morebitnega prejšnjega (ista disciplina
      // kot glasovni klepet — en govor naenkrat).
      window.speechSynthesis.cancel();
      // Razrez na kose po stavčnih mejah (ista čista funkcija kot nekdajna
      // strežniška pot): posamezen izgovor ostane kratek, dolga pripoved
      // se izgovori V CELOTI po zaporednih izgovorih — brez tihih rezov.
      const chunks = chunkNarration(text);
      if (chunks.length === 0) return;
      const session = ++sessionRef.current;
      const speakNext = (i: number) => {
        // Ustavljen/nadomeščen predvajalni sejo → tiho končaj (stop je stop).
        if (session !== sessionRef.current) return;
        if (i >= chunks.length) {
          spokenScriptRef.current = null;
          setPlaying(false);
          return;
        }
        const utterance = new SpeechSynthesisUtterance(chunks[i]);
        utterance.lang = speechLanguageTag(lang); // sl → sl-SI, en → en-US
        utterance.rate = 1;
        utterance.onend = () => speakNext(i + 1);
        utterance.onerror = () => {
          if (session !== sessionRef.current) return;
          // Iskrenost: prekinitev (cancel) NI napaka uporabnika — napako
          // pokažemo samo, če zaposnjeni skript NI bil nadomeščen z novim.
          if (spokenScriptRef.current === text) setError(true);
          spokenScriptRef.current = null;
          setPlaying(false);
        };
        window.speechSynthesis.speak(utterance);
      };
      spokenScriptRef.current = text;
      speakNext(0);
      setPlaying(true);

      // Analitika: uspešen začetek poslušanja (enkrat na klik).
      trackPlannerEvent("itinerary_audio_play", {
        day: dayNumber,
        lang,
        surface,
        engine: "browser-speech-synthesis",
      });
    },
    [lang, dayNumber, surface]
  );

  const handleClick = useCallback(() => {
    if (!script) return;
    // Ustavi, če že predvaja (toggle — tipka je isto dejanje uporabnika).
    if (playing) {
      stopPlayback();
      return;
    }
    setError(false);
    startPlayback(script);
  }, [script, playing, startPlayback, stopPlayback]);

  if (!available) return null;

  // Brskalnik brez govorne sinteze → DOSTOPEN TEKSTOVNI PADEC: gumb
  // preklopi prikaz pripovedi (vsebina ostane dosegljiva, ne izgine).
  if (speechOut === false) {
    return (
      <div className={className}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-full text-xs font-medium print:hidden"
          onClick={() => setShowScript((v) => !v)}
          aria-expanded={showScript}
          aria-controls={`day-script-${dayNumber}`}
        >
          {showScript ? (
            <EyeOff className="size-3.5" aria-hidden="true" />
          ) : (
            <Eye className="size-3.5" aria-hidden="true" />
          )}
          <span>{showScript ? F.hide : F.show}</span>
        </Button>
        {showScript && (
          <p
            id={`day-script-${dayNumber}`}
            className="mt-1 max-w-prose rounded-md border bg-muted/50 p-2 text-xs text-foreground print:hidden"
          >
            <span className="block text-muted-foreground">
              {F.voiceUnavailable}
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
        className="h-8 gap-1.5 rounded-full text-xs font-medium print:hidden"
        onClick={handleClick}
        aria-label={
          playing ? L.stopButtonAria(dayNumber) : L.buttonAria(dayNumber)
        }
      >
        {playing ? (
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
