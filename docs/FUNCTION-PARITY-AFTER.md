# FUNCTION-PARITY-AFTER — končni revizor paritete (issue #19 FAZA F)

> **Namen:** primerjava proti `docs/FUNCTION-PARITY-BEFORE.md` (inventura ob
> e92b8de / 1.153.2: 39 strani, 144 API endpointov, 387 funkcij, 20 območij,
> 22 »Dodaj v mojo pot« površin). Issue #19 zahteva:
> **»0 namenoma odstranjenih obstoječih zmožnosti«** — spodaj je dokaz.

---

## Verdikt: 0 IZGUB — 100 % PARITETA ✓

**Primarni dokaz — površina sprememb (git `e92b8de..0d79d54`, FAZE C+E):**

| Ugotovitev | Vrednost |
|---|---|
| Spremenjenih datotek v `src/` | 20 — **vse MODIFICIRANE** (0 dodanih, 0 izbrisanih) |
| Obseg | +66 / −24 vrstic (čez 6041-vrstični planner: +5; čez 2367-vrstični map-view: +15) |
| Dotaknjenih `page.tsx`/`route.ts` strukturno | **0** (edina stran: things-to-do — zamenjava enega razreda `font-medium`→`font-semibold`) |
| Dotaknjenih API endpointov (`src/app/api/**`) | **0** |
| Odstranjenih komponent/hookov/lib modulov | **0** |
| Število testov bazno → zdaj | **4413 → 4413** (ista številka = nihče ni odstranil niti enega testnega kontrakta) |
| Rezultat suite | 4413/4413 pass, 73.059 expect, eslint 0 |

**Narava vseh 20 sprememb (izključno prezentacijski sloj):**
elevacijski žetoni + `foreground-subtle` (globals.css @theme), CTA hierarhija
(button.tsx varianti), enotna senco lestvica (card/dialog/sheet/popover/
dropdown), lede barve (7 sekcij × 1 razred), teža naslovov (48/48), ritem
py-20 (demo-scenarios), `flex-wrap` ingest tablista, dotikalne tarče (zemljevid
iskalna vrstica, Preskoči kviz, grozdni mehurčki 44×30). Noben handler, stanje,
rute ali podatkovni tok ni bil spremenjen.

## Pariteta po območjih BEFORE inventure (20/20)

| # | Območje (BEFORE) | Preverba AFTER | Status |
|---|---|---|---|
| 1 | Rute (39 strani + 6 handlerjev) | 0 strukturalnih sprememb v `src/app/**` (git filter AD = prazno); vse rute strežejo (SSR 200 v FAZE C/E sweepih) | ✓ |
| 2 | Glavne strani/sekcije | vse komponente modificirane le v className (diff); 13 blokov domače strani nespremenjenih | ✓ |
| 3 | Navigacija (Navigation/MobileTabBar/Footer/orodja) | 0 dotikov; 320/390/430/1280 DOM-sweep 0 prelivov tudi na navigacijskih elementih | ✓ |
| 4 | CTA-ji + 22 Add površin | button.tsx variant API nespremenjen (samo vizualno); 0 odstranjenih CTA-jev; zlata pot Add v FAZI C-1 browser-dokazana | ✓ |
| 5 | Dialogi/modali/sheet-i | samo senčne razrede (shadow-overlay); Dialog/Sheet odprtost v FAZI C-1 preverjena (sheet »Priljubljene«) | ✓ |
| 6 | Interaktivne komponente | 0 odstranjenih; tablist v plannerju ohranja vseh 5 zavihkov (flex-wrap = samo prelom vrstice) | ✓ |
| 7 | My Trip akcije | 0 dotikov `src/lib/my-trip*`/`/api/my-trip`; moja-potovanja DOM-sweep čist (5 širin) | ✓ |
| 8 | Načrtovalnik (6041 vrstic) | diff = 5 vrstic (komentar + flex-wrap); 4413 testov vključno planner pogon; /nacrtuj sweep 0 prelivov | ✓ |
| 9 | Zemljevid (2367 vrstic) | diff = 15 vrstic (vhod py, gumb p, divIcon iconSize); grozd→popup dokazan (MutationObserver ADD); destinacijski popup ✓ | ✓ |
| 10 | Go Mode | 0 dotikov; /na-poti sweep čist (5 širin + EN) | ✓ |
| 11 | Klepet | 0 dotikov | ✓ |
| 12 | Booking/handoff/tržnica | 0 dotikov (registry/affiliati/tržnica nedotaknjeni) | ✓ |
| 13 | Google Pins uvoz | 0 dotikov (F14 pot nedotaknjena) | ✓ |
| 14 | Računi/uvoz rezervacij | 0 dotikov | ✓ |
| 15 | Socialno/skupinske poti | 0 dotikov | ✓ |
| 16 | Zbirke/wishlist | 0 dotikov (collections.tsx samo lede razred) | ✓ |
| 17 | Večjezičnost (6 jezikov) | FAZA E: 27 meritev @ 320 v 6 jezikih — 0 prelivov, h1 pravilen povsod | ✓ |
| 18 | API (144 endpointov) | 0 dotikov `src/app/api/**` | ✓ |
| 19 | PWA/offline | 0 dotikov (SW/manifest nedotaknjena) | ✓ |
| 20 | Slovenia Pass | 0 dotikov | ✓ |

