"use client";

// ============================================================================
// TASK 64 — GO MODE „NA POTI": NOW & NEXT UI (1.64.0)
// ============================================================================
// Sopotnik MED POTOVANJEM (telefon v žepu): velika ura, NASLEDNJA postanka,
// razdalja/smer do nje (GPS, premica — iskrena), ostale postanke dneva,
// opravljanje z enim klikom, povzetek kasnejših dni. Podatki: /potovanje →
// „Zaženi Na poti" persistira načrt na NAPRAVI (dai:go-trip) — ta stran je
// 100 % client-side (0 API klicev, deluje tudi brez signala za ogled načrta).
//
// Hidracija: vse iz localStorage/ure/GPS se rendera TEKOM mounta (mounted
// gate) — SSR in klient se strinjata (skeleton), ni mismatch-a.
//
// ISSUE #21 — LIVE TRIP NAVIGATOR (1.159.0):
//  - ARRIVAL UX: »Približuješ se — X m« → »✓ Prišel si na lokacijo« (stabilen
//    geofence + hystereza + min. čas — čista plast travel-state.ts); prihod
//    je IZRECNO ločen od rezervacije (GPS nikoli ne potrdi rezervacije §3);
//  - SAMODEJNA NAPREDOVANJA (§12): po opravitvi/preskoku naslednji postanek
//    zasede kartico BREZ vračanja v planer (deterministicen vrstni red);
//  - PRESKOK pod nadzorom uporabnika (§5) + Obnovi;
//  - GPS življenjski cikel: en sam auto-retry (hook), zastarelost fiksacije
//    se IZREČNO pokaže (§6 — ne izrekamo svežine);
//  - REZERVACIJSKI KONTEKST (§11, samo za branje): učinkovite JourneyBooking
//    vrstice prek istega GET kanala kot MOJA POT (status ostaja resnica
//    strežnika — Go Mode NE piše rezervacij, le prebere jih).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import {
  AlertTriangle,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  CloudSun,
  Compass,
  ExternalLink,
  LocateFixed,
  Loader2,
  MapPin,
  Navigation as NavigationIcon,
  Phone,
  RotateCcw,
  Route as RouteIcon,
  SkipForward,
  Trash2,
  Wand2,
} from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buildMyTrip } from "@/lib/journey/trip-view";
import { recordExternalHandoff } from "@/lib/journey/handoff-record";
import { heuristicLeg } from "@/lib/road-routing";
import { OpeningHoursStatus } from "@/components/opening-hours-status";
import {
  buildGoView,
  GO_LABELS,
  type GoEntryCard,
} from "@/lib/journey/go-view";
import { GoDayLine } from "@/components/sections/go-day-line";
import { TripComplete } from "@/components/sections/go-mode/trip-complete";
import { useGeolocation, type GeoStatus } from "@/lib/journey/use-geolocation";
import { useWakeLock } from "@/lib/journey/use-wake-lock";
import {
  clearGoTrip,
  loadGoProgress,
  loadGoSkipped,
  loadGoTrip,
  saveGoProgress,
  saveGoSkipped,
  saveItineraryGoTrip,
  type GoTripRecord,
} from "@/lib/journey/go-persist";
import {
  ACCURACY_CLASS_LABELS,
  ARRIVAL_LABELS,
  positionAgeMs,
  type ArrivalContext,
} from "@/lib/journey/travel-state";
import { STOP_GEO_LABELS, isNavigableGeo } from "@/lib/journey/resolve-stop-geo";
import { plannerSessionId, trackPlannerEvent } from "@/lib/planner-analytics";
import {
  CONFIRMATION_STATUS_LABELS,
} from "@/lib/journey/booking";
import type { ConfirmationStatus } from "@/lib/journey/types";
import {
  goWeatherTarget,
  observedTimeLabel,
  parseGoWeatherResponse,
  GO_WEATHER_LABELS,
  type GoWeather,
} from "@/lib/journey/go-weather";
import {
  GO_NAV_LABELS,
  goNavLinks,
  isCoarsePointer,
  pickGoNavHref,
} from "@/lib/journey/go-nav";
import { GoAudioButton } from "@/components/sections/go-audio-button";
import {
  buildNearbyNarration,
  buildStopNarration,
} from "@/lib/journey/go-audio";
// ISSUE #22 — TRAVEL GUARDIAN (1.162.0): stanje dneva, konflikti, recovery,
// jutranji povzetek in pametni prosti čas (vse čisti projekcijski moduli).
import { buildGuardian } from "@/lib/journey/trip-health";
import { assessRecovery } from "@/lib/journey/recovery";
import { buildDayStartSummary } from "@/lib/journey/day-start";
import {
  detectFreeTimeWindow,
  filterNearbyCandidates,
  nearbyBbox,
  NEARBY_CATEGORY_OF,
  CATEGORY_TO_PRODUCT_TYPES,
  type GuardianNearbyCategory,
  type NearbyCandidate,
  type NearbyFit,
} from "@/lib/journey/free-time";
import {
  addNearbyStopToRecord,
  canAddNearbyStops,
  GO_EDIT_LABELS,
} from "@/lib/journey/go-edit";
import type { RecoverySuggestionAction } from "@/lib/journey/recovery";
import type {
  GuardianActionId,
  GuardianConflict,
} from "@/lib/journey/conflict-detect";
import { GuardianBanner } from "@/components/sections/go-mode/guardian-banner";
import { GuardianConflictCard } from "@/components/sections/go-mode/guardian-conflict";
import { GuardianFreeTimeSection } from "@/components/sections/go-mode/guardian-free-time";
import { GuardianDayStartSection } from "@/components/sections/go-mode/guardian-day-start";
// ISSUE #24 Sklop 8 (1.170.0): GO MODE I18N FAZA 2 — polni prevodi it/de/fr/es
// (helper GL z EN-dedovanjem po vzorcu planner-lang PL; podatkovni pari
// shranjenih zapisov {sl,en} ostanejo jezikovno nevtralni — tuji uporabnik
// vidi EN stran para, NIKOLI SL; P4-8: ne mešaj jezikov).
import {
  GL,
  GFn,
  goAll,
  goLangOf,
  goLocaleTag,
  type GoLang,
  type GoStrings,
} from "@/lib/journey/go-lang";

// ---------------------------------------------------------------------------
// Oznake (6-jezični L vzorec — ISSUE #24 Sklop 8 faza 2; SL/EN nespremenjena)
// ---------------------------------------------------------------------------

