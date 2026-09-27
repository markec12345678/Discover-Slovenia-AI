#!/usr/bin/env python3
"""
W1 faza 2a (Issue #15): ROČNI prevodi DE — destinacijske plasti.
5 namespaceov: destinationPage, thingsToDo, bestTime, itineraryPage, guidePage.
Vsa mesta {…} (ICU placeholderji) so obvezno ohranjena (varovalka task71).
Nemške oznake vodnikov: sestavljeni moški samostalniki (brez pridevnkov —
nemška sklanjatev pridevnikov bi prelomila {labelLower} predloge).
"""
import json, sys, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MSG = ROOT / "src/i18n/messages/de.json"

destinationPage = {
    "breadcrumbHome": "Startseite",
    "breadcrumbDestinations": "Reiseziele",
    "heroStats": "{highlights} Highlights · {duration} · {budget}",
    "aboutTitle": "Über {name}",
    "highlightsTitle": "Top-Highlights",
    "facts": {
        "duration": "Empfohlene Aufenthaltsdauer",
        "budget": "Budget",
        "person": "Person",
        "bestFor": "Ideal für",
        "season": "Beste Reisezeit",
    },
    "durations": {
        "d1": "1 Tag",
        "weekend": "Wochenende (2 Tage)",
        "d3": "3 Tage",
        "d5": "5 Tage",
        "d7": "7 Tage",
    },
    "itineraries": {"title": "Fertige Reiserouten für {name}"},
    "guides": {"title": "Guides nach Reiseart — {name}"},
    "bestTime": {"title": "Beste Reisezeit für {name}"},
    "thingsToDo": {
        "title": "Was tun in {name}",
        "text": "Die ausführliche Seite mit Aktivitäten, lokalen Anbietern, Erlebnissen und häufigen Fragen — {highlights} Top-Highlights an einem Ort.",
        "button": "Guide für {name} öffnen",
    },
    "nearby": {"title": "In der Nähe — Region {region}"},
    "explore": {"title": "Auch entdecken", "all": "Alle Reiseziele"},
    "plan": {
        "title": "Plane deine Reise nach {name}",
        "text": "Wir erstellen dir eine komplette Reiseroute für {name} und Umgebung — abgestimmt auf deine Interessen, Termine, die Wettervorhersage und deine Reisegruppe.",
        "button": "Reiseplaner",
    },
    "seasons": {
        "pomlad": "Frühling",
        "poletje": "Sommer",
        "jesen": "Herbst",
        "zima": "Winter",
    },
    "source": {
        "title": "Quelle der Inhalte",
        "sourceLabel": "Quelle",
        "sourceShort": "Quelle",
        "updatedLabel": "Aktualisiert",
        "openingLabel": "Öffnungszeiten",
        "externalSr": "öffnet auf einer externen Seite",
        "langNote": "Die Quelle ist slowenisch; diese Version ist eine Übersetzung.",
    },
    "meta": {
        "notFound": "Reiseziel nicht gefunden",
        "title": "{name} — {tagline} | Slowenien Reiseführer",
        "description": "{name}: {tagline}. Empfohlene Aufenthaltsdauer: {duration}. Highlights: {highlights}. Fertige Reiserouten, Guides nach Reiseart und die beste Reisezeit.",
        "ogTitle": "{name} — Reiseführer für das Reiseziel",
        "ogDescription": "{name}: {tagline}. Was tun, Reiserouten nach Länge und die beste Reisezeit.",
    },
    "trackerTitle": "{name} — Reiseziel",
}

