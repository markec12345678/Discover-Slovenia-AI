"use client";

import * as React from "react";
import { useState, useRef, useEffect, useMemo, lazy, Suspense } from "react";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Sparkles,
  Bot,
  Trash2,
  Landmark,
  MapPin,
  Maximize2,
  Utensils,
  Coffee,
  ShoppingBasket,
  BedDouble,
  Info,
  Clock,
  Plus,
  Check,
  Mic,
  MicOff,
  Volume2,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import type { StoCitation } from "@/lib/rag/types";
import type { ChatPlace, PlaceCategory } from "@/lib/geo-intent";
import { trackPlannerEvent } from "@/lib/planner-analytics";
// 1.42 (GEO → NAČRT): dodajanje kraja iz klepeta v načrt — skupna logika
// (CustomEvent ko je planner montiran / neposredno sicer / stash brez načrta)
import {
  CHAT_ADD_PLACE_EVENT,
  addChatPlaceToItinerary,
  stashChatPlace,
  readLastItinerary,
  persistLastItinerary,
  isValidChatPlace,
} from "@/lib/chat-add-place";
import { useAppStore } from "@/lib/store";
// GLASOVNI KLEPET (Issue #2 §6/§7/§8): brskalnikov STT/TTS brez AI ključa —
// čisto plast v src/lib/voice.ts (podpora, jezikovna oznaka, čistitev besedila)
import {
  sttSupported,
  ttsSupported,
  speechRecognitionCtor,
  speechLanguageTag,
  speechTextForUtterance,
} from "@/lib/voice";

// GEO-ODGOVORI: Leaflet vgreteni ŠTEKNO — komponenta se naloži šele, ko
// prvi AI odgovor prinese kraje (ostale strani ne plačajo ~140 KB bundla).
const ChatMiniMap = lazy(() => import("@/components/chat-mini-map"));

/** Barve pinov po plasteh zaupanja — usklajeno s chat-mini-map.tsx. */
const PLACE_PIN_COLORS: Record<"t1" | "osm" | "t2", string> = {
  t1: "#2d6a3e", // zeleni — preverjeni podatki (T1)
  osm: "#b45309", // jantarni — OpenStreetMap skupnostni vir (T3)
  t2: "#0f766e", // turkizni — uradni vir STO (T2, 1.44): članek, ne lokal
};

/** Ikone kategorij krajev (Mindtrip: fork ikona na pinu; mi v seznamu). */
const CATEGORY_ICONS: Record<PlaceCategory, React.ComponentType<{ className?: string }>> = {
  food: Utensils,
  drinks: Coffee,
  market: ShoppingBasket,
  stay: BedDouble,
  service: Info,
  // 1.46: T1 destinacija — MapPin (obisk kraja, ne spanje/nakup/storitev)
  destination: MapPin,
  // 1.44: T2 uradni vir — Landmark (institucionalni vir, ne lokal)
  source: Landmark,
};

// ============================================================================
// KATEGORIJA ČIPI (1.46) — multi-select filter geo odgovora
// ============================================================================
// Mindtrip raziskava (Wayback + iOS screenshots + recenzije, 20. 9. 2026):
// njihov zemljevid iskanja ima horizontalne čipe "For you / Restaurants /
// Things to do / Events / Stays" (enojni izbor, personaliziran). Naša izvedba
// je NAMENOMA drugačna na tri načine:
//  1. MULTI-SELECT s števci — mešani odgovor ("hrana in pijača v Piranu")
//     potrebuje kombinacije (hrana+pijača skupaj), ne zamenjavo;
//  2. BREZ "For you" — ne sledimo uporabnikom (brez računov, brez
//     profilov); čipi so pošteni števci dejansno prisotnih kategorij;
//  3. Pini OHRANJOJO barvo porekla (T1/OSM/T2) — kategorija je v čipu
//     in ikoni vrstice, poreklo na pinu (Mindtrip: enotno beli pini z
//     ikonami — lepa, a barvno slepo neprijazna kombinacija brez "vira").
// ============================================================================

/** i18n ključi imen kategorij (čipi + aria). */
const CATEGORY_LABEL_KEYS: Record<PlaceCategory, string> = {
  food: "catFood",
  drinks: "catDrinks",
  market: "catMarket",
  stay: "catStay",
  destination: "catDestination",
  service: "catService",
  source: "catSource",
};

/** Fiksni vrstni red čipov (hrana → viri) — predvidljiv za uporabnika. */
const CATEGORY_ORDER: PlaceCategory[] = [
  "food",
  "drinks",
  "market",
  "stay",
  "destination",
  "service",
  "source",
];

/** Števci kategorij v geo odgovoru — [kategorija, število krajev]. */
function categoryCountsOf(places: ChatPlace[]): Map<PlaceCategory, number> {
  const m = new Map<PlaceCategory, number>();
  for (const p of places) m.set(p.category, (m.get(p.category) ?? 0) + 1);
  return m;
}

/**
 * Vrstica čipov kategorij — toggle vključen/izključen (multi-select).
 * Izrisana SAMO kadar so v odgovoru ≥2 kategoriji (ene kategorije ni
 * kaj filtrirati — čip bi bil šum).
 */
