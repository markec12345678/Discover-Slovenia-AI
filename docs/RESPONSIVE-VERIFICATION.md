# RESPONSIVE-VERIFICATION — FAZA E (issue #19 §16/§17/§18)

> **Namen:** GitHub issue #19 »DISCOVER — Premium Product Presentation & 100 %
> Feature Preservation«, **FAZA E — responsive verifikacija**: kanonska matrika
> mobilnih širin (§17), jezikov (§16) in desktopa (§18) z DOM-meritvami.
>
> **Baseline:** HEAD `16be6ac` (1.155.1) + 4 prezentacijski popravki tega
> dokazovanja (spodaj). Merjeno na dev strežniku (agent-browser, en strežnik /
> en ukaz — sandbox omejitve).
> **Skripta:** `scripts/ops/faza-e-responsive.sh` (mobile | locales | desktop |
> custom | shots).

---

## 1. Metodologija (merjeno, ne ugibano — pravilo #19)

| Preverba | Prag | Vir |
|---|---|---|
| Horizontalni overflow | `scrollWidth − innerWidth > 0` | 320px = HARD GATE (§17) |
| Dotikalne tarče — **tiny** | min(w,h) < **24px** | WCAG 2.2 SC 2.5.8 (AA) |
| Dotikalne tarče — compact | 24–40px | advisory (udobje) |
| Slike brez `alt` | > 0 | DOM |
| CTA ovijanje (proxy) | `[data-slot=button]` višji od 60px | DOM |
| Jezik | `h1` v pravem jeziku | DOM |
| Napake strani | `agent-browser errors` | page errors |

**Izjeme WCAG 2.5.8 (inline v besedilu):** prozne povezave v stavkih (noga:
»Metodologija in viri podrobnosti«, »seznam virov«, medijski citati
BBC/Tow Center/MonkeyEatingMango), breadcrumb povezave (standardni shadcn
vzorec, vrstica z ločili) in tiha spremljevalna povezava plannerja
(»Celotno potovanje«, `text-[11px]` v stavku). Te se izmerijo kot < 24px, a so
po WCAG izvzete — niso napake.

**Merilni artefakti (dokumentirani, da jih prihodnji auditi ne lovi):**
- *Hidriranje:* merjenje 2 s po loadu da lažne tiny tarče (1×1 selecti,
  polovični čipi) — rešitev: usedel 4,5 s + obetanje 800 ms po loadu znotraj
  evala; Leaflet markerji (zemljevid) potrebujejo 8,5 s.
- *Restart strežnika:* pageErrors = 1 po proaktivnem restartu (zastarela HMR
  povezava) — sveža seja = 0 napak (preverjeno).