thingsToDo = {
    "breadcrumbHome": "Startseite",
    "heroTitle": "Was tun in {name}",
    "heroStats": "{highlights} Highlights · {activities} Aktivitäten · Redaktionelle Bewertung {rating}★",
    "aboutTitle": "Über {name}",
    "highlightsTitle": "Top-Highlights",
    "experiencesTitle": "Aktivitäten und Erlebnisse in {name}",
    "listingsTitle": "Lokale Anbieter in {name}",
    "productsTitle": "Lokale Produkte aus {name}",
    "bestTimeTitle": "Beste Reisezeit für {name}",
    "seasons": {
        "pomlad": "Frühling",
        "poletje": "Sommer",
        "jesen": "Herbst",
        "zima": "Winter",
    },
    "faqTitle": "Häufige Fragen",
    "planTitle": "Plane deine Reise nach {name}",
    "planText": "Unsere KI erstellt dir eine perfekte Reiseroute für {name} und Umgebung — angepasst an dein Budget, deine Interessen und die Saison.",
    "planButton": "KI-Reiseplaner",
    "exploreTitle": "Auch entdecken",
    "trackerTitle": "Was tun in {name} — Guide",
    "meta": {
        "notFound": "Reiseziel nicht gefunden",
        "title": "Was tun in {name} — {name}-Guide",
        "description": "Entdecke die besten Aktivitäten, Sehenswürdigkeiten und Erlebnisse in {name}, {tagline}. Guide mit {count} Top-Highlights, lokalen Anbietern und KI-Empfehlungen.",
        "ogTitle": "Was tun in {name} — Discover Slovenia AI",
        "ogDescription": "{count} Highlights, lokale Restaurants, Aktivitäten und Erlebnisse in {name}.",
    },
}

bestTime = {
    "breadcrumbHome": "Startseite",
    "breadcrumbCurrent": "Beste Reisezeit — {season}",
    "seasons": {
        "pomlad": {
            "label": "Frühling",
            "months": " März–Mai",
            "desc": "Blütezeit, mildes Wetter, weniger Touristen",
        },
        "poletje": {
            "label": "Sommer",
            "months": " Juni–August",
            "desc": "Warm, ideal für Wasser und Wanderungen",
        },
        "jesen": {
            "label": "Herbst",
            "months": " September–November",
            "desc": "Herbstfarben, Wein, weniger Trubel",
        },
        "zima": {
            "label": "Winter",
            "months": " Dezember–Februar",
            "desc": "Skifahren, Weihnachtsmärkte, Wellness",
        },
    },
    "bestSeasonBadge": "✓ Beste Saison",
    "heroTitle": "Beste Reisezeit für {name}",
    "overviewTitle": "{name} im {seasonLower}",
    "bestCardTitle": "{season} ist die ideale Saison für {name}!",
    "bestCardText": "{name} steht in dieser Saison in vollem Glanz — {taglineLower}.",
    "offCardTitle": "{season} ist nicht die Hauptsaison für {name}",
    "offCardText": "Das kann aber ein Vorteil sein — weniger Touristen, niedrigere Preise und ein anderes Erlebnis.",
    "allSeasonsTitle": "Alle Jahreszeiten für {name}",
    "bestBadge": "★ Beste",
    "faqTitle": "Häufige Fragen",
    "faq": {
        "q1": "Wann ist die beste Reisezeit für {name}?",
        "a1": "{season} ist eine großartige Zeit für {name}. Die Temperaturen liegen bei {temp} — ideal zum Erkunden. Frühling und Herbst bieten weniger Touristen und niedrigere Preise.",
        "q2": "Wie ist das Wetter in {name} im {seasonLower}?",
        "a2": "Im {seasonLower} liegen die Temperaturen in {name} üblicherweise bei {temp}. Wir empfehlen Zwiebellook.",
        "q3": "Welche Aktivitäten gibt es in {name} im {seasonLower}?",
        "a3": "{season} in {name} bietet vielfältige Aktivitäten — von Wanderungen bis Kulinarik. Schau in unsere Liste der Dinge, die man in {name} tun kann.",
        "q4": "Brauche ich eine Reservierung für {name}?",
        "a4": "Wir empfehlen, die Unterkunft mindestens 2 Wochen im Voraus zu buchen, besonders in der Hochsaison. Nutze unseren KI-Reiseplaner, um die Route zu optimieren.",
    },
    "ctaTitle": "Plane deine {seasonLower}-Reise nach {name}",
    "ctaText": "Die KI berücksichtigt Saison, Wetter und deine Interessen für den perfekten Plan.",
    "ctaButton": "KI-Reiseroute",
    "ctaThingsToDo": "Was tun in {name}",
    "exploreTitle": "Auch entdecken",
    "meta": {
        "notFound": "Seite nicht gefunden",
        "title": "Beste Reisezeit für {name} — {season}",
        "description": "Wann nach {name} reisen? {season} ({months}): {desc}. Temperaturen {temp}. Tipps, Aktivitäten und {seasonLower}-Reiseroute für {name}.",
        "ogDescription": "{desc}. Temperaturen {temp}. Guide für {name} im {seasonLower}.",
    },
}