function CategoryChips({
  counts,
  disabled,
  onToggle,
}: {
  counts: ReadonlyMap<PlaceCategory, number>;
  disabled: ReadonlySet<PlaceCategory>;
  onToggle: (cat: PlaceCategory) => void;
}) {
  const t = useTranslations("chatbot");
  const present = CATEGORY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0);
  if (present.length < 2) return null;
  return (
    <div role="group" aria-label={t("catFilterAria")} className="flex flex-wrap gap-1">
      {present.map((cat) => {
        const Icon = CATEGORY_ICONS[cat] ?? Info;
        const on = !disabled.has(cat);
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onToggle(cat)}
            aria-pressed={on}
            title={t(CATEGORY_LABEL_KEYS[cat])}
            className={cn(
              "flex min-h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on
                ? "border-primary/30 bg-primary/10 text-foreground"
                : "border-border/60 bg-transparent text-muted-foreground opacity-60"
            )}
          >
            <Icon className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{t(CATEGORY_LABEL_KEYS[cat])}</span>
            <span className="shrink-0 tabular-nums opacity-70">{counts.get(cat)}</span>
          </button>
        );
      })}
    </div>
  );
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** DATA-LAYERS-RAG: uradni viri STO, poslani AI-ju ob tem odgovoru
   * (opcijsko — starejša/lokalna zgodovina jih nima). */
  sources?: StoCitation[];
  /** GEO-ODGOVORI: kraji iz AI odgovora (OSM v bližini + T1 destinacije
   * iz odgovora) — izrišejo se kot mini zemljevid s pini (opcijsko). */
  places?: ChatPlace[];
}

interface ChatResponse {
  message: string;
  source: "puter" | "z-ai-sdk" | "fallback";
  sources?: StoCitation[];
  places?: ChatPlace[];
  timestamp: string;
}

// isValidChatPlace živi v src/lib/chat-add-place.ts (enkraten vir —
// uporabljata ga klepet za persistenco zgodovine in planner za dogodek)

// ============================================================================
// PERSISTENCA POGOVORA — localStorage "dai:chat-history"
// ============================================================================
// Uporabnikova vrzel (P1/MT-B): pogovor se je ob vsakem osvežitvi ali
// preklopu zavihka izgubil. Zdaj zgodovino shranimo lokalno (zadnjih 40
// sporočil, FIFO) in jo ob mountu povrnemo — SAMO v useEffect (hidratacija
// varna: prvi render na strežniku in klientu izriše enak pozdrav).
//
// Vzorec branja/pisanja sledi src/lib/my-trips-storage.ts: poln, ponarejen
// ali starejši JSON NIKOLI ne sesuje aplikacije — branje vrne [] in pogovor
// začne s svežim pozdravom.
// ============================================================================

const CHAT_HISTORY_KEY = "dai:chat-history";
const CHAT_HISTORY_VERSION = 1;
/** FIFO zgornja meja — zadnjih 40 sporočil (~20 parov vprašanje/odgovor). */
const CHAT_HISTORY_MAX = 40;

interface StoredChatHistory {
  v: number;
  messages: ChatMessage[];
}

function isValidChatMessage(m: unknown): m is ChatMessage {
  return (
    typeof m === "object" &&
    m !== null &&
    ((m as ChatMessage).role === "user" ||
      (m as ChatMessage).role === "assistant") &&
    typeof (m as ChatMessage).content === "string" &&
    (m as ChatMessage).content.length > 0 &&
    // sources so opcijske — če obstajajo, morajo biti array objektov z
    // url+naslovom (vsak element sam po sebi validiran v render zaradi
    // map/filter guardov spodaj)
    ((m as ChatMessage).sources === undefined ||
      (Array.isArray((m as ChatMessage).sources) &&
        (m as ChatMessage).sources!.every(
          (s) =>
            typeof s === "object" &&
            s !== null &&
            typeof (s as StoCitation).url === "string" &&
            typeof (s as StoCitation).title === "string"
        ))
    ) &&
    // GEO-ODGOVORI: places so opcijske — če obstajajo, je vsak element
    // validiran s svojim varovanim preverjalnikom ( ime + koordinati + vir)
    ((m as ChatMessage).places === undefined ||
      (Array.isArray((m as ChatMessage).places) &&
        (m as ChatMessage).places!.every(isValidChatPlace))
    )
  );
}

/** Notranje: preberi shranjeno zgodovino (varno — pokvarjen JSON ne sesuje app). */
function readChatHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return [];
    const { v, messages } = parsed as {
      v?: unknown;
      messages?: unknown;
    };
    // Različica sheme mora natančno ustrezati — prihvati le veljavne vnose
    if (v !== CHAT_HISTORY_VERSION || !Array.isArray(messages)) return [];
    return messages.filter(isValidChatMessage).slice(-CHAT_HISTORY_MAX);
  } catch {
    // poln ali pokvarjen localStorage — začni s svežim pozdravom
    return [];
  }
}

/** Notranje: zapiši zgodovino (varno — poln prostor ne sesuje app). */
function writeChatHistory(messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredChatHistory = {
      v: CHAT_HISTORY_VERSION,
      messages: messages.slice(-CHAT_HISTORY_MAX),
    };
    window.localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(payload));
  } catch {
    // poln/zasebni localStorage — mirno preskoči
  }
}

/** Notranje: izbriši shranjeno zgodovino (ob „Počisti pogovor“). */
function clearChatHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CHAT_HISTORY_KEY);
  } catch {
    // neblokirajoče
  }
}

// FW4.3: hitra vprašanja so TIPKE v sporočilih (chatbot.quickPrompt1–4) —
// poslana vrednost je PREVEDEN niz, zato AI odgovarja v jeziku uporabnika
// (system prompt chat API-ja dovoljuje jezik uporabnika).
const QUICK_PROMPT_KEYS = [
  "quickPrompt1",
  "quickPrompt2",
  "quickPrompt3",
  "quickPrompt4",
] as const;

/** Welcome sporočilo v trenutnem jeziku (iz sporočil, ne modulni const). */
function makeWelcome(t: (k: string) => string): ChatMessage {
  return { role: "assistant", content: t("welcome") };
}

