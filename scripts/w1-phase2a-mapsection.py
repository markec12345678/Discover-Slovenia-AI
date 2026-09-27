#!/usr/bin/env python3
"""W1 faza 2a: map-section.tsx + zemljevid/page.tsx L slovarja → 4-jezična."""
import sys
from pathlib import Path

# ============ map-section.tsx ============
F1 = Path("src/components/sections/map-section.tsx")
s = F1.read_text()

OLD_L = """const L = {
  badge: { sl: "Interaktivni zemljevid", en: "Interactive map" },
  // 1.95.1: regija (Slovenija + zahodni Balkan) + statični FSQ točke
  title: {
    sl: "Odkrijte Slovenijo in Balkan na zemljevidu",
    en: "Discover Slovenia & the Balkans on the map",
  },
  subtitle: {
    sl: (n: number) =>
      `${n} destinacij od Alp do Albanije — plus bencinske postaje, restavracije, nastanitve in druge lokalne točke. Kliknite marker za podrobnosti, vreme in rezervacije.`,
    en: (n: number) =>
      `${n} destinations from the Alps to Albania — plus petrol stations, restaurants, stays and other local places. Tap a marker for details, weather and bookings.`,
  },
  loading: { sl: "Nalagam zemljevid…", en: "Loading map…" }, // rezerva za prihodnjo uporabo znotraj komponente
  routeBadge: {
    sl: (n: number) => `Pot iz AI itinererja (${n} postankov)`,
    en: (n: number) => `Route from AI itinerary (${n} stops)`,
  },
  statDestinationsUnit: { sl: "destinacij", en: "destinations" },
  statRegionsUnit: { sl: "regij", en: "regions" },
  statRatingPrefix: {
    sl: "povprečna ocena",
    en: "average rating",
  },
  legendClick: { sl: "Kliknite marker za podrobnosti", en: "Tap a marker for details" },
  legendRoute: { sl: "Črtkana črta = predlagana pot", en: "Dashed line = suggested route" },
  legendSource: { sl: "Podatki: OpenStreetMap", en: "Data: OpenStreetMap" },
} as const;"""

NEW_L = """const L = {
  badge: {
    sl: "Interaktivni zemljevid",
    en: "Interactive map",
    it: "Mappa interattiva",
    de: "Interaktive Karte",
  },
  // 1.95.1: regija (Slovenija + zahodni Balkan) + statični FSQ točke
  title: {
    sl: "Odkrijte Slovenijo in Balkan na zemljevidu",
    en: "Discover Slovenia & the Balkans on the map",
    it: "Scopri Slovenia e Balcani sulla mappa",
    de: "Entdecke Slowenien und den Balkan auf der Karte",
  },
  subtitle: {
    sl: (n: number) =>
      `${n} destinacij od Alp do Albanije — plus bencinske postaje, restavracije, nastanitve in druge lokalne točke. Kliknite marker za podrobnosti, vreme in rezervacije.`,
    en: (n: number) =>
      `${n} destinations from the Alps to Albania — plus petrol stations, restaurants, stays and other local places. Tap a marker for details, weather and bookings.`,
    it: (n: number) =>
      `${n} destinazioni dalle Alpi all'Albania — più stazioni di benzina, ristoranti, alloggi e altri luoghi locali. Tocca un marker per dettagli, meteo e prenotazioni.`,
    de: (n: number) =>
      `${n} Reiseziele von den Alpen bis Albanien — dazu Tankstellen, Restaurants, Unterkünfte und weitere lokale Orte. Tippe auf einen Marker für Details, Wetter und Buchungen.`,
  },
  loading: {
    sl: "Nalagam zemljevid…",
    en: "Loading map…",
    it: "Caricamento della mappa…",
    de: "Karte wird geladen…",
  }, // rezerva za prihodnjo uporabo znotraj komponente
  routeBadge: {
    sl: (n: number) => `Pot iz AI itinererja (${n} postankov)`,
    en: (n: number) => `Route from AI itinerary (${n} stops)`,
    it: (n: number) => `Percorso dall'itinerario AI (${n} tappe)`,
    de: (n: number) => `Route aus der KI-Reiseroute (${n} Stopps)`,
  },
  statDestinationsUnit: {
    sl: "destinacij",
    en: "destinations",
    it: "destinazioni",
    de: "Reiseziele",
  },
  statRegionsUnit: { sl: "regij", en: "regions", it: "regioni", de: "Regionen" },
  statRatingPrefix: {
    sl: "povprečna ocena",
    en: "average rating",
    it: "valutazione media",
    de: "durchschnittliche Bewertung",
  },
  legendClick: {
    sl: "Kliknite marker za podrobnosti",
    en: "Tap a marker for details",
    it: "Tocca un marker per i dettagli",
    de: "Tippe auf einen Marker für Details",
  },
  legendRoute: {
    sl: "Črtkana črta = predlagana pot",
    en: "Dashed line = suggested route",
    it: "Linea tratteggiata = percorso suggerito",
    de: "Gestrichelte Linie = vorgeschlagene Route",
  },
  legendSource: {
    sl: "Podatki: OpenStreetMap",
    en: "Data: OpenStreetMap",
    it: "Dati: OpenStreetMap",
    de: "Daten: OpenStreetMap",
  },
} as const;"""

