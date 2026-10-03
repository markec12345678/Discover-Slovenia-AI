# POLIRNI KROG 1.173.0–1.173.4: QA obhod žive aplikacije → 6 produkcijskih popravkov

**Datum:** 3. 10. 2026 · **Commiti:** `d1eb184` (1.173.0) → `e51d14a`
(1.173.1) → `cfde199` (1.173.2) → `7de46e6` (1.173.3) → `2bf45ba`
(1.173.4) · **Produkcija:** Render `i-feel-slovenia.onrender.com`
**1.173.4** (health ok, startup 16:11 UTC) + Vercel 1.173.3 (jedro —
znani zamik deploya; health ok). CI zelen na `2bf45ba`
([Run 37135712059](https://github.com/markec12345678/Discover-Slovenia-AI/actions/runs/37135712059)).
Regresija: **5.046 pass** (+24 v krogu), lint 0, tsc 0.

## Kaj je bil krog (odgovor na naročilo »raziskuj, analiziraj, poliraj«)

Sistematičen QA obhod žive aplikacije (agent-browser, mobilni 390×844 +
desktop) je odkril 2 KRIPTIČNA mobilna hrošča in 4 manjše izboljšave —
vse rešene v 5 podverzijah istega dne (3-plastna konsistentnost po vsaki):

| # | Odkritje QA | Popravek | Verzija |
|---|---|---|---|
| 1 | Mobilni Sheet (Več): klik na jezikovni preklopnik oz. dostopnostne nastavitve je ZAPRL Sheet — Radix dropdown se portalira IZVEN Sheet vsebine → outside-interaction handler zapre Sheet PREJ. Uporabnik na mobilnem NI MOGEL preklopiti jezika / vklopiti visokega kontrasta! | INLINE vrstica `LanguageSheetRow` + INLINE `A11ySheetSection` v telesu Sheet (1 klik namesto 2, vsi jeziki vidni, tipke ≥44 px, deljeno jedro `useLanguageOptions`/`useA11ySwitchState`) | 1.173.0 |
| 2 | Katalog → destinacije: 38 hub strani (`/destinacija/[slug]` ×5 podstrani) je bilo iz kataloga NEDOSEGLJIVIH — kartice so odpirale samo modal, ta pa vezal SAMO affiliate partnerje (0 internih povezav) | Kartica: kompaktna povezava »Vodnik →« (pravi `<Link>`) + modal: »Odpri celoten vodnik: {name}« (×6 jezikov) | 1.173.0 |
| 3 | SL slovar je mešal vikanje (~100 nizov: »Vaš 3-dnevni itinerer« …) s prevladujočim tikanjem; DE/IT/ES so vsi neformalni | Tikanje poenoteno (95+3 messages + 11 komponent + 61 fragmentov); TRAJNA varovalka tona v testu (Unicode-zaveden detektor); NAMERNO izvzeto: privacy/terms + B2B površine (formalni register) | 1.173.0 |
| 4 | 404 naslov zavihka je ostal generičen | Deklarativen naslov »404 — Te strani (še) ni na zemljevidu \| …« (dvojezično) — 3 iteracije po QA odkritjih (metadata plast je prepisovala klientski efekt → deklarativen `<title>` ZA layoutovim brskalnik bere prvega → MutationObserver dokončno) | 1.173.1–1.173.3 |
| 5 | 404 izhoda: klik »Nazaj na začetek« je posodobil URL, a 404 vsebina je OSTALA (mehka navigacija iz not-found meje ni zamenjala pogleda) | Izhoda sta edini nalogi strani → navadna `<a>` (trda navigacija, poln SSR vstop) | 1.173.4 |
| 6 | `SITE_DESCRIPTION` vikanje + napačna številka destinacij (22/Piran namesto 38/Saranda); Radix opozorilo v Sheet | Popravljeno ob napredovanju | 1.173.1 |

## Posnetki (Render 1.173.4, mobilni 390×844)

- `prod-01-mobile-home.png` — mobilna naslovnica po popravkih (0 preliva)
- `prod-02-sheet-language-row.png` — INLINE jezikovna vrstica v Sheetu (vsa
  3 javna jezika + SL so vidna naenkrat, brez vdrtih dropdownov)
- `prod-03-sheet-a11y-contrast.png` — INLINE dostopnostne nastavitve
  (visok kontrast VKLOPLJEN v Sheetu — prej nemogoče na mobilnem)
- `prod-04-catalog-guide-links.png` — katalog kartice z novo povezavo
  »Vodnik →« (interna pot do hub strani, ne samo modal)
- `prod-05-modal-guide-link.png` — modal z zaključno povezavo
  »Odpri celoten vodnik«
- `prod-06-404-title.png` → `prod-06-404-title-final.png` — 404 naslov po
  iteracijah (končni dokaz: zavihek »404 — Te strani (še) ni na zemljevidu \| Discover Slovenia AI«)
- `prod-07-404-exits-en.png` — 404 stran z obema izhodoma (trda navigacija)

## Končna QA 1.173.4 na produkciji (3. 10., Render)

- `/ta-stran-ne-obstaja-qa-1734`: naslov »404 — Te strani (še) ni na
  zemljevidu \| Discover Slovenia AI« ✓
- Izhod »Nazaj na začetek« → TRDA navigacija na `/` (naslov domov
  »Discover Slovenia AI — AI načrtovalec potovanj«, poln layout) ✓
- Izhod »Načrtuj potovanje« → TRDA navigacija na `/nacrtuj`
  (»Načrtovalec potovanj — Slovenija«) ✓
- `/en/destinacija/nekaj-neobstojeca` → OSTANE na `/en` + ANGLEŠKA 404
  (»404 — This page is not on the map yet«) ✓ (whitelisted pot)
- `/en/<nedovoljena-pot>` → 308 na slovensko pot s slovensko 404 —
  NAMERNI kanon P4-8 (nikoli mešanja jezikov; `routing.ts` dokumentirano) ✓
- 0 page errorjev, 0 konzolnih napak, 0 preliva (390/390)

## Testna varovalka

`src/lib/__tests__/polish-1-173-0-round.test.ts` — **22 testov**: Sheet
inline source contract (vrstici v Sheetu, dropdowna SAMO v headerju,
deljeno jedro, ≥44 px, aria-current) + trajna varovalka tona (detektor
vikanja nad B2C slovarjem) + 404 naslov + izhoda brez `next/link`
(varovalka proti regresiji mehke navigacije).