// ============================================================================
// GEO-ODGOVORI — pododeli za izris krajev AI odgovora
// ============================================================================

/** Ena vrstica seznama krajev — oštevilčena kot pin na zemljevidu. */
function PlaceRow({
  place,
  index,
  added = false,
  onAdd,
}: {
  place: ChatPlace;
  index: number;
  /** 1.42: kraj je že dodan v načrt (✓ namesto +). */
  added?: boolean;
  /** 1.42: dejanje "Dodaj v načrt" (Mindtripov "+", po našem modelu). */
  onAdd?: (place: ChatPlace) => void;
}) {
  const t = useTranslations("chatbot");
  const Icon = CATEGORY_ICONS[place.category] ?? Info;
  const color = PLACE_PIN_COLORS[place.provenance] ?? PLACE_PIN_COLORS.osm;
  // 1.44: T2 uradni vir je ČLANEK, ne fizični postanek — ne more se dodati
  // v načrt (+ gumba ni); povezava vodi na izvirnik na slovenia.info.
  const isT2 = place.provenance === "t2";

  const number = (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center text-[9px] font-bold text-white",
        // T2 pin ima na zemljevidu zaobljen kvadrat — seznam zrcali obliko
        // (barvna razločnost za barvno slepe: oblika + barva, ne samo barva)
        isT2 ? "rounded-[4px]" : "rounded-full"
      )}
      style={{ backgroundColor: color }}
    >
      {index + 1}
    </span>
  );

  const meta: string[] = [];
  if (place.detail) meta.push(place.detail);
  if (place.budget) meta.push(place.budget);

  const nameEl = (
    <span className="truncate font-medium text-foreground">{place.name}</span>
  );

  return (
    <li className="flex items-start gap-1.5">
      {number}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] leading-snug">
          {/* T1 kraj s slugom → stran destinacije (dejanje iz zemljevida) */}
          {place.provenance === "t1" && place.slug ? (
            <Link
              href={`/destinacija/${place.slug}`}
              className="truncate font-medium text-foreground underline decoration-transparent underline-offset-2 transition-colors hover:decoration-primary"
            >
              {place.name}
              {place.rating ? ` ★${place.rating}` : ""}
            </Link>
          ) : isT2 && place.sourceUrl ? (
            /* 1.44: T2 uradni članek STO → izvirnik na slovenia.info */
            <a
              href={place.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-medium text-foreground underline decoration-transparent underline-offset-2 transition-colors hover:decoration-primary"
              title={`${place.name} — slovenia.info`}
            >
              {place.name}
            </a>
          ) : (
            nameEl
          )}
          {/* Značka porekla — naš diferenciator: zemljevid, ki prizna vir */}
          <span
            className={cn(
              "shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase",
              place.provenance === "t1"
                ? "bg-primary/10 text-primary"
                : isT2
                  ? "bg-teal-600/10 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400"
                  : "bg-muted text-muted-foreground"
            )}
            title={
              place.provenance === "t1"
                ? t("provenanceT1Title")
                : isT2
                  ? t("provenanceT2Title")
                  : t("provenanceOsmTitle")
            }
          >
            {place.provenance === "t1"
              ? t("provenanceT1")
              : isT2
                ? "STO"
                : "OSM"}
          </span>
        </p>
        {(meta.length > 0 || place.openingHours) && (
          <p className="mt-0.5 flex items-center gap-1 text-[10px] leading-snug text-muted-foreground">
            <Icon className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{meta.join(" · ") || "\u00a0"}</span>
            {place.openingHours && (
              <span className="flex shrink-0 items-center gap-0.5" title={place.openingHours}>
                <Clock className="size-3" aria-hidden />
                <span className="max-w-24 truncate">{place.openingHours}</span>
              </span>
            )}
          </p>
        )}
      </div>
      {/* 1.42 (GEO → NAČRT): "+" — kraj iz AI odgovora neposredno v načrt.
          Po dodajanju ✓ (disabled) — dejanje je enkratno, dedupe varuje
          addChatPlaceToItinerary ("Že v načrtu" toast).
          1.44: T2 viri so članki — dejanja "Dodaj v načrt" ni (ne morejo
          biti postanek). */}
      {onAdd && !isT2 && (
        <button
          type="button"
          onClick={() => onAdd(place)}
          disabled={added}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            added
              ? "bg-primary/15 text-primary"
              : "border border-border/60 text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
          )}
          aria-label={
            added
              ? t("addPlaceDone")
              : t("addPlaceAria", { name: place.name })
          }
          title={added ? t("addPlaceDone") : t("addPlace")}
        >
          {added ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Plus className="size-3.5" aria-hidden />
          )}
        </button>
      )}
    </li>
  );
}

interface GeoPlacesSectionProps {
  places: ChatPlace[];
  /** 1.46: prenos filtrov v fullscreen overlay (povečava nadaljuje, kar
   *  je uporabnik že filtriral — koherenten prehod majhen→velik pogled). */
  onExpand: (places: ChatPlace[], disabledCats: ReadonlySet<PlaceCategory>) => void;
  /** 1.42: dejanje "Dodaj v načrt" za vsako vrstico. */
  onAddPlace?: (place: ChatPlace) => void;
  /** 1.42: ID-ji krajev, že dodanih v načrt (✓ stanje). */
  addedPlaceIds?: ReadonlySet<string>;
}

/** Oddelek "Na zemljevidu" pod AI odgovorom: glava + čipi kategorij +
 *  mini mapa + seznam + legenda. Čipi (1.46) filtrirajo SEZNAM IN PINE —
 *  ista filtrirana množica poganja oba, zato sta številke vrstic in pinov
 *  vedno usklajeni. */
