# BASELINE-VISUAL — FAZA B (issue #19) — izhodiščno vizualno stanje

> **Namen:** GitHub issue #19 »DISCOVER — Premium Product Presentation & 100 % Feature
> Preservation«, FAZA B — BASELINE: zapis izhodiščnega vizualnega/funkcionalnega stanja
> + DEJANSKI problemi (pravilo #19: »Do not invent problems that are not present in the
> code or visible product« — vsak zapis spodaj je PREVERJEN v DOM ali v kodi).
>
> **Baseline:** HEAD `e92b8de`, verzija **1.153.2** ŽIVA (Vercel dpl_2dLhCTYM).
> Preverjanje: agent-browser (DOM-diagnostika) na dev strežniku + produkciji,
> screenshot BEFORE dokazi `qh19-baseline/` (5 PNG), VLM analiza domače strani
> (vsaka ugotovitev triažirana: REALNA vs ARTEFAKT).

---

## 1. PREVERJENO ČISTO (struktura/funkcija — ni kaj popravljati)

| Preverba | Rezultat | Metoda |
|---|---|---|
| Horizontalni overflow @ 320px | **0/7 ploskev** (`/`, `/destinacije`, `/destinacija/bled`, `/moja-potovanja`, `/nacrtuj`, `/zemljevid`, `/na-poti`) | DOM: `scrollWidth vs innerWidth` |
| Horizontalni overflow @ 1280px | **0/5 ploskev** | isto |
| Rezano besedilo (clip) | **0** (h1–h4/p/span/a/button brez overflow:hidden) | DOM-diagnostika |
| Dotikalne tarče < 40px | **0** interaktivnih | DOM-diagnostika |
| Slike brez `alt` | **0** (zgodnejša »×2« je bila artefakt Chrome neterror strani — potrjeno) | DOM + re-test na zdravi seji |
| Slike na karticah | **REALNE fotografije** (`/content/*.jpg`, next/image, 95–270KB, produkcija 200) — »sivi placeholderji« iz VLM analize so ARTEFAKT lazy-loada pri full-page screenshot steganju | `ls public/content/` + curl prod |
| Hero berljivost | **3-plastni kinematografski overlay** (`.hero-overlay` v globals.css) + `drop-shadow` na naslovu/opisu/badgu — VLM sum o kontrastu je v kodi že pokrit (eventualno blaga refinanca v svetlih delih neba) | branje hero.tsx |
| A11y / jeziki / LCP/CLS | iz prejšnjih valov: w5-a11y-modes testi zeleni, 6/6 jezikov 200, hreflang ×6, Lighthouse vrata (1.140.1 CLS / 1.140.2 LCP) | suite + docs |

**Sklep:** izdelek je STRUKTURNO zelo čist. FAZA C se torej osredotoči na
PREZENTACIJSKI jezik (hierarhija, gostota, elevation, ritam), ne na odpravljanje
lomov — teh ni.

## 2. DEJANSKI kandidati za FAZO C (presentation refinements)

Vsi spodaj so REALNI opaženi vzorci (VLM + DOM + kode), ki ne lomijo funkcije
so pa vpadaji »premium« občutka. Urejeni po vplivu:

1. **CTA hierarhija / prominence (visok vpliv).** Primarni gumbi (npr. Hero
   »Sestavi mojo pot«) so barvno pravilni, a brez izrazite elevacije/robe —
   nimajo »pop« ločitve od fotografije; sekundarne akcije na karticah
   (»Nadaljuj«, »Podrobnosti«) so kompaktne in iskalne, ne vodilne.
   → cilj: enoten CTA scale (primarni z elevacijo, sekundarni outline,
   terciarni ghost) po vsej aplikaciji.
2. **Konzistentnost elevation/sence (srednji).** Mešanica plavajočih
   elementov (iskalnik) in povsem ravnih kartic; hover lift je na delu
   površin (`hover:shadow-lg`), na delu ne.
   → cilj: enotna 3-stopenjska lestvica senc (card / raised / overlay).
3. **Tipografska hierarhija (srednji).** Podnaslovi sekcij so dosledno
   `text-muted-foreground`, a v svetlih kontekstih prenizka kontrastnost
   (berejo se kot metapodatki); teže naslovov kartic niso popolnoma
   uniformne.
   → cilj: poenotena teža velikosti naslovov kartic +Subtitle barva z
   višjim kontrastom tam, kjer nosi vsebino.
