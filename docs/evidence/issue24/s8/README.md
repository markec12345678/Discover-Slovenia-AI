# ISSUE #24 — Sklop 8 (1.170.0): GO MODE I18N FAZA 2 — POLNI PREVODI IT/DE/FR/ES

**Datum:** 3. 10. 2026 · **Commit:** `7faab29` (35 datotek, +2955/−469)
**Produkcija:** Render `i-feel-slovenia.onrender.com` + Vercel `i-feel-slovenia.vercel.app` — obe 1.170.0, health OK.

## Kaj je bilo narejeno

Faza 1 (1.169.0, Sklop 7) je odprla /{locale}/na-poti za vseh 6 jezikov z
EN-dedovanjem (»pošteno, a popolnjivo«). Faza 2 prevede ~330 UI enot celotne
Go Mode površine ×4 (it/de/fr/es) — tuji uporabnik dobi SVOJ jezik:

- hero strani + meta naslov/opis (SSR);
- živa ura/datum (lokalne oblike it-IT/de-DE/fr-FR/es-ES);
- GPS nadzor (vklop/izklop/statusi/natančnost/wake lock);
- NASLEDNJE kartica (ETA, prihod »Približuješ se«→»✓ Prišel si«, žetoni,
  danes načrtovano, preskok/obnovi, naslednji dnevi, zaključi dialog);
- vreme pri naslednji postanki (Open-Meteo trak);
- navigacijski handoff (»Navigiraj« + zunanja aplikacija razkritje);
- odpiralni časi (OPEN/CLOSED/UNKNOWN + dnevi tedna + »zaprto · odpre pon«);
- Travel Guardian (stanje dneva 🟢🟠🔴⚪, konflikti FACTS→REASON→IMPACT ×10
  vrst, recovery, jutranji ZAČNI DAN, pametni prosti čas s kategorijami);
- shema dneva + zemljevid dneva + POT ZAKLJUČENA;
- glasovni vodik (TTS pripovedi postankov + »kaj je v bližini« v jeziku
  uporabnika; SL ostaja v besedah — TTS izmera; tujci števke nativno).

Nov helper `src/lib/journey/go-lang.ts` (kanon planner-lang `PL()`):
`GL` (manjkajoč tuji prevod → EN, NIKOLI SL — P4-8), `GFn` (funkcijske
enote), `goAll` (gradilec 6-jezičnih objektov v projekcijah), `goLangOf`
(neznan locale → SL izvirnik), `goLocaleTag` (BCP-47).

Popravek bonus: `conflict-detect` je v ANGLEŠKI stavek »The known route (…)«
vstavljal slovensko besedo »ocena« — oznaka vira noge je zdaj jezikovno
zavedna (`labelOfLegSource(source, lang)`).

## Iskrene meje (dokumentirane v CHANGELOG)

1. **Podatkovni pari shranjenih Go zapisov ostanejo {sl,en}** (providerLabel,
   dateLabel, statusLabel poti …): zapis na napravi je jezikovno nevtralen
   (0 migracij) — tuji uporabnik vidi/sliši EN stran para (isti kanon kot
   faza 1); naslovi postankov so uporabnikovi lastni viri.
2. **offline.html** (nadomestna lupina brez signala) ostaja SL+EN z
   EN-dedovanjem za tuje (faza 1 kanon) — lastna naloga, če se izkaže za
   pomembno.
3. Imena destinacij/POI/ponudnikov so podatki virov (jezikovno nevtralni).

## Produkcijski dokazi (Render primarno, 3. 10. 2026)

### SSR — vseh 6 jezikov (curl, naslov + meta)

| Pot | HTTP | H1 | `<title>` |
|---|---|---|---|
| `/it/na-poti` | 200 | »In viaggio: cosa c'è ora, cosa viene dopo« | »In viaggio — Go Mode, compagno di viaggio« |
| `/de/na-poti` | 200 | »Unterwegs: Was ist jetzt, was kommt als Nächstes« | »Unterwegs — Go Mode Reisebegleiter« |
| `/fr/na-poti` | 200 | »En route : ce qu'il y a maintenant, ce qui vient ensuite« | »En route — Go Mode compagnon de voyage« |
| `/es/na-poti` | 200 | »En camino: qué hay ahora, qué viene después« | »En camino — Go Mode compañero de viaje« |
| `/na-poti` (SL regresija) | 200 | »Na poti: kaj je zdaj, kaj je naslednje« (nespremenjeno) | — |
| `/en/na-poti` (EN regresija) | 200 | »On the road: what's now, what's next« (nespremenjeno) | — |

