#!/usr/bin/env python3
"""
W1 faza 2a (Issue #15): ROČNI prevodi IT — destinacijske plasti.
5 namespaceov: destinationPage, thingsToDo, bestTime, itineraryPage, guidePage.
Vsa mesta {…} (ICU placeholderji) so obvezno ohranjena (varovalka task71).
Vstavlja samo te ns v messages/it.json (ostalo se ne dotakne).
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MSG = ROOT / "src/i18n/messages/it.json"

destinationPage = {
    "breadcrumbHome": "Home",
    "breadcrumbDestinations": "Destinazioni",
    "heroStats": "{highlights} attrazioni · {duration} · {budget}",
    "aboutTitle": "Informazioni su {name}",
    "highlightsTitle": "Attrazioni principali",
    "facts": {
        "duration": "Durata consigliata della visita",
        "budget": "Budget",
        "person": "persona",
        "bestFor": "Adatto a",
        "season": "Stagione migliore",
    },
    "durations": {
        "d1": "1 giorno",
        "weekend": "Weekend (2 giorni)",
        "d3": "3 giorni",
        "d5": "5 giorni",
        "d7": "7 giorni",
    },
    "itineraries": {"title": "Itinerari pronti per {name}"},
    "guides": {"title": "Guide per tipo di viaggio — {name}"},
    "bestTime": {"title": "Periodo migliore per visitare {name}"},
    "thingsToDo": {
        "title": "Cosa fare a {name}",
        "text": "La pagina dettagliata con attività, fornitori locali, esperienze e domande frequenti — {highlights} attrazioni principali in un unico posto.",
        "button": "Apri la guida di {name}",
    },
    "nearby": {"title": "Vicino — regione {region}"},
    "explore": {"title": "Esplora anche", "all": "Tutte le destinazioni"},
    "plan": {
        "title": "Pianifica il tuo viaggio a {name}",
        "text": "Possiamo creare un itinerario completo per {name} e dintorni — su misura per i tuoi interessi, le date, le previsioni del tempo e chi viaggia con te.",
        "button": "Pianificatore di viaggio",
    },
    "seasons": {
        "pomlad": "Primavera",
        "poletje": "Estate",
        "jesen": "Autunno",
        "zima": "Inverno",
    },
    "source": {
        "title": "Fonte dei contenuti",
        "sourceLabel": "Fonte",
        "sourceShort": "fonte",
        "updatedLabel": "Aggiornato",
        "openingLabel": "Orari di apertura",
        "externalSr": "si apre su un sito esterno",
        "langNote": "La fonte del contenuto è in sloveno; questa versione è una traduzione.",
    },
    "meta": {
        "notFound": "Destinazione non trovata",
        "title": "{name} — {tagline} | Guida di viaggio della Slovenia",
        "description": "{name}: {tagline}. Durata consigliata della visita: {duration}. Attrazioni: {highlights}. Itinerari pronti, guide per tipo di viaggio e periodo migliore per visitare.",
        "ogTitle": "{name} — guida alla destinazione",
        "ogDescription": "{name}: {tagline}. Cosa fare, itinerari per durata e periodo migliore per visitare.",
    },
    "trackerTitle": "{name} — Destinazione",
}

thingsToDo = {
    "breadcrumbHome": "Home",
    "heroTitle": "Cosa fare a {name}",
    "heroStats": "{highlights} attrazioni · {activities} attività · Valutazione editoriale {rating}★",
    "aboutTitle": "Informazioni su {name}",
    "highlightsTitle": "Attrazioni principali",
    "experiencesTitle": "Attività ed esperienze a {name}",
    "listingsTitle": "Locali a {name}",
    "productsTitle": "Prodotti locali da {name}",
    "bestTimeTitle": "Periodo migliore per visitare {name}",
    "seasons": {
        "pomlad": "Primavera",
        "poletje": "Estate",
        "jesen": "Autunno",
        "zima": "Inverno",
    },
    "faqTitle": "Domande frequenti",
    "planTitle": "Pianifica il tuo viaggio a {name}",
    "planText": "La nostra AI può creare un itinerario perfetto per {name} e dintorni — personalizzato in base al tuo budget, ai tuoi interessi e alla stagione.",
    "planButton": "Pianificatore di viaggi AI",
    "exploreTitle": "Esplora anche",
    "trackerTitle": "Cosa fare a {name} — Guida",
    "meta": {
        "notFound": "Destinazione non trovata",
        "title": "Cosa fare a {name} — Guida di {name}",
        "description": "Scopri le migliori attività, attrazioni ed esperienze a {name}, {tagline}. Guida con {count} attrazioni principali, fornitori locali e raccomandazioni AI.",
        "ogTitle": "Cosa fare a {name} — Discover Slovenia AI",
        "ogDescription": "{count} attrazioni, ristoranti locali, attività ed esperienze a {name}.",
    },
}

bestTime = {
    "breadcrumbHome": "Home",
    "breadcrumbCurrent": "Periodo migliore — {season}",
    "seasons": {
        "pomlad": {
            "label": "Primavera",
            "months": " marzo–maggio",
            "desc": "Fioriture, clima mite, meno turisti",
        },
        "poletje": {
            "label": "Estate",
            "months": " giugno–agosto",
            "desc": "Caldo, ideale per acqua ed escursioni",
        },
        "jesen": {
            "label": "Autunno",
            "months": " settembre–novembre",
            "desc": "Colori autunnali, vino, meno folla",
        },
        "zima": {
            "label": "Inverno",
            "months": " dicembre–febbraio",
            "desc": "Sci, mercatini natalizi, wellness",
        },
    },
    "bestSeasonBadge": "✓ Stagione migliore",
    "heroTitle": "Periodo migliore per visitare {name}",
    "overviewTitle": "{name} in {seasonLower}",
    "bestCardTitle": "{season} è la stagione ideale per {name}!",
    "bestCardText": "{name} è al suo meglio in questa stagione — {taglineLower}.",
    "offCardTitle": "{season} non è l'alta stagione per {name}",
    "offCardText": "Ma questo può essere un vantaggio — meno turisti, prezzi più bassi e un'esperienza diversa.",
    "allSeasonsTitle": "Tutte le stagioni per {name}",
    "bestBadge": "★ Migliore",
    "faqTitle": "Domande frequenti",
    "faq": {
        "q1": "Quando è il periodo migliore per visitare {name}?",
        "a1": "{season} è un ottimo periodo per visitare {name}. Le temperature sono {temp}, ideali per esplorare. Primavera e autunno offrono meno turisti e prezzi più bassi.",
        "q2": "Com'è il meteo a {name} in {seasonLower}?",
        "a2": "In {seasonLower} le temperature a {name} sono di solito {temp}. Consigliamo un abbigliamento a strati.",
        "q3": "Quali attività sono disponibili a {name} in {seasonLower}?",
        "a3": "{season} a {name} offre diverse attività — dall'escursionismo alla gastronomia. Consulta il nostro elenco di cose da fare a {name}.",
        "q4": "Serve una prenotazione per visitare {name}?",
        "a4": "Consigliamo di prenotare l'alloggio almeno 2 settimane in anticipo, soprattutto in alta stagione. Usa il nostro pianificatore AI per ottimizzare l'itinerario.",
    },
    "ctaTitle": "Pianifica un viaggio in {seasonLower} a {name}",
    "ctaText": "La AI considera stagione, meteo e i tuoi interessi per un piano perfetto.",
    "ctaButton": "Itinerario AI",
    "ctaThingsToDo": "Cosa fare a {name}",
    "exploreTitle": "Esplora anche",
    "meta": {
        "notFound": "Pagina non trovata",
        "title": "Periodo migliore per visitare {name} — {season}",
        "description": "Quando visitare {name}? {season} ({months}): {desc}. Temperature {temp}. Consigli, attività e itinerario {seasonLower} per {name}.",
        "ogDescription": "{desc}. Temperature {temp}. Guida per {name} in {seasonLower}.",
    },
}

itineraryPage = {
    "durations": {
        "1-dan": {"label": "1 giorno", "desc": "Visita rapida"},
        "vikend": {"label": "Weekend (2 giorni)", "desc": "Il weekend perfetto"},
        "3-dnevi": {"label": "3 giorni", "desc": "Visita approfondita"},
        "5-dnevi": {"label": "5 giorni", "desc": "Esperienza completa"},
        "7-dnevi": {"label": "7 giorni", "desc": "Una settimana di scoperte"},
    },
    "travelerTypes": {
        "pari": {"label": "Per coppie", "desc": "Fuga romantica"},
        "druzina": {"label": "In famiglia", "desc": "Divertimento per tutte le età"},
        "solo": {"label": "Viaggiatore solo", "desc": "Esplorazione in autonomia"},
        "avanturist": {"label": "Avventuriero", "desc": "Adrenalina e natura"},
    },
    "headline": "Itinerario di {duration} per {name}",
    "overviewTitle": "Panoramica del viaggio",
    "unitDay": "giorno",
    "unitDays": "giorni",
    "costLabel": "stima / persona",
    "ratingLabel": "valutazione editoriale della destinazione",
    "daysTitle": "Programma giornaliero consigliato",
    "dayLabel": "Giorno {day}",
    "dayFirst": "Arrivo ed esplorazione di {name}",
    "dayLast": "Ultimo giorno e partenza",
    "dayMiddle": "Giornata completa di scoperte",
    "hoursLabel": "4-6 ore",
    "perPerson": "€/persona",
    "travelerTypesTitle": "Itinerari per tipo di viaggiatore",
    "generateButton": "Genera itinerario",
    "otherDestinationsTitle": "Altre destinazioni",
    "personalizedTitle": "Vuoi un itinerario personalizzato?",
    "personalizedText": "La nostra AI considera il tuo budget, gli interessi e la stagione per un piano perfetto.",
    "personalizedButton": "Genera itinerario AI",
    "meta": {
        "notFound": "Itinerario non trovato",
        "title": "Itinerario di {duration} per {name} — {desc}",
        "description": "L'itinerario completo di {durationLower} per {name}, {tagline}. {desc} — attività, alloggi e ristoranti consigliati dalla AI per una visita di {days} giorni.",
        "ogDescription": "Itinerario di {duration} consigliato dalla AI con attività, alloggi e ristoranti.",
    },
}

guidePage = {
    "metaNotFound": "Guida non trovata",
    "breadcrumbHome": "Home",
    "breadcrumbAria": "Breadcrumb",
    "editorialRating": "Valutazione editoriale {rating}★",
    "introHeading": "{label} a {name}",
    "metaLine": "Durata: {duration} · Fascia di prezzo: {price}",
    "highlightsTitle": "Attività in evidenza",
    "fallbackHighlight": "Esperienza locale",
    "experiencesTitle": "Esperienze a {name} per una {labelLower}",
    "allExperiences": "Tutte le esperienze",
    "listingsTitle": "Locali consigliati a {name}",
    "allListings": "Tutti i locali",
    "relatedTitle": "Guide correlate",
    "thingsToDoTitle": "Cosa fare a {name}",
    "thingsToDoDesc": "Tutte le {count} attrazioni e attività a {name}.",
    "bestTimeTitle": "Periodo migliore per visitare {name}",
    "bestTimeDesc": "Guida alle stagioni — primavera, estate, autunno, inverno.",
    "faqTitle": "Domande frequenti",
    "ctaTitle": "Crea la tua {labelLower} perfetta a {name}",
    "ctaP": "La AI considera il tuo budget, gli interessi e il tempo a disposizione. {description}",
    "ctaPlanner": "Pianificatore di viaggi AI",
    "ctaItineraries": "Itinerari pronti",
    "elsewhereTitle": "{label} anche altrove",
    "elsewhereDesc": "Scopri la {labelLower} anche in altre destinazioni slovene:",
    "meta": {
        "title": "{title} — Guida {labelLower}",
        "ogDescription": "{description} Guida per {name}.",
        "keywordGuide": "guida",
        "keywordTravel": "viaggio",
        "keywordSlovenia": "Slovenia",
    },
    "faqs": {
        "romanticni-pobeg": {
            "q1": "Cosa rende {name} speciale per una fuga romantica?",
            "a1": "{name} offre una combinazione unica di natura, attrazioni culturali e gastronomia. Una fuga romantica a {name} è perfetta per anniversari, San Valentino o proposte di matrimonio — con attenzione a intimità, panorami e sapori locali.",
            "q2": "Quanto costa una fuga romantica a {name}?",
            "a2": "Il prezzo di una fuga romantica a {name} si aggira di solito intorno a {price}, inclusi un alloggio con vista, una cena per due e un'esperienza (es. degustazione o tour).",
            "q3": "Quando è il periodo migliore per una visita romantica a {name}?",
            "a3": "La primavera (aprile–giugno) e l'inizio dell'autunno (settembre–ottobre) offrono l'atmosfera più romantica a {name} — temperature piacevoli, meno turisti e meravigliosi colori della natura.",
            "q4": "Quali alloggi a {name} sono i più romantici?",
            "a4": "Per una fuga romantica consigliamo boutique hotel e alloggi con vista. Consulta i nostri elenchi di locali a {name} — tutti con fornitori selezionati a mano.",
        },
        "druzinski": {
            "q1": "{name} è adatta a una visita con bambini?",
            "a1": "Sì — {name} è un'ottima destinazione familiare con sentieri sicuri, ristoranti adatti ai bambini ed esperienze interattive. La maggior parte delle attrazioni è accessibile anche con i passeggini.",
            "q2": "Quanto costa una gita in famiglia a {name}?",
            "a2": "Una gita in famiglia a {name} (2 adulti + 2 bambini) costa di solito {price}, inclusi camera familiare, pasti e biglietti delle attrazioni. I bambini fino a 6 anni spesso entrano gratis.",
            "q3": "Quali attività a {name} sono adatte ai bambini?",
            "a3": "{name} offre diverse attività familiari — da escursioni facili, ciclismo e musei con mostre interattive a laboratori e degustazioni. Le nostre raccomandazioni AI considerano l'età dei bambini.",
            "q4": "Quando è il periodo migliore per una visita in famiglia a {name}?",
            "a4": "Le vacanze scolastiche (estate, ottobre, febbraio) sono ideali per una visita in famiglia a {name}. D'estate sono aperte tutte le attrazioni all'aperto, d'inverno ci sono sci e festival invernali.",
        },
        "budget": {
            "q1": "Quanto costa visitare {name} con un budget limitato?",
            "a1": "Con un budget limitato puoi visitare {name} per {price}, inclusi pernottamento in ostello o in camere private, cibo locale nei mercati e attività gratuite.",
            "q2": "Quali attività gratuite sono disponibili a {name}?",
            "a2": "{name} offre numerose attività gratuite — passeggiate nel centro storico, visite alle chiese, sentieri nei dintorni e spiagge pubbliche. I biglietti dei musei hanno spesso sconti per studenti.",
            "q3": "Come risparmiare sul trasporto verso {name}?",
            "a3": "Per un trasporto conveniente verso {name} consigliamo treno o autobus (ricerca tramite FlixBus o le ferrovie slovene). A {name} puoi usare i trasporti pubblici urbani o la bici (molte destinazioni hanno sistemi di noleggio).",
            "q4": "Si trovano alloggi economici a {name}?",
            "a4": "Sì — a {name} ci sono ostelli, camere private tramite Airbnb e pensioni a conduzione familiare. I prezzi sono più bassi fuori stagione (novembre–marzo, esclusi i festivi).",
        },
        "vikend": {
            "q1": "Cosa fare a {name} durante il weekend?",
            "a1": "Un weekend a {name} permette di esplorare le attrazioni principali, la gastronomia locale e almeno un'esperienza. Il venerdì sera è ideale per l'arrivo e una passeggiata, il sabato per le attrazioni principali, la domenica per il relax.",
            "q2": "Quanto costa un weekend a {name}?",
            "a2": "Un weekend a {name} (2 notti, 3 pasti al giorno, attrazioni) costa circa {price}. Puoi risparmiare con prenotazioni anticipate e mercati locali.",
            "q3": "Quando è il periodo migliore per una fuga nel weekend a {name}?",
            "a3": "{name} è ottima per una fuga nel weekend tutto l'anno. Primavera e autunno offrono il meteo migliore per esplorare, d'estate ci sono più eventi, d'inverno meno turisti e prezzi più bassi.",
            "q4": "Come arrivare a {name} per il weekend?",
            "a4": "{name} è raggiungibile in auto, treno o autobus. Consigliamo di prenotare il trasporto almeno una settimana prima, soprattutto per il venerdì pomeriggio.",
        },
        "ai": {
            "q": "La AI può creare un itinerario per {name}?",
            "a": "Sì — il nostro pianificatore AI può creare un itinerario completamente personalizzato per {name}, che considera i tuoi interessi, il budget e il tempo a disposizione. Provalo nella pagina Pianifica.",
        },
    },
    "guideTypes": {
        "romanticni-pobeg": {
            "label": "Fuga romantica",
            "shortLabel": "Romantica",
            "description": "Una fuga per due — attività romantiche, cene a lume di candela, esperienze private e alloggi con vista.",
            "title": "Fuga romantica a {name}",
            "intro": "{name} — {tagline}. Questa guida è pensata per le coppie che cercano momenti di intimità: passeggiate romantiche lungo il lago o il mare, cene a lume di candela, degustazioni private e alloggi con vista. Tutti i suggerimenti sono selezionati a mano per una fuga indimenticabile a due.",
            "durationLabel": "2 giorni / 1 notte",
            "priceRange": "180–350 € / coppia",
            "bestFor": "Coppie · Sposi novelli · Anniversari",
            "metaKeyword": "romanticismo",
            "h1": {
                "title": "Passeggiata romantica lungo {hl1}",
                "description": "Inizia la giornata con una passeggiata rilassante lungo {hl1Lower} a {name}. La luce del mattino e meno turisti creano l'atmosfera ideale per una coppia.",
            },
            "h2": {
                "title": "Esperienza privata: {hl2}",
                "description": "Nel pomeriggio concedetevi un'esperienza privata a {name} — una degustazione, un giro in barca o un laboratorio locale. Le nostre raccomandazioni sono verificate per coppie.",
            },
            "h3": {
                "title": "Cena a lume di candela a {name}",
                "description": "Concludete la giornata con una cena romantica in uno dei ristoranti selezionati a {name}. Gli chef locali propongono menù stagionali con vini dei vigneti sloveni.",
            },
        },
        "druzinski": {
            "label": "Gita in famiglia",
            "shortLabel": "In famiglia",
            "description": "Attività adatte a tutte le età — sentieri sicuri, attrazioni per bambini, menù dedicati ed esperienze interattive.",
            "title": "Gita in famiglia a {name}",
            "intro": "State pianificando una gita in famiglia a {name}? Questa guida combina sentieri sicuri, esperienze interattive per i bambini, ristoranti family-friendly con menù dedicati e alloggi con camere familiari. {name} è un'ottima scelta per ricordi di famiglia indimenticabili.",
            "durationLabel": "2–3 giorni",
            "priceRange": "120–260 € / famiglia",
            "bestFor": "Famiglie con bambini · Viaggi multigenerazionali",
            "metaKeyword": "famiglia",
            "h1": {
                "title": "Visita in famiglia: {hl1}",
                "description": "{hl1} a {name} è adatta ai bambini — mostre interattive, percorsi sicuri e spesso laboratori per i più piccoli.",
            },
            "h2": {
                "title": "Relax presso {hl2}",
                "description": "{hl2} offre spazio per picnic e relax. I bambini possono giocare, gli adulti godersi la natura di {name}.",
            },
            "h3": {
                "title": "Cena in famiglia a {name}",
                "description": "Scegli un ristorante con menù per bambini a {name}. Pizze locali, pasta e piatti tradizionali sloveni piacciono a tutte le età.",
            },
        },
        "budget": {
            "label": "Vacanza economica",
            "shortLabel": "Economica",
            "description": "Massima esperienza con budget minimo — attrazioni gratuite, picnic locale, alloggi economici e trasporti pubblici.",
            "title": "{name} con budget limitato",
            "intro": "Anche {name} si può visitare con un budget ridotto. Questa guida presenta attrazioni gratuite, mercati locali, alloggi economici e trasporto pubblico. I suggerimenti sono pensati per chi vuole massimizzare l'esperienza minimizzando la spesa.",
            "durationLabel": "1–2 giorni",
            "priceRange": "30–80 € / persona",
            "bestFor": "Studenti · Backpacker · Viaggiatori attenti al budget",
            "metaKeyword": "economico",
            "h1": {
                "title": "Visita gratuita: {hl1}",
                "description": "{hl1} a {name} è gratuita da ammirare dall'esterno. Una passeggiata nei suoi dintorni offre spunti fotografici meravigliosi e un'esperienza culturale.",
            },
            "h2": {
                "title": "Picnic presso {hl2}",
                "description": "Compra formaggi locali, pane e frutta al mercato di {name} e organizza un picnic. Il risparmio sul pasto lascia più spazio per le esperienze.",
            },
            "h3": {
                "title": "Escursione a {hl3}",
                "description": "{hl3} è gratuita da esplorare a piedi o in bicicletta. A {name} i sentieri segnalati sono adatti a tutti i livelli.",
            },
        },
        "vikend": {
            "label": "Fuga nel weekend",
            "shortLabel": "Weekend",
            "description": "La fuga perfetta di 2 giorni — dal venerdì sera alla domenica pomeriggio. Programma equilibrato tra attrazioni principali e gastronomia locale.",
            "title": "Weekend a {name}",
            "intro": "La fuga perfetta nel weekend a {name} — dal venerdì sera alla domenica pomeriggio. Programma equilibrato tra attrazioni principali, gastronomia locale e tempo per rilassarsi. {name} è abbastanza vicina per una fuga breve e abbastanza ricca per un weekend intero.",
            "durationLabel": "Weekend (venerdì–domenica)",
            "priceRange": "150–280 € / persona",
            "bestFor": "Lavoratori · Amici · Fuga veloce",
            "metaKeyword": "fuga nel weekend",
            "h1": {
                "title": "Venerdì: arrivo e passeggiata a {name}",
                "description": "Dopo l'arrivo a {name}, sistematevi e concedetevi una passeggiata rilassata nel centro storico. Gustate un caffè locale e pianificate i due giorni successivi.",
            },
            "h2": {
                "title": "Sabato: {hl1} e dintorni",
                "description": "Dedicate la giornata principale alle attrazioni — {hl1Lower}, il museo locale e un pranzo in un ristorante tradizionale a {name}.",
            },
            "h3": {
                "title": "Domenica: {hl2} e partenza",
                "description": "L'ultimo giorno è per {hl2Lower} e l'acquisto di ricordi locali. Prima di partire, un ultimo caffè a {name}.",
            },
        },
    },
}

# ---- vstavi v messages/it.json (samo teh 5 ns; ostalo nedotaknjeno) ----
payload = {
    "destinationPage": destinationPage,
    "thingsToDo": thingsToDo,
    "bestTime": bestTime,
    "itineraryPage": itineraryPage,
    "guidePage": guidePage,
}

data = json.loads(MSG.read_text())
for ns, val in payload.items():
    if ns not in data:
        print(f"NAPAKA: ns {ns} ne obstaja v {MSG} — pariteta bi se prelomila")
        sys.exit(1)
    data[ns] = val

# varovalka: struktura ključev mora ostati IDENTIČNA stari (samo vrednosti se
# zamenjajo) — preveri po ploščih ključih proti SL
sl = json.loads((ROOT / "src/i18n/messages/sl.json").read_text())

def flat(d, prefix=""):
    out = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flat(v, key))
        else:
            out[key] = v
    return out

for ns in payload:
    before = set(flat(sl[ns]))
    after = set(flat(data[ns]))
    if before != after:
        print(f"NAPAKA: ns {ns} — razlika ključev: manjka {before - after}, odveč {after - before}")
        sys.exit(1)

# varovalka: ICU placeholderji (presek SL∩EN) morajo ostati
en = json.loads((ROOT / "src/i18n/messages/en.json").read_text())
import re
ph = lambda s: set(re.findall(r"\{[a-zA-Z0-9_]+\}", s))
checked = 0
for ns in payload:
    fsl, fen, fit = flat(sl[ns]), flat(en[ns]), flat(data[ns])
    for key in fsl:
        required = ph(fsl[key]) & ph(fen.get(key, ""))
        if not required:
            continue
        got = ph(fit.get(key, ""))
        missing = required - got
        if missing:
            print(f"NAPAKA: {ns}.{key} — manjkajo placeholderji {missing}")
            sys.exit(1)
        checked += 1
print(f"placeholder varovalka OK ({checked} nizov preverjenih)")

MSG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
print(f"messages/it.json posodobljen: 5 ns zamenjanih z ročnimi prevodi")
