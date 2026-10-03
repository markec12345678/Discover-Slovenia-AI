// ============================================================================
// TASK 64 — GO MODE GPS HOOK: navigator.geolocation.watchPosition (1.64.0)
// ============================================================================
// Prva uporaba Geolocation API-ja v projektu. Živi SAMO na klientu
// (hook — klipe se iz "use client" komponente; SSR varno prek tipa
// navigator guard). NE shranjuje sledi — položaj živi v pomnilniku seje.
//
// Iskrenost: status je vedno ena od realnih stanj API-ja (active/denied/
// unavailable/error) — NIKOLI ne lažemo, da imamo položaj, ko ga ni.
//
// ISSUE #21 §6 (1.159.0) — profesionalni GPS življenjski cikel:
//  - EN sam samodejni ponovni poskus po PREHODNI napaki (timeout/signal),
//    ne po zavrnitvi dovoljenja (denied = uporabnikova izrecna izbira) in
//    ne v zanki (en poskus, potem iskreno stanje error + gumb);
//  - uspešna fiksacija ponastavi proračun ponovitve;
//  - stop()/unmount počistita TUDI časovnik ponovitve (0 lukenj);
//  - starost fiksacije (zastarelost) je čista izpeljava v travel-state.ts
//    (positionAgeMs/isPositionStale) — hook samo nosi timestamp.
//
// ISSUE #24 Sklop 10 (1.172.0) — PRILAGODLJIVA NATANČNOST (baterija,
// Polarsteps <4 %/dan): klicnik poda `mode` ("high" = enableHighAccuracy
// true — kanonsko vedenje; "balanced" = mrežni približki daleč stran).
// Sprememba načina PONOVNO ODPRE watch z novimi možnostmi BREZ utripanja
// stanja (status/position ostaneta — samo izmenjava zajemanja) in BREZ
// ponastavitve proračuna ponovitve (sprememba načina ni napaka). Geofence
// prihodi ostanejo varni: resolucija načina (gps-power.ts) je čista
// projekcija razdalje do naslednjega postanka — »high« je zagotovljen
// že 2 km pred pragom prihoda (≤ 150 m + histereza).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

import type { GpsPowerMode } from "./gps-power";
import type { GoPosition } from "./go-view";

export type GeoStatus =
  | "idle" // GPS ni vklopljen (uporabnik ga še ni zagnal)
  | "requesting" // čakamo prvo fiksacijo
  | "active" // watchPosition živi, položaj je
  | "denied" // uporabnik je zavrnil dovoljenje
  | "unavailable" // naprava/brskalnik nima Geolocation API-ja
  | "error"; // timeout / sporočilo napake

/** Zakasnitev samodejne ponovitve po prehodni napaki (ISSUE #21 §6). */
const RETRY_DELAY_MS = 4_000;

/** Možnosti hooka (ISSUE #24 Sklop 10 — prilagodljiva natančnost). */
export interface UseGeolocationOptions {
  /** Način zajemanja (default "high" — kanonsko vedenje, kompatibilnost
   *  z obstoječimi klicniki/testi). Sprememba ponovno odpre watch z novim
   *  enableHighAccuracy — brez izgube položaja in brez utripanja stanja. */
  mode?: GpsPowerMode;
}

export interface UseGeolocationResult {
  position: GoPosition | null;
  status: GeoStatus;
  /** Surovo sporočilo napake (za prikaz pošteno kot ± tehnično). */
  errorMessage: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * Živi GPS položaj za Go Mode. start() odpre watchPosition (visoka
 * natančnost, sveže vsaj 30 s), stop() ga zapre. Samodejni cleanup ob
 * unmount. Večkraten start() brez učinka (en watch). Po prehodni napaki
 * (ne zavrnitvi) EN sam samodejni ponovni poskus po 4 s — nato iskreno
 * stanje error (gumb Vklopi GPS ostane edina pot naprej).
 *
 * ISSUE #24 Sklop 10 (1.172.0): `opts.mode` upravlja natančnost — glej
 * glavo datoteke. Preklop načina med vožnjo je NEVIDEN uporabniku
 * (status in položaj se ne brišejo; samo izmenjava zajemanja).
 */
export function useGeolocation(
  opts?: UseGeolocationOptions
): UseGeolocationResult {
  const [position, setPosition] = useState<GoPosition | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriedRef = useRef(false);
  // Trenutni način zajemanja (ref — beginWatch bere ZVEK najnovejšega;
  // default "high" ohranja kanonsko vedenje za obstoječe klicnike).
  const modeRef = useRef<GpsPowerMode>(opts?.mode ?? "high");
  // Zrcalo položaja (ref — preklop načina bere VEDNO svežo vrednost,
  // brez tveganja zastarelega closure-a v efektku odvisnosti [opts?.mode]).
  const positionRef = useRef<GoPosition | null>(null);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      try {
        navigator.geolocation.clearWatch(watchIdRef.current);
      } catch {
        // neblokirajoče
      }
      watchIdRef.current = null;
    }
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current != null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const beginWatchRef = useRef<
    (openOpts?: { keepActiveStatus?: boolean }) => void
  >(() => {
    // nadomeščen v efektu (ref indirekcija — rekurzija v useCallback
    // bi ranila react-hooks/immutability); klic pred prvim efektom je
    // nemogoč (časovnik ponovitve ≥ 4 s po mountu).
  });

