#!/usr/bin/env python3
"""W10 (Issue #15, 1.133.0): posodobitev /primerjava v 4 jezikih.

Avtorizacija: fragments/comparison.{sl,en}.json (izvirnik SL, referenca EN);
IT/DE živita v messages/{it,de}.json (kanon W1 — fragmenti za IT/DE so
opcijski). Skript naredi istovetne spremembe v vseh 4 jezikih:

  1. META: naslov/opis ciljata poizvedbe »Mindtrip alternativa« (W10 merilo 2)
  2. TERENSKA SEKCIJA (nova): 3 datirane preverbe iz raziskave Task 20
     (Mindtrip črn — živo preverjeno še danes 28. 9. 2026; Layla bot-zid +
     Expedia prevzem; Google komoditizacija) — G4 kanon: brez izmišljenih
     števcev, z datumi, brez ugibanj o vzrokih (W10 merilo 1 + 4)
  3. FAQ: a5 popravljen (NEVELJAVNA trditev o iOS odstranjena — nismo je
     preverili), nov q6/a6 »Kaj se je zgodilo z Mindtripom?«
  4. CTA: zlate poti /nacrtuj + /zemljevid + /#skupnost (W10 merilo 3) +
     ctaBody posodobljen na 4 jezike (stran je nastala pred W1)
  5. updated: 17. 9. → 28. 9. 2026 + tabela jezikovne vrstice (4 jeziki)

Brez --write potopi samo diff poročilo (dry run).
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRAGMENTS = ROOT / "src" / "i18n" / "fragments"
MESSAGES = ROOT / "src" / "i18n" / "messages"

DRY = "--write" not in sys.argv

# ---------------------------------------------------------------------------
# Lokalno-specifični nizi (W10). Vsi datumi = 28. september 2026 (živa
# preverba: mindtrip.ai -> 302 -> images.mindtrip.ai/heroku/construction.html,
# naslov strani "Under Construction | mindtrip.").
# ---------------------------------------------------------------------------

SL = {
    "meta": {
        "title": "Mindtrip alternativa za Slovenijo — iskrena primerjava",
        "description": "Iščete Mindtrip alternativo? Teren preverjen 28. 9. 2026: iskrena primerjava generalistov s specializom za Slovenijo — brez prijave, v 4 jezikih.",
    },
    "updated": "Posodobljeno: 28. september 2026. Primerjave staréjo — preverite datum pred odločitvijo.",
    "generalistsIntro": "Mindtrip, Layla, Wanderlog, ChatGPT in sorodniki so dobri izdelki (za trenutno dosegljivost glej terensko sekcijo zgoraj). Za naslednje primere je generalist pravilna izbira:",
    "fieldBadge": "Teren · preverjeno 28. 9. 2026",
    "fieldTitle": "Teren se je premaknil — kaj smo živo preverili 28. septembra 2026",
    "fieldIntro": "Iskrena primerjava zahteva datirane preverbe, ne večne trditve. To so točkovne ugotovitve naših preverb (javni dostop do strani, uradni viri) — ko se teren spremeni, posodobimo to sekcijo.",
    "field": {
        "mindtripTitle": "Mindtrip: celoten spletni orodnik nedosegljiv",
        "mindtripDesc": "Ob preverbi 28. 9. 2026 so mindtrip.ai, prijava in API prikazovali stran »Under Construction« (preusmeritev vodi na njihov CDN za slike). O izpadu nismo zasledili medijske pokritosti, recenzije iz 22.–23. 9. pa Mindtrip še navajajo med najboljšimi orodji — recenzijski cikel zaostaja za realnostjo. O vzroku ne ugibamo; trenutno stanje preverite pri njih.",
        "laylaTitle": "Layla: za marsikaterega obiskovalca za zidom",
        "laylaDesc": "layla.ai je ob naših preverbah vračal napako 429 in varnostno preverjanje brskalnika; nekdanja tržna domena itslayla.com je danes nepovezana modna trgovina. Laylo je 31. 7. 2026 prevzela skupina Expedia — klepet-prvi lijaki v tej kategoriji zdaj stojijo na OTA denarju, kar še ne pomeni boljše izkušnje za vsakega obiskovalca.",
        "googleTitle": "Google: generični AI itinerarji so zdaj brezplačni",
        "googleDesc": "Po uradni časovnici blogov Google (november 2025 → avgust 2026) znata AI Mode in Gemini sestaviti itinerer brezplačno. »AI ti napiše načrt« torej ni več razlika med orodji — globina podatkov, preverljivost virov in uporaba brez povezave so.",
    },
    "fieldNote": "To so točkovne preverbe z datumom — ne stalne trditve. Če se Mindtrip vrne (in upamo, da se), to sekcijo posodobimo; primerjava ostaja poštena v obeh smerih.",
    "tableLanguageOurs": "4 jeziki kot jedro izdelka (SL/EN/IT/DE)",
    "ctaBody": "Od vprašanja do načrta: 30 sekund. Zahtevan račun: nič. Jezik: slovenščina, angleščina, italijanščina ali nemščina.",
    "ctaMap": "Odpri zemljevid",
    "ctaCommunity": "Poglej skupnostne načrte",
    "a5": "Mindtrip je bil dober generalist; ob preverbi 28. 9. 2026 je bilo celo njihovo spletno okolje (stran, prijava, API) nedosegljivo, o vzroku pa ne moremo soditi. Za slovenska potovanja pri nas dobite: načrtovanje brez prijave, štiri jezike, preverjene lokalne podatke in rezervacije pri lokalnih ponudnikih. Presodite sami — poskus brez prijave traja 30 sekund.",
    "q6": "Kaj se je zgodilo z Mindtripom?",
    "a6": "Iskreno: vemo le, kar smo preverili. 28. septembra 2026 je celoten njihov spletni orodnik (mindtrip.ai, prijava, API) prikazoval stran »Under Construction«; o izpadu nismo našli medijske pokritosti, recenzije iz 22.–23. septembra pa jih medtem še uvrščajo med najboljša brezplačna AI orodja za načrtovanje. Ne ugibamo o vzrokih ali prihodnosti — trenutno stanje preverite neposredno pri njih.",
}

EN = {
    "meta": {
        "title": "Mindtrip Alternative for Slovenia? An Honest Comparison",
        "description": "Looking for a Mindtrip alternative? Field-checked 28 Sep 2026: an honest comparison of general AI planners vs. a Slovenia specialist — no signup, 4 languages.",
    },
    "updated": "Updated: 28 September 2026. Comparisons age — check the date before deciding.",
    "generalistsIntro": "Mindtrip, Layla, Wanderlog, ChatGPT and kin are good products (for current availability see the field report above). A generalist is the right choice for:",
    "fieldBadge": "Field · verified 28 Sep 2026",
    "fieldTitle": "The field moved — what we verified live on 28 September 2026",
    "fieldIntro": "An honest comparison needs dated checks, not eternal claims. These are point-in-time findings from our own verifications (public page access, official sources) — when the field changes, we update this section.",
    "field": {
        "mindtripTitle": "Mindtrip: the whole web estate is unreachable",
        "mindtripDesc": "As of our check on 28 Sep 2026, mindtrip.ai, its login and its API all served an \"Under Construction\" page (the redirect leads to their image CDN). We found no press coverage of the outage, while reviews from 22–23 Sep still rank Mindtrip among the best tools — the review cycle lags reality. We won't guess at the cause; check their site for the current state.",
        "laylaTitle": "Layla: behind a wall for many visitors",
        "laylaDesc": "At our checks layla.ai returned HTTP 429 and a browser security checkpoint; the former marketing domain itslayla.com is now an unrelated fashion shop. Expedia Group acquired Layla on 31 Jul 2026 — the chat-first funnels in this category now run on OTA money, which doesn't automatically mean a better experience for every visitor.",
        "googleTitle": "Google: generic AI itineraries are now free",
        "googleDesc": "By Google's official blog timeline (Nov 2025 → Aug 2026), AI Mode and Gemini can assemble an itinerary for free. \"An AI writes your plan\" is no longer a differentiator between tools — data depth, verifiable sources and offline use are.",
    },
    "fieldNote": "These are dated, point-in-time checks — not standing claims. If Mindtrip comes back (and we hope it does), we'll update this section; the comparison stays honest both ways.",
    "tableLanguageOurs": "Four languages as product core (SL/EN/IT/DE)",
    "ctaBody": "From question to plan: 30 seconds. Account required: none. Language: Slovenian, English, Italian or German.",
    "ctaMap": "Open the map",
    "ctaCommunity": "See community plans",
    "a5": "Mindtrip was a good generalist; at our check on 28 Sep 2026 their entire web estate (site, login, API) was unreachable, and we can't judge the cause. For Slovenia trips you get here: planning without an account, four languages, verified local data and bookings with local providers. Judge for yourself — a no-signup trial takes 30 seconds.",
    "q6": "What happened to Mindtrip?",
    "a6": "Honestly: we only know what we verified. On 28 September 2026 their entire web estate (mindtrip.ai, login, API) served an \"Under Construction\" page; we found no press coverage of the outage, while reviews from 22–23 Sep still rank it among the best free AI trip planners. We don't speculate about causes or the future — check their site directly for the current state.",
}

IT = {
    "meta": {
        "title": "Alternativa a Mindtrip per la Slovenia? Confronto onesto",
        "description": "Cerchi un'alternativa a Mindtrip? Verifica sul campo (28 set 2026): confronto onesto tra generalisti e uno specialista della Slovenia. Senza registrazione, 4 lingue.",
    },
    "updated": "Aggiornato: 28 settembre 2026. I confronti invecchiano — controlla la data prima di decidere.",
    "generalistsIntro": "Mindtrip, Layla, Wanderlog, ChatGPT e affini sono buoni prodotti (per la disponibilità attuale vedi il rapporto sul campo qui sopra). Un generalista è la scelta giusta per:",
    "fieldBadge": "Teren · verificato il 28 set 2026",
    "fieldTitle": "Il terreno si è mosso — cosa abbiamo verificato in diretta il 28 settembre 2026",
    "fieldIntro": "Un confronto onesto richiede verifiche datate, non affermazioni eterne. Questi sono rilievi puntuali delle nostre verifiche (accesso pubblico alle pagine, fonti ufficiali) — quando il terreno cambia, aggiorniamo questa sezione.",
    "field": {
        "mindtripTitle": "Mindtrip: tutto il loro web è irraggiungibile",
        "mindtripDesc": "Alla verifica del 28 set 2026 mindtrip.ai, il login e l'API mostravano tutti una pagina \"Under Construction\" (il reindirizzamento porta al loro CDN delle immagini). Non abbiamo trovato copertura stampa dell'interruzione, mentre le recensioni del 22–23 set li indicano ancora tra i migliori strumenti — il ciclo delle recensioni è in ritardo rispetto alla realtà. Non speculiamo sulla causa; verifica lo stato attuale direttamente da loro.",
        "laylaTitle": "Layla: dietro un muro per molti visitatori",
        "laylaDesc": "Alle nostre verifiche layla.ai restituiva l'errore 429 e un controllo di sicurezza del browser; l'ex dominio marketing itslayla.com è oggi un negozio di moda non correlato. Il gruppo Expedia ha acquisito Layla il 31 lug 2026 — i funnel chat-first della categoria girano ormai su denaro OTA, che non significa automaticamente un'esperienza migliore per ogni visitatore.",
        "googleTitle": "Google: gli itinerari AI generici ora sono gratuiti",
        "googleDesc": "Secondo la timeline ufficiale dei blog Google (nov 2025 → ago 2026), AI Mode e Gemini sanno comporre un itinerario gratis. \"Un'AI ti scrive il piano\" non è più un differenziale tra strumenti — lo sono la profondità dei dati, le fonti verificabili e l'uso offline.",
    },
    "fieldNote": "Sono verifiche puntuali datate — non affermazioni permanenti. Se Mindtrip torna (e lo speriamo), aggiorneremo questa sezione; il confronto resta onesto in entrambe le direzioni.",
    "tableLanguageOurs": "Quattro lingue come nucleo del prodotto (SL/EN/IT/DE)",
    "ctaBody": "Dalla domanda al piano: 30 secondi. Account richiesto: nessuno. Lingua: sloveno, inglese, italiano o tedesco.",
    "ctaMap": "Apri la mappa",
    "ctaCommunity": "Guarda i piani della community",
    "a5": "Mindtrip era un buon generalista; alla nostra verifica del 28 set 2026 tutto il loro web (sito, login, API) era irraggiungibile e non possiamo giudicarne la causa. Per i viaggi in Slovenia qui trovi: pianificazione senza registrazione, quattro lingue, dati locali verificati e prenotazioni con fornitori locali. Giudica tu — la prova senza registrazione richiede 30 secondi.",
    "q6": "Cosa è successo a Mindtrip?",
    "a6": "Con onestà: sappiamo solo ciò che abbiamo verificato. Il 28 settembre 2026 tutto il loro web (mindtrip.ai, login, API) mostrava una pagina \"Under Construction\"; non abbiamo trovato copertura stampa, mentre le recensioni del 22–23 set li collocano ancora tra i migliori pianificatori AI gratuiti. Non speculiamo su cause o futuro — verifica lo stato attuale direttamente sul loro sito.",
}

DE = {
    "meta": {
        "title": "Mindtrip-Alternative für Slowenien? Ehrlicher Vergleich",
        "description": "Du suchst eine Mindtrip-Alternative? Feldcheck vom 28.09.2026: ehrlicher Vergleich allgemeiner KI-Planer mit einem Slowenien-Spezialisten — ohne Anmeldung, in 4 Sprachen.",
    },
    "updated": "Aktualisiert: 28. September 2026. Vergleiche altern — prüfe das Datum vor der Entscheidung.",
    "generalistsIntro": "Mindtrip, Layla, Wanderlog, ChatGPT und Verwandte sind gute Produkte (zur aktuellen Erreichbarkeit siehe den Feldbericht oben). Ein Generalist ist die richtige Wahl für:",
    "fieldBadge": "Feld · geprüft am 28.09.2026",
    "fieldTitle": "Das Feld hat sich bewegt — was wir am 28. September 2026 live geprüft haben",
    "fieldIntro": "Ein ehrlicher Vergleich braucht datierte Prüfungen, keine ewigen Behauptungen. Dies sind punktuelle Befunde unserer eigenen Prüfungen (öffentlicher Seitenzugriff, offizielle Quellen) — ändert sich das Feld, aktualisieren wir diesen Abschnitt.",
    "field": {
        "mindtripTitle": "Mindtrip: das gesamte Web-Erbe ist unerreichbar",
        "mindtripDesc": "Bei unserer Prüfung am 28.09.2026 zeigten mindtrip.ai, Login und API durchweg eine „Under Construction“-Seite (die Weiterleitung führt auf ihr Bild-CDN). Wir fanden keine Presseberichterstattung zum Ausfall, während Reviews vom 22.–23.09. Mindtrip weiter unter den besten Tools führen — der Review-Zyklus hinkt der Realität hinterher. Über die Ursache raten wir nicht; prüfe den aktuellen Stand direkt bei ihnen.",
        "laylaTitle": "Layla: für viele Besucher hinter einer Wand",
        "laylaDesc": "Bei unseren Prüfungen lieferte layla.ai den Fehler 429 und eine Browser-Sicherheitsprüfung; die frühere Marketing-Domain itslayla.com ist heute ein unverbundener Mode-Shop. Die Expedia Group hat Layla am 31.07.2026 übernommen — die Chat-first-Funnels der Kategorie laufen jetzt auf OTA-Geld, was nicht automatisch bessere Erlebnisse für jeden Besucher bedeutet.",
        "googleTitle": "Google: generische KI-Reiserouten sind jetzt gratis",
        "googleDesc": "Nach Googles offizieller Blog-Zeitleiste (Nov 2025 → Aug 2026) können AI Mode und Gemini kostenlos einen Reiseplan erstellen. „Eine KI schreibt deinen Plan“ ist kein Unterscheidungsmerkmal mehr — Daten-Tiefe, überprüfbare Quellen und Offline-Nutzung schon.",
    },
    "fieldNote": "Dies sind datierte Punktprüfungen — keine Daueraussagen. Kommt Mindtrip zurück (und wir hoffen es), aktualisieren wir diesen Abschnitt; der Vergleich bleibt in beide Richtungen ehrlich.",
    "tableLanguageOurs": "Vier Sprachen als Produktkern (SL/EN/IT/DE)",
    "ctaBody": "Von der Frage zum Plan: 30 Sekunden. Konto nötig: keins. Sprache: Slowenisch, Englisch, Italienisch oder Deutsch.",
    "ctaMap": "Karte öffnen",
    "ctaCommunity": "Community-Pläne ansehen",
    "a5": "Mindtrip war ein guter Generalist; bei unserer Prüfung am 28.09.2026 war ihr gesamtes Web (Seite, Login, API) unerreichbar, und über die Ursache können wir nicht urteilen. Für Slowenien-Reisen bekommst du hier: Planung ohne Anmeldung, vier Sprachen, verifizierte lokale Daten und Buchungen bei lokalen Anbietern. Urteile selbst — der Test ohne Anmeldung dauert 30 Sekunden.",
    "q6": "Was ist mit Mindtrip passiert?",
    "a6": "Ehrlich: Wir wissen nur, was wir geprüft haben. Am 28. September 2026 zeigte ihr gesamtes Web (mindtrip.ai, Login, API) eine „Under Construction“-Seite; wir fanden keine Presseberichterstattung, während Reviews vom 22.–23.09. sie weiter unter die besten kostenlosen KI-Reiseplaner einreihen. Wir spekulieren nicht über Ursachen oder Zukunft — prüfe den aktuellen Stand direkt bei ihnen.",
}

UPDATES = {"sl": SL, "en": EN, "it": IT, "de": DE}


def apply(c: dict, u: dict, label: str) -> list:
    """Vzame obstoječi comparison ns in nanj naloži W10 spremembe.
    Vrne seznam sprememb (za poročilo)."""
    changes = []

    def set_key(path: list, value: str):
        node = c
        for p in path[:-1]:
            node = node[p]
        key = path[-1]
        old = node.get(key)
        if old != value:
            node[key] = value
            changes.append(".".join(path))

    set_key(["meta", "title"], u["meta"]["title"])
    set_key(["meta", "description"], u["meta"]["description"])
    set_key(["updated"], u["updated"])
    set_key(["generalistsIntro"], u["generalistsIntro"])
    set_key(["table", "rows", "language", "ours"], u["tableLanguageOurs"])
    set_key(["ctaBody"], u["ctaBody"])
    set_key(["ctaMap"], u["ctaMap"])
    set_key(["ctaCommunity"], u["ctaCommunity"])
    set_key(["faq", "a5"], u["a5"])
    set_key(["faq", "q6"], u["q6"])
    set_key(["faq", "a6"], u["a6"])

    # Nova terenska sekcija (celoten blok)
    c["fieldBadge"] = u["fieldBadge"]
    c["fieldTitle"] = u["fieldTitle"]
    c["fieldIntro"] = u["fieldIntro"]
    c["field"] = {
        "mindtripTitle": u["field"]["mindtripTitle"],
        "mindtripDesc": u["field"]["mindtripDesc"],
        "laylaTitle": u["field"]["laylaTitle"],
        "laylaDesc": u["field"]["laylaDesc"],
        "googleTitle": u["field"]["googleTitle"],
        "googleDesc": u["field"]["googleDesc"],
    }
    c["fieldNote"] = u["fieldNote"]
    changes.append("fieldBadge/fieldTitle/fieldIntro/field.*/fieldNote (novo)")

    return changes


def flat_count(d: dict, prefix: str = "") -> int:
    n = 0
    for k, v in d.items():
        if isinstance(v, dict):
            n += flat_count(v, f"{prefix}.{k}" if prefix else k)
        else:
            n += 1
    return n


def main() -> None:
    all_counts = {}
    for locale, update in UPDATES.items():
        # Vir: SL/EN iz fragmentov, IT/DE iz messages (kanon W1)
        if locale in ("sl", "en"):
            frag_path = FRAGMENTS / f"comparison.{locale}.json"
            data = json.loads(frag_path.read_text(encoding="utf-8"))
            c = data["comparison"]
            changes = apply(c, update, locale)
            if not DRY:
                frag_path.write_text(
                    json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
            count = flat_count(c)
        else:
            msg_path = MESSAGES / f"{locale}.json"
            data = json.loads(msg_path.read_text(encoding="utf-8"))
            c = data["comparison"]
            changes = apply(c, update, locale)
            if not DRY:
                msg_path.write_text(
                    json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
            count = flat_count(c)
        all_counts[locale] = count
        print(f"[{locale}] {len(changes)} sprememb, {count} ploščih ključev")
        for ch in changes:
            print(f"    - {ch}")

    # SL/EN fragmente zlij v messages (idempotentno: prepiši comparison ns)
    if not DRY:
        for locale in ("sl", "en"):
            msg_path = MESSAGES / f"{locale}.json"
            data = json.loads(msg_path.read_text(encoding="utf-8"))
            frag = json.loads((FRAGMENTS / f"comparison.{locale}.json").read_text(encoding="utf-8"))
            data["comparison"] = frag["comparison"]
            msg_path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            print(f"[{locale}] messages comparison ns prepisana iz fragmenta")

    # Simetrija (ista logika kot merge-i18n-fragments.py)
    counts = set(all_counts.values())
    if len(counts) == 1:
        print(f"OK: simetrično — {all_counts}")
    else:
        print(f"NAPAKA: nesimetrija ključev! {all_counts}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
