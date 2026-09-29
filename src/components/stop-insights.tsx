import Link from "next/link";
import {
  Calendar,
  ChevronDown,
  Clock,
  Euro,
  HelpCircle,
  Info,
  TriangleAlert,
} from "lucide-react";

import {
  destinationById,
  durationLabelFor,
  weatherSuitabilityOf,
  DESTINATIONS_DATA_AS_OF,
} from "@/lib/stop-insights";
import { classifyFreshness, freshnessLabel } from "@/lib/data-freshness";
import type { LocationVisit } from "@/lib/types";

// ============================================================================
// STOP INSIGHTS (Faza 4-1 + 4-3) — razlaga in praktični podatki postanka
// ============================================================================
//
// 4-1 "Zakaj je to priporočeno?": prikaže visit.reason — kratko, podatkovno
//     utemeljeno razlago (interesi, tip skupine, razdalja, vreme, sezona),
//     ki jo je sestavil server iz dejstev. Brez marketinških fraz.
//
// 4-3 "Preveri praktične podatke": prikaže SAMO podatke, ki OBSTOJEJO v
//     datasetu destinacij (trajanje, okvirna cena, sezona, vremenska
//     ustreznost, vir + zadnja posodobitev) + opozorilo, da uporabnik
//     pred obiskom preveri urnike in cene. NI generičnega "Verified"
//     značka — dokler ni dejanskega postopka potrjevanja.
//
// F5.5 ( odpiralni časi): ODPIRALNI ČASI zdaj OBSTAJAJO v datasetu za 5
// destinacij, kjer so bili urnik/dnevi zaprtja preverjeni na uradnih virih
// ( vintgar.si, postojnska-jama.eu, kobariski-muzej.si, visitcelje.eu,
// pmpo.si) — prikažejo se SAMO tam, skupaj z virom. Parkiranje ŠE VEDNO ne
// obstaja v datasetu ( samo pri partnerjih/lokalih) — prazno ≠ izmišljeno.
//
// Datum "posodobljeno" sledi DESTINATIONS_DATA_AS_OF iz stop-insights.ts
// (git-zabeležena zadnja sprememba dataseta destinacij).
//
// ISSUE #4 §17 (VAL 5 sklop A): ENOTNA OZNAKA SVEŽINE — razred
// destinationContent se klasificira z data-freshness.ts (FRESH/STALE/
// UNKNOWN/LIVE po as-of datumu). Vreme (day.weather) NIMA časovnega žiga
// v itinererju — starosti NE izmišljujemo (iskrenost §17: brez podatka
// ni prikaza; živi widget /api/weather ima svojo atribucijo).
// ============================================================================

interface StopInsightsProps {
  visit: LocationVisit;
  /** Jezik prikaza (6 jezikov — W12-faza-2b; neznan → SL). */
  locale: string;
}

type UiLang = "sl" | "en" | "it" | "de" | "fr" | "es";

function uiLang(locale: string): UiLang {
  return locale === "en" || locale === "it" || locale === "de" || locale === "fr" || locale === "es"
    ? (locale as UiLang)
    : "sl";
}

const SEASON_LABELS: Record<string, Record<UiLang, string>> = {
  spring: { sl: "pomlad", en: "spring", it: "primavera", de: "Frühling", fr: "printemps", es: "primavera" },
  summer: { sl: "poletje", en: "summer", it: "estate", de: "Sommer", fr: "été", es: "verano" },
  autumn: { sl: "jesen", en: "autumn", it: "autunno", de: "Herbst", fr: "automne", es: "otoño" },
  winter: { sl: "zima", en: "winter", it: "inverno", de: "Winter", fr: "hiver", es: "invierno" },
};

const DATA_AS_OF_LABEL: Record<UiLang, string> = {
  sl: "13. sep. 2026",
  en: "Sep 13, 2026",
  it: "13 set 2026",
  de: "13. Sep. 2026",
  fr: "13 sept. 2026",
  es: "13 sept 2026",
};