if OLD_L not in s:
    print("NAPAKA: map-section L blok ni najden")
    sys.exit(1)
s = s.replace(OLD_L, NEW_L)

OLD_LANG = 'const lang = useLocale() === "en" ? "en" : "sl";'
NEW_LANG = (
    "const locale = useLocale();\n"
    "  // W1 (Issue #15 faza 2a): 4 javni jeziki — it/de imata lastne nize\n"
    '  const lang =\n'
    '    locale === "en" || locale === "it" || locale === "de" ? locale : "sl";'
)
if OLD_LANG not in s:
    print("NAPAKA: map-section lang vrstica ni najdena")
    sys.exit(1)
s = s.replace(OLD_LANG, NEW_LANG)

# MAP_STATS decimalna vejica: sl/it/de uporabljajo vejico (le EN piko)
OLD_RATING = 'rating: avg.toFixed(1).replace(".", ","),'
NEW_RATING = (
    "// W1: decimalna vejica za vse jezike razen EN — vrednost je odvisna od\n"
    "  // trenutnega jezika, zato se formatira v render poti (spodaj).\n"
    'rating: avg.toFixed(1),'
)
if OLD_RATING not in s:
    print("NAPAKA: MAP_STATS rating vrstica ni najdena")
    sys.exit(1)
s = s.replace(OLD_RATING, NEW_RATING)

# kjer se rating izpiše, formatiraj po jeziku (poišči izpis statRatingPrefix bloka)
OLD_RATING_OUT = "{MAP_STATS.rating}"
NEW_RATING_OUT = '{MAP_STATS.rating.replace(".", lang === "en" ? "." : ",")}'
s = s.replace(OLD_RATING_OUT, NEW_RATING_OUT)

F1.write_text(s)
print("map-section.tsx: L 4-jezičen + lang + decimalna vejica")

# ============ zemljevid/page.tsx ============
F2 = Path("src/app/zemljevid/page.tsx")
p = F2.read_text()

OLD_PL = """const L = {
  badge: { sl: "Zemljevid", en: "Map" },
  title: {
    sl: "Interaktivni zemljevid Slovenije in Balkana",
    en: "Interactive map of Slovenia & the Balkans",
  },
  subtitle: {
    sl: (n: number) =>
      `${n} destinacij od Alp do Albanije na enem zemljevidu — z bencinskimi postajami, restavracijami, nastanitvami in drugimi lokalnimi točkami, s podrobnostmi o vsaki lokaciji in potjo vašega AI itinererja.`,
    en: (n: number) =>
      `${n} destinations from the Alps to Albania on a single map — with petrol stations, restaurants, stays and other local places, details for every location and your AI itinerary route once you build one.`,
  },
  hint: {
    sl: "Kliknite marker za podrobnosti · Brez prijave",
    en: "Tap a marker for details · No sign-up required",
  },
  metaTitle: {
    sl: "Interaktivni zemljevid Slovenije in Balkana",
    en: "Interactive map of Slovenia & the Balkans",
  },
  metaDescription: {
    sl: "Raziščite Slovenijo in Balkan na interaktivnem zemljevidu — destinacije, bencinske postaje, restavracije, nastanitve, lokalne ponudnike in pot svojega AI itinererja.",
    en: "Explore Slovenia and the Balkans on an interactive map — destinations, petrol stations, restaurants, stays, local providers and your AI itinerary route.",
  },
} as const;"""