Badge + podnaslov prevedena v vseh 4 (npr. IT »Go Mode — durante il
viaggio« + »Il piano è sul tuo dispositivo — funziona anche senza segnale.«).

### Brskalnik (agent-browser, mobilni 390 px) — client-side GoMode

- **/it/na-poti**: prazno stanje POSEDEK VSEH kartic prevedeno — »Nessun
  viaggio attivo«, »Crea un viaggio nella pagina Viaggio (arrivo,
  destinazione, tappe in 4 paesi) … premi „Avvia In viaggio“.«, »Hai un
  piano AI? Il pulsante „Avvia In viaggio“ nel pianificatore …«, CTA
  »Crea un viaggio« + »Pianifica con l'AI«; IT navigacija (Scopri/Mappa/
  Vai); obvestilo »Traduzione automatica«; **0 page errors**;
  scrollWidth = 390 (0 preliva).
- **/de/na-poti**: »Keine aktive Reise« + »Stelle auf der Seite Reise eine
  Reise zusammen … drücke „Unterwegs starten“.« + »Du hast einen KI-Plan? …«;
  DE navigacija; 0 napak.
- **/fr/na-poti**: »Aucun voyage actif« + »Compose un voyage sur la page
  Voyage … appuie sur “Démarrer En route”.«; FR navigacija; 0 napak.
- **/es/na-poti**: »Ningún viaje activo« + »Crea un viaje en la página Viaje
  … pulsa “Iniciar En camino”.« + »¿Tienes un plan de IA? …«; ES navigacija;
  0 napak.
- **SL regresija**: »Ni aktivnega potovanja … Zaženi Na poti« (nespremenjeno).

### Vercel (sekundarna)

- `/fr/na-poti` h1 preveden (SSR); `/it/na-poti` + `/es/na-poti` h1 prevedena
  (SSR — posnetki Render; CDP eval timeout je znana počasnost hladnega
  zagona brezplačnega paketa, enako kot Sklop 5/6 QA).

### SEO vodovodarstvo

- hreflang alternativi: 7 (sl-SI, en-US, it-IT, de-DE, fr-FR, es-ES +
  x-default) v produkcijskem HTML (`hrefLang` React zapis);
- `sitemap.xml`: 48 `na-poti` URL (7 × vsak tuji jezik + SL + EN × seznami).

## Regresija

- **Testi:** 4971 pass + 1 znana sandbox DB napaka (issue7-g11 ④ — CI z
  Postgresom zelen; ista napaka je bila prisotna pred spremembo).
- **Nov test:** `issue24-s8-gomode-translations.test.ts` (27 testov): helper
  kanon, STRUKTURNA POPOLNOST (walker — vsak list 20 slovarjev nosi it/de/
  fr/es; anti »tiho EN padlo«), P4-8 ne-mešanje, kakovostni vzorci ×6
  (countdown/navigate/konflikti/jutranji pozdrav/odpiralni časi), TTS
  pripovedi ×6 (uvodni stavek, termin v govoru, PREMICA razkritje,
  providerLabel EN-dedovanje), source contracts (goLangOf resolucija, GoLang
  tipi po 7 komponentah, podatkovna nevtralnost zapisa {sl,en}), iskrena
  meja offline.html.
- **Posodobljeni source-contract testi:** #21 ①④ (ARRIVAL [lang] → GFn),
  #23 ⑬ (GoLang tip), #22 ⑥ (v1 feedback = GO_EDIT_LABELS en vir),
  S7 ④⑤ (resolucija SL-first → goLangOf; faza 2 nadgradnja faze 1).
- **lint 0 · tsc 0.**

## Posnetki

- `na-poti-it-390.png` — IT hero + prazno stanje + navigacija (mobilni).
- `na-poti-de-390.png` — DE hero + prazno stanje (mobilni).
- `na-poti-es-390.png` — ES hero + prazno stanje (mobilni).

## Stanje žetona (iskreno)

Žeton iz seje je uspešno opravil PUSH (`e55fa86..7faab29`), potem pa je
prestal veljati za API (401 Bad credentials — rotiran ali samodejno
preklican). Posledica: komentarja na issue #24 tokrat NI bilo mogoče
objaviti — objaviti ga je treba z novim žetonom (pripravljeno besedilo v
worklogu). CI status ni bil dosegljiv (javni API rate-limit + mrtvi žeton),
a: lokalna regresija 4971 = isti niz kot CI; obe produkciji sta zdravi na
1.170.0 (auto-deploy po pushu).