const L = {
  why: { sl: "Zakaj ta postanek:", en: "Why this stop:", it: "Perché questa tappa:", de: "Warum dieser Stopp:", fr: "Pourquoi cet arrêt :", es: "Por qué esta parada :" },
  practical: { sl: "Praktični podatki", en: "Practical info", it: "Informazioni pratiche", de: "Praktische Infos", fr: "Infos pratiques", es: "Información práctica" },
  duration: { sl: "Trajanje", en: "Duration", it: "Durata", de: "Dauer", fr: "Durée", es: "Duración" },
  price: { sl: "Okvirna cena", en: "Estimate", it: "Stima", de: "Schätzung", fr: "Estimation", es: "Estimación" },
  season: { sl: "Sezona", en: "Season", it: "Stagione", de: "Saison", fr: "Saison", es: "Temporada" },
  opening: { sl: "Odpiralni čas", en: "Opening hours", it: "Orari di apertura", de: "Öffnungszeiten", fr: "Horaires d'ouverture", es: "Horario de apertura" },
  weather: { sl: "Vremenska ustreznost", en: "Weather fit", it: "Idoneità meteo", de: "Wetter-Eignung", fr: "Adaptation météo", es: "Aptitud climática" },
  weatherIndoor: {
    sl: "notranja aktivnost — primerna tudi ob dežju",
    en: "indoor — fine in bad weather",
    it: "attività al coperto — adatta anche con la pioggia",
    de: "Innenaktivität — auch bei Regen geeignet",
    fr: "activité intérieure — convient aussi par temps de pluie",
    es: "actividad interior — apta también con lluvia",
  },
  weatherMixed: {
    sl: "mešano — kraj ponuja tudi notranje vsebine",
    en: "mixed — indoor options available too",
    it: "mista — opzioni al coperto disponibili",
    de: "gemischt — Innenoptionen ebenfalls verfügbar",
    fr: "mixte — des options intérieures aussi",
    es: "mixta — también hay opciones interiores",
  },
  weatherOutdoor: {
    sl: "zunanja aktivnost — odvisna od vremena",
    en: "outdoor — weather-dependent",
    it: "attività all'aperto — dipende dal meteo",
    de: "Outdoor-Aktivität — wetterabhängig",
    fr: "activité extérieure — dépend de la météo",
    es: "actividad exterior — depende del clima",
  },
  source: { sl: "Vir", en: "Source", it: "Fonte", de: "Quelle", fr: "Source", es: "Fuente" },
  sourceName: { sl: "Uredniški vodnik destinacij", en: "Editorial destination guide", it: "Guida editoriale alle destinazioni", de: "Redaktioneller Reiseführer", fr: "Guide éditorial des destinations", es: "Guía editorial de destinos" },
  updated: { sl: "posodobljeno", en: "updated", it: "aggiornato", de: "aktualisiert", fr: "mis à jour", es: "actualizado" },
  // ISSUE #4 §17 (VAL 5 sklop A): enotna vrstica svežine destinationContent
  freshness: { sl: "Svežina", en: "Freshness", it: "Freschezza", de: "Frische", fr: "Fraîcheur", es: "Frescura" },
  dataAsOf: { sl: "podatki od", en: "data as of", it: "dati al", de: "Daten vom", fr: "données au", es: "datos al" },
  perPerson: { sl: "/ osebo", en: "/ person", it: "/ persona", de: "/ Person", fr: "/ personne", es: "/ persona" },
  warning: {
    sl: "Pred obiskom preveri urnike, cene in dostopnost na uradni strani lokacije.",
    en: "Before visiting, check opening hours, prices and availability on the location's official site.",
    it: "Prima della visita, verifica orari, prezzi e disponibilità sul sito ufficiale della località.",
    de: "Prüfe vor dem Besuch Öffnungszeiten, Preise und Verfügbarkeit auf der offiziellen Website des Ortes.",
    fr: "Avant la visite, vérifie les horaires, les prix et la disponibilité sur le site officiel du lieu.",
    es: "Antes de visitar, comprueba horarios, precios y disponibilidad en el sitio oficial del lugar.",
  },
  details: { sl: "Podrobnosti o lokaciji", en: "Location details", it: "Dettagli del luogo", de: "Details zum Ort", fr: "Détails du lieu", es: "Detalles del lugar" },
  methodNote: {
    sl: "Razdalje v razlagah so približek — izračun iz koordinat (cestni faktor 1,3), ne navigacijski podatek.",
    en: "Distances in the reasons are estimates computed from coordinates (road factor 1.3) — not navigation data.",
    it: "Le distanze nelle spiegazioni sono stime calcolate dalle coordinate (fattore stradale 1,3) — non dati di navigazione.",
    de: "Die Entfernungen in den Begründungen sind Schätzungen aus Koordinaten (Straßenfaktor 1,3) — keine Navigationsdaten.",
    fr: "Les distances dans les explications sont des estimations calculées à partir des coordonnées (facteur route 1,3) — pas des données de navigation.",
    es: "Las distancias en las explicaciones son estimaciones calculadas desde las coordenadas (factor carretera 1,3) — no son datos de navegación.",
  },
} as const;

