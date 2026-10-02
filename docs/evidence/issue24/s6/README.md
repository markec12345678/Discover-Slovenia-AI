# Issue #24 — Sklop 6: PDF povzetek poti — tiskana platnica »travel book lite« (1.168.0)

**Datum QA:** 2. 10. 2026 · **Produkcija:** Render (`i-feel-slovenia.onrender.com`, primarna) + Vercel (`i-feel-slovenia.vercel.app`) · **Oba na 1.168.0**

Načrt QA: shranjena pot `/pot/7c18f6db32` (AI načrt potovanja po Sloveniji, 3 dnevi / 6 postankov, ustvarjena 2. 10. 2026) → gumb **Natisni / Shrani kot PDF** → brskalniški izvoz (Playwright `page.pdf` uporablja print media).

## Posnetki in dokumenti

| Datoteka | Vsebina |
| --- | --- |
| `01-screen-full.png` | Render: celotna stran na zaslonu (platnica skrita — `hidden print:block`) |
| `02-print-render.pdf` | **Render: dejanski 7-stranski tiskani PDF** s platnico |
| `03-mobile-390.png` | Render: mobilni 390 px — 0 prelivanja |
| `04-print-button.png` | Render: gumb »Natisni / Shrani kot PDF« v heroju |
| `05-print-vercel.pdf` | Vercel: PDF izvoz — platnica na vrhu, isti podatki |

## Meritve (14)

1. **Platnica v DOM (Render):** `print:block` blok z živimi podatki: znamka »DISCOVER SLOVENIA AI«, naslov »AI načrt potovanja po Sloveniji«, vir »Načrt brez AI (deterministični motor)«, »Načrt ustvarjen 2. oktobra 2026«.
2. **Ploščice statistike:** **3 dnevi**, **6 postankov**, **≈ €270 ocene vstopnin** — fail-closed izpusti (neznane vrednosti se ne napišejo).
3. **7 strani PDF (Render):** platnica na 1. strani na vrhu → »Načrt po dnevih« (Dan 1 JUTRO/POPOLDAN …) → vodnik → pakirni seznam → prazen dnevnik → QR/URL noga.
4. **Hero BREZ duplikata:** značke + naslov + žetoni heroja so v tisku skriti (`.pot-page .shared-hero` print CSS; embed zaščiten — scope varuje prikaz v embed načinu).
5. **Upravljalni UI ODSOTEN v PDF:** `Uredi pot`/`Zamenjaj`/`Sodelovanje`/`Rezervacije (kartica)`/`Dokumenti`/`Opomniki`/`Dodaj strošek`/`Dodaj v mojo pot`/`Kopiraj povezavo` = **0 zadetkov** v celotnem PDF.
6. **`print:hidden`:** 31 pojavitev v SSR HTML / 25 v klientnem DOM (upravljalne karte: sodelovanje, rezervacije, proračun, dokumenti, opomniki).
7. **Edini »Proračun« zadetek** v PDF = »Proračun potovanja (ocena)« — **vsebinski sklop načrta** (preverjeno: brez `print:hidden` v predništvu, natisnjen po zasnovi); gumb »Dodaj strošek« iz kartice pa je skrit.
8. **Dnevnik spominov:** »Dnevnik je še prazen — zapiši prvi spomin …« + razlaga: »natisnite stran (gumb zgoraj) — dnevnik je del PDF-ja, vaša papirnata spominska knjiga. Zavestno brez fotografij.«
9. **Noga PDF:** »Izvoženo z Discover Slovenia AI · https://…/pot/7c18f6db32« + »Skeniraj za odpiranje na telefonu« (QR koda).
10. **Dvojna izvozna kanala ločena:** strežniški PDF izvoz (»Prenesi PDF«, A4 večstranski, pdf-lib) ostaja nedotaknjen; nov brskalniški tisk (print CSS) ne podvaja kanalov.
11. **Mobilni 390 px:** `document.documentElement.scrollWidth = 390` — 0 prelivanja.
12. **Vercel:** platnica v DOM z istimi podatki; PDF izvoz — platnica na vrhu (mrzli zagon ~87 s je znan artefakt brezplačnega paketa, po ogretju 1,4 s).
13. **Razpoložljivost gumba:** »Natisni / Shrani kot PDF« prisoten v heroju (ob »Prenesi PDF«).
14. **Napake:** 0 napak strani in 0 napak konzole na Render in Vercel (skupaj 3 obiskane poti + 2 PDF izvoza).

## Sklep

Tiskana »knjiga potovanja« je **živa na obe produkcijski okoliji**: »Natisni / Shrani kot PDF« izpljune čist 7-stranski dokument s platnico (ime/vir/datumi/statistika), načrtom po dnevih, vodnikom, dnevnikom spominov in QR/URL nogico — brez upravljalnih gumbov, brez duplikata naslova, z varovanim embed načinom.
