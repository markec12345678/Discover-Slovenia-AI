# Issue #24 — Sklop 7: Go Mode i18n — odprt za vseh 6 jezikov, faza 1 (1.169.0)

**Datum QA:** 2. 10. 2026 · **Produkcija:** Render (`i-feel-slovenia.onrender.com`, primarna) + Vercel (`i-feel-slovenia.vercel.app`) · **Oba na 1.169.0** · CI zelen (`ad76c44`)

**Zlata pot QA (Render, mobilni 390 px):** italijanski uporabnik na `/it/nacrtuj` → mobilni zavihek **»Vai«** (POJDI) → Go Mode.

## Posnetki

| Datoteka | Vsebina |
| --- | --- |
| `01-it-vai-na-poti.png` | Zlata pot: IT uporabnik → zavihek »Vai« → **/it/na-poti** z EN Go Mode vsebino + IT navigacija + obvestilo »Traduzione automatica« |
| `02-de-na-poti.png` | Direkten URL /de/na-poti — EN fallback (Go Mode hero + prazno stanje) |
| `03-sl-regresija.png` | Regresija: /na-poti ostaja popolnoma slovenska |

## Meritve (14)

1. **Usmerjanje (Render, curl):** `/na-poti` 200 SL · `/en/na-poti` 200 EN · `/it`, `/de`, `/fr`, `/es/na-poti` **200 EN** (prej: it/de/fr/es = **308 → slovenska** stran).
2. **Zlata pot P4-8 (Render, brskalnik):** IT uporabnik klikne »Vai« → `https://…/it/na-poti` — **ostane v svoji URL poti** z EN vsebino (prej: pahnjen na SL stran = mešanje jezikov).
3. **EN fallback vsebina:** naslov strani »On the road — Go Mode travel companion«, h1 »On the road: what's now, what's next«, podnaslov »Your plan lives on your device — it works offline too.« — pri vseh 4 tujih jezikih enak (L-vzorec {sl,en}).
4. **Prazno stanje (EN):** »No active journey | Build a journey on the Journey page (arrival, destination, stops across 4 countries) … | Have an AI plan? The "Start On-the-road" button on the planner (or a shared link) loads it here — it works offline too. | Build a journey | Plan with AI«.
5. **Poštena oznaka prevoda:** IT uporabnik vidi obvestilo **»Traduzione automatica — Questa pagina è tradotta automaticamente (IA) dall'originale sloveno ed è in attesa di revisione umana«** (mtNotice v njegovem jeziku; SL in EN sta referenčni).
6. **Navigacija v uporabnikovem jeziku:** »Scopri | Mappa | Il mio viaggio | Vai | Altro« (it) — zavihek POJDI je prevoden, cilj pa zdaj jezikovno pravilen.
7. **SL regresija:** `/na-poti` → »Na poti: kaj je zdaj, kaj je naslednje« + »Go Mode — med potovanjem« (byte-enako prejšnjemu stanju).
8. **Zaprte poti ostajajo zaprte (regresija):** `/it/potovanje` → **308** → `/potovanje`; `/es/moja-potovanja` → **308** → `/moja-potovanja` (P4-8 varovalo — Sklop 7 je namerno ozek samo na Go Mode).
9. **hreflang (7 alternativ, produkcijski HTML):** sl-SI, en-US, **it-IT, de-DE, fr-FR, es-ES** + x-default (prej samo sl+en).
10. **Sitemap:** `/it/na-poti`, `/de/na-poti`, `/fr/na-poti`, `/es/na-poti`, `/en/na-poti` vsi prisotni v produkcijskem `sitemap.xml`.
11. **Lokalni dim-test (pred pushom, dev):** vseh 6 poti 200 s pravilnim jezikom; `hreflangForPath("/na-poti")` vrača vseh 7 alternativ.
12. **Vercel:** `/es/na-poti` 200 EN; `/it/na-poti` 200 EN po ogretju (mrzli zagon ~68 s — znan artefakt brezplačnega paketa).
13. **Testni kanon:** 12 novih pogodbenih testov (`issue24-s7-gomode-i18n` — routing/resolucija/vnosi/zapis/offline) + 1 nov dinamični offline test (IT piškotek → EN besedila + `/it/na-poti` povezava) + 4 usklajeni testi (w1-2b flip, w12 11→12 poti + sitemap 581→582, task73).
14. **Napake:** 0 napak strani in 0 napak konzole (Render: /it/nacrtuj, /it/na-poti, /de/na-poti, /na-poti).

## Iskrena meja

Go Mode NIZI obstajajo samo v SL+EN — it/de/fr/es uporabnik vidi EN površino (pošteno, a popolnjivo — IMPROVE #3). Celotni prevodi (~260 enot × 4 jeziki) so faza 2 po jezikih (isti mejnik W1 → W12 kot planner). Go ZAPIS (`dai:go-trip`) je jezikovno nevtralen ({sl,en} pari), zato izris po localu deluje brez migracij.
