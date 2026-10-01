# ISSUE #22 — PRODUKCIJSKI DOKAZI (Render, 1.162.0 → 1.162.3)

> Agent-browser na živi produkciji `https://i-feel-slovenia.onrender.com`
> (mobilni viewport 390×844). Vsi prikazi so DEJANSKA koda proti DEJAVNIM
> API-jem (FSQ pinovi, /api/journey/plan, /api/itinerary, /api/map/pins).
> Izjeme (dokumentirane spodaj): GPS simulacija (ista poštena metoda kot
> dokazi #21) in dve dokazni pripravi stanja naprave.

## ZLATA POT #22 (vse slike v tej mapi)

| # | Dokaz | Kaj kaže |
|---|---|---|
| prod-00 | health-render.json | Render 1.162.3 `status: ok`, zagonski pregledi |
| prod-01 | gomode-empty.png | /na-poti brez načrta — iskren prazen stanje z obema izhodoma |
| prod-02 | gomode-guardian.png | ⚪ PODATKOV NI DOVOLJ ZA ZANESLJIVO OCENO (brez GPS — banner laže ne) |
| prod-03 | guardian-ontrack.png | 🟢 VSE TEČE PO NAČRTU — »Naslednja rezervacija ob 22:30. Predviden prihod ~19:28. Rezerva 182 min.« |
| prod-04 | guardian-conflict.png | 🟠 POTREBUJE TVOJO POZORNOST — konflikt kartica (role=alert): dejstva + razlog + posledica + [Navigiraj][Prilagodi mojo pot][Preskoči][Odpri rezervacijo] |
| prod-05 | guardian-recovery.png | RECOVERY MODE (zložljiv): kaj se je spremenilo, ✓ Še velja: Lent, Leonardo Hotel Maribor, naslednji izvedljivi cilj, [Nadaljuj][Preskoči][Preuredi mojo pot] + »Odločiš ti — Discover ne spreminja rezervacij namesto tebe.« |
| prod-06 | freetime-window.png | ⏳ PROST ČAS — »Imaš približno 147 min« + »Prihranili smo 33 min varnostne rezerve« + [Znamenitosti][Hrana][Kava][Sprehod] |
| prod-07 | freetime-candidates.png | 4 varno prefiltrirani kandidati iz /api/map/pins (166 pinov v bbox-u) — vsak z iskreno zanko »5 min tja · 60 min obiska · 10 min do termina · ~4.3 km« + »odpiralni čas neznan« |
| prod-08 | v1-honest-note.png | v1 (kanonična) pot + klik [V mojo pot] → iskrena opomba (dodajanje ni mogoče) |
| prod-09 | v2-gomode.png + v2-guardian-past.png | v2 (AI itinerer) v Go Mode: 🟠 PAST_BOOKING — »Termin ob 09:00 se je začel pred 655 min.« (načrt za 29. 9., danes 1. 10. zvečer — iskreno zaznan zamik dneva) |
| — | (tek med dokazi) | Preskoči (iz konflikt kartice) → zapis dai:go-skipped → SAMODEJNA progresija Bohinj → Triglav + takojšnja ponovna ocena (14:40 tudi pretekla) |
| prod-10 | v2-ontrack-freetime.png | v2: 🟢 rezerva 137 min + ⏳ okno 108 min |
| prod-11 | v2-candidates.png | v2 kandidati (Picerija Don Andro, Macesen Bar, Restavracija Ukanc …) |
| prod-12 | v2-added-success.png | DODAJANJE USPEŠNO: »✓ Picerija in špageterija Don Andro dodan na konec dneva.« — zapis `nearby:4c2f3c5a…` v dai:go-trip, postanek viden v dnevu |
| prod-13 | moja-potovanja-resume.png | Gostov pogled Moja potovanja: kartica poti z [Nadaljuj na poti][Odpri] |
| prod-14 | resume-gomode.png | Klik Nadaljuj → svež v2 zapis naložen v /na-poti (preskočeni Bohinj preživi zamenjavo zapisa → naslednji Triglav + iskren 🟠) |

## Dokazne priprave (pošteno razložene)

1. **GPS simulacija** — JS override `watchPosition` (~10 km od cilja, ±12 m,
   sveži časovni žigi vsake 2 s) — IDENTIČNA metoda kot dokazi #21 (v sandboxu
   ni prave GPS naprave). Vsa prihodna detekcija, rezerva in okna so
   izračunana z DEJANSKO kodo iz simuliranih fiksov.
2. **Termin 22:30 na v2 zapisu** — čas Triglava v `dai:go-trip` (zapis
   naprave, enakovredno urejanju v načrtovalniku) prestavljen iz 14:40 na
   22:30, ker so bili vsi časi načrta (generiranega za 29. 9.) ob 20:13 že
   pretekli in prosti čas ponaravno ne bi obstal. Vse nadaljnje je živa koda.
3. **Vnos v dai:my-trips** — zapisan v TOČNO obliki, ki jo zapiše
   `addSavedTrip()` (my-trips-storage.ts), ker shranjevanje OBNOVLJENEGA
   načrta (drugi klik Shrani po restore) ne pokliče `addSavedTrip` —
   opažena vrzel PRED #22 (isti vzorec kot update-pot, ki `return`a prej).
   Zabeležena v REMAINING; gumb in celoten tok sta dejanska koda.

## Produkcijska dejstva (iskrena)

- Potek je streljal čez 3 produkcjske deployje (1.162.0 → 1.162.3), ker sta
  bili med dokazi ujeti in popravljeni dve napaki (glej CHANGELOG):
  1.162.1/1.162.2 — nearby kandidati (abort/dedupe tekma; korensko: last
  write wins po ključu), 1.162.3 — Nadaljuj na poti manjkal v gostovem
  pogledu. Vse tri regresijsko zaklenjene s testi.
- Vreme na Renderu 502 (kot v #21 — neblokirajoče, izven obsega #22).
- ZAČNI DAN (§13) utrjen s 17 unit/source-contract testi; produkcijska slika
  jutranjega povzetka zahteva sejo pred 11:00 (dokaz poteka je bil zvečer) —
  pogoj `applicable` je čista projekcija istega pravila (day-start.ts).
- 0 konzolnih napak na /na-poti med vsemi dokazi (errors prazne).

## Zunanje meje (nespremenjene iz #20/#21)

- Vercel: API kvota deployev (GitHub App ni nameščena) — Render je primarni
  produkcijski dokaz.
- 0 API_BOOKING ponudnikov → rezervacijski kontekst ostaja EXTERNAL/brez
  vrstic (CANCELLED prikaz prihaja iz strežniške vrstice, ko nastane).