itineraryPage = {
    "durations": {
        "1-dan": {"label": "1 Tag", "desc": "Kurzer Besuch"},
        "vikend": {"label": "Wochenende (2 Tage)", "desc": "Das perfekte Wochenende"},
        "3-dnevi": {"label": "3 Tage", "desc": "Vertiefter Besuch"},
        "5-dnevi": {"label": "5 Tage", "desc": "Vollständiges Erlebnis"},
        "7-dnevi": {"label": "7 Tage", "desc": "Eine Woche voller Entdeckungen"},
    },
    "travelerTypes": {
        "pari": {"label": "Für Paare", "desc": "Romantischer Kurztrip"},
        "druzina": {"label": "Familien", "desc": "Spaß für alle Altersgruppen"},
        "solo": {"label": "Solo-Reisende", "desc": "Auf eigene Faust entdecken"},
        "avanturist": {"label": "Abenteurer", "desc": "Adrenalin und Natur"},
    },
    "headline": "{duration}-Reiseroute für {name}",
    "overviewTitle": "Reiseübersicht",
    "unitDay": "Tag",
    "unitDays": "Tage",
    "costLabel": "Schätzung / Person",
    "ratingLabel": "redaktionelle Bewertung des Reiseziels",
    "daysTitle": "Empfohlener Tagesablauf",
    "dayLabel": "Tag {day}",
    "dayFirst": "Ankunft und Erkundung von {name}",
    "dayLast": "Letzter Tag und Abreise",
    "dayMiddle": "Ganztägiges Entdecken",
    "hoursLabel": "4–6 Stunden",
    "perPerson": "€/Person",
    "travelerTypesTitle": "Reiserouten nach Reisertyp",
    "generateButton": "Reiseroute erstellen",
    "otherDestinationsTitle": "Weitere Reiseziele",
    "personalizedTitle": "Möchtest du eine personalisierte Reiseroute?",
    "personalizedText": "Unsere KI berücksichtigt dein Budget, deine Interessen und die Saison für den perfekten Plan.",
    "personalizedButton": "KI-Reiseroute erstellen",
    "meta": {
        "notFound": "Reiseroute nicht gefunden",
        "title": "{duration}-Reiseroute für {name} — {desc}",
        "description": "Die vollständige {durationLower}-Reiseroute für {name}, {tagline}. {desc} — KI-empfohlene Aktivitäten, Unterkünfte und Restaurants für einen {days}-Tage-Besuch.",
        "ogDescription": "KI-empfohlene {duration}-Reiseroute mit Aktivitäten, Unterkünften und Restaurants.",
    },
}