const L = {
  now: { sl: "Zdaj", en: "Now", it: "Ora", de: "Jetzt", fr: "Maintenant", es: "Ahora" },
  gps: {
    start: {
      sl: "Vklopi GPS",
      en: "Turn on GPS",
      it: "Attiva il GPS",
      de: "GPS aktivieren",
      fr: "Activer le GPS",
      es: "Activar el GPS",
    },
    stop: {
      sl: "Izklopi GPS",
      en: "Turn off GPS",
      it: "Disattiva il GPS",
      de: "GPS deaktivieren",
      fr: "Désactiver le GPS",
      es: "Desactivar el GPS",
    },
    status: {
      idle: {
        sl: "GPS je izklopljen.",
        en: "GPS is off.",
        it: "Il GPS è disattivato.",
        de: "Das GPS ist aus.",
        fr: "Le GPS est désactivé.",
        es: "El GPS está desactivado.",
      },
      requesting: {
        sl: "Nastavljam fiksacijo …",
        en: "Fixing position …",
        it: "Rilevo la posizione …",
        de: "Position wird ermittelt …",
        fr: "Localisation en cours …",
        es: "Fijando la posición …",
      },
      active: {
        sl: "GPS aktiven",
        en: "GPS active",
        it: "GPS attivo",
        de: "GPS aktiv",
        fr: "GPS actif",
        es: "GPS activo",
      },
      denied: {
        sl: "Dovoljenje za lokacijo je zavrnjeno — omogoči ga v nastavitvah brskalnika.",
        en: "Location permission denied — enable it in the browser settings.",
        it: "Permesso di localizzazione negato — attivalo nelle impostazioni del browser.",
        de: "Standortberechtigung abgelehnt — aktiviere sie in den Browser-Einstellungen.",
        fr: "Autorisation de localisation refusée — active-la dans les réglages du navigateur.",
        es: "Permiso de ubicación denegado — actívalo en los ajustes del navegador.",
      },
      unavailable: {
        sl: "Ta naprava ali brskalnik ne podpira Geolocation API.",
        en: "This device or browser does not support the Geolocation API.",
        it: "Questo dispositivo o browser non supporta la Geolocation API.",
        de: "Dieses Gerät oder dieser Browser unterstützt die Geolocation-API nicht.",
        fr: "Cet appareil ou ce navigateur ne prend pas en charge l'API Geolocation.",
        es: "Este dispositivo o navegador no admite la API de geolocalización.",
      },
      error: {
        sl: "GPS napaka",
        en: "GPS error",
        it: "Errore GPS",
        de: "GPS-Fehler",
        fr: "Erreur GPS",
        es: "Error de GPS",
      },
    } as Record<GeoStatus, GoStrings>,
    accuracy: {
      sl: (m: number) => `natančnost ±${Math.round(m)} m`,
      en: (m: number) => `accuracy ±${Math.round(m)} m`,
      it: (m: number) => `precisione ±${Math.round(m)} m`,
      de: (m: number) => `Genauigkeit ±${Math.round(m)} m`,
      fr: (m: number) => `précision ±${Math.round(m)} m`,
      es: (m: number) => `precisión ±${Math.round(m)} m`,
    },
    // ISSUE #21 §10 (1.161.0): wake lock — prikaz SAMO dejanskega stanja.
    wake: {
      sl: "zaslon ostaja prižgan",
      en: "screen stays on",
      it: "lo schermo resta acceso",
      de: "der Bildschirm bleibt an",
      fr: "l'écran reste allumé",
      es: "la pantalla sigue encendida",
    },
  },
  next: {
    sl: "Naslednje",
    en: "Next",
    it: "Prossima",
    de: "Als Nächstes",
    fr: "Ensuite",
    es: "Siguiente",
  },
  // TASK 102 — ISSUE #21 §10/§12: »NASLEDNJE PO TEM« (postanek po trenutnem).
  nextAfter: {
    sl: "Nato",
    en: "Then",
    it: "Poi",
    de: "Danach",
    fr: "Ensuite",
    es: "Después",
  },
  nextAfterEmpty: {
    sl: "To je zadnji postanek dneva.",
    en: "This is the last stop of the day.",
    it: "Questa è l'ultima tappa della giornata.",
    de: "Dies ist die letzte Station des Tages.",
    fr: "C'est le dernier arrêt de la journée.",
    es: "Esta es la última parada del día.",
  },
  today: {
    sl: "Danes načrtovano",
    en: "Planned today",
    it: "In programma oggi",
    de: "Heute geplant",
    fr: "Prévu aujourd'hui",
    es: "Previsto hoy",
  },
  done: {
    sl: "Opravljeno",
    en: "Completed",
    it: "Completato",
    de: "Erledigt",
    fr: "Terminé",
    es: "Completado",
  },
  complete: {
    sl: "Opravi",
    en: "Done",
    it: "Completa",
    de: "Erledigen",
    fr: "Terminer",
    es: "Completar",
  },
  restore: {
    sl: "Obnovi",
    en: "Restore",
    it: "Ripristina",
    de: "Wiederherstellen",
    fr: "Restaurer",
    es: "Restaurar",
  },
  // ISSUE #21 §5: preskok pod nadzorom uporabnika (Preskoči ≠ Opravi).
  skip: {
    sl: "Preskoči",
    en: "Skip",
    it: "Salta",
    de: "Überspringen",
    fr: "Passer",
    es: "Omitir",
  },
  skippedSection: {
    sl: "Preskočeno",
    en: "Skipped",
    it: "Saltate",
    de: "Übersprungen",
    fr: "Passés",
    es: "Omitidas",
  },
  skipHint: {
    sl: "Preskočeni postanek ni opravljen — vrneš ga lahko z Obnovi.",
    en: "A skipped stop is not completed — you can bring it back with Restore.",
    it: "Una tappa saltata non è completata — puoi riportarla con Ripristina.",
    de: "Eine übersprungene Station ist nicht erledigt — du kannst sie mit Wiederherstellen zurückholen.",
    fr: "Un arrêt passé n'est pas terminé — tu peux le restaurer avec Restaurer.",
    es: "Una parada omitida no está completada — puedes devolverla con Restaurar.",
  },
  // ISSUE #21 §11: rezervacijski žeton (samo iz DEJANSKE vrstice).
  bookingChip: {
    sl: "Rezervacija",
    en: "Booking",
    it: "Prenotazione",
    de: "Buchung",
    fr: "Réservation",
    es: "Reserva",
  },
  laterDays: {
    sl: "Naslednji dnevi",
    en: "Coming days",
    it: "Prossimi giorni",
    de: "Kommende Tage",
    fr: "Jours suivants",
    es: "Próximos días",
  },
  // ISSUE #4 §16 (val 4): dnevna navigacija — preklapljanje dni.
  dayNav: {
    sl: "Dnevi poti",
    en: "Trip days",
    it: "Giorni di viaggio",
    de: "Reisetage",
    fr: "Jours de voyage",
    es: "Días de viaje",
  },
  dayToday: {
    sl: "Danes",
    en: "Today",
    it: "Oggi",
    de: "Heute",
    fr: "Aujourd'hui",
    es: "Hoy",
  },
  dayManual: {
    sl: "Dan izbran ročno — »Danes« se vrne na današnji datum.",
    en: "Day selected manually — “Today” returns to today's date.",
    it: "Giorno selezionato manualmente — \"Oggi\" torna alla data di oggi.",
    de: "Tag manuell gewählt — \"Heute\" kehrt zum heutigen Datum zurück.",
    fr: "Jour choisi manuellement — \"Aujourd'hui\" revient à la date du jour.",
    es: "Día elegido manualmente — \"Hoy\" vuelve a la fecha de hoy.",
  },
  stops: {
    sl: "postankov",
    en: "stops",
    it: "tappe",
    de: "Stationen",
    fr: "arrêts",
    es: "paradas",
  },
  inAir: {
    sl: "v zraku",
    en: "as the crow flies",
    it: "in linea d'aria",
    de: "Luftlinie",
    fr: "à vol d'oiseau",
    es: "en línea recta",
  },
  toward: {
    sl: "proti",
    en: "toward",
    it: "verso",
    de: "Richtung",
    fr: "vers",
    es: "hacia",
  },
  hours: {
    sl: "Odpiralni časi",
    en: "Opening hours",
    it: "Orari di apertura",
    de: "Öffnungszeiten",
    fr: "Horaires d'ouverture",
    es: "Horario de apertura",
  },
  call: {
    sl: "Pokliči",
    en: "Call",
    it: "Chiama",
    de: "Anrufen",
    fr: "Appeler",
    es: "Llamar",
  },
  bookAt: {
    sl: "Rezerviraj pri ponudniku",
    en: "Book at the provider",
    it: "Prenota dal fornitore",
    de: "Beim Anbieter buchen",
    fr: "Réserver chez le prestataire",
    es: "Reservar con el proveedor",
  },
  openSource: {
    sl: "Odpri vir",
    en: "Open source",
    it: "Apri la fonte",
    de: "Quelle öffnen",
    fr: "Ouvrir la source",
    es: "Abrir la fuente",
  },
  planLink: {
    sl: "Nazaj na potovanje",
    en: "Back to the journey",
    it: "Torna al viaggio",
    de: "Zurück zur Reise",
    fr: "Retour au voyage",
    es: "Volver al viaje",
  },
  // ISSUE #4 §2 (val 2): v2 AI zapis — nazaj na NAČRT (ne potovanje).
  backToPlan: {
    sl: "Nazaj na načrt",
    en: "Back to the plan",
    it: "Torna al piano",
    de: "Zurück zum Plan",
    fr: "Retour au plan",
    es: "Volver al plan",
  },
  end: {
    sl: "Zaključi Na poti",
    en: "End On-the-road",
    it: "Termina In viaggio",
    de: "Unterwegs beenden",
    fr: "Terminer En route",
    es: "Finalizar En camino",
  },
  endConfirm: {
    title: {
      sl: "Zaključim Na poti?",
      en: "End On-the-road?",
      it: "Terminare In viaggio?",
      de: "Unterwegs beenden?",
      fr: "Terminer En route ?",
      es: "¿Finalizar En camino?",
    },
    desc: {
      sl: "Načrt in opravljene postanke pobrišem s te naprave. Na /potovanje ga lahko kadar koli sestaviš znova.",
      en: "I will delete the plan and completed stops from this device. You can rebuild it anytime at /potovanje.",
      it: "Eliminerò il piano e le tappe completate da questo dispositivo. Puoi ricostruirlo in qualsiasi momento su /potovanje.",
      de: "Ich lösche den Plan und die erledigten Stationen von diesem Gerät. Du kannst ihn jederzeit unter /potovanje neu erstellen.",
      fr: "Je supprimerai le plan et les arrêts terminés de cet appareil. Tu peux le reconstruire à tout moment sur /potovanje.",
      es: "Borraré el plan y las paradas completadas de este dispositivo. Puedes reconstruirlo cuando quieras en /potovanje.",
    },
    // ISSUE #4 §2 (val 2): v2 AI zapis — iskren vir obnovitve (prej inline).
    descAi: {
      sl: "Načrt in opravljene postanke pobrišem s te naprave. AI načrt lahko kadar koli znova odpreš na načrtovalniku ali prek deljene povezave.",
      en: "I will delete the plan and completed stops from this device. You can reopen the AI plan anytime on the planner or via its shared link.",
      it: "Eliminerò il piano e le tappe completate da questo dispositivo. Puoi riaprire il piano AI in qualsiasi momento sul pianificatore o tramite il suo link di condivisione.",
      de: "Ich lösche den Plan und die erledigten Stationen von diesem Gerät. Du kannst den KI-Plan jederzeit im Planer oder über seinen geteilten Link wieder öffnen.",
      fr: "Je supprimerai le plan et les arrêts terminés de cet appareil. Tu peux rouvrir le plan IA à tout moment dans le planificateur ou via son lien de partage.",
      es: "Borraré el plan y las paradas completadas de este dispositivo. Puedes reabrir el plan de IA cuando quieras en el planificador o a través de su enlace compartido.",
    },
    cancel: {
      sl: "Prekliči",
      en: "Cancel",
      it: "Annulla",
      de: "Abbrechen",
      fr: "Annuler",
      es: "Cancelar",
    },
    action: {
      sl: "Zaključi",
      en: "End",
      it: "Termina",
      de: "Beenden",
      fr: "Terminer",
      es: "Finalizar",
    },
  },
  empty: {
    title: {
      sl: "Ni aktivnega potovanja",
      en: "No active journey",
      it: "Nessun viaggio attivo",
      de: "Keine aktive Reise",
      fr: "Aucun voyage actif",
      es: "Ningún viaje activo",
    },
    desc: {
      sl: "Sestavi potovanje na strani Potovanje (prihod, destinacija, postanke po 4 državah), izberi kar te zanima in pritisni „Zaženi Na poti“.",
      en: "Build a journey on the Journey page (arrival, destination, stops across 4 countries), pick what interests you and press “Start On-the-road”.",
      it: "Crea un viaggio nella pagina Viaggio (arrivo, destinazione, tappe in 4 paesi), scegli ciò che ti interessa e premi „Avvia In viaggio“.",
      de: "Stelle auf der Seite Reise eine Reise zusammen (Ankunft, Ziel, Stationen in 4 Ländern), wähle, was dich interessiert, und drücke „Unterwegs starten“.",
      fr: "Compose un voyage sur la page Voyage (arrivée, destination, arrêts dans 4 pays), choisis ce qui t'intéresse et appuie sur “Démarrer En route”.",
      es: "Crea un viaje en la página Viaje (llegada, destino, paradas en 4 países), elige lo que te interese y pulsa “Iniciar En camino”.",
    },
    // TASK 4 / K-7: drugi izhod za uporabnike AI NAČRTA — prej je empty
    // state vodil SAMO v /potovanje (drugi koncept), AI načrt ni imel mostu.
    descAi: {
      sl: "Imaš AI načrt? Gumb „Zaženi Na poti“ na načrtovalniku (ali deljeni povezavi) ga naloži sem — deluje tudi brez signala.",
      en: "Have an AI plan? The “Start On-the-road” button on the planner (or a shared link) loads it here — it works offline too.",
      it: "Hai un piano AI? Il pulsante „Avvia In viaggio“ nel pianificatore (o un link condiviso) lo carica qui — funziona anche senza segnale.",
      de: "Du hast einen KI-Plan? Die Schaltfläche „Unterwegs starten“ im Planer (oder ein geteilter Link) lädt ihn hierher — er funktioniert auch offline.",
      fr: "Tu as un plan IA ? Le bouton “Démarrer En route” dans le planificateur (ou un lien partagé) le charge ici — il fonctionne aussi hors ligne.",
      es: "¿Tienes un plan de IA? El botón “Iniciar En camino” del planificador (o un enlace compartido) lo carga aquí — también funciona sin conexión.",
    },
    cta: {
      sl: "Sestavi potovanje",
      en: "Build a journey",
      it: "Crea un viaggio",
      de: "Reise zusammenstellen",
      fr: "Composer un voyage",
      es: "Crear un viaje",
    },
    ctaAi: {
      sl: "Načrtuj z AI",
      en: "Plan with AI",
      it: "Pianifica con l'AI",
      de: "Mit KI planen",
      fr: "Planifier avec l'IA",
      es: "Planificar con IA",
    },
  },
  duration: {
    sl: "trajanje",
    en: "duration",
    it: "durata",
    de: "Dauer",
    fr: "durée",
    es: "duración",
  },
  min: { sl: "min", en: "min", it: "min", de: "Min.", fr: "min", es: "min" },
  offline: {
    sl: "Načrt je shranjen na tej napravi — deluje tudi brez signala.",
    en: "The plan is stored on this device — it works offline too.",
    it: "Il piano è salvato su questo dispositivo — funziona anche senza segnale.",
    de: "Der Plan ist auf diesem Gerät gespeichert — er funktioniert auch offline.",
    fr: "Le plan est enregistré sur cet appareil — il fonctionne aussi hors ligne.",
    es: "El plan está guardado en este dispositivo — también funciona sin conexión.",
  },
  // ISSUE #4 §16 (val 4): MATRIKA ZMOŽNOSTI BREZ SIGNALA — iskrena
  // ločitev (nikoli splošna "offline" oznaka): dnevi/postanki/GPS-ure
  // delujejo; ploščice samo že odprta območja; navigacija je zunanja
  // aplikacija; vreme in rezervacije potrebujejo signal.
  offlineMatrix: {
    sl: "Brez signala: dnevi in postanki delujejo · navigacijski gumb odpre zunanjo aplikacijo · vreme potrebuje signal",
    en: "Offline: days and stops work · the navigation button opens an external app · weather needs a signal",
    it: "Senza segnale: giorni e tappe funzionano · il pulsante di navigazione apre un'app esterna · il meteo richiede segnale",
    de: "Ohne Signal: Tage und Stationen funktionieren · der Navigationsknopf öffnet eine externe App · Wetter braucht Signal",
    fr: "Sans signal : les jours et les arrêts fonctionnent · le bouton de navigation ouvre une application externe · la météo nécessite un signal",
    es: "Sin conexión: los días y las paradas funcionan · el botón de navegación abre una aplicación externa · el tiempo necesita conexión",
  },
  // === ISSUE #4 §8 (val 2): real-time kontekst — pošteni žetoni ===
  driveFromPrev: {
    sl: "vožnja od prejšnjega postanka",
    en: "drive from the previous stop",
    it: "viaggio dalla tappa precedente",
    de: "Fahrt von der vorherigen Station",
    fr: "trajet depuis l'arrêt précédent",
    es: "trayecto desde la parada anterior",
  },
  legSource: {
    osrm: {
      sl: "vir: OSRM (realne ceste)",
      en: "source: OSRM (real roads)",
      it: "fonte: OSRM (strade reali)",
      de: "Quelle: OSRM (echte Straßen)",
      fr: "source : OSRM (routes réelles)",
      es: "fuente: OSRM (carreteras reales)",
    },
    heuristic: {
      sl: "ocena (hevristika)",
      en: "estimate (heuristic)",
      it: "stima (euristica)",
      de: "Schätzung (Heuristik)",
      fr: "estimation (heuristique)",
      es: "estimación (heurística)",
    },
    // ISSUE #24 Sklop 8: prej INLINE par {sl:"mešano",en:"mixed"} v izrisu.
    mixed: {
      sl: "mešano",
      en: "mixed",
      it: "misto",
      de: "gemischt",
      fr: "mixte",
      es: "mixto",
    },
  },
  eta: {
    label: {
      sl: "Predviden prihod",
      en: "Estimated arrival",
      it: "Arrivo previsto",
      de: "Voraussichtliche Ankunft",
      fr: "Arrivée estimée",
      es: "Llegada estimada",
    },
    hint: {
      sl: "ocena iz premočne razdalje ×1,3 pri 55 km/h — ni podatka o prometu",
      en: "estimate from straight-line ×1.3 at 55 km/h — no traffic data",
      it: "stima dalla distanza in linea d'aria ×1,3 a 55 km/h — nessun dato sul traffico",
      de: "Schätzung aus der Luftlinie ×1,3 bei 55 km/h — keine Verkehrsdaten",
      fr: "estimation depuis la ligne droite ×1,3 à 55 km/h — pas de données de trafic",
      es: "estimación desde la línea recta ×1,3 a 55 km/h — sin datos de tráfico",
    },
    unknown: {
      sl: "Predviden prihod: neznano — brez GPS ali vozne razdalje",
      en: "Estimated arrival: unknown — no GPS or drive distance",
      it: "Arrivo previsto: sconosciuto — senza GPS o distanza stradale",
      de: "Voraussichtliche Ankunft: unbekannt — ohne GPS oder Fahrstrecke",
      fr: "Arrivée estimée : inconnue — sans GPS ni distance routière",
      es: "Llegada estimada: desconocida — sin GPS ni distancia por carretera",
    },
  },
  delay: {
    sl: "Zamude in promet v realnem času: NEZNANO — nimamo vira (niti lažnjega prometa).",
    en: "Real-time delays and traffic: UNKNOWN — we have no source (and no fake traffic either).",
    it: "Ritardi e traffico in tempo reale: SCONOSCIUTO — non abbiamo una fonte (e nemmeno traffico finto).",
    de: "Echtzeit-Verspätungen und Verkehr: UNBEKANNT — wir haben keine Quelle (und auch keinen Fake-Verkehr).",
    fr: "Retards et trafic en temps réel : INCONNU — nous n'avons pas de source (ni de faux trafic).",
    es: "Retrasos y tráfico en tiempo real: DESCONOCIDO — no tenemos fuente (ni tráfico falso).",
  },
  dayRoute: {
    sl: (n: number, km: number, min: number, method: string) =>
      `Pot dneva: ${n} postankov · skupaj ~${km} km · ~${min} min (${method})`,
    en: (n: number, km: number, min: number, method: string) =>
      `Day's route: ${n} stops · ~${km} km total · ~${min} min (${method})`,
    it: (n: number, km: number, min: number, method: string) =>
      `Percorso del giorno: ${n} tappe · ~${km} km in totale · ~${min} min (${method})`,
    de: (n: number, km: number, min: number, method: string) =>
      `Tagesroute: ${n} Stationen · insgesamt ~${km} km · ~${min} Min. (${method})`,
    fr: (n: number, km: number, min: number, method: string) =>
      `Itinéraire du jour : ${n} arrêts · ~${km} km au total · ~${min} min (${method})`,
    es: (n: number, km: number, min: number, method: string) =>
      `Ruta del día: ${n} paradas · ~${km} km en total · ~${min} min (${method})`,
  },
  hoursMissing: {
    sl: "vir ne objavlja ur — preveri pri postanku",
    en: "not published by the source — check on arrival",
    it: "orari non pubblicati dalla fonte — verifica all'arrivo",
    de: "von der Quelle nicht veröffentlicht — vor Ort prüfen",
    fr: "non publiés par la source — vérifie sur place",
    es: "no publicados por la fuente — verifica al llegar",
  },
  savedTrip: {
    link: {
      sl: "Odpri shranjeno pot",
      en: "Open the saved trip",
      it: "Apri il viaggio salvato",
      de: "Gespeicherte Reise öffnen",
      fr: "Ouvrir le voyage enregistré",
      es: "Abrir el viaje guardado",
    },
    note: {
      sl: "Ta načrt je povezan s shranjeno potjo (/pot/…).",
      en: "This plan is linked to a saved trip (/pot/…).",
      it: "Questo piano è collegato a un viaggio salvato (/pot/…).",
      de: "Dieser Plan ist mit einer gespeicherten Reise verknüpft (/pot/…).",
      fr: "Ce plan est lié à un voyage enregistré (/pot/…).",
      es: "Este plan está vinculado a un viaje guardado (/pot/…).",
    },
  },
} as const;

