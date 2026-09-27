#!/usr/bin/env python3
"""W1 faza 2a: provider-panel.tsx L slovar → 4-jezičen + statusLabel IT/DE.

Register labels/accessNote (provenance podrobnosti) ostanejo {sl,en} —
vir-atribucija v izvirnem jeziku (isti §38 vzorec kot tržnica).
"""
import sys
from pathlib import Path

F = Path("src/components/supply/provider-panel.tsx")
s = F.read_text()

OLD_L = """const L = {
  // F12-3 (§7): ikonski sprožilec — isti niz za aria-label + title
  // (dostopnost nespremenjena, vizualna teža zmanjšana).
  triggerAria: { sl: "Ponudba in viri (napredno)", en: "Supply and sources (advanced)" },
  title: { sl: "Zemljevid ponudbe", en: "Supply map" },
  desc: {
    sl: "Lokalna ponudba (odprti podatki) in komercialni partnerji z jasnimi statusi virov.",
    en: "Local supply (open data) and commercial partners with clear source statuses.",
  },
  productsTitle: { sl: "Ponudba v pogledu", en: "Supply in view" },
  productsNone: {
    sl: "Približajte zemljevid ali vklopite kategorije.",
    en: "Zoom in or enable categories.",
  },
  productsLoading: { sl: "Nalagam…", en: "Loading…" },
  productsDegraded: {
    sl: "Nekateri viri trenutno niso dosegljavi — lokalna plast ostaja.",
    en: "Some sources are unreachable right now — the local layer remains.",
  },
  localGroup: { sl: "Lokalni viri (odprti podatki)", en: "Local sources (open data)" },
  commercialGroup: { sl: "Komercialni partnerji", en: "Commercial partners" },
  ownGroup: { sl: "Naša tržnica", en: "Our marketplace" },
  open: { sl: "Odpri pri partnerju", en: "Open at partner" },
  active: { sl: "aktiven sloj", en: "active layer" },
  notActive: { sl: "ni sloja", en: "no layer" },
  statusLegend: {
    sl: "Status pove, KAJ dejansko imamo: živi inventar, objavljene podatke, iskanje, samo povezavo partnerja ali lokalne odprte podatke. Affiliate povezava NI inventar.",
    en: "The status tells what we actually have: live inventory, published data, search, a partner link only, or local open data. An affiliate link is NOT inventory.",
  },
} as const;"""

NEW_L = """const L = {
  // F12-3 (§7): ikonski sprožilec — isti niz za aria-label + title
  // (dostopnost nespremenjena, vizualna teža zmanjšana).
  // W1 faza 2a (Issue #15): 4 javni jeziki (zemljevid je 4-jezičen).
  triggerAria: {
    sl: "Ponudba in viri (napredno)",
    en: "Supply and sources (advanced)",
    it: "Offerta e fonti (avanzato)",
    de: "Angebot und Quellen (erweitert)",
  },
  title: {
    sl: "Zemljevid ponudbe",
    en: "Supply map",
    it: "Mappa dell'offerta",
    de: "Angebotskarte",
  },
  desc: {
    sl: "Lokalna ponudba (odprti podatki) in komercialni partnerji z jasnimi statusi virov.",
    en: "Local supply (open data) and commercial partners with clear source statuses.",
    it: "Offerta locale (dati aperti) e partner commerciali con stati delle fonti chiari.",
    de: "Lokales Angebot (offene Daten) und kommerzielle Partner mit klaren Quellenstatus.",
  },
  productsTitle: {
    sl: "Ponudba v pogledu",
    en: "Supply in view",
    it: "Offerta in vista",
    de: "Angebot im Blick",
  },
  productsNone: {
    sl: "Približajte zemljevid ali vklopite kategorije.",
    en: "Zoom in or enable categories.",
    it: "Ingrandisci la mappa o attiva le categorie.",
    de: "Zoome in die Karte oder aktiviere Kategorien.",
  },
  productsLoading: {
    sl: "Nalagam…",
    en: "Loading…",
    it: "Caricamento…",
    de: "Wird geladen…",
  },
  productsDegraded: {
    sl: "Nekateri viri trenutno niso dosegljavi — lokalna plast ostaja.",
    en: "Some sources are unreachable right now — the local layer remains.",
    it: "Alcune fonti non sono raggiungibili al momento — il livello locale resta.",
    de: "Einige Quellen sind derzeit nicht erreichbar — die lokale Ebene bleibt.",
  },
  localGroup: {
    sl: "Lokalni viri (odprti podatki)",
    en: "Local sources (open data)",
    it: "Fonti locali (dati aperti)",
    de: "Lokale Quellen (offene Daten)",
  },
  commercialGroup: {
    sl: "Komercialni partnerji",
    en: "Commercial partners",
    it: "Partner commerciali",
    de: "Kommerzielle Partner",
  },
  ownGroup: {
    sl: "Naša tržnica",
    en: "Our marketplace",
    it: "La nostra vetrina",
    de: "Unser Marktplatz",
  },
  open: {
    sl: "Odpri pri partnerju",
    en: "Open at partner",
    it: "Apri dal partner",
    de: "Beim Partner öffnen",
  },
  active: { sl: "aktiven sloj", en: "active layer", it: "livello attivo", de: "aktive Ebene" },
  notActive: { sl: "ni sloja", en: "no layer", it: "nessun livello", de: "keine Ebene" },
  statusLegend: {
    sl: "Status pove, KAJ dejansko imamo: živi inventar, objavljene podatke, iskanje, samo povezavo partnerja ali lokalne odprte podatke. Affiliate povezava NI inventar.",
    en: "The status tells what we actually have: live inventory, published data, search, a partner link only, or local open data. An affiliate link is NOT inventory.",
    it: "Lo stato dice cosa abbiamo davvero: inventario live, dati pubblicati, ricerca, solo un collegamento al partner o dati aperti locali. Un link affiliate NON è inventario.",
    de: "Der Status sagt, was wir tatsächlich haben: Live-Bestand, veröffentlichte Daten, Suche, nur einen Partner-Link oder lokale offene Daten. Ein Affiliate-Link ist KEIN Bestand.",
  },
} as const;"""