guidePage = {
    "metaNotFound": "Guide nicht gefunden",
    "breadcrumbHome": "Startseite",
    "breadcrumbAria": "Breadcrumb",
    "editorialRating": "Redaktionelle Bewertung {rating}★",
    "introHeading": "{label} in {name}",
    "metaLine": "Dauer: {duration} · Preisrahmen: {price}",
    "highlightsTitle": "Aktivitäten im Fokus",
    "fallbackHighlight": "Lokales Erlebnis",
    "experiencesTitle": "Erlebnisse in {name} für den {labelLower}",
    "allExperiences": "Alle Erlebnisse",
    "listingsTitle": "Empfohlene lokale Anbieter in {name}",
    "allListings": "Alle lokalen Anbieter",
    "relatedTitle": "Verwandte Guides",
    "thingsToDoTitle": "Was tun in {name}",
    "thingsToDoDesc": "Alle {count} Sehenswürdigkeiten und Aktivitäten in {name}.",
    "bestTimeTitle": "Beste Reisezeit für {name}",
    "bestTimeDesc": "Guide durch die Jahreszeiten — Frühling, Sommer, Herbst, Winter.",
    "faqTitle": "Häufige Fragen",
    "ctaTitle": "Stelle deinen perfekten {labelLower} in {name} zusammen",
    "ctaP": "Die KI berücksichtigt dein Budget, deine Interessen und deine Zeit. {description}",
    "ctaPlanner": "KI-Reiseplaner",
    "ctaItineraries": "Fertige Reiserouten",
    "elsewhereTitle": "{label} auch anderswo",
    "elsewhereDesc": "Entdecke den {labelLower} in anderen slowenischen Reisezielen:",
    "meta": {
        "title": "{title} — {labelLower}-Guide",
        "ogDescription": "{description} Ein Guide für {name}.",
        "keywordGuide": "Guide",
        "keywordTravel": "Reise",
        "keywordSlovenia": "Slowenien",
    },
    "faqs": {
        "romanticni-pobeg": {
            "q1": "Was macht {name} besonders für einen Romantik-Trip?",
            "a1": "{name} bietet eine einzigartige Kombination aus Natur, kulturellen Sehenswürdigkeiten und Kulinarik. Ein Romantik-Trip nach {name} ist perfekt für Jahrestage, Valentinstag oder Anträge — im Fokus stehen Privatsphäre, Ausblicke und lokale Aromen.",
            "q2": "Was kostet ein Romantik-Trip nach {name}?",
            "a2": "Der Preis für einen Romantik-Trip nach {name} liegt üblicherweise bei {price}, inklusive Unterkunft mit Ausblick, Dinner für zwei und einem Erlebnis (z. B. Verkostung oder Fahrt).",
            "q3": "Wann ist die beste Zeit für einen romantischen Besuch in {name}?",
            "a3": "Frühling (April–Juni) und früher Herbst (September–Oktober) bieten die romantischste Atmosphäre in {name} — angenehme Temperaturen, weniger Touristen und wunderbare Naturfarben.",
            "q4": "Welche Unterkünfte in {name} sind am romantischsten?",
            "a4": "Für einen Romantik-Trip empfehlen wir Boutique-Hotels und Unterkünfte mit Ausblick. Schau in unsere Listen lokaler Anbieter in {name} — alle mit handverlesenen Anbietern.",
        },
        "druzinski": {
            "q1": "Ist {name} für einen Besuch mit Kindern geeignet?",
            "a1": "Ja — {name} ist ein hervorragendes Familienziel mit sicheren Wanderwegen, kinderfreundlichen Restaurants und interaktiven Erlebnissen. Die meisten Attraktionen sind auch mit Kinderwagen zugänglich.",
            "q2": "Was kostet ein Familienausflug nach {name}?",
            "a2": "Ein Familienausflug nach {name} (2 Erwachsene + 2 Kinder) kostet üblicherweise {price}, inklusive Familienzimmer, Mahlzeiten und Eintrittskarten. Kinder bis 6 Jahre haben oft freien Eintritt.",
            "q3": "Welche Aktivitäten in {name} sind für Kinder geeignet?",
            "a3": "{name} bietet vielfältige Familienaktivitäten — von leichten Wanderungen und Radfahren über Museen mit interaktiven Ausstellungen bis zu Workshops und Verkostungen. Unsere KI-Empfehlungen berücksichtigen das Alter der Kinder.",
            "q4": "Wann ist die beste Zeit für einen Familienbesuch in {name}?",
            "a4": "Die Schulferien (Sommer, Oktober, Februar) sind ideal für einen Familienbesuch in {name}. Im Sommer sind alle Außenattraktionen geöffnet, im Winter gibt es Skifahren und Winterfestivals.",
        },
        "budget": {
            "q1": "Was kostet ein Besuch in {name} mit begrenztem Budget?",
            "a1": "Mit begrenztem Budget kannst du {name} für {price} besuchen, inklusive Unterkunft im Hostel oder Privatzimmer, lokalem Essen von den Märkten und kostenlosen Aktivitäten.",
            "q2": "Welche kostenlosen Aktivitäten gibt es in {name}?",
            "a2": "{name} bietet zahlreiche kostenlose Aktivitäten — Spaziergänge durch die Altstadt, Kirchenbesuche, Wanderwege in der Umgebung und öffentliche Strände. Museumstickets haben oft Studentenrabatte.",
            "q3": "Wie spare ich bei der Anreise nach {name}?",
            "a3": "Für eine günstige Anreise nach {name} empfehlen wir Zug oder Bus (Suche über FlixBus oder die slowenische Bahn). In {name} kannst du öffentliche Verkehrsmittel oder das Fahrrad nutzen (viele Reiseziele haben Verleihsysteme).",
            "q4": "Finde ich günstige Unterkünfte in {name}?",
            "a4": "Ja — in {name} gibt es Hostels, Privatzimmer über Airbnb und familiengeführte Pensionen. Die Preise sind außerhalb der Saison niedriger (November–März, außer an Feiertagen).",
        },
        "vikend": {
            "q1": "Was tun in {name} am Wochenende?",
            "a1": "Ein Wochenende in {name} ermöglicht die Erkundung der wichtigsten Sehenswürdigkeiten, der lokalen Kulinarik und mindestens eines Erlebnisses. Freitags abends eignet sich ideal für Ankunft und Spaziergang, Samstag für die Hauptattraktionen, Sonntag zur Entspannung.",
            "q2": "Was kostet ein Wochenende in {name}?",
            "a2": "Ein Wochenende in {name} (2 Nächte, 3 Mahlzeiten pro Tag, Attraktionen) kostet etwa {price}. Sparen kannst du mit Frühbuchungen und lokalen Märkten.",
            "q3": "Wann ist die beste Zeit für einen Wochenend-Trip nach {name}?",
            "a3": "{name} eignet sich das ganze Jahr über für einen Wochenend-Trip. Frühling und Herbst bieten das beste Wetter zum Erkunden, im Sommer gibt es mehr Veranstaltungen, im Winter weniger Touristen und niedrigere Preise.",
            "q4": "Wie komme ich für ein Wochenende nach {name}?",
            "a4": "{name} ist mit dem Auto, Zug oder Bus erreichbar. Wir empfehlen, die Anreise mindestens eine Woche im Voraus zu buchen, besonders für Freitagnachmittag.",
        },
        "ai": {
            "q": "Kann die KI eine Reiseroute für {name} erstellen?",
            "a": "Ja — unser KI-Reiseplaner erstellt eine vollständig maßgeschneiderte Reiseroute für {name}, die deine Interessen, dein Budget und deine Zeit berücksichtigt. Probiere es auf der Seite „Reise planen“.",
        },
    },
    "guideTypes": {
        "romanticni-pobeg": {
            "label": "Romantik-Trip",
            "shortLabel": "Romantik",
            "description": "Auszeit zu zweit — romantische Aktivitäten, Dinner bei Kerzenschein, private Erlebnisse und Unterkünfte mit Ausblick.",
            "title": "Romantik-Trip nach {name}",
            "intro": "{name} — {tagline}. Dieser Guide ist für Paare gedacht, die private Momente suchen: romantische Spaziergänge am See oder Meer, Dinner bei Kerzenschein, private Verkostungen und Unterkünfte mit Ausblick. Alle Empfehlungen sind handverlesen für einen unvergesslichen Trip zu zweit.",
            "durationLabel": "2 Tage / 1 Nacht",
            "priceRange": "180–350 € / Paar",
            "bestFor": "Paare · Frischvermählte · Jahrestage",
            "metaKeyword": "Romantik",
            "h1": {
                "title": "Romantischer Spaziergang entlang {hl1}",
                "description": "Beginne den Tag mit einem entspannten Spaziergang entlang {hl1Lower} in {name}. Das Morgenlicht und weniger Touristen schaffen die perfekte Atmosphäre für zwei.",
            },
            "h2": {
                "title": "Privates Erlebnis: {hl2}",
                "description": "Nimm dir nachmittags Zeit für ein privates Erlebnis in {name} — eine Verkostung, eine Bootsfahrt oder ein lokaler Workshop. Unsere Empfehlungen sind für Paare geprüft.",
            },
            "h3": {
                "title": "Dinner bei Kerzenschein in {name}",
                "description": "Beende den Tag mit einem romantischen Dinner in einem der ausgewählten Restaurants in {name}. Lokale Küchenchefs bieten saisonale Menüs mit Weinen slowenischer Weingüter.",
            },
        },
        "druzinski": {
            "label": "Familienausflug",
            "shortLabel": "Familie",
            "description": "Familienfreundliche Aktivitäten für alle Altersgruppen — sichere Wanderwege, Attraktionen, Kindergerichte und interaktive Erlebnisse.",
            "title": "Familienausflug nach {name}",
            "intro": "Du planst einen Familienausflug nach {name}? Dieser Guide verbindet sichere Wanderwege, interaktive Erlebnisse für Kinder, familienfreundliche Restaurants mit Kindergerichten und Unterkünfte mit Familienzimmern. {name} ist eine hervorragende Wahl für unvergessliche Familienerinnerungen.",
            "durationLabel": "2–3 Tage",
            "priceRange": "120–260 € / Familie",
            "bestFor": "Familien mit Kindern · Mehrgenerationen-Reisen",
            "metaKeyword": "Familie",
            "h1": {
                "title": "Familienbesuch: {hl1}",
                "description": "{hl1} in {name} ist kinderfreundlich — interaktive Ausstellungen, sichere Wege und oft Workshops für die Kleinsten.",
            },
            "h2": {
                "title": "Entspannung an {hl2}",
                "description": "{hl2} bietet Raum für Picknick und Entspannung. Kinder können spielen, Erwachsene die Natur von {name} genießen.",
            },
            "h3": {
                "title": "Familien-Dinner in {name}",
                "description": "Wähle ein Restaurant mit Kinderkarte in {name}. Lokale Pizzen, Pasta und traditionelle slowenische Gerichte kommen bei allen Altersgruppen an.",
            },
        },
        "budget": {
            "label": "Spar-Trip",
            "shortLabel": "Spar",
            "description": "Maximales Erlebnis mit minimalem Budget — kostenlose Attraktionen, lokales Picknick, günstige Unterkünfte und öffentliche Verkehrsmittel.",
            "title": "{name} mit kleinem Budget",
            "intro": "Auch {name} lässt sich mit kleinem Budget besuchen. Dieser Guide stellt kostenlose Attraktionen, lokale Märkte, günstige Unterkünfte und öffentliche Verkehrsmittel vor. Die Empfehlungen sind für Reisende gedacht, die das Maximum erleben und das Minimum ausgeben wollen.",
            "durationLabel": "1–2 Tage",
            "priceRange": "30–80 € / Person",
            "bestFor": "Studierende · Backpacker · Budget-Reisende",
            "metaKeyword": "günstig",
            "h1": {
                "title": "Kostenloser Besuch: {hl1}",
                "description": "{hl1} in {name} ist von außen kostenlos zu bewundern. Ein Spaziergang daran vorbei bietet wunderbare Fotomotive und ein Kulturerlebnis.",
            },
            "h2": {
                "title": "Picknick an {hl2}",
                "description": "Kaufe lokale Käse, Brot und Obst auf dem Markt in {name} und organisiere ein Picknick. Die Ersparnis bei den Mahlzeiten lässt mehr Raum für Erlebnisse.",
            },
            "h3": {
                "title": "Wanderung zu {hl3}",
                "description": "{hl3} ist kostenlos zu Fuß oder mit dem Fahrrad zu erkunden. In {name} sind die markierten Wanderwege für alle Niveaus geeignet.",
            },
        },
        "vikend": {
            "label": "Wochenend-Trip",
            "shortLabel": "Wochenende",
            "description": "Die perfekte Auszeit über 2 Tage — von Freitagabend bis Sonntagnachmittag. Ausgewogenes Programm mit Hauptsehenswürdigkeiten und lokaler Kulinarik.",
            "title": "Wochenende in {name}",
            "intro": "Der perfekte Wochenend-Trip nach {name} — von Freitagabend bis Sonntagnachmittag. Ausgewogenes Programm mit Hauptsehenswürdigkeiten, lokaler Kulinarik und Zeit zum Entspannen. {name} ist nah genug für eine kurze Auszeit und reichhaltig genug für ein ganzes Wochenende.",
            "durationLabel": "Wochenende (Freitag–Sonntag)",
            "priceRange": "150–280 € / Person",
            "bestFor": "Berufstätige · Freunde · Kurztrip",
            "metaKeyword": "Wochenend-Trip",
            "h1": {
                "title": "Freitag: Ankunft und Spaziergang durch {name}",
                "description": "Nach der Ankunft in {name} beziehe deine Unterkunft und nimm dir Zeit für einen entspannten Spaziergang durch die Altstadt. Genieße einen lokalen Kaffee und plane die nächsten zwei Tage.",
            },
            "h2": {
                "title": "Samstag: {hl1} und Umgebung",
                "description": "Widme den Haupttag den wichtigsten Sehenswürdigkeiten — {hl1Lower}, das lokale Museum und ein Mittagessen in einem traditionellen Restaurant in {name}.",
            },
            "h3": {
                "title": "Sonntag: {hl2} und Abreise",
                "description": "Nutze den letzten Tag für {hl2Lower} und den Kauf lokaler Andenken. Vor der Abreise noch ein letzter lokaler Kaffee in {name}.",
            },
        },
    },
}