- *Chrome neterror strani:* če strežnik (OOM) umre med nalaganjem, agent-browser
  »uspešno« odpre neterror stran (h1: »This page couldn't load«) — te vrstice
  se zavrzijo in pomerijo znova.
- *OOM:* `next dev` RSS zraste prek 2,5 GB pri zaporednih kompilacijah →
  sandbox OOM-kill sredi sweepa — skripta ima ensure_server/restart_server.

## 2. Obseg (kanonska matrika — 72 meritev)

| Sklop | Širine | Površine | Meritev |
|---|---|---|---|
| Mobilno SL | 320/360/375/390/430 | /, /destinacije, /destinacija/bled, /moja-potovanja, /nacrtuj, /zemljevid, /na-poti | 35 |
| Jeziki @ 320 | sl, en (7 površin), it/de/fr/es (5: /, /destinacije, /destinacija/bled, /nacrtuj, /zemljevid — W1/W12 whitelist dejansko stanje) | 27 |
| Desktop | 1280×800 (7), 1920×1080 (3: /, /nacrtuj, /zemljevid) | 10 |

## 3. Rezultati

| Preverba | Rezultat |
|---|---|
| Horizontalni overflow | **0 / 72** (320 hard gate ✓, vse širine, vsi jeziki, desktop) |
| Slike brez alt | **0 / 72** |
| Dotikalne tarče < 24px | **0 resnih** — samo WCAG-inline izjeme (noga/breadcrumb/proza) |
| CTA ovijanje | 0 (btnTall na /destinacija/bled = namerna izbira trajanja, 70px) |
| Jeziki | h1 pravilen v vseh 6 jezikih; dolgi prevodi ne lomijo (0 overflow) |
| Napake strani | 0 (sveža seja; restart-artefakt dokumentiran) |

## 4. Popravki te faze (4, čisto prezentacijski — 0 funkcionalnih sprememb)

1. **`/nacrtuj` ingest tablist `flex-wrap`** (`itinerary-planner.tsx`):
   5 zavihkov (Povezava/Besedilo/Slika/PDF/Točke) je pri 360px štrlo 3px čez
   (izmerjeno; edini realni overflow v celotnem sweepu). Ozko polje zdaj
   ovije v 2 vrstici; široko nespremenjeno.
2. **Iskalna vrstica zemljevida** (`map-view.tsx`): vhod `py-1` (20px → 28px;
   celotna vrstica 44px — dotik prijazen) + gumb »Počisti« `p-1.5` (22px →
   26px).
3. **Gumb »Preskoči kviz«** (`travel-style-quiz.tsx`): `py-1.5` (16px → 28px).
4. **Zemljevid grozdni mehurčki** (`map-view.tsx`): `divIcon` brez `iconSize`
   pušča Leafletov PRIVZETI zabojčik 12×12 (izmerjeno na vseh jezikih), viden
   mehurček pa ~24×24+. Izrecna tarča **44×30** s sredinsko pritrjenim
   mehurčkom (`left/top 50 %` + `translate(-50 %,-50 %)`) — idiomatska
   velikost grozda leaflet.markercluster (~40–52px), vizualno identična.
   Verificirano: 36/36 grozdov točno 44×30, 0 tiny.

## 5. Predobstoječe težave, odkrite med auditom (§25 — dokumentirane, NE rešene v tej fazi)

- **Persistenca popupa grozdnih mehurčkov:** popup se odpre (dokazano z
  MutationObserver: `ADD:leaflet-popup grid-bubble-popup`), a v avtomatiziranih
  testih ne vztraja zanesljivo (A/B na ORIGINALNI kodi = enako vedenje → NI
  regresija popravka #4; sum: avto-pan/refetch sloja po odprtju). Markerji
  destinacij delujejo normalno. Potrebuje lastno preiskavo (funkcionalna napaka,
  izven prezentacijskega obsega FAZE E).
- **Prekrivanje grozdov z markerji destinacij:** 38 destinacijskih markerjev
  (36×36, višji z-index) prekriva središča grozdov pri nizkem zoomu — viden
  vzorec plavajočih slojev, uporabnik klikne zgornji marker. Obstoječe
  vedenje pred #19.

## 6. AFTER dokazi (screenshots, `qh19-faza-e/`)

- `after-home-mobile-320.png`, `after-home-desktop-1280.png`,
  `after-home-en-390.png`
- `after-planner-mobile-320.png`, `after-planner-desktop-1280.png`
- `after-map-mobile-320.png`, `after-map-bubbles-320.png` (36 grozdov, vsi
  44×30, verificirano z eval)
- `after-mytrip-mobile-320.png`, `after-gomode-mobile-320.png`

Surovi rezultati: `/tmp/faza-e-{mobile,locales,custom,desktop}.jsonl`
(62 + 10 meritev; jsonl po vrsticah, po ploskvi).

## 7. Sklep

FAZA E kanonska matrika je **ČISTA**: 0 prelivov na 320px hard gate (in vseh
ostalih širinah/jezikih/desktopu), 0 rezanih slik, 0 resnih dotikalnih tarč
pod WCAG 2.2 AA, dolgi prevodi v 6 jezikih ne lomijo postavitve. Štirje
prezentacijski popravki odpravljajo edina izmerjena odstopanja. Regresija:
eslint 0, **4413/4413 testov** (73.059 expect), 0 funkcionalnih sprememb.