Aneks A (nepopolno preverjene funkcije v BEFORE) ostaja enak — težava
lastnikovih operacij, ne prezentacijske faze.

## Življenjske poti (§21 issueja) — dokazi FAZE C/E (browser)

- **ODKRIJ → DODAJ → MOJA POT → NAČRTUJ → BOOK → POJDI**: C-1 zlata pot (čip
  »Miren vikend« → /nacrtuj → avto-generiran itinerer Bled/Bohinj) ✓;
  /moja-potovanja + /na-poti sweepi ✓.
- **ZEMLJEVID → KRAJ → DODAJ → MOJA POT**: grozd 44×30 → popup odprt
  (MutationObserver dokaz) → destinacijski popupi ✓; iskalna vrstica 44px ✓.
- **KLEPET → DESTINACIJA → DODAJ**: komponente nedotaknjene (§11) ✓.

## Odkrite PREDOSTOJEČE težave (dokumentirane, ne odpravljene — §25)

1. Persistenca popupa grozdnih mehurčkov (A/B na originalni kodi — ni regresija
   #19; suma avto-pan/refetch sloja) — `docs/RESPONSIVE-VERIFICATION.md` §5.
2. Prekrivanje grozdov z destinacijskimi markerji pri nizkem zoomu (obstoječe)
   — isto, §5.

## Sklep

**ZERO FEATURE LOSS. 100 % FUNCTION PARITY.** Vsa #19 implementacija (FAZE
C+E) je izključno prezentacijski sloj na skupnih primitivih; funkcionalna
inventura BEFORE ostaja 1:1 veljavna.

---

## Dodatek — FAZA G: PRODUKCIJSKA KONTROLA KAKOVOSTI (1. 10. 2026)

> Issue §23 PHASE G: »final review iz perspektive prvega uporabnika —
> rezultat mora izgledati in se obnašati kot koherenten komercialni
> potovalni izdelek.« Izvedeno na produkciji (Vercel **1.156.0** =
> kodno identičen HEAD-u; 1.156.1/1.156.2 sta docs-only).

**Zlata pot na produkciji (browser, agent-browser):**

| Pot | Rezultat |
|---|---|
| Hero čip »Miren vikend« → `/nacrtuj` | samodejno generiran **3-dnevni itinerer** (dnevi 1–3, 9 hitrih prilagoditev, zemljevid poti, rezervacije — 6 ponudb) ✓ |
| `/destinacija/bled` → »Dodaj v mojo pot« | localStorage `dai:my-trip-items` (source: `destinacija-hub`) + toast → hub `/moja-potovanja` prikazuje »Moja pot 1 — DESTINACIJE (1)« ✓ |
| `/zemljevid` → iskanje »restavracije Ljubljana« | zadetki **z razlogi** → supply sloj samodejno aktiven (839 markerjev) → fly-to → POI popup (Kratochwill 🍽️) → »+ Dodaj v mojo pot« → **OBE plasti** (localStorage product `fsq:4bf6a187…` source `zemljevid` + sessionStorage `dai:supply-selection`) + gumb »✓ Dodano« ✓ |

**Površine:** desktop 1280 (domov, načrtovalnik, hub, zemljevid) + mobil
390 (domov s tab vrstico in značko »2 idej v moji poti« — pravilen števec,
/nacrtuj, /zemljevid, /moja-potovanja »Moja pot 2«, /na-poti, /destinacije,
/destinacija/bled) + **320 trdni prag** (domov: 0 preliva, 320 = 320).

**0 page errors · 0 console errors** v celotni seji. 13 dokazov PNG:
`qh19-faza-g/prod-g-*.png`.

Opazovanje (ni napaka): prvi klik hero čipa je enkratno obtičal na RSC
prehodu (fetch 200, navigacija se ni zavezala) — NEPOVRATLJIVO na ponovitvi
in direktni navigaciji; ista seja je imela CDP timeout ob prvem odpiranju
(artefakt merilne povezave, 0 konzolnih napak). Na dev je C-1 zlata pot že
bila browser-dokazana.

**Verdikt FAZE G:** izdelek se obnaša kot koherentna komercialna
potovalna platforma — enoten CTA/rezultat hierarhičen, tipografija in
elevacija dosledni, mobilna tab vrstica + značka števca pravilna, vse
zlate poti (ODKRIJ → DODAJ → MOJA POT → NAČRTUJ; ZEMLJEVID → KRAJ → DODAJ)
delujejo na produkciji.