if OLD_L not in s:
    print("NAPAKA: ProviderPanel L blok ni najden")
    sys.exit(1)
s = s.replace(OLD_L, NEW_L)

# props tipa: 4-jezični lang (map-view pošilja MapLang)
s = s.replace(
    """interface ProviderPanelProps {
  lang: "sl" | "en";""",
    """interface ProviderPanelProps {
  /** W1 faza 2a: 4 javni jeziki (zemljevid); registarske accessNote/labels
   *  ostanejo {sl,en} — provenance v izvirnem jeziku (§38 vzorec). */
  lang: "sl" | "en" | "it" | "de";""",
)
s = s.replace(
    """}: {
  entry: ProviderRegistryEntry;
  lang: "sl" | "en";
}) {
  const status = statusLabel(entry.status)[lang];
  const label = entry.labels[lang];
  const note = entry.accessNote?.[lang];""",
    """}: {
  entry: ProviderRegistryEntry;
  lang: "sl" | "en" | "it" | "de";
}) {
  // W1 faza 2a: statusBadge + skupine v UI jeziku; labels/accessNote so
  // register-atribucija (vir) — IT/DE vidita SL izvirnik (isti §38 kanon
  // kot imena ponudnikov iz DB na /it/trznica).
  const regLang: "sl" | "en" = lang === "en" ? "en" : "sl";
  const status = statusLabel(entry.status, lang);
  const label = entry.labels[regLang];
  const note = entry.accessNote?.[regLang];""",
)

F.write_text(s)
print("provider-panel.tsx: L 4-jezičen + props/regLang")

# ============ registry.ts statusLabel → 4-jezična ============
FR = Path("src/lib/supply/registry.ts")
r = FR.read_text()

OLD_STATUS = """export function statusLabel(status: SupplyStatus): { sl: string; en: string } {
  switch (status) {
    case "local":
      return { sl: "Lokalni vir", en: "Local source" };
    case "live":
      return { sl: "Živa ponudba", en: "Live inventory" };
    case "static":
      return { sl: "Objavljeni podatki", en: "Published data" };
    case "search":
      return { sl: "Iskanje", en: "Search" };
    case "affiliate":
      return { sl: "Povezava partnerja", en: "Partner link" };
    case "planned":
      return { sl: "Načrtovano", en: "Planned" };
  }
}"""

NEW_STATUS = """export function statusLabel(
  status: SupplyStatus,
  /** W1 faza 2a: UI jezik (privzeto SL — nazaj kompatibilno). */
  uiLang: "sl" | "en" | "it" | "de" = "sl"
): { sl: string; en: string; it: string; de: string } {
  switch (status) {
    case "local":
      return {
        sl: "Lokalni vir",
        en: "Local source",
        it: "Fonte locale",
        de: "Lokale Quelle",
      };
    case "live":
      return {
        sl: "Živa ponudba",
        en: "Live inventory",
        it: "Inventario live",
        de: "Live-Bestand",
      };
    case "static":
      return {
        sl: "Objavljeni podatki",
        en: "Published data",
        it: "Dati pubblicati",
        de: "Veröffentlichte Daten",
      };
    case "search":
      return { sl: "Iskanje", en: "Search", it: "Ricerca", de: "Suche" };
    case "affiliate":
      return {
        sl: "Povezava partnerja",
        en: "Partner link",
        it: "Link del partner",
        de: "Partner-Link",
      };
    case "planned":
      return { sl: "Načrtovano", en: "Planned", it: "Previsto", de: "Geplant" };
  }
}"""

if OLD_STATUS not in r:
    print("NAPAKA: statusLabel blok ni najden")
    sys.exit(1)
r = r.replace(OLD_STATUS, NEW_STATUS)
FR.write_text(r)
print("registry.ts: statusLabel 4-jezična (privzeto SL — kompatibilno)")