  const beginWatch = useCallback(
    (openOpts?: { keepActiveStatus?: boolean }) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    if (watchIdRef.current != null) return; // že aktivno
    // ISSUE #24 Sklop 10: preklop načina med ODPRTIM zajemanjem ne utripa
    // statusa — če fiksacijo ŽE imamo (zrcalo ref, vedno sveže), status
    // ostane "active" (iskreno: položaj je, samo izmenjava zajemanja);
    // sicer "requesting" (prva fiksacija še prihaja — ročni zagon #21).
    setStatus(
      openOpts?.keepActiveStatus && positionRef.current != null
        ? "active"
        : "requesting"
    );
    setErrorMessage(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        // Uspešna fiksacija — ponovno odpre proračun ponovitve (naslednja
        // prehodna napaka spet dobi en sam poskus; §6 brez neskončne zanke).
        retriedRef.current = false;
        const next: GoPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ...(Number.isFinite(pos.coords.accuracy)
            ? { accuracyM: pos.coords.accuracy }
            : {}),
          timestamp: pos.timestamp,
        };
        positionRef.current = next; // zrcalo (preklop načina — sveža vrednost)
        setPosition(next);
        setStatus("active");
      },
      (err) => {
        // Po napaki/zavrnitvi zapremo watch — sicer bi gumb „Vklopi GPS"
        // nehal delovati (start() bi prezgodaj izstopil, ker watchId ni
        // null). Uporabnik tako lahko ponovno poskusi (npr. po omogočitvi
        // dovoljenja v nastavitvah brskalnika).
        if (watchIdRef.current != null) {
          try {
            navigator.geolocation.clearWatch(watchIdRef.current);
          } catch {
            // neblokirajoče
          }
          watchIdRef.current = null;
        }
        if (err.code === err.PERMISSION_DENIED) {
          // Zavrnitev = izrecna uporabnikova izbira — NO samodejne ponovitve.
          setStatus("denied");
          setErrorMessage(err.message || String(err.code));
          return;
        }
        if (!retriedRef.current) {
          // ISSUE #21 §6: EN sam samodejni ponovni poskus za prehodne
          // napake (timeout / izguba signala) — stanje ostane requesting,
          // po 4 s znova odpremo watch. Druga napaka → iskreno error.
          retriedRef.current = true;
          setStatus("requesting");
          clearRetryTimer();
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            beginWatchRef.current(); // ref — ne lastna zanka (immutability)
          }, RETRY_DELAY_MS);
          return;
        }
        setStatus("error");
        setErrorMessage(err.message || String(err.code));
      },
      // ISSUE #24 Sklop 10: enableHighAccuracy upravlja NAČIN (ref — vedno
      // najnovejša vrednost ob odpiranju watcha; preostale možnosti so
      // kanonske iz #21 in se NE spreminjajo med načinoma).
      {
        enableHighAccuracy: modeRef.current === "high",
        timeout: 10_000,
        maximumAge: 30_000,
      }
    );
    },
    [clearRetryTimer]
  );

  // Ref indirekcija: časovnik ponovitve vedno pokliče NAJNOVEJŠO instanco
  // beginWatch (identiteta prek refa — stabilna, brez rekurzije vClosure).
  useEffect(() => {
    beginWatchRef.current = beginWatch;
  }, [beginWatch]);

  const start = useCallback(() => {
    clearRetryTimer();
    retriedRef.current = false; // ročni zagon ima svež proračun ponovitve
    beginWatch();
  }, [beginWatch, clearRetryTimer]);

  // ISSUE #24 Sklop 10 (1.172.0) — PREKLOP NAČINA MED VOŽNJO: če je watch
  // odprt, ga tiho izmenjamo z novimi možnostmi (clearWatch + ponovni
  // watchPosition). Status/položaj se NE brišejo (brez utripanja
  // »Nastavljam fiksacijo« ob vsakem preklopu) in proračun ponovitve
  // ostane (preklop ni napaka). Če preklop pride s čakajočim ponovnim
  // poskusom, naslednji beginWatch pobere najnovejši način prek refa.
  useEffect(() => {
    const nextMode: GpsPowerMode = opts?.mode ?? "high";
    if (modeRef.current === nextMode) return;
    modeRef.current = nextMode;
    if (watchIdRef.current != null) {
      // Odprti watch zamenjamo takoj — položaj iz prejšnjega načina ostane
      // veljaven (razdalje/smer tečejo naprej brez lukenj). Status in
      // položaj se NE brišejo (beginWatch z zastavico ohrani "active", če
      // fiksacijo že imamo — setState živi V beginWatch, ne v efektu).
      clearWatch();
      beginWatchRef.current({ keepActiveStatus: true });
    }
    // opts?.mode je v odvisnostih po vrednosti (niz) — učinek se sproži
    // SAMO ob dejanski spremembi načina, ne ob vsakem izrisu.
  }, [opts?.mode, clearWatch]);

  const stop = useCallback(() => {
    clearRetryTimer();
    retriedRef.current = false;
    clearWatch();
    positionRef.current = null; // zrcalo čisto ob izklopu (isti kanon kot state)
    setStatus("idle");
    setPosition(null);
  }, [clearWatch, clearRetryTimer]);

  // Cleanup ob unmount (React pravilo: hook brez lukenj — tudi časovnik
  // ponovitve mora umreti s komponento).
  useEffect(
    () => () => {
      clearRetryTimer();
      clearWatch();
    },
    [clearWatch, clearRetryTimer]
  );

  return { position, status, errorMessage, start, stop };
}