4. **Gostota kartic / scanability (srednji).** Nekatere kartice nosijo veliko
   majhnih elementov (žetoni, ikonice, opisi) — oko ne ve, kje je glavna
   akcija.
   → cilj: progresivno razkrivanje metapodatkov (glavni: slika → naslov →
   1 vrstica meta → CTA; ostalo v modal/expand).
5. **Ritam sekcij (nizek/srednji).** Vertikalni razmiki med sekcijami
   domače strani niso popolnoma uniformni (del »praznine« je bil artefakt
   screenshotanja, a nekaj neenotnosti je realne).
   → cilj: enoten section-rhythm scale.
6. **Barvni ton (nizek, SUBJEKTIVEN).** VLM predlaga bolj zemeljske tone
   namesto »generične zelene«. NE spreminjamo brez izrecnega lastnikovega
   mandata (sistemski zelena je skozi celoten product + branding; sprememba
   palette je visoko tvegana za regresijo vizualne konsistentnosti).

## 3. Artefakti, ZAVRNJENI kot problemi (dokumentirano, da jih FAZA C ne lovi)

- »Sivi placeholderji slik« — lazy-load med full-page screenshot steganjem;
  kartice uporabljajo realne fotografije (preverjeno).
- »Velika praznina med sekcijami« — pretežno screenshot scroll-stitch
  artefakt; DOM pregled strukturo sekcij pokaže povezano (re vpogled v #2.5).
- »2 sliki brez alt na vsaki strani« — sliki Chrome neterror strani med
  okno, ko je dev strežnik hladen; na zdravi seji 0.

## 4. BEFORE dokazi (screenshot)

- `qh19-baseline/before-home-desktop-1280.png`
- `qh19-baseline/before-home-mobile-320.png`
- `qh19-baseline/before-planner-desktop-1280.png`
- `qh19-baseline/before-mytrip-desktop-1280.png`
- `qh19-baseline/before-gomode-desktop-1280.png`

(Produkcija 1.153.2 — ista koda kot HEAD; zajeto 30. 9. 2026 zvečer.)

## 5. Naslednji korak — FAZA C

Implementacija največjega učinka po vrstnem redu iz §2 (1 → 5), po celotni
aplikaciji (ne le domača stran), z varovalkami: FUNCTION-PARITY-BEFORE.md je
pogodba (0 izgub), po vsaki koherentni množici sprememb FAZA D regresija
(suite/tsc/lint/E2E + zlata pot), FAZA E responsive (320 hard gate ostaja),
FAZA F FUNCTION-PARITY-AFTER.md.

## 6. DODATEK (FAZA C, 30. 9. 2026 zvečer) — DOM-meritve gostote/ritma

Po zaključenih C-1 (CTA + elevacija) in C-2 (tipografija) sem izmeril
preostala dva kandidata §2 (pravilo #19: samo izmerjeno gre v implementacijo):

**§2.4 Gostota kartic — OVREGENO z meritvijo.** Kartice na `/` (destinacije,
zbirke, izkušnje): 4 vizualne vrstice, 1–3 badgeov, 1–3 gumbov — zdrava
gostota. Koda že ima progresivno razkrivanje iz prejšnjih valov (compact
meta pas, specialties cap 2–3, `+X` badge za skrite destinacije v
community-trips, demoted akcije). NILO popravkov.

**§2.5 Ritam sekcij — izmerjeno, 1 realni popravek.** Kanonski ritem = py-20
(80/80), 8/12 glavnih sekcij sekcij ga drži. Izjeme z namernim designom:
Hero (special, nav overlap), HomeEntryRow (32/32 kompakten vstopni pas
D8-B), `<details>` pasovi (0/0, declutter D8-F). **Edini outlayer brez
namena: DemoScenarios py-12 (48)** — zastrikalo tok 80→48→80 med Stats in
Affiliate → popravljen na py-20 (1.155.1).

**Merilni artefakt (dokumentiran, da ga prihodnji auditi ne lovi):**
»negativne vrzeli −24px« med sekcijami v getBoundingClientRect so
framer-motion `Reveal` inicialni `y: 24` transform za sekcije, ki še niso
scrollane v pogled — NI realnega prekrivanja (po animaciji transform → 0).

**Radij (§3 issueja):** distribucija lg(304)/full(288)/md(207)/xl(82)/2xl(33)
je zdrava hierarhija (kontrole → kartice → paneli → velike površine) — brez
sprememb. **Stanja (§3):** kanonska družina `states/` (loading/empty/error,
TASK 8 / F3-B) + 12+ površin + testne varovalke; ročni nizi so v
sankcioniranem L-pattern slovarju — brez sprememb.