function localeTime(d: Date, lang: GoLang): string {
  return d.toLocaleTimeString(goLocaleTag(lang), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Kartice
// ---------------------------------------------------------------------------

function DistanceChip({ card, lang }: { card: GoEntryCard; lang: GoLang }) {
  if (card.distanceKm == null || !card.bearingLabel) return null;
  return (
    <Badge className="gap-1 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <MapPin className="h-3 w-3" />
      {card.distanceKm} km {GL(lang, L.toward)} {GL(lang, card.bearingLabel)} ·{" "}
      {GL(lang, L.inAir)}
    </Badge>
  );
}

/**
 * ISSUE #4 §8 (val 2): VOŽNJA od prejšnjega postanka (po načrtu) — km/min
 * iz OSRM ali hevristike, vir razkrit. Brez noge (prvi postanek dneva /
 * manjkajoči par) se žeton NE prikaže (ne izmišljujemo).
 */
function LegChip({
  card,
  lang,
}: {
  card: GoEntryCard;
  lang: GoLang;
}) {
  const leg = card.entry.legFromPrev;
  if (!leg) return null;
  return (
    <Badge
      className="gap-1 border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-50 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"
      title={GL(lang, L.driveFromPrev)}
    >
      <RouteIcon className="h-3 w-3" aria-hidden="true" />
      ~{leg.km} km · ~{leg.min} {GL(lang, L.min)} ·{" "}
      {t2(leg.source === "osrm" ? L.legSource.osrm : L.legSource.heuristic, lang)}
    </Badge>
  );
}

/** Pomožna za žetone (UI slovarji z EN-dedovanjem — Sklop 8). */
function t2(o: GoStrings, lang: GoLang) {
  return GL(lang, o);
}

function EntryLinks({
  card,
  lang,
}: {
  card: GoEntryCard;
  lang: GoLang;
}) {
  const e = card.entry;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {e.bookingUrl && (
        <a
          href={e.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          // 1.88.1 (FA-3 GAP): enak zapis EXTERNAL handoffa kot MOJA POT
          // povezava (prej Go Mode kliki niso pustili lifecycle sledi).
          onClick={() =>
            recordExternalHandoff(e.provider, e.providerProductId)
          }
          className="inline-flex items-center gap-1 font-medium text-violet-700 underline-offset-4 hover:underline dark:text-violet-400"
        >
          {GL(lang, L.bookAt)} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      {e.sourceUrl && (
        <a
          href={e.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline"
        >
          {GL(lang, L.openSource)} <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {e.phone && (
        <a
          href={`tel:${e.phone.replace(/\s+/g, "")}`}
          className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline"
        >
          <Phone className="h-3.5 w-3.5" /> {GL(lang, L.call)}: {e.phone}
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TASK 67 — NAVIGACIJSKI HANDOFF (zunanja aplikacija)
// ---------------------------------------------------------------------------

/**
 * Gumb „Navigiraj": ODPRE zunanjo navigacijo do postanka.
 *  - href = Google Maps URL (vedno veljaven https link — SSR/hidracijsko
 *    varen, deluje povsod);
 *  - na mobilnem (pointer: coarse) klik prestrežemo in odpremo geo: URI →
    SISTEMSKI izbirnik navigacijskih aplikacij (Google Maps, Waze, Organic,
    Apple Maps … — uporabnik izbere svojo);
 *  - postanek BREZ geo → gumba NI (iskrena odsotnost — kot razdalja);
 *  - platforma NI lastna navigacija (AGENTS.md §13) — label to izrecno pove.
 */
function NavButton({
  card,
  lang,
  variant = "hero",
  origin,
}: {
  card: GoEntryCard;
  lang: GoLang;
  variant?: "hero" | "icon";
  /** ISSUE #4 §8: živi GPS — prenese se v web URL (external app dobi
   * dejansko izhodišče; brez njega uporabi svojo lokacijo). */
  origin?: { lat: number; lng: number } | null;
}) {
  const links = goNavLinks(card.entry, origin ?? null);
  if (links == null) return null; // brez geo → handoff preprosto NI

  const onNav = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Mobilni: geo: URI odpre izbirnik aplikacij (precej nad web URL — brez
    // privzganja Google Maps). Prestrežemo SAMO ob kliku (0 hidracijskih
    // posledic). Desktop/pad: privzeti <a> odpre Google Maps.
    if (isCoarsePointer()) {
      e.preventDefault();
      window.location.href = links.geo;
    }
  };

  const externalHint = GL(lang, GO_NAV_LABELS.external);
  const aria = GFn(lang, GO_NAV_LABELS.navigateAria)(card.entry.title);

  if (variant === "icon") {
    return (
      <Button asChild variant="outline" className="h-11 w-11 shrink-0">
        <a
          href={links.web}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNav}
          title={externalHint}
          aria-label={aria}
        >
          <NavigationIcon className="h-4 w-4" />
        </a>
      </Button>
    );
  }

  return (
    <Button
      asChild
      variant="outline"
      className="h-12 flex-1 border-emerald-300 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
    >
      <a
        href={links.web}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNav}
        title={externalHint}
        aria-label={aria}
      >
        <NavigationIcon className="mr-2 h-4 w-4" /> {GL(lang, GO_NAV_LABELS.navigate)}
      </a>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// GLAVNA KOMPONENTA
// ---------------------------------------------------------------------------

export function GoMode() {
  const locale = useLocale();
  // ISSUE #24 Sklop 8 (1.170.0): FAZA 2 — polni prevodi. Resolucija po
  // goLangOf: vseh 6 javnih jezikov živi na /{locale}/na-poti; neprevedene
  // enote (izjemoma) dedijo EN prek GL; neznan locale → SL (izvirnik).
  // Prej (faza 1): vsi tuji → EN (prehodni PL kanon).
  const lang: GoLang = goLangOf(locale);
  const t = (o: GoStrings) => GL(lang, o);

  // Hidracijska varnost: localStorage + živa ura se naložita TEKOM mounta —
  // setState v callbacku makro-naloge (NE sinhrono v telesu efekta — pravilo
  // react-hooks/set-state-in-effect), SSR in prvi klientni render sta skeleton.
  const [record, setRecord] = useState<GoTripRecord | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  // ISSUE #21 §5: preskočeni postanki (ločeno od done — Preskoči ≠ Opravi).
  const [skipped, setSkipped] = useState<Record<string, string>>({});
  const [now, setNow] = useState<Date | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  // ISSUE #21: kontekst prihoda naslednjega postanka (hystereza +
  // stabilnost čez fiksacije) — živi SAMO v seji (ref): 0 persistencje,
  // po refreshu klasifikacija iskreno začne na novo.
  const arrivalRef = useRef<ArrivalContext | null>(null);
  // ISSUE #4 §16 (val 4): DNEVNA NAVIGACIJA — ročno izbrani dan (null =
  // samodejno po datumu). Preživi tick ure/geo — uporabnikova izbira je
  // stabilna, dokler jo ne resetira (gumb »Danes«).
  const [dayOverride, setDayOverride] = useState<number | null>(null);
  const geo = useGeolocation();
  // ISSUE #21 §10 (1.161.0) — WAKE LOCK (konkurenčna delta D1): dokler je
  // GPS watch aktiven, držimo zaslon prižgan (vodilči ga ob vožnji ugasne).
  // Iskreno: brez podpore nič ne obljubimo; brskalnik lahko odvzame (held).
  const wake = useWakeLock(geo.status === "active");

  useEffect(() => {
    const hydrate = setTimeout(() => {
      setRecord(loadGoTrip());
      setDone(loadGoProgress());
      setSkipped(loadGoSkipped());
      setNow(new Date());
    }, 0);
    // Živa ura: osvežitev vsakih 30 s (setState v interval-callbacku —
    // zunanji dogodek, ne sinhroni render kaskada).
    const clock = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      clearTimeout(hydrate);
      clearInterval(clock);
    };
  }, []);

  const trip = useMemo(
    () =>
      record
        ? // TASK 4 / K-7: v2 = AI itinerer (MyTripView shranjen SESTAVLJEN —
          // 0 transformacij ob branju); v1 = /potovanje TravelJourney
          // (kanonična pot, nespremenjena).
          record.version === 1
          ? buildMyTrip(record.journey, new Set(record.selectedIds))
          : record.view
        : null,
    [record]
  );
  const view = useMemo(
    () =>
      trip && now
        ? buildGoView(trip, now, geo.position, done, {
            dayOverride,
            skipped,
            arrivalContext: arrivalRef.current,
          })
        : null,
    [trip, now, geo.position, done, skipped, dayOverride]
  );

  // ISSUE #21: novi kontekst prihoda gre nazaj v ref PO renderu (brez
  // dodatnega render krogotočka — ref pisanje ne sproži re-rendera;
  // naslednja fiksacija/ura ga uporabi za hysterezo in stabilnost).
  useEffect(() => {
    arrivalRef.current = view?.arrivalContext ?? null;
  }, [view]);

  // ----------------------------------------------------------------------
  // TASK 65 — VREME PRI NASLEDNJI POSTANKI (živi Open-Meteo prek
  // /api/weather, 10-min cache na strežniku). Cilj je GEO naslednjega
  // postanka — postanek brez geo → vreme preprosto NI (iskrena odsotnost,
  // isti kanon kot DistanceChip). Pogled se gradi vsakih 30 s (živa ura) —
  // zato so effect-depi PRIMITIVI (lat/lng), da se fetch sproži SAMO ob
  // spremembi postanka (ne ob vsakem tiku ure).
  // ----------------------------------------------------------------------
  const weatherTarget = useMemo(
    () => (view ? goWeatherTarget(view) : null),
    [view]
  );
  const wLat = weatherTarget?.lat ?? null;
  const wLng = weatherTarget?.lng ?? null;
  const [weather, setWeather] = useState<GoWeather | null>(null);
  const [weatherFailed, setWeatherFailed] = useState(false);
  /** Za kateri cilj je trenutni odgovor veljalen (drugo = zastarel → skeleton). */
  const [weatherFor, setWeatherFor] = useState<{
    lat: number | null;
    lng: number | null;
  }>({ lat: null, lng: null });
  const [weatherTick, setWeatherTick] = useState(0);

  // Osvežitev vsakih 10 min — usklajeno s 600 s strežniškim cachejem
  // (setState v interval-callbacku — zunanji dogodek).
  useEffect(() => {
    const refresh = setInterval(() => setWeatherTick((t) => t + 1), 600_000);
    return () => clearInterval(refresh);
  }, []);

  useEffect(() => {
    if (wLat == null || wLng == null) return; // brez geo → NI vremena
    let active = true;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/weather?lat=${wLat}&lng=${wLng}&lang=${lang}&daily=1`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseGoWeatherResponse(await res.json());
        if (!active) return;
        if (parsed) {
          setWeather(parsed);
          setWeatherFailed(false);
        } else {
          setWeather(null);
          setWeatherFailed(true);
        }
        setWeatherFor({ lat: wLat, lng: wLng });
      } catch {
        // Prekinitev (nov cilj) NE šteje kot napaka — active je takrat false.
        if (!active) return;
        setWeather(null);
        setWeatherFailed(true);
        setWeatherFor({ lat: wLat, lng: wLng });
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [wLat, wLng, lang, weatherTick]);

  /** skeleton, dokler odgovor ne pokriva aktualnega cilja (zastarel = loading). */
  const weatherLoading =
    wLat != null &&
    (weatherFor.lat !== wLat || weatherFor.lng !== wLng);

  // ----------------------------------------------------------------------
  // ISSUE #4 §8 (val 2): ETA DO NASLEDNJEGA POSTANKA — SAMO ko imamo GPS +
  // geo postanka (hevristika premica ×1,3 pri 55 km/h — pošteno labelirana,
  // ker prometa nimamo). Brez pogojev → izrecno NEZNANO (ne tiho).
  // ----------------------------------------------------------------------
  const etaInfo = useMemo(() => {
    if (!view?.next || !now) return null;
    const n = view.next.entry;
    if (
      geo.position &&
      typeof n.lat === "number" &&
      typeof n.lng === "number"
    ) {
      const leg = heuristicLeg(
        { lat: geo.position.lat, lng: geo.position.lng },
        { lat: n.lat, lng: n.lng }
      );
      const arrival = new Date(now.getTime() + leg.min * 60_000);
      return {
        unknown: false as const,
        hhmm: localeTime(arrival, lang),
        min: leg.min,
        km: leg.km,
      };
    }
    return { unknown: true as const };
  }, [view, now, geo.position, lang]);

  // ----------------------------------------------------------------------
  // W7 — VOICE VODIČ: skripti izgovora (deterministično iz dejstev istega
  // pogleda, ki ga vidi zaslon — Issue #9 ZERO-AI). »Kaj je v bližini«
  // izvzame geo-točke današnjih postankov (W8 načelo razpršitve:
  // bližina je za ODKRIVANJE, ne ponavljanje dneva). Izklop GPS počisti
  // položaj → gumb naravno izgine (fail-closed, kanon DistanceChip).
  // ----------------------------------------------------------------------
  /** Geo-točke današnjih postankov (izvzem iz »kaj je v bližini«). */
  const dayStopCoords = useMemo(() => {
    if (!view) return [];
    return [view.next, ...view.remaining, ...view.done]
      .filter((c): c is GoEntryCard => c != null)
      .map((c) =>
        typeof c.entry.lat === "number" && typeof c.entry.lng === "number"
          ? { lat: c.entry.lat, lng: c.entry.lng }
          : null
      )
      .filter((p): p is { lat: number; lng: number } => p !== null);
  }, [view]);
  /** Pripoved »kaj je v bližini« — SAMO z živim GPS (sicer null → brez
   *  gumba); 0 destinacij v radiju → null (iskrena odsotnost). */
  const nearbyScript = useMemo(
    () =>
      geo.position
        ? buildNearbyNarration(geo.position, lang, dayStopCoords)
        : null,
    [geo.position, lang, dayStopCoords]
  );

  // ----------------------------------------------------------------------
  // ISSUE #21 §11 — REZERVACIJSKI KONTEKST (SAMO ZA BRANJE): učinkovite
  // JourneyBooking vrstice za danes relevantne postanke (isti GET kanal
  // kot MOJA POT prekrivka — provider:productId, obseg seje). Go Mode NE
  // piše rezervacij (piše le EXTERNAL handoff ob kliku — obstoječe);
  // status ostaja resnica strežnika, brez vrstice žetona NI (iskrena
  // odsotnost). Fail-closed: napaka omrežja NE blokira načrta.
  // ----------------------------------------------------------------------
  const [bookingRows, setBookingRows] = useState<
    { key: string; status: string; providerBookingId: string | null }[]
  >([]);
  const overlayProducts = useMemo(() => {
    if (!view) return [];
    const entries = [view.next, ...view.remaining, ...view.skipped]
      .filter((c): c is GoEntryCard => c != null)
      .map((c) => c.entry);
    const keys = entries
      .filter(
        (e) =>
          e.provider != null &&
          e.providerProductId != null &&
          e.status === "EXTERNAL"
      )
      .map((e) => `${e.provider}:${e.providerProductId}`);
    return Array.from(new Set(keys)).slice(0, 20);
  }, [view]);
  const overlayQuery =
    overlayProducts.length > 0 ? overlayProducts.join(",") : null;

  useEffect(() => {
    if (!overlayQuery) {
      setBookingRows([]);
      return;
    }
    let active = true;
    const sid = plannerSessionId();
    (async () => {
      try {
        const res = await fetch(
          `/api/journey/bookings?products=${encodeURIComponent(overlayQuery)}&sessionKey=${encodeURIComponent(sid)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          bookings?: {
            provider: string;
            providerProductId: string;
            status: string;
            providerBookingId?: string | null;
          }[];
        };
        if (active && Array.isArray(data.bookings)) {
          setBookingRows(
            data.bookings.map((b) => ({
              key: `${b.provider}:${b.providerProductId}`,
              status: b.status,
              providerBookingId: b.providerBookingId ?? null,
            }))
          );
        }
      } catch {
        // Neblokirajoče — prekrivka je izboljšava, ne obveza (brez nje
        // vidimo enako iskrene načrtovane statuse).
      }
    })();
    return () => {
      active = false;
    };
  }, [overlayQuery]);

  /** Žeton rezervacije za postanek (SAMO če DEJANSKA vrstica obstaja). */
  const bookingRowByKey = useMemo(
    () => new Map(bookingRows.map((r) => [r.key, r] as const)),
    [bookingRows]
  );

  const bookingBadgeOf = useCallback(
    (entry: { provider?: string; providerProductId?: string }) => {
      if (entry.provider == null || entry.providerProductId == null) return null;
      const row = bookingRowByKey.get(`${entry.provider}:${entry.providerProductId}`);
      if (!row) return null;
      const label =
        CONFIRMATION_STATUS_LABELS[row.status as ConfirmationStatus];
      return { status: row.status, label };
    },
    [bookingRowByKey]
  );

  const toggleDone = useCallback((key: string) => {
    setDone((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = new Date().toISOString();
      saveGoProgress(next);
      return next;
    });
    // ISSUE #21 §12: opravitev/postanek izstopi iz preskokov (ena resnica
    // na postanek: ali je opravljen ALI preskočen ALI odprt — nikoli oboje).
    setSkipped((prev) => {
      if (!prev[key]) return prev;
      const nextS = { ...prev };
      delete nextS[key];
      saveGoSkipped(nextS);
      return nextS;
    });
  }, []);

  /** ISSUE #21 §5: preskok pod nadzorom uporabnika — postanek IZPADA iz
   * naslednjega toka (a ostaja danes; Obnovi ga vrne). NI opravitev. */
  const toggleSkip = useCallback((key: string) => {
    setSkipped((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = new Date().toISOString();
      saveGoSkipped(next);
      return next;
    });
    setDone((prev) => {
      if (!prev[key]) return prev;
      const nextD = { ...prev };
      delete nextD[key];
      saveGoProgress(nextD);
      return nextD;
    });
  }, []);

  const endGoMode = useCallback(() => {
    clearGoTrip();
    setRecord(null);
    setDone({});
    setSkipped({});
  }, []);

  // ----------------------------------------------------------------------
  // ISSUE #22 — TRAVEL GUARDIAN (1.162.0): stanje dneva + konflikti +
  // recovery + jutranji povzetek + prosti čas. Vse ČISTE projekcije
  // ISTIH podatkov, ki jih vidi zaslon (0 novih virov resnice, 0 nove
  // persistance — slika dneva se preračuna iz (pot + progress + ura + GPS),
  // kanon #21 §9).
  // ----------------------------------------------------------------------
  const guardian = useMemo(
    () =>
      view && now
        ? buildGuardian({
            view,
            now,
            position: geo.position,
            bookingRows,
          })
        : null,
    [view, now, geo.position, bookingRows]
  );

  const recovery = useMemo(
    () =>
      view && now && guardian
        ? assessRecovery({
            view,
            now,
            conflicts: guardian.conflicts,
            position: geo.position,
          })
        : null,
    [view, now, guardian, geo.position]
  );

  const dayStart = useMemo(
    () =>
      view && now
        ? buildDayStartSummary({
            view,
            now,
            conflicts: guardian?.conflicts ?? [],
            gpsActive: geo.status === "active",
          })
        : null,
    [view, now, guardian, geo.status]
  );

  const freeTime = useMemo(
    () =>
      view && now
        ? detectFreeTimeWindow({
            view,
            now,
            position: geo.position,
            arrived: view.next?.travel?.status === "arrived",
          })
        : null,
    [view, now, geo.position]
  );

  // SMART FREE-TIME kandidati (§9/§11): SAMO po uporabnikovi izbiri
  // kategorije + živem oknu — /api/map/pins z bbox okoli GPS (groba
  // posplošitev ~5 km, brez natančne pozicije naprej), nato ČISTI
  // varnostni filter (celotna zanka ≤ okno − rezerva). Fail-closed:
  // napaka/brez signala → iskrena opomba, načrt deluje naprej.
  const [nearbyCategory, setNearbyCategory] =
    useState<GuardianNearbyCategory | null>(null);
  const [nearbyFits, setNearbyFits] = useState<NearbyFit[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyUnavailable, setNearbyUnavailable] = useState(false);
  const [nearbyFeedback, setNearbyFeedback] = useState<GoStrings | null>(null);

  /** Ključ nalaganja: kategorija + groba pozicija (~100 m) + dolžina okna —
   *  refetch SAMO ob dejanski spremembi (nov fix < 100 m tika ne sproži). */
  const nearbyLastKeyRef = useRef<string | null>(null);
  const nbLat = geo.position?.lat ?? null;
  const nbLng = geo.position?.lng ?? null;
  const nbMinutes = freeTime?.minutes ?? null;
  const nbKey =
    nearbyCategory != null && nbLat != null && nbLng != null && nbMinutes != null
      ? `${nearbyCategory}@${nbLat.toFixed(3)},${nbLng.toFixed(3)}@${nbMinutes}`
      : null;

  // Nalagalnik kandidatov: LAST-WRITE-WINS PO KLJUČU (brez AbortController —
  // PROD DOKAZ #22: abort ob vsaki GPS fiksaciji (2 s) je ubil vsak fetch,
  // dedupe pa prepovedoval ponovni poskus; rezultat = vedno prazno). Vsak
  // tek teče do konca; zastareli izpisi se zavržejo s primerjavo ključa
  // (novejša zahteva je med tem zmagala). Brez signala NI AbortError catch-a.
  useEffect(() => {
    if (
      !view ||
      !now ||
      !freeTime ||
      nearbyCategory == null ||
      nbLat == null ||
      nbLng == null
    ) {
      return;
    }
    if (nbKey == null || nearbyLastKeyRef.current === nbKey) return; // dedupe
    const runKey = nbKey;
    nearbyLastKeyRef.current = runKey;
    (async () => {
      setNearbyLoading(true);
      try {
        const cats = CATEGORY_TO_PRODUCT_TYPES[nearbyCategory].join(",");
        const bbox = nearbyBbox({ lat: nbLat, lng: nbLng }, 5);
        const res = await fetch(
          `/api/map/pins?bbox=${encodeURIComponent(bbox)}&zoom=13&cats=${encodeURIComponent(cats)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          pins?: { id: string; name: string; lat: number; lng: number; type: string }[];
        };
        if (nearbyLastKeyRef.current !== runKey) return; // nadigrana zahteva
        const candidates: NearbyCandidate[] = (data.pins ?? [])
          .map((p) => {
            const category = NEARBY_CATEGORY_OF[p.type as keyof typeof NEARBY_CATEGORY_OF];
            if (category == null) return null;
            return {
              key: p.id,
              title: p.name,
              lat: p.lat,
              lng: p.lng,
              category,
            } satisfies NearbyCandidate;
          })
          .filter((c): c is NearbyCandidate => c != null);
        const next = view.next;
        const nextStop =
          next && next.geo.lat != null && next.geo.lng != null
            ? { lat: next.geo.lat, lng: next.geo.lng }
            : null;
        const fits = filterNearbyCandidates({
          candidates,
          position: { lat: nbLat, lng: nbLng },
          window: freeTime,
          now,
          exclude: dayStopCoords,
          nextStop,
          category: nearbyCategory,
        });
        if (nearbyLastKeyRef.current !== runKey) return; // nadigrana zahteva
        setNearbyFits(fits);
        setNearbyUnavailable(false);
      } catch {
        if (nearbyLastKeyRef.current !== runKey) return;
        setNearbyFits([]);
        setNearbyUnavailable(true);
      } finally {
        if (nearbyLastKeyRef.current === runKey) setNearbyLoading(false);
      }
    })();
  }, [view, now, freeTime, nearbyCategory, nbLat, nbLng, nbMinutes, nbKey, dayStopCoords]);

  /** §9 E2E-8: dodaj kandidata v mojo pot (SAMO v2 zapis — čista projekcija
   *  go-edit.ts + persistanca saveItineraryGoTrip; v1: iskrena opomba).
   *  ISSUE #24 Sklop 9 (1.171.0) — SREDI DNEVA (TripIt Nearby vzorec): kadar
   *  obstaja naslednji postanek, kandidat iz prostega časa gre PRED NJEGA
   *  (obišče se ZDAJ), sicer na konec dneva (staro vedenje). Vstavek nikoli
   *  ne preureja obstoječih postankov; varnost okna (zanka ≤ okno − rezerva)
   *  je bila preverjena V filterNearbyCandidates PRED dodajanjem. */
  const addNearby = useCallback(
    (fit: NearbyFit) => {
      if (!record || !view) return;
      if (!canAddNearbyStops(record)) {
        setNearbyFeedback(GO_EDIT_LABELS.notPossibleV1);
        return;
      }
      const beforeKey = view.next?.entry.key ?? null;
      const updated = addNearbyStopToRecord(
        record,
        {
          id: fit.candidate.key,
          name: fit.candidate.title,
          lat: fit.candidate.lat,
          lng: fit.candidate.lng,
          category: fit.candidate.category,
        },
        view.activeDayIndex,
        { beforeKey }
      );
      if (!updated) return;
      const shareId = record.version === 2 ? record.shareId : undefined;
      if (!saveItineraryGoTrip(updated.view, { shareId })) return;
      setRecord(updated);
      // Kje je kandidat dejansko pristal? (beforeKey iz AKTIVNEGA dneva je
      // vedno najden — a obrambno preverimo položaj v posodobljenem dnevu:
      // zadnji mestec = konec dneva, sicer = sredi dneva pred naslednjim.)
      const newKey = `nearby:${fit.candidate.key}`;
      const dayEntries = updated.view.days[view.activeDayIndex]?.entries ?? [];
      const newIndex = dayEntries.findIndex((e) => e.key === newKey);
      const isMid = newIndex !== -1 && newIndex < dayEntries.length - 1;
      // Sklop 8: en vir resnice (GO_EDIT_LABELS) — Sklop 9: pravo sporočilo
      // glede na DEJANSKI položaj vstavitve (sredina ne obljubljamo, če je
      // padlo na konec — npr. prazen dan robni primer).
      setNearbyFeedback(
        goAll(
          isMid ? GO_EDIT_LABELS.addedMid : GO_EDIT_LABELS.added,
          fit.candidate.title
        )
      );
      // Telemetrija (brez PII — samo položaj vstavitve, ne ime/geo kandidata):
      // meri, koliko dodajanj gre SREDI dneva (TripIt vzorec) vs. konec.
      trackPlannerEvent("nearby_stop_added", { position: isMid ? "mid" : "end" });
    },
    [record, view]
  );

  /** §8: Guardian akcije — vse izvede uporabnik prek obstoječih mehanizmov
   *  (navigacijski handoff #21, preskok #21, planer, rezervacija pri
   *  ponudniku). Guardian SAMO predlaga — nikoli ne piše rezervacij. */
  const onGuardianAction = useCallback(
    (
      action: RecoverySuggestionAction | GuardianActionId,
      conflict: GuardianConflict
    ) => {
      if (!view || !record) return;
      if (action === "NAVIGATE" && view.next) {
        const links = goNavLinks(view.next.entry, geo.position ?? null);
        if (links != null) {
          if (isCoarsePointer()) {
            window.location.href = links.geo;
          } else {
            window.open(links.web, "_blank", "noopener,noreferrer");
          }
        }
        return;
      }
      if (action === "SKIP") {
        toggleSkip(conflict.stopKey);
        return;
      }
      if (action === "COMPLETE") {
        toggleDone(conflict.stopKey);
        return;
      }
      if (action === "ADJUST_PLAN") {
        // ISTA destinacija kot gumb „Nazaj na načrt" (en vir resnice).
        const href =
          record.version === 2
            ? record.shareId
              ? `/pot/${record.shareId}`
              : "/nacrtuj"
            : "/potovanje";
        window.location.assign(href);
        return;
      }
      if (action === "VIEW_BOOKING" || action === "CONTINUE") {
        // Odpri rezervacijo pri ponudniku (kanonični vir) — sicer nadaljuj
        // tok: pomakni se na NASLEDNJE (primarna odločitev ostane vidna).
        if (action === "VIEW_BOOKING" && view.next && conflict.stopKey === view.next.entry.key) {
          const url = view.next.entry.bookingUrl ?? view.next.entry.sourceUrl;
          if (url) {
            window.open(url, "_blank", "noopener,noreferrer");
            return;
          }
        }
        document
          .getElementById("naslednje")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [view, record, geo.position, toggleSkip, toggleDone]
  );

  /** §13: ZAČNI DAN — vklopi GPS (permission SAMO na uporabnikovo dejanje,
   *  kanon #21 §9) + pomakni na naslednji cilj (živi tok prevzame). */
  const startDay = useCallback(() => {
    if (geo.status !== "active") geo.start();
    document
      .getElementById("naslednje")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [geo]);


  // --- Skeleton (SSR == prvi klientni render; ura še ni hydratana) ---
  if (!now) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // --- Prazen stanje: ni shranjenega načrta (ali zaključen Go Mode) ---
  // TASK 4 / K-7: DVA izhoda — potovanje iz /potovanje (kanonična pot) ALI
  // AI načrt (nacrtuj → „Zaženi Na poti“; revizija: uporabnik AI načrta ni
  // vedel, da Go Mode obstaja zanj — empty state je vodil SAMO v /potovanje).
  if (!record || !view) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <Compass className="h-10 w-10 text-muted-foreground" />
          <h2 className="text-xl font-semibold">{t(L.empty.title)}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {t(L.empty.desc)}
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            {t(L.empty.descAi)}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg" className="h-12">
              <Link href="/potovanje">
                <NavigationIcon className="mr-2 h-4 w-4" />
                {t(L.empty.cta)}
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12">
              <Link href="/nacrtuj">
                <Wand2 className="mr-2 h-4 w-4" />
                {t(L.empty.ctaAi)}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusLabel = L.gps.status[geo.status];

  return (
    <div className="space-y-4">
      {/* === GLAVA: naslov + živa ura + aktivni dan === */}
      <Card className="border-emerald-600/40 dark:border-emerald-500/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t(view.title)}
            </p>
            <p className="text-lg font-semibold leading-tight">
              {t(view.activeDayLabel)}
            </p>
            {view.activeDayNote && (
              <p className="text-xs text-muted-foreground">
                {t(view.activeDayNote)}
              </p>
            )}
          </div>
          <div className="text-right" role="status" aria-live="off">
            <p className="text-xs text-muted-foreground">
              {t(L.now)} ·{" "}
              {now.toLocaleDateString(goLocaleTag(lang), {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </p>
            <p className="text-4xl font-bold tabular-nums tracking-tight">
              {localeTime(now, lang)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* === ISSUE #22 (1.162.0) — TRAVEL GUARDIAN: stanje dneva ===
          🟢/🟠/🔴/⚪ na enem pogledu z DEJANSKIMI številkami (ONE DECISION
          AT A TIME §21 — tehniški izraz "Trip Health" NI izpisan §30.E).
          Konflikt kartica (samo ob pozornosti) nosi FACTS → RAZLOG →
          POSLEDICO + uporabnikove akcije (§8 — Discover nikoli ne spremeni
          rezervacije namesto uporabnika). ZAČNI DAN povzetek (§13) ponudi
          jutranji vstop v živi tok. */}
      {guardian && <GuardianBanner snapshot={guardian} lang={lang} />}
      {guardian && guardian.topConflict && (
        <GuardianConflictCard
          conflict={guardian.topConflict}
          recovery={recovery}
          lang={lang}
          onAction={onGuardianAction}
          isNextStop={guardian.topConflict.stopKey === view.next?.entry.key}
        />
      )}
      {dayStart?.applicable && (
        <GuardianDayStartSection summary={dayStart} lang={lang} onStartDay={startDay} />
      )}

      {/* === ISSUE #4 §16 (val 4): DNEVNA NAVIGACIJA — preklapljanje dni ===
          Zahteva naročnika (§16): "navigate days" tudi brez signala —
          prej je bil aktiven dan SAMODEN (po datumu) in so bili kasnejši
          dnevi le bralni povzetek. Zdaj: čipi vseh dni + gumb »Danes«
          (vrne samodejno izbiro); izbira preživi tick ure/GPS. */}
      {view.daySwitcher.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t(L.dayNav)}
              </p>
              {view.dayManuallySelected && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDayOverride(null)}
                  aria-label={t(L.dayToday)}
                >
                  <CalendarCheck className="h-4 w-4" aria-hidden />
                  {t(L.dayToday)}
                </Button>
              )}
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t(L.dayNav)}
            >
              {view.daySwitcher.map((d) => {
                const isSelected =
                  view.dayManuallySelected && d.index === dayOverride;
                const isAuto =
                  !view.dayManuallySelected &&
                  d.label.sl === view.activeDayLabel.sl;
                return (
                  <button
                    key={d.index}
                    type="button"
                    onClick={() => setDayOverride(d.index)}
                    aria-pressed={isSelected || isAuto}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      isSelected || isAuto
                        ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500/60 dark:bg-emerald-950 dark:text-emerald-300"
                        : "border-border bg-background text-muted-foreground hover:border-emerald-600/40 hover:text-foreground"
                    }`}
                  >
                    {t(d.label)}
                    {d.isToday && (
                      <span
                        className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300"
                        title={t(L.dayToday)}
                      >
                        {t(L.dayToday)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {view.dayManuallySelected && (
              <p className="text-xs text-muted-foreground">{t(L.dayManual)}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* === NASLEDNJE (hero kartica) === */}
      {/* TASK 8 / F2-B (§24 hierarhija NOW → NEXT → WHEN → HOW → CONTEXT):
          NASLEDNJE je druga kartica (ne četrta) — primarni tok po GLAVI.
          GPS NADZOR (HOW) je premaknjen POD naslednjo kartico. */}
      {view.next ? (
        <Card id="naslednje" className="border-emerald-500 ring-1 ring-emerald-500/50">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                ▸ {t(L.next)}
              </p>
              {view.next.countdownMin != null && (
                <Badge className="border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  {GFn(lang, GO_LABELS.countdown)(view.next.countdownMin)}
                </Badge>
              )}
            </div>

            <div className="flex items-start gap-3">
              <span aria-hidden className="text-4xl leading-none">
                {view.next.entry.icon}
              </span>
              <div className="min-w-0 space-y-1">
                <h2 className="text-2xl font-bold leading-tight">
                  {view.next.entry.title}
                </h2>
                {view.next.entry.time?.start && (
                  <p className="text-sm text-muted-foreground">
                    {view.next.entry.time.start}
                    {view.next.entry.time.end
                      ? `–${view.next.entry.time.end}`
                      : ""}
                  </p>
                )}
                {view.next.entry.timeNote && !view.next.entry.time && (
                  <p className="text-xs italic text-muted-foreground">
                    {t(view.next.entry.timeNote)}
                  </p>
                )}
                {view.next.entry.location && (
                  <p className="text-sm text-muted-foreground">
                    <MapPin className="mr-1 inline h-3.5 w-3.5" />
                    {view.next.entry.location}
                  </p>
                )}

                {/* === ISSUE #4 §8 (val 2): PREDVIDEN PRIHOD (ETA) ===
                    SAMO iz realnih vhodov (GPS + geo postanka); sicer
                    izrecno NEZNANO — nikoli izmišljen promet. */}
                {etaInfo && (
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    {etaInfo.unknown ? (
                      <p className="text-xs text-muted-foreground">
                        {t(L.eta.unknown)}
                      </p>
                    ) : (
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t(L.eta.label)}
                        </span>
                        <span className="font-semibold tabular-nums">
                          ~{etaInfo.hhmm}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          (~{etaInfo.km} km · ~{etaInfo.min} {GL(lang, L.min)} ·{" "}
                          {t(L.eta.hint)})
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* === ISSUE #21 — ARRIVAL UX (§7, §10): Približuješ se → ✓ Prišel si.
                STABILEN prihod (geofence + hystereza + min. čas — čista plast
                travel-state.ts). role=status: bralniki zaslišijo prehod.
                GPS prihod je IZRECNO ločen od rezervacije (dve resnici §3). === */}
            {view.next.travel?.status === "near_destination" &&
              view.next.travel.arrivalM != null && (
                <p
                  role="status"
                  className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                >
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {GFn(lang, ARRIVAL_LABELS.near)(view.next.travel.arrivalM)}
                </p>
              )}
            {view.next.travel?.status === "arrived" && (
              <div
                role="status"
                className="space-y-1 rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-2 dark:border-emerald-700 dark:bg-emerald-950"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  <span aria-hidden>✓</span>
                  {GFn(lang, ARRIVAL_LABELS.arrived)(view.next.entry.title)}
                </p>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
                  {t(ARRIVAL_LABELS.arrivedHint)}
                </p>
              </div>
            )}

            {/* === TASK 65: VREME PRI NASLEDNJI POSTANKI ===
                Živi Open-Meteo (prek /api/weather, brez ključa). ISKRENOST:
                postanek brez geo → trak SE NE PRIKAŽE (kot razdalja); napaka
                vira/brez signala → iskrena opomba (načrt dela naprej); vir in
                čas meritve sta izrecno navedena. */}
            {wLat != null && wLng != null && (
              <div
                className="rounded-lg border bg-muted/30 px-3 py-2"
                aria-label={t(GO_WEATHER_LABELS.title)}
              >
                <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <CloudSun className="h-3 w-3" aria-hidden="true" />
                  {t(GO_WEATHER_LABELS.title)}
                </p>
                {weatherLoading ? (
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-7 rounded-full" />
                    <Skeleton className="h-4 w-44" />
                  </div>
                ) : weatherFailed || !weather ? (
                  <p className="text-xs text-muted-foreground">
                    {t(GO_WEATHER_LABELS.unavailable)}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span
                      className="text-xl leading-none"
                      role="img"
                      aria-label={weather.condition}
                    >
                      {weather.icon}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {weather.temp} °C
                    </span>
                    <span className="capitalize text-muted-foreground">
                      {weather.condition}
                    </span>
                    {weather.today && (
                      <span className="text-muted-foreground">
                        {GFn(lang, GO_WEATHER_LABELS.today)(weather.today)}
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {weather.observedAt &&
                        observedTimeLabel(weather.observedAt) &&
                        `${GFn(lang, GO_WEATHER_LABELS.observed)(
                          observedTimeLabel(weather.observedAt) as string
                        )} · `}
                      {t(GO_WEATHER_LABELS.source)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              <DistanceChip card={view.next} lang={lang} />
              {/* ISSUE #4 §8: vožnja od prejšnjega postanka (OSRM/ocena). */}
              <LegChip card={view.next} lang={lang} />
              {/* ISSUE #21 §4 (1.161.0) — ISKRENA GEO NATANČNOST CILJA:
                  lastna tržnica = preverjeno, zunanji viri = približno
                  (vir poimenovan — uporabnik ve, čemur zaupa). missing/
                  invalid se pokaže nad gumbi (NAVIGIRAJ tam ne obstaja). */}
              {view.next.geo.precision === "exact" && (
                <Badge variant="outline" className="font-normal text-muted-foreground">
                  {t(STOP_GEO_LABELS.exact)}
                </Badge>
              )}
              {view.next.geo.precision === "approximate" && (
                <Badge variant="outline" className="font-normal text-muted-foreground">
                  {GFn(lang, STOP_GEO_LABELS.approximate)(view.next.geo.source)}
                </Badge>
              )}
              <Badge variant="secondary">{t(view.next.entry.statusLabel)}</Badge>
              {/* ISSUE #21 §11: DEJANSKI rezervacijski status iz JourneyBooking
                  vrstice (samo za branje; brez vrstice žetona NI — ne
                  izmišljujemo rezervacije). */}
              {(() => {
                const b = bookingBadgeOf(view.next.entry);
                return b?.label ? (
                  <Badge className="border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-50 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200">
                    {t(L.bookingChip)}: {t(b.label)}
                  </Badge>
                ) : null;
              })()}
              {view.next.entry.durationMin != null && (
                <Badge variant="outline">
                  {GL(lang, L.duration)} ~{view.next.entry.durationMin} {GL(lang, L.min)}
                </Badge>
              )}
              {/* W7 — glasovni vodik: izgovor NASLEDNJEGA postanka (ista
                  dejstva kot zaslon, povedana z brskalniškim glasom —
                  telefon v žepu, hoja proti postanku). Fail-closed: brez
                  uporabne pripovedi ga NI (nikoli 0-dejavni gumb). */}
              <GoAudioButton
                script={buildStopNarration(view.next, lang)}
                lang={lang}
                kind="stop"
                title={view.next.entry.title}
              />
            </div>

            {/* ISSUE #4 §9: status ur ob TRENUTKU (OPEN/CLOSED/UNKNOWN)
                + surov niz vira (nič ne izgubimo). §8: vir brez ur →
                izrecno URA NEZNANA (ne tiha odsotnost). */}
            <div className="text-xs text-muted-foreground">
              <span className="mr-1">{t(L.hours)}:</span>
              <OpeningHoursStatus
                raw={view.next.entry.openingHours}
                lang={lang}
                missingLabel={L.hoursMissing}
                className="text-xs"
              />
            </div>

            {/* === ISSUE #4 §8: ZAMUDE/PROMET — pošteno NEZNANO (nikoli
                lažni „open now / traffic“) === */}
            <p
              className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground"
              role="note"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t(L.delay)}
            </p>

            <EntryLinks card={view.next} lang={lang} />

            {/* ISSUE #21 §4/§18-7/8 (1.161.0) — cilj BREZ uporabne lokacije:
                NAVIGIRAJ izrecno NE obstaja in to POVEMO (ne tiha luknja —
                „kje je gumb?“ je slaba izkušnja; „vir lokacije je podal
                napačne podatke“ je iskrena resnica). */}
            {!isNavigableGeo(view.next.geo) && (
              <p
                className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground"
                role="note"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {t(
                  view.next.geo.precision === "invalid"
                    ? STOP_GEO_LABELS.invalid
                    : STOP_GEO_LABELS.missing
                )}
              </p>
            )}

            {/* TASK 67: navigacijski handoff + opravljanje — navigacija je
                prva akcija ob postanku, opravi druga (mobilno: skupaj full-width).
                ISSUE #21 §5: PRESKOČI je tretja, tiha akcija (ghost — ne
                tekmuje z Navgiraj/Opravi; preskok ≠ opravitev). */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <NavButton
                card={view.next}
                lang={lang}
                origin={geo.position}
              />
              <Button
                onClick={() => toggleDone(view.next!.entry.key)}
                size="lg"
                className={`h-12 flex-1 text-base ${
                  view.next.travel?.status === "arrived"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : ""
                }`}
              >
                <span className="truncate">
                  ✓ {t(L.complete)}: {view.next.entry.title}
                </span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => toggleSkip(view.next!.entry.key)}
                className="h-12 shrink-0 px-4 text-muted-foreground"
                aria-label={`${t(L.skip)}: ${view.next.entry.title}`}
                title={t(L.skipHint)}
              >
                <SkipForward className="mr-1 h-4 w-4" aria-hidden="true" />
                {t(L.skip)}
              </Button>
            </div>

            {/* === TASK 102 — ISSUE #21 §10/§12: »NASLEDNJE PO TEM« ===
                Kompaktni napovednik naslednjega cilja po trenutnem —
                uporabnik se NE vrača v planer po naslednji cilj (§12).
                Zadnji postanek dneva → iskrena opomba (brez izmišljanja). */}
            <div
              className="rounded-lg border border-dashed px-3 py-2 text-sm"
              role="note"
              aria-label={t(L.nextAfter)}
            >
              {view.nextAfter ? (
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t(L.nextAfter)}
                  </span>
                  <span className="font-medium">
                    {view.nextAfter.entry.icon} {view.nextAfter.entry.title}
                  </span>
                  {view.nextAfter.entry.time?.start && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {view.nextAfter.entry.time.start}
                    </span>
                  )}
                  {view.nextAfter.distanceKm != null && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      · {view.nextAfter.distanceKm} km ({t(L.inAir)})
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t(L.nextAfterEmpty)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : view.remaining.length === 0 &&
        view.laterDays.every((d) => d.count === 0) &&
        view.done.length + view.skipped.length > 0 ? (
        /* === ISSUE #23 (1.163.0) — TERMINALNO STANJE: zadnji postanek
            zadnjega dne opravljen → povzetek POT ZAKLJUČENA + naslednji
            koraki (deljenje/nova pot). Prej: golo „ni več postankov"
            (revizija Faze A: največja vrzel verige). Dan z nadaljnjimi
            dnevi OSTANE pri iskrenem noEntryLeft sporočilu. === */
        <TripComplete
          lang={lang}
          days={trip?.days.length ?? 1}
          doneTotal={
            trip?.days.reduce(
              (sum, d) => sum + d.entries.filter((e) => done[e.key]).length,
              0,
            ) ?? view.done.length
          }
          skippedTotal={
            trip?.days.reduce(
              (sum, d) => sum + d.entries.filter((e) => skipped[e.key]).length,
              0,
            ) ?? view.skipped.length
          }
          savedTripHref={
            record?.version === 2 && record.shareId ? `/pot/${record.shareId}` : null
          }
        />
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {t(GO_LABELS.noEntryLeft)}
          </CardContent>
        </Card>
      )}

      {/* === ISSUE #22 §9/§10 (1.162.0) — SMART FREE-TIME ===
          SAMO kadar DEJANSKO obstaja prosto okno (fiksni termin v prihodnosti
          − vožnja − varnostna rezerva ≥ 30 min); kandidati so prefiltrirani
          skozi varnostna vrata (celotna zanka ≤ okno — zamuda ni mogoča). */}
      {freeTime && (
        <GuardianFreeTimeSection
          window={freeTime}
          lang={lang}
          selectedCategory={nearbyCategory}
          onCategorySelect={(cat) => {
            setNearbyCategory(cat);
            setNearbyFeedback(null);
          }}
          fits={nearbyFits}
          loading={nearbyLoading}
          unavailable={nearbyUnavailable}
          canAdd={record != null && canAddNearbyStops(record)}
          note={nearbyFeedback}
          onAdd={addNearby}
        />
      )}

      {/* === TASK 102 — SHEMA DNEVA + ZEMLJEVID DNEVA (ISSUE #21 §10) ===
          Cel dan na en pogled (odgovor na najmočnejšo prednost vodilčih —
          vizualni pregled), a ISKRENO: shematsko po vrstnem redu načrta,
          deluje offline; polni zemljevid je IZRECNO zunanji handoff
          (isti kanon kot NAVIGIRAJ — fail-closed brez koordinat). */}
      <GoDayLine
        line={view.line}
        origin={geo.position}
        lang={lang}
      />

      {/* === GPS NADZOR (HOW) — TASK 8 / F2-B: premaknjen pod NASLEDNJO
          (§24: navigacijska orodja sledijo primarnemu toku, ne prekinjajo
          NOW → NEXT). Vsa zmožnost nespremenjena. === */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {geo.status === "requesting" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed
                  className={`h-4 w-4 ${
                    geo.status === "active" ? "text-emerald-600" : "text-muted-foreground"
                  }`}
                />
              )}
              {t(statusLabel)}
              {geo.status === "active" && geo.position?.accuracyM != null && (
                <span className="text-xs font-normal text-muted-foreground">
                  {GFn(lang, L.gps.accuracy)(geo.position.accuracyM)}
                </span>
              )}
              {/* ISSUE #21 §6 (1.161.0) — RAZRED natančnosti (high/medium/
                  low): uporabnik vidi KAKO natančno je fiksacija, ne samo
                  ±X m — nizka opozori, da razdalji ne gre zaupati do metre. */}
              {geo.status === "active" && view?.positionAccuracyClass != null && (
                <span className="text-xs font-normal text-muted-foreground">
                  · {t(ACCURACY_CLASS_LABELS[view.positionAccuracyClass])}
                </span>
              )}
              {/* ISSUE #21 §10 (1.161.0) — WAKE LOCK: prikaz SAMO kadar je
                  DEJANSKO pridržan (brez obljub, ki jih brskalnik lahko
                  prelomi — battery saver/vidnost ga odvzame). */}
              {geo.status === "active" && wake.held && (
                <span className="text-xs font-normal text-emerald-700 dark:text-emerald-400">
                  · {t(L.gps.wake)}
                </span>
              )}
              {/* ISSUE #21 §6: zastarela fiksacija se IZREČNO pokaže (ne
                  izrekamo svežine — ura že tiktaka vsakih 30 s). */}
              {geo.status === "active" &&
                geo.position &&
                view?.positionStale &&
                now && (
                  <span className="text-xs font-normal text-amber-700 dark:text-amber-400">
                    {GFn(lang, ARRIVAL_LABELS.stale)(
                      Math.max(
                        1,
                        Math.round(
                          positionAgeMs(geo.position.timestamp, now.getTime()) /
                            60_000
                        )
                      )
                    )}
                  </span>
                )}
            </p>
            <p className="text-xs text-muted-foreground">
              {geo.position
                ? t(GO_LABELS.positionHint)
                : t(GO_LABELS.noPosition)}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {/* W7 — »kaj je v bližini«: destinacije okoli živega GPS
                (deterministično iz paketa — deluje tudi brez signala).
                SAMO kadar obstaja položaj (izklop GPS ga počisti) in
                pripoved (0 destinacij v radiju → iskrena odsotnost). */}
            <GoAudioButton
              script={nearbyScript}
              lang={lang}
              kind="nearby"
            />
            {geo.status === "idle" || geo.status === "denied" || geo.status === "unavailable" || geo.status === "error" ? (
              <Button
                onClick={geo.start}
                variant="outline"
                className="h-11"
                aria-label={t(L.gps.start)}
              >
                <LocateFixed className="mr-2 h-4 w-4" /> {t(L.gps.start)}
              </Button>
            ) : (
              <Button onClick={geo.stop} variant="outline" className="h-11">
                {t(L.gps.stop)}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* === ISSUE #4 §8 (val 2): POT DNEVA (vsota nog — OSRM/ocena) ===
          Samo kjer načrt nosi noge; delne ocene so pošteno razkrite
          (legsKnown/legsTotal). */}
      {view.activeDayRoute && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <RouteIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">
            {GFn(lang, L.dayRoute)(
              view.activeDayRoute.legsKnown + 1,
              view.activeDayRoute.km,
              view.activeDayRoute.min,
              t2(
                view.activeDayRoute.method === "osrm"
                  ? L.legSource.osrm
                  : view.activeDayRoute.method === "heuristic"
                    ? L.legSource.heuristic
                    : L.legSource.mixed,
                lang
              )
            )}
          </span>
          {view.activeDayRoute.legsKnown < view.activeDayRoute.legsTotal && (
            <span className="text-xs text-muted-foreground">
              ({view.activeDayRoute.legsKnown}/{view.activeDayRoute.legsTotal}{" "}
              {GL(lang, L.stops)})
            </span>
          )}
        </p>
      )}

      {/* === ISKRENOST: dan brez realnih ur === */}
      {!view.dayHasRealTime && (view.next || view.remaining.length > 0) && (
        <p className="px-1 text-xs text-muted-foreground">
          {t(GO_LABELS.noTimesToday)}
        </p>
      )}

      {/* === OSTALE POSTANKE DNEVA === */}
      {view.remaining.length > 0 && (
        <section aria-label={t(L.today)} className="space-y-3">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            {t(L.today)}
            <span className="text-sm font-normal text-muted-foreground">
              {view.remaining.length}
            </span>
          </h3>
          <div className="space-y-3">
            {view.remaining.map((card) => (
              <Card key={card.entry.key}>
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="flex items-center gap-2 font-medium leading-snug">
                      <span aria-hidden>{card.entry.icon}</span>
                      {card.entry.title}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {card.countdownMin != null && (
                        <Badge variant="outline">
                          {GFn(lang, GO_LABELS.countdown)(card.countdownMin)}
                        </Badge>
                      )}
                      {card.entry.time?.start && !card.countdownMin && (
                        <Badge variant="outline">{card.entry.time.start}</Badge>
                      )}
                      <DistanceChip card={card} lang={lang} />
                      <Badge variant="secondary">
                        {t(card.entry.statusLabel)}
                      </Badge>
                      {/* ISSUE #21 §11: dejanski rezervacijski status (branje). */}
                      {(() => {
                        const b = bookingBadgeOf(card.entry);
                        return b?.label ? (
                          <Badge className="border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-50 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200">
                            {t(L.bookingChip)}: {t(b.label)}
                          </Badge>
                        ) : null;
                      })()}
                    </div>
                    {card.entry.timeNote && !card.entry.time && (
                      <p className="text-xs italic text-muted-foreground">
                        {t(card.entry.timeNote)}
                      </p>
                    )}
                    {/* ISSUE #4 §9: ure + status tudi na preostalih
                        postankih dneva (prej: samo naslednja kartica).
                        §8: vir brez ur → izrecno URA NEZNANA. */}
                    <OpeningHoursStatus
                      raw={card.entry.openingHours}
                      lang={lang}
                      missingLabel={L.hoursMissing}
                      showRaw={false}
                      className="text-[11px]"
                    />
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {/* W7 — glasovni vodik tudi na preostalih postankih
                        dneva (samo ikona — kartica je kompaktna; polno
                        dejanje razkrije ARIA oznaka). */}
                    <GoAudioButton
                      script={buildStopNarration(card, lang)}
                      lang={lang}
                      kind="stop"
                      title={card.entry.title}
                      iconOnly
                    />
                    <NavButton
                      card={card}
                      lang={lang}
                      variant="icon"
                      origin={geo.position}
                    />
                    <Button
                      variant="outline"
                      onClick={() => toggleDone(card.entry.key)}
                      className="h-11 shrink-0"
                      aria-label={`${t(L.complete)}: ${card.entry.title}`}
                    >
                      ✓
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* === OPRABLJENE POSTANKE (zbirko) === */}
      {view.done.length > 0 && (
        <section aria-label={t(L.done)} className="space-y-2">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="flex w-full items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-sm font-medium hover:bg-muted/60"
          >
            <span>
              ✓ {t(L.done)} ({view.done.length})
            </span>
            {showDone ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showDone && (
            <div className="space-y-2">
              {view.done.map((card) => (
                <Card key={card.entry.key} className="opacity-75">
                  <CardContent className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span aria-hidden>{card.entry.icon}</span>
                        <s className="decoration-muted-foreground/60">
                          {card.entry.title}
                        </s>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {GFn(lang, GO_LABELS.doneAt)(card.doneAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleDone(card.entry.key)}
                      className="h-11 shrink-0"
                      aria-label={`${t(L.restore)}: ${card.entry.title}`}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* === ISSUE #21 §5: PRESKOČENI POSTANKI (zložljivo — kot opravljeno,
          a izrecno ločeno: preskok NI opravitev; Obnovi vrne v načrt) === */}
      {view.skipped.length > 0 && (
        <section aria-label={t(L.skippedSection)} className="space-y-2">
          <button
            type="button"
            onClick={() => setShowSkipped((v) => !v)}
            aria-expanded={showSkipped}
            className="flex w-full items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-sm font-medium hover:bg-muted/60"
          >
            <span>
              ⏭ {t(L.skippedSection)} ({view.skipped.length})
            </span>
            {showSkipped ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showSkipped && (
            <div className="space-y-2">
              {view.skipped.map((card) => (
                <Card key={card.entry.key} className="opacity-75">
                  <CardContent className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span aria-hidden>{card.entry.icon}</span>
                        <span className="text-muted-foreground">
                          {card.entry.title}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(L.skipHint)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSkip(card.entry.key)}
                      className="h-11 shrink-0"
                      aria-label={`${t(L.restore)}: ${card.entry.title}`}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* === NASLEDNJI DNEVI === */}
      {view.laterDays.length > 0 && (
        <section aria-label={t(L.laterDays)} className="space-y-2">
          <h3 className="text-base font-semibold">{t(L.laterDays)}</h3>
          <Card>
            <CardContent className="divide-y p-0">
              {view.laterDays.map((d, i) => (
                <div
                  key={`${t(d.dateLabel)}-${i}`}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <span className="text-muted-foreground">{t(d.dateLabel)}</span>
                  <span className="font-medium">
                    {d.count} {GL(lang, L.stops)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* === NAPREJ / KONEC === */}
      {/* ISSUE #4 §2 (val 2): v2 zapis s shareId → nazaj na SHRANJENO pot
          (/pot/{shareId} — strežniški objekt), ne na prazen načrtovalnik. */}
      <div className="flex flex-col gap-2 pt-2 sm:flex-row">
        <Button asChild variant="outline" className="h-11 sm:flex-1">
          {/* TASK 4 / K-7: nazaj na IZVORNI načrt — /nacrtuj za AI itinererje
              (v2), /potovanje za kanonična potovanja (v1). */}
          <Link
            href={
              record.version === 2
                ? record.shareId
                  ? `/pot/${record.shareId}`
                  : "/nacrtuj"
                : "/potovanje"
            }
          >
            {record.version === 2
              ? t(L.backToPlan)
              : t(L.planLink)}
          </Link>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="h-11 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950 sm:flex-1"
            >
              <Trash2 className="mr-2 h-4 w-4" /> {t(L.end)}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t(L.endConfirm.title)}</AlertDialogTitle>
              <AlertDialogDescription>
                {/* TASK 4 / K-7: iskren vir obnovitve glede na vrsto zapisa */}
                {record.version === 2 ? t(L.endConfirm.descAi) : t(L.endConfirm.desc)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">
                {t(L.endConfirm.cancel)}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={endGoMode}
                className="h-11 bg-red-600 hover:bg-red-700"
              >
                {t(L.endConfirm.action)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <p className="px-1 pb-2 text-center text-xs text-muted-foreground">
        {t(L.offline)}
        {/* ISSUE #4 §2: veza na shranjeno pot (strežniški objekt) — povezava
            je navaden URL (offline-varna: pokaže se ob kliku, ko je signal). */}
        {record.version === 2 && record.shareId && (
          <>
            {" · "}
            <Link
              href={`/pot/${record.shareId}`}
              className="font-medium underline underline-offset-2"
            >
              {t(L.savedTrip.link)}
            </Link>
          </>
        )}
        {/* ISSUE #4 §16 (val 4): matrika zmožnosti — iskrena ločitev
            kaj dela brez signala (ne splošna "offline" oznaka). */}
        <span className="mt-1 block">{t(L.offlineMatrix)}</span>
      </p>
    </div>
  );
}
