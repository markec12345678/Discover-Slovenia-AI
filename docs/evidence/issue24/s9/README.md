# ISSUE #24 — Sklop 9 (1.171.0 + 1.172.1/2): NEARBY DODAJANJE SREDI DNEVA

**Datum:** 3. 10. 2026 · **Commit:** `07b0337` (Sklop 9) + `844649b` (1.172.1
UX popravka) + `d18c33a` (1.172.2 preliv regresija)
**Produkcija:** Render `i-feel-slovenia.onrender.com` **1.172.2** (končna) +
Vercel `i-feel-slovenia.vercel.app` 1.172.0 (jedro — popravki 1.172.1/2 sta
dokazana na Renderu; Vercel deploy z zamikom, glej opombo). CI zelen na
vseh treh (`07b0337`, `844649b`, `d18c33a`).

## Kaj je bilo narejeno (TripIt Nearby vzorec — zadnja vrstica P3 tabele)

Prej je kandidat iz PROSTEGA ČASOVNEGA OKNA pristal **na koncu dneva** — po
vseh še odprtih postankih (in večerji), čeprav ga uporabnik obišče ZDAJ, v
oknu pred terminom. Zdaj:

- `addNearbyStopToRecord` dobi `beforeKey` (ključ naslednjega postanka iz
  `view.next`) → **ČIST VSTAVEK pred naslednji postanek**:
  `[a, b, c]` + pred `b` → `[a, nearby, b, c]`;
- **ZERO reordering ostaja kanon** — obstoječi vrstni red se ne dotakne
  (vstavek ≠ preurejanje); stabilen ključ `nearby:{id}` + `savedAt`;
- **iskren fallback**: `beforeKey`, ki ni v dnevu (npr. naslednji postanek
  v drugem dnevu / dan brez postankov) → pošteno konec dneva (staro
  vedenje, kompatibilnost);
- **sporočilo sledi DEJANSKEMU položaju**: sredina → »✓ … dodan pred
  naslednji postanek.« (6 jezikov — `GO_EDIT_LABELS.addedMid`), konec →
  nespremenjeno sporočilo;
- **varnost okna OSTAJA** (§9/§10): zanka (vožnja tam + obisk + vožnja do
  termina) ≤ okno − rezerva je preverjena v `filterNearbyCandidates` PRED
  dodajanjem; `DEFAULT_FREE_TIME_CONFIG` testno zaklenjen;
- **telemetrija `nearby_stop_added`** — 3-plastna pariteta (klientni union +
  strežniški VALID_EVENTS + docs/ANALYTICS-EVENTS.md); props SAMO
  `position` (`mid`/`end`) — brez PII.

### Popravki iz QA (1.172.1 + 1.172.2)

1. **Potrditev ne izgine več s kartico** (1.172.1): po uspešnem dodajanju
   kandidat brez termina postane naslednji postanek → meje ni → kartica
   prostega časa se iskreno umakne — sporočilo pa je do popravka izginilo
   SKUPAJ z njo. Zdaj živi kot samostojna vrstica (`role="status"` +
   `aria-live="polite"`), vezana na okno nastanka (`nearbyNoteKey`).
2. **4+ postankov NE razširijo strani** (1.172.2): sr-only stanja sheme
   dneva (`position:absolute` brez pozicioniranega prednika) so pri 4.
   postanku razširila `documentElement.scrollWidth` na **462 > 390** —
   popravek: `relative` na stolpcu postanka (containing block = scroll
   zabojnik). Latentna napaka od TASK 102, ki jo vstavek prikaže.

## Produkcijski dokazi (Render 1.172.2 primarno, mobilni 390 px)

### Zlata pot (agent-browser, realni kliki, GPS simulacija z beleženjem)

Testni zapis (v2, današnji dan): Soteska Vintgar (opravljeno) →
**Restavracija Vila Prešeren 15:30** (fiksni termin) → Blejski grad;
GPS 4,3 km stran od termina.

1. **Kartica PROSTI ČAS se odpre** z dejanskimi številkami: »Imaš
   približno 110 min prostega časa · do naslednje rezervacije ob 15:30« +
   »Prihranili smo 29 min varnostne rezerve« (formula 15 + 10 % živa).
2. **Hrana → 4 varni kandidati** (Troha, Devil Caffe & Bar, Irish Pub …),
   vsak z zanko: »5 min tja · 60 min obiska · ~4,2 km« (zanka ≤ okno).
3. **[+ V mojo pot] na prvem kandidatu →**
   - potrditev: **»✓ Troha dodan pred naslednji postanek.«** (vidna TUDI
     po umiku kartice — 1.172.1);
   - zapis `dai:go-trip`: `["vintgar", "nearby:4b86cdbc…",
     "villa-preseren", "bled-grad"]` — vstavek NA DRUGEM MESTU, PRED
     terminom (ne na koncu);
   - kartica prostega časa se iskreno umakne (novi naslednji je brez
     termina → meje ni);
   - `documentElement.scrollWidth = 390` (0 preliva tudi pri 4 postankih —
     1.172.2).

### Vercel (sekundarna, 1.172.0 — jedro funkcije)

- Enak cikel: `[true,false]` → čip → okno → Hrana → dodajanje →
  `["vintgar", "nearby:…", "villa-preseren", "bled-grad"]` (identičen
  vrstni red — determinizem) → premik bližje → `[true,false,true]` →
  »✓ Prišel si na lokacijo Troha« (posnetek `vercel-prihod-390.png` v s10).
- 0 page errors, 0 konzolnih napak.

## Regresija

- **Testi:** 5.022 pass + 1 znana sandbox DB napaka (issue7-g11 ④ — CI s
  Postgresom zelen; enaka je bila pred spremembo).
- **Nov test:** `issue24-s9-nearby-midday.test.ts` (26 testov): čisti
  delivec `nearbyInsertIndex` ×4, vstavek sredi dneva ×7 (prvi/sredina/
  zadnji/brez/fallback/drugi dan/iskren vnos), pariteta zavrnitev ×2,
  oznake addedMid ×3 (6 jezikov, lastni prevodi), source contract go-mode
  ×5 (beforeKey + isMid sporočilo + telemetrija brez PII + samostojna
  potrditev + vezava na okno), 3-plastna analitika ×3, zaklenjena
  varnostna konfiguracija, **⑧ preliv regresija** (`relative` na stolpcu
  sheme dneva).
- lint 0 · tsc 0.

## Posnetki

- `prost-cas-kandidati-390.png` — kartica prostega časa s kandidati
  (Hrana; zanke + varnostna rezerva razkrite).
- `potrditev-vstavka-390.png` — zelena potrditev »✓ Troha dodan pred
  naslednji postanek.« po umiku kartice (1.172.1) — VLM preverjena.
- `shema-dneva-4-postanki-390.png` — shema dneva s 4 postanki (Vintgar
  opravljen → Troha trenutni → Vila Prešeren prihodnji → Blejski grad),
  0 preliva (390 px).

## Iskrena opomba

Ob zaključku QA je bil Vercel še na 1.172.0 (jedro obeh sklopov že vseboval;
popravka sta bila dokazana na Renderu 1.172.2) — znana zamuda brezplačnega
paketa, enako kot Sklop 5/6/8 QA. Kasneje istega dne se je Vercel osvežil na
**1.172.2** (health preverjen).
