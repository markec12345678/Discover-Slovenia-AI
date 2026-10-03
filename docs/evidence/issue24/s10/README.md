# ISSUE #24 — Sklop 10 (1.172.0): PRILAGODLJIVA GPS NATANČNOST (BATERIJA)

**Datum:** 3. 10. 2026 · **Commit:** `4ab825a` (feat) — CI zelen
**Produkcija:** Render `i-feel-slovenia.onrender.com` **1.172.2** +
Vercel `i-feel-slovenia.vercel.app` **1.172.2** (osvežil se po zaključku
QA; v času dokazovanja 1.172.0 z jedrom funkcije) — obe zdravi, CI zelen.

## Kaj je bilo narejeno (Polarsteps <4 %/dan vzorec — predzadnja vrstica P3)

Go Mode ni več poganjal polnega GPS čipa ves dan:

- **`resolveGpsPowerMode`** (nov čist modul `src/lib/journey/gps-power.ts`):
  daleč od naslednjega postanka (> 2 km) → **varčni način**
  (`enableHighAccuracy: false` — mrežni/wifi približki za razdaljo/smer);
  znotraj 2 km → **polna natančnost** (geofence varnost). Fail-safe:
  neznana razdalja → visoka (neznanje ne varčuje); dan brez odprtega
  postanka → varčno (prihoda ni).
- **Varnostna geometrija** (pogoj P3 »NE sme zlomiti geofence prihodov«):
  prag prihoda ≤ 150 m + histereza 75 m; preklop na »high« je zagotovljen
  že 2 km pred pragom (≈ 5× najširši geofence; pri 50 km/h ~2,4 min
  vožnje za ponovni prijem GPS). Lažni prihod iz grobe fiksacije izključi
  obstoječa 8 s stabilnost: groba fiksacija ≤ 2 km TEGA TRENUTKA preklopi
  način na high — prihod mora nato vzdržati 8 s v natančnih fiksacijah;
  zmoto natančne takoj prevotnejo (iskreno »Približuješ se«).
- **`useGeolocation({ mode })`**: preklop načina med vožnjo PONOVNO ODPRE
  watch z novim `enableHighAccuracy` brez utripanja stanja (status/položaj
  ostaneta — `positionRef` zrcalo; ohranitev statusa živi v `beginWatch` z
  zastavico `keepActiveStatus` — spoštovan pravilu
  react-hooks/set-state-in-effect) in brez ponastavitve proračuna
  ponovitve (preklop ni napaka). Default brez možnosti = »high«
  (kompatibilnost #21).
- **Iskren UI**: čip »varčni GPS« ob statusu (samo kadar je varčni način
  dejaven) + razlaga »natančen GPS se samodejno vklopi, ko se približaš
  naslednjemu postanku« — 6 jezikov (P4-8), preverjeno tudi v EN
  produkciji (»battery-saving GPS« + »precise GPS turns on
  automatically«).
- **Telemetrija `gps_power_mode_changed`** — 3-plastna pariteta; samo ob
  DEJANSKEM preklopu z odprtim zajemanjem; props SAMO `mode` (brez
  razdalje — izpeljana iz lokacije = PII disciplina).

## Produkcijski dokazi (Render 1.172.2 primarno, mobilni 390 px)

### Živi zapis preklopov (watchPosition klici — programski dokaz)

GPS simulacija (override `navigator.geolocation.watchPosition` z beljenjem
vseh klicev + `enableHighAccuracy` vrednosti; testna pot: Vintgar opravljen
→ Vila Prešeren 15:30 → Blejski grad; pozicija 4,3 km od termina):

| Korak | `__gpsCalls` | Dejstvo |
|---|---|---|
| Vklopi GPS (daleč) | `[true, false]` | prvi watch visok (privzeto), RESTART varčno — preklop živi |
| Premik ≤ 2 km (k vstavljenemu postanku) | `[true, false, true]` | SAMODEJNI povratek polne natančnosti |

### Celoten cikel na enem zalonu (Render + Vercel enaka)

1. **Daleč (4,3 km):** status »GPS aktiven · natančnost ±40 m · varčni
   GPS« + namig o samodejnem vklopu; kartica PROSTI ČAS se odpre
   (110 min do termina 15:30 − 29 min rezerve).
2. **Hrana → dodajanje Trohe** (Sklop 9) → premik k Trohi (~10 m):
   čip varčnega načina IZGINE (polna natančnost nazaj), wake lock drži.
3. **Po 8 s stabilnosti: »✓ Prišel si na lokacijo Troha«** — geofence
   prihod deluje SKOZI preklop načinov (ključni pogoj P3) + iskren namig
   »GPS prihod NE potrdi rezervacije«.
4. **0 page errors · 0 konzolnih napak · scrollWidth = 390** po vseh
   korakih.

### EN (Render, /en/na-poti)

- čip **»battery-saving GPS«** + namig **»precise GPS turns on
  automatically as you approach the next stop«** (faza 2 prevodi živi).
- (Kartica prostega časa v EN toku ni bila ponovno odprta — okno je bilo
  že porabljeno z dodajanjem iz SL toka; EN oznake FREE TIME so pokrite z
  strukturnimi testi S8.)

### Vercel (sekundarna, 1.172.0)

- Enak cikel: `[true,false]` → čip → okno → dodajanje → premik →
  `[true,false,true]` → prihod »✓ Prišel si na lokacijo Troha«
  (`vercel-prihod-390.png`); 0 napak.

## Regresija

- **Testi:** 5.022 pass + 1 znana sandbox DB napaka (issue7-g11 ④ — CI s
  Postgresom zelen).
- **Nov test:** `issue24-s10-gps-power.test.ts` (25 testov): resolucija ×5
  (mejni primeri: 2.000 m inkluzivno, 2.001 m varčno, neznana → high,
  brez postanka → balanced), varnostna geometrija ×4 (prekrivanje geofenca
  ≥ 5×, 8 s stabilnost + pragi zaklenjeni, matematika izključitve lažnega
  prihoda), source contract use-geolocation ×5 (modeRef, restart brez
  brisanja položaja, proračun ponovitve nedotaknjen, default high,
  kanonske možnosti), source contract go-mode ×4, telemetrija ×2 (samo
  preklop + brez PII), 3-plastna pariteta ×3, oznake ×2 (6 jezikov,
  lastni prevodi).
- lint 0 · tsc 0.

## Posnetki

- `gps-varcni-dalec-390.png` — GPS plošča daleč stran: status + ±40 m +
  čip »varčni GPS« + namig (SL).
- `prihod-po-preklopu-390.png` — NASLEDNJE po prihodu: »✓ Prišel si na
  lokacijo Troha« skozi cikel preklopov (Render).
- `gps-balanced-en-390.png` — EN čip »battery-saving GPS« (/en/na-poti).
- `vercel-prihod-390.png` — prihod na Vercelu (sekundarna produkcija).

## Iskrene meje (dokumentirano v CHANGELOG)

- Prihranek baterije je ODVISEN od naprave/brskalnika (mrežno
  pozicioniranje na navidečih lokacijah QA ne more izmeriti v % —
  dokazano je VEDENJE preklopov, ne poraba); resnični prihranek bo pokazal
  telemetrija `gps_power_mode_changed` v produkciji.
- Deljeni GPS (vožnja s souporabniki) ni pokrit — izven obsega #24.