function GeoPlacesSection({
  places,
  onExpand,
  onAddPlace,
  addedPlaceIds,
}: GeoPlacesSectionProps) {
  const t = useTranslations("chatbot");
  // 1.46: izklopljene kategorije (multi-select; prazna množica = vse)
  const [disabledCats, setDisabledCats] = useState<ReadonlySet<PlaceCategory>>(
    new Set()
  );
  const counts = useMemo(() => categoryCountsOf(places), [places]);
  const filtered = useMemo(
    () => places.filter((p) => !disabledCats.has(p.category)),
    [places, disabledCats]
  );
  const hasOsm = places.some((p) => p.provenance === "osm");
  const hasT2 = places.some((p) => p.provenance === "t2");
  const filtering = disabledCats.size > 0;

  const toggleCat = (cat: PlaceCategory) => {
    const wasDisabled = disabledCats.has(cat);
    setDisabledCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
    // Telemetrija: preklop filtra (meri, ali so čipi uporabni — če jih
    // nihče ne preklopi, jih v 1.47 odstranimo; če jih, vemo KATERE)
    trackPlannerEvent("chat_geo_filtered", {
      category: cat,
      enabled: wasDisabled ? 1 : 0,
      surface: "chat",
    });
  };

  return (
    <div className="mt-2.5 border-t border-border/60 pt-2.5">
      {/* Glava: label + števec (iskren ob filtru: vidno/-skupaj) + povečava */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <MapPin className="size-3 shrink-0" aria-hidden />
          <span className="truncate">
            {t("placesLabel")}
            {" · "}
            {filtering ? `${filtered.length}/${places.length}` : places.length}
          </span>
        </p>
        <button
          type="button"
          onClick={() => onExpand(places, disabledCats)}
          className="flex min-h-6 shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("mapExpand")}
          title={t("mapExpand")}
        >
          <Maximize2 className="size-3" aria-hidden />
          {t("mapExpandShort")}
        </button>
      </div>

      {/* 1.46: čipi kategorij — multi-select filter nad seznamom in pini */}
      <div className="mb-1.5">
        <CategoryChips counts={counts} disabled={disabledCats} onToggle={toggleCat} />
      </div>

      {filtered.length === 0 ? (
        /* Iskren prazen stanje: vsi čipi izklopljeni → ponudi ponastavitev */
        <p className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border/60 px-2 py-1.5 text-[10px] text-muted-foreground">
          <span className="italic">{t("catEmpty")}</span>
          <button
            type="button"
            onClick={() => setDisabledCats(new Set())}
            className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-foreground transition-colors hover:bg-muted"
          >
            {t("catEmptyReset")}
          </button>
        </p>
      ) : (
        <>
          {/* Mini zemljevid — lazy Leaflet (nalaga se ob prvem geo odgovoru) */}
          <Suspense
            fallback={
              <div className="h-40 w-full animate-pulse rounded-lg bg-muted" aria-hidden />
            }
          >
            <ChatMiniMap places={filtered} />
          </Suspense>

          {/* Seznam krajev — drsljiv pri dolgih seznamih */}
          <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {filtered.map((p, i) => (
              <PlaceRow
                key={p.id}
                place={p}
                index={i}
                added={addedPlaceIds?.has(p.id)}
                onAdd={onAddPlace}
              />
            ))}
          </ul>
        </>
      )}

      {/* Legenda porekla — T1 zeleni / OSM jantarni / T2 turkizni (iskrenost o viru) */}
      <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: PLACE_PIN_COLORS.t1 }} />
          {t("provenanceT1Legend")}
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: PLACE_PIN_COLORS.osm }} />
          {t("provenanceOsmLegend")}
        </span>
        {hasT2 && (
          <span className="flex items-center gap-1">
            <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: PLACE_PIN_COLORS.t2 }} />
            {t("provenanceT2Legend")}
          </span>
        )}
      </p>
      {hasOsm && <p className="mt-1 text-[10px] italic text-muted-foreground">{t("osmNote")}</p>}
      {hasT2 && <p className="mt-1 text-[10px] italic text-muted-foreground">{t("stoNote")}</p>}
    </div>
  );
}

/**
 * Chatbot — lebdeči AI asistent z dostopom do vsebine platforme.
 *
 * Pozna: destinacije, lokale, izdelke, izkušnje, dogodke, AI itinerer.
 * Kontekst se gradi iz baze in pošlje GLM-ju (Puter API).
 * Fallback: deterministični odgovori če AI odpove.
 */