function label(key: keyof typeof L, locale: string): string {
  return L[key][uiLang(locale)];
}

export function StopInsights({ visit, locale }: StopInsightsProps) {
  // W12-faza-2b: 6-jezično (razlogi iz API so ×6 — buildFallbackRationale;
  // predpona ne sme biti SL uhod na FR/ES/IT/DE straneh, P4-8)
  const lang = uiLang(locale);
  const dest = destinationById(visit.destination_id);

  const duration = dest ? durationLabelFor(dest.id, lang) : null;
  const price = dest?.costPerPerson;
  const seasons = dest?.bestSeason ?? [];
  const suitability = dest ? weatherSuitabilityOf(dest.type) : null;
  // F5.5: preverjeni odpiralni časi ( SAMO obstoječi vnos — z virom)
  const opening = dest?.opening;
  const openingNote = opening
    ? lang === "en" || lang === "it" || lang === "de" || lang === "fr" || lang === "es"
      ? opening.noteEn
      : opening.note
    : null;

  // ISSUE #4 §17 (VAL 5 sklop A): klasifikacija svežine destinationContent
  // po as-of datumu (ura injicirana tu — modul nima lastne ure). Prag 180 d
  // je dovolj širok, da razred ni občutljiv na milisekunde med SSR in
  // hidracijo (klasifikacija se spremeni šele čez mesece).
  const destFreshness = classifyFreshness("destinationContent", {
    timestamp: DESTINATIONS_DATA_AS_OF,
    now: Date.now(),
  });

  // Praktični podatki se prikažejo, če obstoja KATERIKOLI zapis o destinaciji
  if (!visit.reason && !dest) return null;

  // UX-CMP #3 (Mindtrip primerjava, 17. 9. 2026): kartice postankov so bile
  // besedilno težke — razlaga in praktični nasveti so bili VEDNO razprti.
  // Zdaj je CEL blok zložljiv (collapse-by-default, enak vzorec kot prej
  // samo pri praktičnih podatkih), v povzetku pa ostane PRVI STAVEK
  // razlage — iskrenost ("zakaj priporočeno") ostane vidna na prvi
  // potezi, podrobnosti pa so en klik stran.
  const fullReason = visit.reason?.trim() ?? "";
  const hasWhy = fullReason.length > 0;
  const TEASER_MAX = 110;
  const cut = fullReason.lastIndexOf(" ", TEASER_MAX);
  const teaser =
    fullReason.length <= TEASER_MAX
      ? fullReason
      : (cut > 60 ? fullReason.slice(0, cut) : fullReason.slice(0, TEASER_MAX)) +
        "…";

  return (
    <details className="group mt-2.5 text-xs">
      <summary className="flex cursor-pointer select-none list-none items-start gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 [&::-webkit-details-marker]:hidden">
        <HelpCircle
          className="mt-0.5 size-3.5 shrink-0 text-primary/70"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 leading-relaxed">
          {hasWhy ? (
            <>
              <span className="font-medium text-foreground/80">
                {label("why", locale)}
              </span>{" "}
              {teaser}
            </>
          ) : (
            <span className="font-medium text-foreground/80">
              {label("practical", locale)}
            </span>
          )}
        </span>
        <ChevronDown
          className="mt-0.5 size-3.5 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="mt-1.5 space-y-2 pl-1">
        {/* FAZA 4-1 — Zakaj je to priporočeno? (dejstva, ne marketing);
            celotna razlaga, če je bila v povzetku prirezana */}
        {hasWhy && teaser !== fullReason && (
          <div className="space-y-1">
            <p className="leading-relaxed text-muted-foreground">
              {fullReason}
            </p>
            {/* P1-1 (recenzija): če razlaga navaja razdaljo, je metoda
                izračuna eksplicitno povedana — približek iz koordinat,
                ne navigacija. */}
            {/\bkm\b/i.test(fullReason) && (
              <p className="text-[10px] leading-relaxed text-muted-foreground/80">
                {label("methodNote", locale)}
              </p>
            )}
          </div>
        )}
        {hasWhy && teaser === fullReason && /\bkm\b/i.test(fullReason) && (
          <p className="text-[10px] leading-relaxed text-muted-foreground/80">
            {label("methodNote", locale)}
          </p>
        )}

        {/* FAZA 4-3 — Praktični podatki: SAMO obstoječi (zložljivo, mobilno prijazno) */}
        {dest && (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-md border border-border/60 bg-card/40 p-2.5 text-muted-foreground sm:grid-cols-2">
            {duration && (
              <div className="flex items-start gap-1.5">
                <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <div>
                  <dt className="sr-only">{label("duration", locale)}</dt>
                  <dd>
                    <span className="font-medium text-foreground/80">
                      {label("duration", locale)}:
                    </span>{" "}
                    {duration}
                  </dd>
                </div>
              </div>
            )}

            {typeof price === "number" && price > 0 && (
              <div className="flex items-start gap-1.5">
                <Euro className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <div>
                  <dt className="sr-only">{label("price", locale)}</dt>
                  <dd>
                    <span className="font-medium text-foreground/80">
                      {label("price", locale)}:
                    </span>{" "}
                    €{price}
                    {label("perPerson", locale)}
                  </dd>
                </div>
              </div>
            )}

            {seasons.length > 0 && (
              <div className="flex items-start gap-1.5">
                <Calendar className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <div>
                  <dt className="sr-only">{label("season", locale)}</dt>
                  <dd>
                    <span className="font-medium text-foreground/80">
                      {label("season", locale)}:
                    </span>{" "}
                    {seasons
                      .map((s) => SEASON_LABELS[s]?.[lang] ?? s)
                      .join(", ")}
                  </dd>
                </div>
              </div>
            )}

            {suitability && (
              <div className="flex items-start gap-1.5">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <div>
                  <dt className="sr-only">{label("weather", locale)}</dt>
                  <dd>
                    <span className="font-medium text-foreground/80">
                      {label("weather", locale)}:
                    </span>{" "}
                    {suitability === "indoor"
                      ? label("weatherIndoor", locale)
                      : suitability === "mixed"
                      ? label("weatherMixed", locale)
                      : label("weatherOutdoor", locale)}
                  </dd>
                </div>
              </div>
            )}

            {/* F5.5: odpiralni čas — SAMO kjer je vnos preverjen ( vir vedno
                prikazan; data honesty: prazno = ni podatka, ne "odprto") */}
            {openingNote && opening && (
              <div className="flex items-start gap-1.5">
                <Calendar className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <div>
                  <dt className="sr-only">{label("opening", locale)}</dt>
                  <dd>
                    <span className="font-medium text-foreground/80">
                      {label("opening", locale)}:
                    </span>{" "}
                    {openingNote}{" "}
                    <span className="text-muted-foreground/80">
                      ({label("source", locale).toLowerCase()}: {opening.source})
                    </span>
                  </dd>
                </div>
              </div>
            )}

            <div className="flex items-start gap-1.5 sm:col-span-2">
              <div>
                <dt className="sr-only">{label("source", locale)}</dt>
                <dd>
                  <span className="font-medium text-foreground/80">
                    {label("source", locale)}:
                  </span>{" "}
                  {label("sourceName", locale)} · {label("updated", locale)}{" "}
                  {DATA_AS_OF_LABEL[lang]}
                </dd>
              </div>
            </div>

            {/* ISSUE #4 §17 (VAL 5 sklop A): ENOTNA VRSTICA SVEŽINE —
                destinationContent klasificiran po as-of datumu (sveže/
                zastarelo odkrito povedano). Vreme NIMA časovnega žiga →
                vrstice o starosti vremena NI (ne izmišljujemo). */}
            <div className="flex items-start gap-1.5 sm:col-span-2">
              <div>
                <dt className="sr-only">{label("freshness", locale)}</dt>
                <dd className="text-muted-foreground/80">
                  {label("freshness", locale)}:{" "}
                  {freshnessLabel(destFreshness, lang)} ·{" "}
                  {label("dataAsOf", locale)} {DATA_AS_OF_LABEL[lang]}
                </dd>
              </div>
            </div>
          </dl>
        )}

        {/* Opozorilo + povezava na podrobnosti destinacije */}
        {dest && (
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground/90">
            <TriangleAlert
              className="mt-0.5 size-3 shrink-0 text-amber-600/80"
              aria-hidden="true"
            />
            <span>
              {label("warning", locale)}{" "}
              <Link
                href={`/destinacija/${dest.slug}`}
                className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                {label("details", locale)} →
              </Link>
            </span>
          </p>
        )}
      </div>
    </details>
  );
}