NEW_PL = """const L = {
  badge: { sl: "Zemljevid", en: "Map", it: "Mappa", de: "Karte" },
  title: {
    sl: "Interaktivni zemljevid Slovenije in Balkana",
    en: "Interactive map of Slovenia & the Balkans",
    it: "Mappa interattiva della Slovenia e dei Balcani",
    de: "Interaktive Karte von Slowenien und dem Balkan",
  },
  subtitle: {
    sl: (n: number) =>
      `${n} destinacij od Alp do Albanije na enem zemljevidu — z bencinskimi postajami, restavracijami, nastanitvami in drugimi lokalnimi točkami, s podrobnostmi o vsaki lokaciji in potjo vašega AI itinererja.`,
    en: (n: number) =>
      `${n} destinations from the Alps to Albania on a single map — with petrol stations, restaurants, stays and other local places, details for every location and your AI itinerary route once you build one.`,
    it: (n: number) =>
      `${n} destinazioni dalle Alpi all'Albania su un'unica mappa — con stazioni di benzina, ristoranti, alloggi e altri luoghi locali, dettagli per ogni posizione e il percorso del tuo itinerario AI.`,
    de: (n: number) =>
      `${n} Reiseziele von den Alpen bis Albanien auf einer Karte — mit Tankstellen, Restaurants, Unterkünften und weiteren lokalen Orten, Details zu jeder Position und der Route deiner KI-Reiseroute.`,
  },
  hint: {
    sl: "Kliknite marker za podrobnosti · Brez prijave",
    en: "Tap a marker for details · No sign-up required",
    it: "Tocca un marker per i dettagli · Senza registrazione",
    de: "Tippe auf einen Marker für Details · Ohne Registrierung",
  },
  metaTitle: {
    sl: "Interaktivni zemljevid Slovenije in Balkana",
    en: "Interactive map of Slovenia & the Balkans",
    it: "Mappa interattiva della Slovenia e dei Balcani",
    de: "Interaktive Karte von Slowenien und dem Balkan",
  },
  metaDescription: {
    sl: "Raziščite Slovenijo in Balkan na interaktivnem zemljevidu — destinacije, bencinske postaje, restavracije, nastanitve, lokalne ponudnike in pot svojega AI itinererja.",
    en: "Explore Slovenia and the Balkans on an interactive map — destinations, petrol stations, restaurants, stays, local providers and your AI itinerary route.",
    it: "Esplora Slovenia e Balcani su una mappa interattiva — destinazioni, stazioni di benzina, ristoranti, alloggi, fornitori locali e il percorso del tuo itinerario AI.",
    de: "Entdecke Slowenien und den Balkan auf einer interaktiven Karte — Reiseziele, Tankstellen, Restaurants, Unterkünfte, lokale Anbieter und die Route deiner KI-Reiseroute.",
  },
} as const;"""

if OLD_PL not in p:
    print("NAPAKA: zemljevid page L blok ni najden")
    sys.exit(1)
p = p.replace(OLD_PL, NEW_PL)

# lang mapping (2 pojavitvi: metadata + page)
OLD_PLANG = 'const lang: PageLang = locale === "en" ? "en" : "sl";'
NEW_PLANG = (
    "// W1 (Issue #15 faza 2a): 4 javni jeziki\n"
    "  const lang: PageLang =\n"
    '    locale === "en" || locale === "it" || locale === "de" ? locale : "sl";'
)
count = p.count(OLD_PLANG)
if count != 2:
    print(f"NAPAKA: pričakovani 2 pojavitvi PageLang, najdeno {count}")
    sys.exit(1)
p = p.replace(OLD_PLANG, NEW_PLANG)

F2.write_text(p)
print("zemljevid/page.tsx: L 4-jezičen + lang ×2")
