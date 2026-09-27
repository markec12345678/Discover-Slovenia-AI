#!/usr/bin/env python3
"""W1 faza 2a: map-view.tsx T slovar → 4 jezikovni (SL/EN/IT/DE) + lang mapping."""
import re, sys
from pathlib import Path

F = Path("src/components/sections/map-view.tsx")
src = F.read_text()

START = "const T = {"
END = "} as const;\n\ntype MapLang = keyof typeof T.allDestinations;"
i = src.index(START)
j = src.index(END)
old_block = src[i : j + len(END)]

NEW = '''const T = {
  catAttraction: {
    sl: "Atrakcije",
    en: "Attractions",
    it: "Attrazioni",
    de: "Sehenswürdigkeiten",
  },
  catMuseum: { sl: "Muzeji", en: "Museums", it: "Musei", de: "Museen" },
  catNatural: { sl: "Narava", en: "Nature", it: "Natura", de: "Natur" },
  catViewpoint: {
    sl: "Razgledišča",
    en: "Viewpoints",
    it: "Punti panoramici",
    de: "Aussichtspunkte",
  },
  catReligious: {
    sl: "Religiozno",
    en: "Religious",
    it: "Religioso",
    de: "Religiöses",
  },
  catRestaurant: {
    sl: "Hrana & pijača",
    en: "Food & drink",
    it: "Cibo e bevande",
    de: "Essen & Trinken",
  },
  catAccommodation: {
    sl: "Nastanitve",
    en: "Stays",
    it: "Alloggi",
    de: "Unterkünfte",
  },
  catShop: { sl: "Trgovine", en: "Shops", it: "Negozi", de: "Geschäfte" },
  catPetrol: { sl: "Bencinske", en: "Petrol", it: "Benzina", de: "Tankstellen" },
  // TASK 45: aktivnosti/ture (Viator Partner API) — izrecna izbira
  // (default: false; naročniška zahteva §9: sloj OFF → 0 API klicev).
  catActivity: {
    sl: "Aktivnosti",
    en: "Activities",
    it: "Attività",
    de: "Aktivitäten",
  },
  catTour: { sl: "Ture", en: "Tours", it: "Tour", de: "Touren" },
  // TASK 43: transfer sloj (KiwiTaxi) — izrecna izbira (default: false):
  // sloj se prikaže SAMO ko ga uporabnik vklopi (naročniška zahteva §9).
  catTransfer: { sl: "Transferji", en: "Transfers", it: "Transfer", de: "Transfers" },
  allDestinations: {
    sl: "Vse destinacije",
    en: "All destinations",
    it: "Tutte le destinazioni",
    de: "Alle Reiseziele",
  },
  reset: { sl: "Ponastavi", en: "Reset", it: "Reimposta", de: "Zurücksetzen" },
  hideRoute: {
    sl: "Skrij pot",
    en: "Hide route",
    it: "Nascondi percorso",
    de: "Route ausblenden",
  },
  showRoute: {
    sl: "Pokaži pot",
    en: "Show route",
    it: "Mostra percorso",
    de: "Route anzeigen",
  },
  // ISSUE #12 (F12-1): MAP-FIRST SEARCH — iskanje na zemljevidu. Niza
  // showPois/hidePois (Pokaži/Skrij POI gumb) sta ODSTRANJENA: supply sloj
  // se vklopi SAMODEJNO ob search/kategorija kontekstu (nedvouen
  // mentalni model: ko iščem, vidim rezultate — brez tehničnega predpogoja).
  searchPlaceholder: {
    sl: "Kaj iščeš? (npr. restavracije v Ljubljani)",
    en: "What are you looking for? (e.g. restaurants in Ljubljana)",
    it: "Cosa cerchi? (es. ristoranti a Lubiana)",
    de: "Wonach suchst du? (z. B. Restaurants in Ljubljana)",
  },
  searchAria: {
    sl: "Iskanje po zemljevidu",
    en: "Map search",
    it: "Ricerca sulla mappa",
    de: "Kartensuche",
  },
  searchResultsAria: {
    sl: "Rezultati iskanja",
    en: "Search results",
    it: "Risultati della ricerca",
    de: "Suchergebnisse",
  },
  searchClear: {
    sl: "Počisti iskanje",
    en: "Clear search",
    it: "Cancella ricerca",
    de: "Suche löschen",
  },
  searchEmpty: {
    sl: "Ni zadetkov — poskusi z drugo besedo (kraj, hrana, pohod, vino, muzej).",
    en: "No matches — try another word (place, food, hike, wine, museum).",
    it: "Nessun risultato — prova con un'altra parola (luogo, cibo, escursione, vino, museo).",
    de: "Keine Treffer — versuche ein anderes Wort (Ort, Essen, Wanderung, Wein, Museum).",
  },
  searchError: {
    sl: "Iskanje trenutno ni na voljo — poskusi znova.",
    en: "Search is unavailable right now — try again.",
    it: "La ricerca non è disponibile al momento — riprova.",
    de: "Die Suche ist derzeit nicht verfügbar — versuche es erneut.",
  },
  searchShowOnMap: {
    sl: "Prikaži na zemljevidu",
    en: "Show on map",
    it: "Mostra sulla mappa",
    de: "Auf der Karte zeigen",
  },
  searchKindDestination: {
    sl: "Destinacija",
    en: "Destination",
    it: "Destinazione",
    de: "Reiseziel",
  },
  searchKindListing: {
    sl: "Lokal",
    en: "Venue",
    it: "Locale",
    de: "Anbieter",
  },
  searchKindProduct: {
    sl: "Izdelek",
    en: "Product",
    it: "Prodotto",
    de: "Produkt",
  },
  searchKindExperience: {
    sl: "Izkušnja",
    en: "Experience",
    it: "Esperienza",
    de: "Erlebnis",
  },
  searchNoGeo: {
    sl: "Brez lokacije na zemljevidu — odpri podrobnosti",
    en: "No map location — open details",
    it: "Nessuna posizione sulla mappa — apri i dettagli",
    de: "Kein Standort auf der Karte — Details öffnen",
  },
  chipsAria: {
    // ISSUE #12 (F12-3, §7): „POI“ je tehnični izraz — izglavljen iz
    // glavnega uporabniškega jezika (aria-label je uporabniški tekst).
    sl: "Filtriranje kategorij",
    en: "Filter categories",
    it: "Filtra le categorie",
    de: "Kategorien filtern",
  },
  // ISSUE #12 (F12-2): „+ Več" expander (5 primarnih → vseh 12 čipov).
  moreCats: { sl: "Več", en: "More", it: "Altro", de: "Mehr" },
  fewerCats: { sl: "Manj", en: "Less", it: "Meno", de: "Weniger" },
  // ISSUE #12 (F12-2): marker result card (issue §6) — primarna akcija je
  // DODAJ V MOJO POT; sekundarni Podrobnosti + Navigiraj.
  addToTrip: {
    sl: "Dodaj v mojo pot",
    en: "Add to my trip",
    it: "Aggiungi al mio viaggio",
    de: "Zu meiner Reise hinzufügen",
  },
  addedToTrip: { sl: "✓ Dodano", en: "✓ Added", it: "✓ Aggiunto", de: "✓ Hinzugefügt" },
  addLimitReached: {
    sl: "Doseženih največ izbir",
    en: "Selection limit reached",
    it: "Limite di selezione raggiunto",
    de: "Auswahlmaximum erreicht",
  },
  navigate: { sl: "Navigiraj", en: "Navigate", it: "Naviga", de: "Navigieren" },
  reviewsUnit: {
    sl: "mnenj",
    en: "reviews",
    it: "recensioni",
    de: "Bewertungen",
  },
  emptyText: {
    sl: "Vse kategorije so izklopljene — točke niso prikazane.",
    en: "All categories are off — no places are shown.",
    it: "Tutte le categorie sono disattivate — nessun luogo viene mostrato.",
    de: "Alle Kategorien sind aus — es werden keine Orte angezeigt.",
  },
  emptyReset: {
    sl: "Prikaži privzeto",
    en: "Show defaults",
    it: "Mostra predefiniti",
    de: "Standard anzeigen",
  },
  // ISSUE #12 (F12-3, §7+§13): uporabniški jezik stanj — „POI“ tehnični
  // izraz se umika iz glavnega UX (issue §7); vsa stanja ostajajo ISKRENA.
  loadingPois: {
    sl: "Nalagam lokalna mesta…",
    en: "Loading local places…",
    it: "Caricamento dei luoghi locali…",
    de: "Lokale Orte werden geladen…",
  },
  // ISSUE #12 (F12-3): števec rezultatov supply sloja v glavnem jeziku
  // (prej „X POI · viri“ — zdaj rezultati + atribucija virov ostane).
  supplyUnit: {
    sl: "rezultatov",
    en: "results",
    it: "risultati",
    de: "Ergebnisse",
  },
  mapAria: {
    sl: "Interaktivni zemljevid Slovenije in Balkana z destinacijami, bencinskimi, restavracijami in nastanitvami",
    en: "Interactive map of Slovenia and the Balkans with destinations, petrol stations, restaurants and stays",
    it: "Mappa interattiva della Slovenia e dei Balcani con destinazioni, stazioni di benzina, ristoranti e alloggi",
    de: "Interaktive Karte von Slowenien und dem Balkan mit Reisezielen, Tankstellen, Restaurants und Unterkünften",
  },
  infoDestUnit: {
    sl: "destinacij",
    en: "destinations",
    it: "destinazioni",
    de: "Reiseziele",
  },
  infoClickMarker: {
    sl: "Klikni marker",
    en: "Tap a marker",
    it: "Tocca un marker",
    de: "Tippe auf einen Marker",
  },
  editorial: { sl: "uredniška", en: "editorial", it: "editoriale", de: "redaktionell" },
  moreInfo: {
    sl: "Več informacij →",
    en: "More info →",
    it: "Ulteriori informazioni →",
    de: "Weitere Infos →",
  },
  details: {
    sl: "Podrobnosti →",
    en: "Details →",
    it: "Dettagli →",
    de: "Details →",
  },
  day: {
    sl: (n: number) => `Dan ${n}`,
    en: (n: number) => `Day ${n}`,
    it: (n: number) => `Giorno ${n}`,
    de: (n: number) => `Tag ${n}`,
  },
  // F1 (Supply Map):
  // ISSUE #12 (F12-3, §13): zoom hint BREZ tehnične ravni „z ≥ 10“ —
  // uporabniško dejanje, ne številka plasti (razlog ostaja v kodi/hooku).
  zoomHint: {
    sl: "Približajte zemljevid za lokalne točke.",
    en: "Zoom in for local places.",
    it: "Ingrandisci la mappa per i luoghi locali.",
    de: "Zoome in die Karte für lokale Orte.",
  },
  // ISSUE #12 (F12-3, §13): PRIMER IZ ISSUEJA — „Nekaterih lokalnih mest
  // trenutno ni mogoče prikazati.“ (prej: „Nekateri viri … niso dosegljivi“).
  // Destinacije (vedno na voljo) ostanejo pošteno omenjene.
  degradedHint: {
    sl: "Nekaterih lokalnih mest trenutno ni mogoče prikazati — destinacije ostajajo.",
    en: "Some local places can't be shown right now — destinations remain.",
    it: "Alcuni luoghi locali non possono essere mostrati al momento — le destinazioni restano disponibili.",
    de: "Einige lokale Orte können derzeit nicht angezeigt werden — die Reiseziele bleiben verfügbar.",
  },
  // TASK 99-a (§15): iskrena oznaka za "client-network" — napaka je na
  // STRANI ODJEMALCA (offline), zato NE obtožuje virov/ponudnikov.
  networkHint: {
    sl: "Ni internetne povezave — destinacije ostajajo na voljo.",
    en: "You appear to be offline — destinations remain available.",
    it: "Nessuna connessione a Internet — le destinazioni restano disponibili.",
    de: "Keine Internetverbindung — die Reiseziele bleiben verfügbar.",
  },
  // MAP PINS sloj (1.95.1) — statični FSQ: bencinske/restavracije/
  // nastanitve SI+HR+ME+AL.
  pinsUnit: { sl: "točk", en: "places", it: "luoghi", de: "Orte" },
  pinsCappedHint: {
    sl: "Prikazanih najboljše ocenjenih — približajte za vse.",
    en: "Showing best-rated — zoom in for all.",
    it: "Mostrati i meglio valutati — ingrandisci per vederli tutti.",
    de: "Am besten bewertete werden angezeigt — zoome für alle.",
  },
  pinsError: {
    sl: "Točk ni bilo mogoče naložiti — premaknite zemljevid in poskusite znova.",
    en: "Places could not be loaded — move the map and try again.",
    it: "Impossibile caricare i luoghi — sposta la mappa e riprova.",
    de: "Orte konnten nicht geladen werden — verschiebe die Karte und versuche es erneut.",
  },
  pinsCellTitle: {
    sl: (n: number) => `${n} točk na tem območju`,
    en: (n: number) => `${n} places in this area`,
    it: (n: number) => `${n} luoghi in quest'area`,
    de: (n: number) => `${n} Orte in diesem Gebiet`,
  },
  pinsCellZoom: {
    sl: "Približaj to območje",
    en: "Zoom into this area",
    it: "Ingrandizza quest'area",
    de: "In dieses Gebiet zoomen",
  },
  pinsReviews: {
    sl: (n: number) => `${n} mnenj`,
    en: (n: number) => `${n} reviews`,
    it: (n: number) => `${n} recensioni`,
    de: (n: number) => `${n} Bewertungen`,
  },
  // Atribucija (Apache-2.0) — ISTA vrednost kot MAP_PINS_SOURCE v
  // src/lib/map-pins.ts (server; klient ne sme uvažati node:fs plasti).
  pinsAttribution: {
    sl: "Foursquare Open Places (Apache-2.0)",
    en: "Foursquare Open Places (Apache-2.0)",
    it: "Foursquare Open Places (Apache-2.0)",
    de: "Foursquare Open Places (Apache-2.0)",
  },
} as const;

type MapLang = keyof typeof T.allDestinations;'''

src = src[:i] + NEW + src[j + len(END) :]

# lang mapping: 4-way (prej binarni en/sl)
old_lang = 'const lang: MapLang = useLocale() === "en" ? "en" : "sl";'
new_lang = (
    "const locale = useLocale();\n"
    "  // W1 (Issue #15 faza 2a): 4 javni jeziki — it/de padeta v svoj vejo\n"
    '  const lang: MapLang =\n'
    '    locale === "en" || locale === "it" || locale === "de" ? locale : "sl";'
)
if old_lang not in src:
    print("NAPAKA: lang vrstice ni mogoče najti")
    sys.exit(1)
src = src.replace(old_lang, new_lang)

# formatPinCount: decimalna vejica za sl/it/de (le EN pika)
old_fp = 'v.toFixed(1).replace(".", lang === "sl" ? "," : ".");'
new_fp = 'v.toFixed(1).replace(".", lang === "en" ? "." : ",");'
if old_fp not in src:
    print("NAPAKA: formatPinCount vrstice ni mogoče najti")
    sys.exit(1)
src = src.replace(old_fp, new_fp)

F.write_text(src)
print("map-view.tsx: T slovar 4-jezičen, lang mapping + formatPinCount posodobljeni")