# ---- vstavi v messages/de.json (samo teh 5 ns; ostalo nedotaknjeno) ----
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

# varovalki: struktura ključev + ICU placeholderji (enako kot IT skripta)
sl = json.loads((ROOT / "src/i18n/messages/sl.json").read_text())
en = json.loads((ROOT / "src/i18n/messages/en.json").read_text())

def flat(d, prefix=""):
    out = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flat(v, key))
        else:
            out[key] = v
    return out

ph = lambda s: set(re.findall(r"\{[a-zA-Z0-9_]+\}", s))
checked = 0
for ns in payload:
    before = set(flat(sl[ns]))
    after = set(flat(data[ns]))
    if before != after:
        print(f"NAPAKA: ns {ns} — razlika ključev: manjka {before - after}, odveč {after - before}")
        sys.exit(1)
    fsl, fen, fde = flat(sl[ns]), flat(en[ns]), flat(data[ns])
    for key in fsl:
        required = ph(fsl[key]) & ph(fen.get(key, ""))
        if not required:
            continue
        got = ph(fde.get(key, ""))
        missing = required - got
        if missing:
            print(f"NAPAKA: {ns}.{key} — manjkajo placeholderji {missing}")
            sys.exit(1)
        checked += 1
print(f"placeholder varovalka OK ({checked} nizov preverjenih)")

MSG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
print(f"messages/de.json posodobljen: 5 ns zamenjanih z ročnimi prevodi")
