# Issue #24 — Sklop 5: Poštena delitev stroškov med potnike (1.167.0)

**Datum QA:** 2. 10. 2026 · **Produkcija:** Render (`i-feel-slovenia.onrender.com`, primarna) + Vercel (`i-feel-slovenia.vercel.app`) · **Oba na 1.168.0**

Načrt QA: `Bled, soteska Vintgar in Bohinj` (deterministični motor, 3 dnevi, skupina 2) → plošča »Podrobnosti izračunov« → razdelek **Razdelitev na osebo**.

## Posnetki

| Datoteka | Vsebina |
| --- | --- |
| `01-split-2-potnika.png` | Render: 3-vrstična poštena delitev pri 2 potnikih (270 + 36 = 306 €) |
| `02-split-4-potniki.png` | Render: koračnik na 4 (270 + 18 = 288 €) |
| `03-split-1-potnik.png` | Render: 1 potnik — identiteta (270 + 71 = 341 € = skupaj načrta) |
| `04-razlaga-delitve.png` | Render: razkrivalno besedilo ZAKAJ se vstopnine ne delijo, vožnja pa |
| `05-ev-delitev.png` | Render: interakcija s Sklopom 4 — EV 54 € ÷ 2 = 27 € |
| `06-en-split.png` | Render /en/nacrtuj: »Split per person« z enakimi številkami |
| `07-vercel-split.png` | Vercel: ista zlata pot — identične številke (determinizem) |

## Meritve (14)

1. **N=2:** Atrakcije (tvoji vstopniki — niso deljeni) **270 €** + Vožnja ÷ 2 potnika **36 €** → Skupaj na osebo **306 €** (71 ÷ 2 = 35,5 → 36).
2. **Iskrenostna razlika:** stara delitev F6.2 bi pokazala 341 ÷ 2 = **170,50 €/osebo** (zanižala pravi strošek posameznika za 135 €) — ta vrednost na strani **NE obstaja več**.
3. **N=4:** 270 € + 18 € (71 ÷ 4 = 17,75 → 18) = **288 €**.
4. **N=3:** 270 € + 24 € (71 ÷ 3 = 23,67 → 24) = **294 €**.
5. **N=1:** 270 € + **71 €** (nedeljeno) = **341 €** = vrstica »Skupaj (načrt)« — identiteta pri enem potniku.
6. **Persistanca:** `localStorage.dsa_budget_travelers = "3"` po koračniku (useSyncExternalStore; strežniški snapshot null = hidracijsko varen).
7. **Vozilo (Sklop 4) interakcija:** EV → vožnja 54 € ÷ 2 = **27 €/osebo**, atrakcije nespremenjene 270 €, skupaj 297 €; vrnitev na bencin → 36 €.
8. **Namig kartice kvalitete:** »· ≈ 36 €/osebo« ob vožnji pri >1 potniku (ista čista funkcija = usklajene številke obeh površin).
9. **Razlaga delitve (disclosure):** »cene atrakcij so že na osebo (vsak plača svoje vstopnike — NE delimo), strošek avta (gorivo/elektrika + vinjeta) pa je skupen in se deli med vse 2 potnike.«
10. **Angleščina** (/en/nacrtuj): »Activities (your own tickets — not shared) €270 + Driving ÷ 2 travelers (shared car cost) €36 = Total per person €306« — stanje načrta preživi preklop jezika.
11. **Dostopnost:** `[role=group aria-label="Potniki v avtu"]`, gumba `Manj oseb`/`Več oseb`, števec v aria-live; radiogroup vozila nedotaknjen.
12. **Mehja 12:** MAX_CAR_SHARERS (koračnik 1–12; defenzivne varovala v `splitTripCostsPerPerson` — testno zaklenjeno).
13. **Vercel:** ista zlata pot → identične številke 270/36/306 (deterministični motor).
14. **Napake:** 0 napak strani in 0 napak konzole na Render (/nacrtuj, /en/nacrtuj) in Vercel (/nacrtuj).

## Sklep

Poštena delitev je **živa na obe produkcijski okolji** z matematično točnimi vrednostmi pri 1/2/3/4 potnikih, persistirano preferenco, razlago v obeh jezikih in ohranjenim izbirnikom vrste vozila (Sklop 4). Vstopnine se NE delijo, vožnja (gorivo/elektrika + vinjeta) se deli — popravljena iskrenostna napaka F6.2.