export function Chatbot() {
  const t = useTranslations("chatbot");
  // FW4.3-2: chat API-ju povemo jezik pogovora (en → angleški asistent)
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [makeWelcome(t)]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"puter" | "z-ai-sdk" | "fallback">("puter");
  const [hasNewMessage, setHasNewMessage] = useState(false);
  // GEO-ODGOVORI: kraji trenutno povečanega zemljevida (fullscreen overlay)
  const [mapOverlay, setMapOverlay] = useState<ChatPlace[] | null>(null);
  // 1.46: izklopljene kategorije v fullscreen overlayju — DEDI se iz čipov
  // kompaktnega oddelka ob povečavi (koherenten prehod), nato neodvisno
  const [overlayDisabled, setOverlayDisabled] = useState<
    ReadonlySet<PlaceCategory>
  >(() => new Set<PlaceCategory>());
  // 1.42 (GEO → NAČRT): kraji, dodani v načrt IZ TEGO pogovora (✓ na
  // gumbu; po osvežitvi stanje izgubi — dedupe v addChatPlaceToItinerary
  // pošteno odgovori "Že v načrtu", zato ni vztrajen)
  const [addedPlaceIds, setAddedPlaceIds] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  // UX-CMP #6 (Mindtrip primerjava, 17. 9. 2026 / pilot audit 🟡): chat FAB
  // (fiksni, spodaj desno, z-50) je pri 320 px prekrival ZADNJI gumb dneva
  // v dnevní navigaciji, dokler ta še ni prilepljena na vrh. Standardni
  // Material vzorec: FAB se OB DRSENJU DOL skrije, OB DRSENJU GOR (ali
  // pri vrhu strani) pa vrne — vsebina je vedno nad gumbom. Samo mobilno
  // (< sm); desktop FAB ostane vedno viden.
  const [fabHidden, setFabHidden] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // ── GLASOVNI KLEPET (Issue #2 §6/§7/§8) ── BREZ AI API KLJUČA ──────────
  // §6 VHOD: Web Speech API SpeechRecognition (brskalnikov STT).
  // §7 IZHOD: window.speechSynthesis (brskalniški TTS).
  // §8 CELI KLEPET: izgovorjeno vprašanje → besedilo → /api/chat → odgovor
  // se prikaŽE in SAMODEJNO prebere (shouldAutoSpeak semantika v lib/voice).
  // Podpora se preverja PO hidrataciji (server=false, klient=true bi bil
  // hydration mismatch); nepodprto STT → gumb se NE izriše (besedilni vnos
  // je vedno viden = zahtevan fallback), nepodprt TTS → gumb za branje se
  // ne izriše (odgovori ostanejo besedilni).
  const [voiceIn, setVoiceIn] = useState(false);
  const [voiceOut, setVoiceOut] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const manualStopRef = useRef(false);

  useEffect(() => {
    setVoiceIn(sttSupported());
    setVoiceOut(ttsSupported());
  }, []);

  /** §7: prebere odgovor ( ali ustavi morebitnega prejšnjega). */
  function speakMessage(idx: number, text: string) {
    if (!ttsSupported()) return;
    stopSpeaking();
    const clean = speechTextForUtterance(text);
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = speechLanguageTag(locale);
    u.onend = () => setSpeakingIdx(null);
    u.onerror = () => setSpeakingIdx(null);
    setSpeakingIdx(idx);
    window.speechSynthesis.speak(u);
  }

  function stopSpeaking() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingIdx(null);
  }

  /** §6: mikrofon vklop/izklop — diktiranje vprašanja (brez AI ključa). */
  function toggleVoiceInput() {
    if (listening) {
      // Ročna ustavitev: prepoznavo ustavimo, a besedila NE pošljemo
      // ( ostane v vnosu za urejanje) — razlikuje se od naravnega konca.
      manualStopRef.current = true;
      recRef.current?.stop();
      return;
    }
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = speechLanguageTag(locale);
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    finalTranscriptRef.current = "";
    manualStopRef.current = false;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const txt = r[0]?.transcript ?? "";
        if (r.isFinal) finalTranscriptRef.current += txt;
        else interim += txt;
      }
      // Vmesni prepis kažemo v vnosu ( uporabnik vidi, kaj se sliši)
      if (interim) setInput(interim);
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast({ title: t("voiceDenied"), description: t("voiceDeniedDesc") });
      } else if (e.error === "no-speech") {
        toast({ title: t("voiceNoSpeech") });
      } else if (e.error !== "aborted") {
        toast({ title: t("voiceError") });
      }
    };
    rec.onend = () => {
      setListening(false);
      if (manualStopRef.current) return; // ročna ustavitev — ne pošiljaj
      const finalText = finalTranscriptRef.current.trim();
      if (finalText) {
        // §8 CELI KLEPET: izgovorjeno vprašanje gre v klepet; odgovor se
        // bo (kjer TTS podprt) samodejno prebral — glej sendMessage.
        sendMessage(finalText, { viaVoice: true });
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  // TTS ne sme "uči" iz zaprtega klepeta — ustavimo ob odmontiranju,
  // ob zaprtju panela in ob vsakem novem poizvedovanju ( sendMessage).
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      try {
        recRef.current?.abort();
      } catch {
        // nepodprto / Že končano — ni napaka
      }
    };
  }, []);

  // Povrni shranjeno zgodovino (SAMO v effect — prvi render ostane enak na
  // strežniku in klientu, zato ni hydration mismatch)
  useEffect(() => {
    const stored = readChatHistory();
    if (stored.length > 0) setMessages(stored);
  }, []);

  // Persistiraj UMIRJENO stanje: med loading (računanje odgovora) ne pišemo —
  // vmesni seznam (user sporočilo brez odgovora) se ne splača shraniti, saj
  // se po odgovoru/napaki VEDNO zapiše končni seznam. Samo pozdrav (≤ 1)
  // se ne shranjuje — clear action ga izbriše eksplicitno.
  useEffect(() => {
    if (loading || messages.length <= 1) return;
    writeChatHistory(messages);
  }, [messages, loading]);

  // Auto-scroll na dno ko pride novo sporočilo
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // UX-CMP #6: skrivanje FAB ob drsenju dol (samo mobilni via max-sm
  // razredov spodaj; logika beži na vseh velikostih, vizualno se aplicira
  // le < 640 px). Odpren panel FAB vedno pokaže.
  useEffect(() => {
    if (open) {
      setFabHidden(false);
      return;
    }
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY;
        // prag 8 px filtrira micro-scroll; y > 120 pomeni "pod herojem"
        if (delta > 8 && y > 120) setFabHidden(true);
        else if (delta < -8 || y <= 120) setFabHidden(false);
        lastY = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  // Focus na input ko se odpre
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      // Reset ko se zapre — glasovni izgovor se NADALJUJE v ozadju le,
      // če bi panel zaprli med branjem; pošteno ga ustavimo (uporabnik
      // ne vidi več besedila, ki bi se bralo).
      setHasNewMessage(false);
      stopSpeaking();
    }
  }, [open]);

  // GEO-ODGOVORI: fullscreen zemljevid — Escape zapre + zaklenjeno
  // drsenje ozadja (isti vzorec kot image-lightbox)
  useEffect(() => {
    if (!mapOverlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMapOverlay(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mapOverlay]);

  /** Počisti pogovor (brez potrditve) + izbriši lokalno zgodovino. */
  const handleClearConversation = () => {
    setMessages([makeWelcome(t)]);
    clearChatHistory();
    toast({ title: t("cleared") });
  };

  /**
   * 1.42 (GEO → NAČRT): Mindtripov "+" na kartici kraja — dejanje iz AI
   *  odgovora neposredno v načrt potovanja. DETERMINISTIČNO (0 AI žetonov),
   *  kraj obdrži poreklo (T1/OSM) in pade v dan, ki je kraju najbližje.
   *
   *  Poti (ista logika, različna okolja — glej src/lib/chat-add-place.ts):
   *   A) /načrtuj — planner je montiran, prevzame CustomEvent (preventDefault)
   *   B) druga stran — dodamo neposredno v Zustand store + localStorage
   *   C) ni še načrta — kraj odložimo (sessionStorage, heroQuery vzorec)
   *      in ga samodejno dodamo, ko uporabnik ustvari/obnovi načrt
   */
  function handleAddPlace(place: ChatPlace) {
    const evt = new CustomEvent<ChatPlace>(CHAT_ADD_PLACE_EVENT, {
      detail: place,
      cancelable: true,
    });
    // dispatchEvent vrne false, če je listener poklical preventDefault →
    // planner (na /načrtuj) je dogodek prevzel in pokaže svoj toast
    const handledByPlanner = !window.dispatchEvent(evt);
    if (handledByPlanner) {
      setAddedPlaceIds((prev) => new Set(prev).add(place.id));
      return;
    }

    // B) planner ni na strani — načrt iz store-a oz. localStorage
    const persisted = readLastItinerary();
    const current =
      useAppStore.getState().itinerary ?? persisted?.itinerary ?? null;
    if (!current) {
      // C) ni še načrta — odloži + pošteno obvestilo (ne izgubimo kraja)
      stashChatPlace(place);
      setAddedPlaceIds((prev) => new Set(prev).add(place.id));
      trackPlannerEvent("chat_place_added", {
        provenance: place.provenance,
        category: place.category,
        stashed: 1,
      });
      toast({
        title: t("addPlaceNoPlanTitle"),
        description: t("addPlaceNoPlanDesc", { name: place.name }),
      });
      return;
    }

    const result = addChatPlaceToItinerary(current, place, {
      locale,
      groupSize: persisted?.formData?.groupSize,
    });
    if (!result.ok) {
      toast({
        title: t("addPlaceDuplicateTitle"),
        description: place.name,
      });
      return;
    }

    useAppStore.getState().setItinerary(result.itinerary);
    persistLastItinerary(result.itinerary, persisted?.formData);
    setAddedPlaceIds((prev) => new Set(prev).add(place.id));
    trackPlannerEvent("chat_place_added", {
      provenance: place.provenance,
      category: place.category,
      day: result.day,
    });
    toast({
      title: t("addPlaceAddedTitle"),
      description: t("addPlaceAddedDesc", {
        name: place.name,
        day: result.day,
      }),
    });
  }

  async function sendMessage(text: string, opts?: { viaVoice?: boolean }) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    // Glasovni klepet (§8): novo vprašanje prekine izgovor prejšnjega
    // odgovora — odgovora se ne smeta prekrivati.
    stopSpeaking();

    const viaVoice = opts?.viaVoice === true;
    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          currentPage: typeof window !== "undefined" ? window.location.pathname : undefined,
          language: locale === "en" ? "en" : "sl",
        }),
      });

      if (!res.ok) throw new Error("Napaka pri chatu");

      const data: ChatResponse = await res.json();
      setSource(data.source);
      const places = data.places ?? [];
      setMessages((prev) => [
        ...prev,
        // DATA-LAYERS-RAG: priloži citate uradnih virov (T2) — značke
        // pod odgovorom, kadar je AI dobil uzemljenje za to vprašanje.
        // GEO-ODGOVORI: priloži kraje — mini zemljevid s pini.
        {
          role: "assistant" as const,
          content: data.message,
          sources: data.sources ?? [],
          places,
        },
      ]);

      // §8 CELI GLASOVNI KLEPET: odgovor na IZGOVORJENO vprašanje se
      // samodejno prebere (brskalniški TTS, brez AI ključa). Tipkovnica in
      // hitri pozivi ostanejo tiho — samodejni izgovor je rezerviran za
      // glasovni pogovor, kjer uporabnik pričakuje govorjen odgovor.
      if (viaVoice && ttsSupported() && data.message) {
        speakMessage(newMessages.length, data.message);
      }

      // Telemetrija: geo odgovor je bil izrisan (meri doseg funkcije:
      // koliko odgovorov prinese pine — ločeno po plasti porekla)
      if (places.length > 0) {
        trackPlannerEvent("chat_geo_answered", {
          osm_count: places.filter((p) => p.provenance === "osm").length,
          t1_count: places.filter((p) => p.provenance === "t1").length,
          t2_count: places.filter((p) => p.provenance === "t2").length,
          // 1.46: katere kategorije so v odgovoru (npr. "food:5,drinks:2,
          // destination:1,source:2") — pove, katere čipe uporabniki sploh
          // vidijo (telemetrična slepota prej: samo poreklo, ne kategorija)
          cat_counts: [...categoryCountsOf(places).entries()]
            .map(([cat, n]) => `${cat}:${n}`)
            .join(","),
        });
      }

      if (!open) setHasNewMessage(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: t("offlineFallback"),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  return (
    <>
      {/* Lebdeči gumb (spodaj desno) — UX-CMP #6: ob drsenju dol se na
          mobilnem skrije (vsebina > gumb), ob drsenju gor se vrne */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "dsa-chat-fab fixed bottom-4 right-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 sm:bottom-6 sm:right-6",
          fabHidden &&
            "max-sm:pointer-events-none max-sm:translate-y-24 max-sm:opacity-0"
        )}
        aria-label={open ? t("fabClose") : t("fabOpen")}
        aria-expanded={open}
        tabIndex={fabHidden ? -1 : 0}
      >
        {open ? (
          <X className="size-6" aria-hidden="true" />
        ) : (
          <>
            <MessageCircle className="size-6" aria-hidden="true" />
            {hasNewMessage && (
              <span className="absolute -right-1 -top-1 flex size-4">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex size-4 rounded-full bg-red-500" />
              </span>
            )}
          </>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="dsa-chat-panel fixed bottom-20 right-4 z-50 flex h-[32rem] max-h-[calc(100vh-6rem)] w-[calc(100vw-2rem)] flex-col rounded-2xl border border-border bg-background shadow-2xl sm:right-6 sm:w-96"
          role="dialog"
          aria-label={t("dialogAriaLabel")}
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border bg-primary/5 p-4 rounded-t-2xl">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
              <Bot className="size-5 text-primary" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h2 className="flex items-center gap-1.5 text-sm font-bold">
                {t("headerTitle")}
                <Badge
                  variant="secondary"
                  className={cn(
                    "gap-1 text-[9px]",
                    source === "fallback"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  )}
                >
                  <Sparkles className="size-2.5" aria-hidden="true" />
                  {source === "fallback" ? t("badgeFallback") : t("badgeAI")}
                </Badge>
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {t("headerSubtitle")}
              </p>
            </div>
            {/* Počisti pogovor — takojšen (brez potrditve), s toast obvestilom;
                onemogočen, dokler ni zgodovine za počistiti */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={handleClearConversation}
              disabled={messages.length <= 1}
              aria-label={t("clear")}
              title={t("clear")}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Sporočila */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto p-4"
            aria-live="polite"
            aria-atomic="false"
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                    msg.role === "user"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted"
                  )}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                  {/* GEO-ODGOVORI: mini zemljevid s pini — AI odgovor se
                      izriše prostorsko (kje je hrana/pijača/tržnica …) */}
                  {msg.role === "assistant" && msg.places && msg.places.length > 0 ? (
                    <GeoPlacesSection
                      places={msg.places}
                      onExpand={(places, disabledCats) => {
                        setMapOverlay(places);
                        // 1.46: overlay podeduje filter kompaktnega pogleda
                        // (povečava nadaljuje, kar je uporabnik filtriral)
                        setOverlayDisabled(new Set(disabledCats));
                        // Obstojeci dogodek map_opened z novo dimenzijo via
                        // (zemljevid_page | chat_geo) — brez novega eventa
                        trackPlannerEvent("map_opened", { via: "chat_geo" });
                      }}
                      onAddPlace={handleAddPlace}
                      addedPlaceIds={addedPlaceIds}
                    />
                  ) : null}

                  {/* DATA-LAYERS-RAG: značke uradnih virov (T2) — veriga
                      "podatek → AI → vir → dejanje": citat STO + morebitna
                      geopovezava na našo stran destinacije (zemljevid). */}
                  {msg.role === "assistant" && msg.sources && msg.sources.length > 0 ? (
                    <div className="mt-2.5 border-t border-border/60 pt-2.5">
                      <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Landmark className="size-3" aria-hidden="true" />
                        {t("sourcesLabel")}
                      </p>
                      <ul className="space-y-1.5">
                        {msg.sources.map((s) => (
                          <li key={s.url} className="flex flex-wrap items-center gap-1.5">
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="max-w-full truncate rounded-md bg-background px-2 py-1 text-[11px] font-medium text-foreground underline decoration-border underline-offset-2 transition-colors hover:decoration-primary"
                              title={`${s.title} — slovenia.info`}
                            >
                              {s.title}
                            </a>
                            {s.destinationSlug ? (
                              <Link
                                href={`/destinacija/${s.destinationSlug}`}
                                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                                onClick={() => setOpen(true)}
                              >
                                <MapPin className="size-3" aria-hidden="true" />
                                {t("sourceMap")}
                              </Link>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* §7 GLASOVNI IZHOD — brskalniški TTS (brez AI ključa):
                      odgovor preberi na glas. Gumb se izriše SAMO ob
                      podprtem speechSynthesis; ob izgovoru se spremeni v
                      ustavitev. Ne moti zemljevida/virov — lastna vrstica. */}
                  {msg.role === "assistant" && voiceOut && msg.content ? (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() =>
                          speakingIdx === i
                            ? stopSpeaking()
                            : speakMessage(i, msg.content)
                        }
                        aria-pressed={speakingIdx === i}
                        aria-label={
                          speakingIdx === i
                            ? t("voiceStopSpeak")
                            : t("voiceSpeak")
                        }
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {speakingIdx === i ? (
                          <Square className="size-3" aria-hidden="true" />
                        ) : (
                          <Volume2 className="size-3" aria-hidden="true" />
                        )}
                        {speakingIdx === i
                          ? t("voiceStopSpeak")
                          : t("voiceSpeak")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {/* Quick prompts (samo ko je samo welcome message) */}
            {messages.length === 1 && !loading && (
              <div className="space-y-2 pt-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("quickPromptsLabel")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPT_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => sendMessage(t(key))}
                      className="rounded-full border border-border/60 bg-background px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground active:bg-primary/10"
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5">
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
                  <span className="text-xs text-muted-foreground">{t("thinking")}</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t border-border p-3">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={listening ? t("voiceListening") : t("inputPlaceholder")}
                disabled={loading}
                maxLength={500}
                className="flex-1"
                aria-label={t("inputAriaLabel")}
              />
              {/* §6 GLASOVNI VHOD — brskalnikov STT, brez AI ključa. Gumb se
                  izriše SAMO ob podprtem SpeechRecognition; besedilni vnos
                  je vedno viden (zahtevani fallback za nepodprte brskalnike). */}
              {voiceIn && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={toggleVoiceInput}
                  disabled={loading && !listening}
                  aria-pressed={listening}
                  aria-label={listening ? t("voiceStop") : t("voiceStart")}
                  title={listening ? t("voiceStop") : t("voiceStart")}
                  className={cn(
                    "shrink-0",
                    listening &&
                      "animate-pulse border-red-300 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-600 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60"
                  )}
                >
                  {listening ? (
                    <MicOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Mic className="size-4" aria-hidden="true" />
                  )}
                </Button>
              )}
              <Button
                type="submit"
                size="icon"
                disabled={loading || !input.trim()}
                className="shrink-0"
                aria-label={t("send")}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* GEO-ODGOVORI: fullscreen zemljevid — mobilna izkušnja "velikega
          zemljevida" (Mindtrip split-pane je desktop rešitev; naša večina
          uporabnikov je mobilnih). Escape ali X zapreta.
          1.46: čipi kategorij + legenda porekla (isti kot kompakten pogled —
          prej je legendi manjkala tukaj, audit vrzel #8). */}
      {mapOverlay && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-background"
          role="dialog"
          aria-modal="true"
          aria-label={t("mapOverlayAria")}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border p-3">
            <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
              <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="truncate">
                {t("placesLabel")}
                <span className="ml-1 font-normal text-muted-foreground">
                  {" · "}
                  {overlayDisabled.size > 0
                    ? `${mapOverlay.filter((p) => !overlayDisabled.has(p.category)).length}/${mapOverlay.length}`
                    : mapOverlay.length}
                </span>
              </span>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => setMapOverlay(null)}
              aria-label={t("mapClose")}
            >
              <X className="size-5" aria-hidden />
            </Button>
          </div>
          <div className="min-h-0 flex-1 p-2">
            {mapOverlay.filter((p) => !overlayDisabled.has(p.category)).length > 0 ? (
              <Suspense
                fallback={<div className="h-full w-full animate-pulse rounded-lg bg-muted" aria-hidden />}
              >
                <ChatMiniMap
                  places={mapOverlay.filter((p) => !overlayDisabled.has(p.category))}
                  variant="overlay"
                />
              </Suspense>
            ) : (
              /* Iskren prazen stanje (vsi čipi izklopljeni) — tudi tukaj */
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 text-center">
                <p className="px-4 text-xs text-muted-foreground">{t("catEmpty")}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOverlayDisabled(new Set())}
                >
                  {t("catEmptyReset")}
                </Button>
              </div>
            )}
          </div>
          <div className="border-t border-border">
            {/* 1.46: čipi — izven drsljivega seznama, da so vedno vidni */}
            <div className="px-3 pt-2">
              <CategoryChips
                counts={categoryCountsOf(mapOverlay)}
                disabled={overlayDisabled}
                onToggle={(cat) => {
                  const wasDisabled = overlayDisabled.has(cat);
                  setOverlayDisabled((prev) => {
                    const next = new Set(prev);
                    if (next.has(cat)) next.delete(cat);
                    else next.add(cat);
                    return next;
                  });
                  trackPlannerEvent("chat_geo_filtered", {
                    category: cat,
                    enabled: wasDisabled ? 1 : 0,
                    surface: "overlay",
                  });
                }}
              />
            </div>
            <div className="max-h-52 overflow-y-auto p-3 pt-2">
              <ul className="space-y-1.5">
                {mapOverlay
                  .filter((p) => !overlayDisabled.has(p.category))
                  .map((p, i) => (
                    <PlaceRow
                      key={p.id}
                      place={p}
                      index={i}
                      added={addedPlaceIds.has(p.id)}
                      onAdd={handleAddPlace}
                    />
                  ))}
              </ul>
            </div>
            {/* Legenda porekla — ista kot v kompaktnem pogledu (1.46: prej
                je v overlayju manjkala — uporabnik ni vedel, kaj barve
                pinov pomenijo, ko je zemljevid povečal) */}
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: PLACE_PIN_COLORS.t1 }} />
                {t("provenanceT1Legend")}
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: PLACE_PIN_COLORS.osm }} />
                {t("provenanceOsmLegend")}
              </span>
              {mapOverlay.some((p) => p.provenance === "t2") && (
                <span className="flex items-center gap-1">
                  <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: PLACE_PIN_COLORS.t2 }} />
                  {t("provenanceT2Legend")}
                </span>
              )}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
