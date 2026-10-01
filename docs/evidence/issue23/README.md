# ISSUE #23 — PRODUKCIJSKI DOKAZI (Render 1.163.0)

> Zlata pot vodene plasti dokazana v ŽIVI produkciji
> (https://i-feel-slovenia.onrender.com), mobilni 390×844, agent-browser,
> **0 konzolnih napak, 0 page errorjev** (2026-10-01, verzija 1.163.0).

## Zajeta zlata pot (§38 G1–G10)

| # | Korak | Rezultat | Dokaz |
|---|---|---|---|
| G1 | Nov uporabnik, prvi obisk `/` | First-run kartica: „DOBRODOŠEL V DISCOVER SLOVENIA" + 5 nameri (Načrtujem pot / Odkrij mi Slovenijo / Najdi mi nekaj / Želim pomoč / **Ne vem — pokaži mi**) + „Ne zdaj" — točno na mestu welcome banerja | `prod-01-home-first-run.png` |
| §18 | Klik „Ne vem — pokaži mi" | VODENA POT vklopljena (`dai:guided-tour: 1`) + preusmeritev na /destinacije; `intent_selected{dont_know}` + `first_run_started` izstreljena | (storage dokaz v zapisu seje) |
| G2/G3 | Odpri Bled → „Dodaj v mojo pot" | `dai:my-trip-items` zapisan (kind destination, refId bled); toast z **DWEMA akcijama**: „Odpri pot" (obstoječa) + **„Načrtuj potovanje"** (novi naslednji korak §13) — VLM-potrjen | `prod-03-add-toast.png` |
| G3 | Domov po dodajanju | Vodeni trak: veriga „Odkrij→Načrtuj→Rezerviraj→Na poti→Zaključi", **„Korak 2 od 5"** (aria-current=step), značka **VODENA POT**, sporočilo „Tvoja zbirka ima 1 postanek — naslednji korak je načrt." (pravilna slovenska množina!), primarna [Načrtuj potovanje] + sekundarna [Odkrij destinacije] + dismiss | `prod-02-home-building-tour.png` |
| G3 | /moja-potovanja (hub) | Chain indikator „Napredek poti" v glavi razdelka Moja pot („Korak 2 od 5") — BREZ novih CTA (obstoječi „Nadaljuj načrtovanje" ostaja primaren — §33) | `prod-04-hub-chain.png` |
| G10 | Vračajoči uporabnik (nova seja/2. obisk) | Welcome banner STANJE-VEDEN: naslov „Tvoja pot je aktivna" + „Nadaljuj, kjer si ostal. [Nadaljuj na poti]" — NE first-run kartica (§19) | `prod-05-returning-banner.png` |
| G8 | /na-poti, zadnji postanek zadnjega dne opravljen | **„POT ZAKLJUČENA — Vsi postanki so opravljeni — čestitamo! 🎉 / 1 dan · 2 opravljenih / Kaj zdaj? Poglej svojo pot, jo deli s prijatelji ali načrtuj novo." + [Moja potovanja] [Načrtuj novo pot]**; shema dneva: ✓ Blejski grad opravljeno, ✓ Soteska Vintgar opravljeno; iskreno BREZ „Odpri shranjeno pot" (priprava brez shareId) | `prod-06-go-complete.png` |
| — | Domov po zaključku poti | Trak COMPLETED: **„Korak 5 od 5"** + „Pot je zaključena — 2 opravljenih, 0 preskočenih." + [Načrtuj novo pot] [Moja potovanja] | `prod-08-home-completed.png` |
| §28 | /en (angleščina) | Trak v EN: „Trip progress · Discover/Plan/Book/On the road/Finish · Step 2 of 5 · GUIDED PATH · Your collection has 1 stop — the next step is a plan. [Plan a trip]" — 6-jezični dokaz (preostali jeziki testno pokriti) | `prod-07-en-strip.png` |

## Dokazne priprave (iskreno)

- **COMPLETED stanje (G8):** `dai:go-trip` (v2, danes 2026-10-01, 2 postanka
  Blejski grad + Soteska Vintgar) + `dai:go-progress` (oba opravljena) sta
  bila pripravljena DIREKTNO v localStorage brskalnika — ENAKA oblika, kot jo
  zapisuje `saveItineraryGoTrip()` (buildItineraryGoView izhod; validacija
  oblike go-persist je zapis sprejela → potrdi skladnost). Namen: dokaz
  terminalnega stanja brez čakanja na celodnevno potovanje. Vsi drugi dokazi
  so nastali z NAVADNIMI uporabniškimi kliki.
- **Returning banner (G10):`visitCount ≥ 2` dosežen z odprtjem novega zavihka
  (sessionStorage števec obiskov je na zavihek — enaka semantika kot nova
  seja brskalnika).

## Meje (iskrene, dokumentirane v GUIDANCE-EVIDENCE.md §4)

- /na-poti ostaja SL/EN (obstoječa whitelist meja #21/#22) — COMPLETED
  kartica ji sledi; trak na domov/hub je 6-jezičen.
- Živi kontekst (NAVIGATING/ARRIVED/FREE_TIME/…) obstaja samo v seji /na-poti
  — trak izven pade na iskreno TRIP_STARTED (namerno, §30).
- Planner save-toast (G6) je source-contract zaklenjen
  (issue23-guidance-ux.test.ts ⑯) — produkcijski posnetek celotne AI
  generacije + shranjevanja izpuščen (časovna zahtevnost; enak vzorec
  dokaza kot #21 za AI odgovore).
