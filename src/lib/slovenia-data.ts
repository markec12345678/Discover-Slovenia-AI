import type { CountryCode, Destination } from "./types";

// Single source of truth za destinacije platforme.
// 22 slovenskih destinacij (pokriva vse regije) + 16 destinacij zahodnega
// Balkana (TASK 62: HR/ME/AL — isto shemo, ista iskrenost).
// SLIKE: `/content/*.jpg` so AI-generirane (z-ai image generation, sept 2026)
// po VLM auditu — stara CDN slika za Dravograd je prikazovala turkizno reko
// v gozdnati dolini (Soča-style) namesto mesta ob sotočju treh rek. Nova slika
// je narejena iz opisa, VLM potrjeno ujemanje 9/10. Brez atribucije (AI, ne CC).
// Regionalne slike (TASK 62): enaka konvencija — AI-generirane, VLM
// spot-audit 3/3 PASS (dubrovnik/berat/durmitor), glej blok TASK 62 spodaj.
export const DESTINATIONS: Destination[] = [
  {
    id: "bled",
    country: "SI",
    slug: "bled",
    name: "Bled",
    tagline: "Biser Alp s srednjeveškim gradom in otokom",
    region: "gorenjska",
    type: "lake",
    description:
      "Blejsko jezero s svojim edinstvenim otokom, na katerem stoji cerkev z zvonikom, je najbolj prepoznavna slovenska razglednica. Srednjeveški grad na pečini ponuja panoramske poglede, Vintgarska soteska pa kratek sprehod skozi apnenec ob umirjeni reki. Kremšnita v slaščičarni ob jezeru je obvezen sladki greh.",
    highlights: ["Blejski otok", "Blejski grad", "Vintgarska soteska", "Kremšnita"],
    activities: ["Pletna vožnja do otoka", "Obisk gradu", "Sprehod po soteski", "Plavanje"],
    bestFor: ["romantika", "družina", "fotografija"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/bled.jpg",
    coords: { lat: 46.3683, lng: 14.0944 },
    rating: 4.8,
    budget: "€€",
    duration: "1-2 dni",
    costPerPerson: 25,
    featured: true,
  },
  {
    id: "bohinj",
    country: "SI",
    slug: "bohinj",
    name: "Bohinj",
    tagline: "Divja, nedotaknjena lepota Triglavskega narodnega parka",
    region: "gorenjska",
    type: "lake",
    description:
      "Bohinjsko jezero je večji in bolj divji brat Blejskega jezera, znotraj Triglavskega narodnega parka. Žičnica Vogel ponuja panoramske poglede na Julijce, slap Savica pa je kratek pohod skozi gozd. Idealno za tiste, ki iščejo mir in aktivno naravo.",
    highlights: ["Bohinjsko jezero", "Vogel", "Slap Savica", "Triglavski narodni park"],
    activities: ["Pohodništvo", "Smučanje", "Kajakaštvo", "Žičnica Vogel"],
    bestFor: ["narava", "aktivnosti", "mir"],
    bestSeason: ["spring", "summer", "autumn", "winter"],
    image: "/content/bohinj.jpg",
    coords: { lat: 46.2833, lng: 13.8833 },
    rating: 4.7,
    budget: "€",
    duration: "1-2 dni",
    costPerPerson: 15,
    featured: true,
  },
  {
    id: "ljubljana",
    country: "SI",
    slug: "ljubljana",
    name: "Ljubljana",
    tagline: "Zelena, ustvarjalna prestolnica z zmajevim mostom",
    region: "osrednja",
    type: "city",
    description:
      "Ljubljana je majhna, a živahna prestolnica, kjer se mešata srednjeveška arhitektura in sodobna kulinarična scena. Ljubljanski grad nudi panoramski pogled, Prešernov trg z zmajevim mostom je srce mesta, ob Ljubljanici pa se odvija kava in klepet.",
    highlights: ["Ljubljanski grad", "Zmajev most", "Prešernov trg", "Tivoli park"],
    activities: ["Obisk gradu", "Sprehod po starem mestu", "Kulinarična tura", "Kolo ob Ljubljanici"],
    bestFor: ["kultura", "hrana", "mesto"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/ljubljana.jpg",
    coords: { lat: 46.0569, lng: 14.5058 },
    rating: 4.6,
    budget: "€",
    duration: "2 dni",
    costPerPerson: 20,
    featured: true,
  },
  {
    id: "postojna",
    country: "SI",
    slug: "postojnska-jama",
    name: "Postojnska jama",
    tagline: "24 km podzemnih rovov in vilinsko kraljestvo kapnikov",
    region: "kras",
    type: "cave",
    description:
      "Postojnska jama je največji turistični jamski sistem v Evropi z edinstvenim podzemnim vlakcem. V njej bivala tudi človeška ribica — endemit, ki je navdihnil legende o zmajevih mladičih. Predjamski grad, vklesan v 123-metrsko pečino, je le 9 km stran.",
    highlights: ["Podzemno vlakec", "Kapniki", "Človeška ribica", "Predjamski grad"],
    activities: ["Jamska tura z vlakcem", "Obisk Predjamskega gradu", "Fotografija"],
    bestFor: ["družina", "avantura", "narava"],
    bestSeason: ["spring", "summer", "autumn", "winter"],
    image: "/content/postojnska-jama.jpg",
    coords: { lat: 45.7845, lng: 14.2045 },
    rating: 4.7,
    budget: "€€",
    duration: "1 dan",
    costPerPerson: 30,
    featured: true,
    // F5.5: uradna stran — »Vedno odprto. Postojnska jama je odprta vse dni
    // v letu, tudi ob nedeljah, praznikih in tudi v slabem vremenu.« ( vir:
    // postojnska-jama.eu, preverjeno 2026-09). Vodeni ogledi čez dan; pozimi
    // redkejši odhodi. Brez dni zaprtja.
    opening: {
      note: "Odprta vse dni v letu ( vodeni ogledi čez dan; pozimi redkejši odhodi)",
      noteEn: "Open every day of the year ( guided tours through the day; fewer winter departures)",
      closureLevel: "mainAttraction",
      source: "postojnska-jama.eu",
    },
  },
  {
    id: "piran",
    country: "SI",
    slug: "piran",
    name: "Piran",
    tagline: "Slovenske Benetke s kamnitimi uličicami in Tartinijevim trgom",
    region: "primorska",
    type: "coast",
    description:
      "Piran je obmorsko mestece beneškega videza, kjer se ozke uličice stiskajo med kamnitimi hišami. Tartinijev trg, glavni trg z marmornatimi tlaki, je posvečen violinistu Giuseppu Tartiniju. Cerkev sv. Jurija na hribu ponuja pogled na Jadransko morje.",
    highlights: ["Tartinijev trg", "Cerkev sv. Jurija", "Obala", "Stare uličice"],
    activities: ["Sprehod po starem mestu", "Sončni zahod", "Morska hrana", "Obisk solin"],
    bestFor: ["romantika", "kultura", "hrana"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/piran.jpg",
    coords: { lat: 45.5233, lng: 13.5676 },
    rating: 4.7,
    budget: "€€",
    duration: "1 dan",
    costPerPerson: 35,
    featured: true,
  },
  {
    id: "soca",
    country: "SI",
    slug: "reka-soca",
    name: "Reka Soča",
    tagline: "Smaragdna reka med Julijci za adrenalinske avanture",
    region: "gorenjska",
    type: "river",
    description:
      "Soča je ena redkih rek, ki ohranja svojo smaragdno barvo skozi vse leto. Vije se skozi Tolmin in Bovec, kjer ponuja vrhunsko rafting, kajakaštvo in canyoning. Vmes so korita Soče — naravni bazeni, vrezani v apnenec, idealni za poletno osvežitev.",
    highlights: ["Korita Soče", "Bovec", "Tolmin", "Trdnjava Kluže"],
    activities: ["Rafting", "Kajakaštvo", "Canyoning", "Zip-line"],
    bestFor: ["adrenalin", "narava", "poletje"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/reka-soca.jpg",
    coords: { lat: 46.3447, lng: 13.7332 },
    rating: 4.8,
    budget: "€€",
    duration: "2-3 dni",
    costPerPerson: 40,
    featured: true,
  },
  {
    id: "triglav",
    country: "SI",
    slug: "triglav",
    name: "Triglav",
    tagline: "2864 m visok simbol naroda z neštetimi potmi",
    region: "gorenjska",
    type: "mountain",
    description:
      "Triglav je najvišji vrh Slovenije in narodni simbol, ki krasa državni grb. Vzpon zahteva tehnično pohodništvo, a ob pogoju dobre priprave je dosegljiv v enih ali dveh dneh. Na vrhu stoji Aljažev stolp — najvišje ležeče zatočišče v državi.",
    highlights: ["Vrh 2864 m", "Aljažev stolp", "Triglavska roža", "Pohodništvo"],
    activities: ["Pohodništvo", "Alpinizem", "Fotografija"],
    bestFor: ["avantura", "pohodništvo", "narava"],
    bestSeason: ["summer", "autumn"],
    image: "/content/triglav.jpg",
    coords: { lat: 46.3794, lng: 13.8462 },
    rating: 4.9,
    budget: "€",
    duration: "2 dni",
    costPerPerson: 15,
    featured: false,
  },
  {
    id: "kobarid",
    country: "SI",
    slug: "kobarid",
    name: "Kobarid",
    tagline: "Zgodovina, Soška fronta in kulinarika v eni vasi",
    region: "gorenjska",
    type: "city",
    description:
      "Kobarid je vasica ob Soči, znana po Kobaridskem muzeju, ki dokumentira krvavo Soško fronto prve svetovne vojne. Napoleonov most čez Sočo in Kolovrat ponujata panoramske poglede. Hiša Franko, ena najboljših restavrac v regiji, prinaša sodobno tolminsko kuhinjo.",
    highlights: ["Kobaridski muzej", "Napoleonov most", "Kolovrat", "Hiša Franko"],
    activities: ["Muzej", "Pohodništvo", "Kulinarična izkušnja", "Kolo ob Soči"],
    bestFor: ["zgodovina", "hrana", "narava"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/kobarid.jpg",
    coords: { lat: 46.2453, lng: 13.5864 },
    rating: 4.5,
    budget: "€€",
    duration: "1 dan",
    costPerPerson: 25,
    featured: false,
    // F5.5: Kobariški muzej — uradna stran: »Muzej je odprt vse dni v letu.
    // januar–marec 10:00–17:00« ( jul–avg do 19:00; vir kobariski-muzej.si +
    // soca-valley.com, preverjeno 2026-09). Brez dni zaprtja.
    opening: {
      note: "Kobariški muzej odprt vsak dan ( jan–mar 10–17, jul–avg do 19)",
      noteEn: "Kobarid Museum open daily ( Jan–Mar 10–17, Jul–Aug until 19)",
      closureLevel: "mainAttraction",
      source: "kobariski-muzej.si",
    },
  },
  {
    id: "maribor",
    country: "SI",
    slug: "maribor",
    name: "Maribor",
    tagline: "Drugo največje mesto z najstarejšo trto na svetu",
    region: "stajerska",
    type: "city",
    description:
      "Maribor leži ob Dravi, obkrožen z vinogradi Pohorja. Stara trta, stara več kot 400 let, je vpisana v Guinnessovo knjigo rekordov. Mesto ponuja živahno staro mestno jedro, vinogradniške lance Pohorja in smučanje pozimi.",
    highlights: ["Stara trta", "Pohorje", "Glavni trg", "Vinogradništvo"],
    activities: ["Obisk Stare trte", "Smučanje Pohorje", "Vinska degustacija", "Staro mesto"],
    bestFor: ["kultura", "vino", "smučanje"],
    bestSeason: ["spring", "summer", "autumn", "winter"],
    image: "/content/maribor.jpg",
    coords: { lat: 46.5547, lng: 15.6459 },
    rating: 4.4,
    budget: "€",
    duration: "1-2 dni",
    costPerPerson: 20,
    featured: false,
  },
  {
    id: "portoroz",
    country: "SI",
    slug: "portoroz",
    name: "Portorož",
    tagline: "Slovensko obmorsko letovišče s Casino in wellness",
    region: "primorska",
    type: "coast",
    description:
      "Portorož je najbolj znano slovensko obmorsko letovišče z dolgo peščeno plažo, hoteli z wellness centri in Casinojem. Obalne sprehajališče povezuje Portorož s Piranom, soline Sečovlje pa nudijo edinstveno naravno izkušnjo in wellness z blatom.",
    highlights: ["Plaža", "Casino", "Soline Sečovlje", "Wellness"],
    activities: ["Plavanje", "Wellness", "Igre na srečo", "Kolo ob morju"],
    bestFor: ["poletje", "wellness", "družina"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/portoroz.jpg",
    coords: { lat: 45.5142, lng: 13.5922 },
    rating: 4.3,
    budget: "€€€",
    duration: "2-3 dni",
    costPerPerson: 60,
    featured: false,
  },
  {
    id: "vintgar",
    country: "SI",
    slug: "vintgarska-soteska",
    name: "Vintgarska soteska",
    tagline: "Kratek sprehod skozi apnenec ob umirjeni reki",
    region: "gorenjska",
    type: "gorge",
    description:
      "Vintgarska soteska je 1,6 km dolga soteska ob reki Radovni, le 4 km od Bleda. Lesene poti vodijo ob kristalno čisti vodi, mimo slapa in naravnih bazenov. Sprehod traja približno eno uro in je primeren za vse starosti.",
    highlights: ["Slap Šum", "Lesene poti", "Kristalna voda", "Naravni bazeni"],
    activities: ["Sprehod", "Fotografija", "Opazovanje narave"],
    bestFor: ["družina", "narava", "fotografija"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/vintgarska-soteska.jpg",
    coords: { lat: 46.4, lng: 14.1167 },
    rating: 4.6,
    budget: "€",
    duration: "1 dan",
    costPerPerson: 10,
    featured: false,
    // F5.5 ( NAJPLESNEJŠI primer): uradna stran — »The Vintgar Gorge is open
    // to visitors between April and October« ( vir vintgar.si, preverjeno
    // 2026-09; odprtve po zimskem zaprtju se datumsko razlikujejo po letih —
    // npr. 2024: 19. april). NOVEMBER–MAREC ZAPRTO ( led/sneg) — zaprtje na
    // ravni DESTINACIJE ( soteska JE kraj), zato geo-validacija javlja ERROR,
    // ko zimski načrt vsebuje ta postanek.
    opening: {
      note: "Odprta april–oktober ( poleti 8–18, spomladi/jeseni 9–16); pozimi zaprta",
      noteEn: "Open April–October ( summer 8–18, spring/autumn 9–16); closed in winter",
      closedMonths: [11, 12, 1, 2, 3],
      closureLevel: "destination",
      source: "vintgar.si",
    },
  },
  {
    id: "rogaska",
    country: "SI",
    slug: "rogaska-slatina",
    name: "Rogaška Slatina",
    tagline: "Najstarejše slovensko zdravilišče z mineralno vodo",
    region: "stajerska",
    type: "spa",
    description:
      "Rogaška Slatina je elegantno zdravilišče z 400-letno tradicijo, znano po mineralni vodi Donat Mg z najvišjo vsebnostjo magnezija na svetu. Secesijska arhitektura, parki in wellness centri nudijo sprostitev skozi vse leto.",
    highlights: ["Donat Mg", "Secesijska arhitektura", "Grand hotel", "Wellness"],
    activities: ["Wellness", "Pitje mineralne vode", "Sprehodi po parku", "Masaže"],
    bestFor: ["wellness", "sprostitev", "zdravje"],
    bestSeason: ["spring", "summer", "autumn", "winter"],
    image: "/content/rogaska-slatina.jpg",
    coords: { lat: 46.3231, lng: 15.6422 },
    rating: 4.4,
    budget: "€€€",
    duration: "2 dni",
    costPerPerson: 80,
    featured: false,
  },
  // === ŠTAJERSKA — dodatne destinacije ===
  {
    id: "ptuj",
    country: "SI",
    slug: "ptuj",
    name: "Ptuj",
    tagline: "Najstarejše mesto v Sloveniji z rimsko zgodovino",
    region: "stajerska",
    type: "city",
    description:
      "Ptuj je najstarejše zabeleženo mesto v Sloveniji, ustanovljeno v rimski dobi kot Poetovio. Srednjeveški grad na hribu ponuja panoramski pogled na Dravo, staro mestno jedro pa ohranja baročno arhitekturo. Poznan po Kurentovanju — največjem pustnem festivalu v Srednji Evropi.",
    highlights: ["Ptujski grad", "Rimske izkopanine", "Kurentovanje", "Drava"],
    activities: ["Obisk gradu", "Sprehod po starem mestu", "Pustni festival", "Sprehod ob Dravi"],
    bestFor: ["kultura", "zgodovina", "festival"],
    bestSeason: ["spring", "summer", "autumn", "winter"],
    image: "/content/ptuj.jpg",
    coords: { lat: 46.4197, lng: 15.867 },
    rating: 4.5,
    budget: "€",
    duration: "1 dan",
    costPerPerson: 18,
    featured: false,
    // F5.5 ( MindTrip »Louvre je zaprt ob torkih« pariteta): Pokrajinski
    // muzej Ptuj–Ormož — Ptujski grad: »Odprto od torka do nedelje od 10. do
    // 18. ure. Ponedeljki zaprto.« ( uradna objava muzeja, pmpo.si, apr 2026;
    // poletni urnik). Staro mestno jedro je dostopno vedno — zaprtje je na
    // ravni GLAVNE ZNAMENITOSTI ( WARN, ne ERROR).
    opening: {
      note: "Ptujski grad zaprt ob ponedeljkih ( tor–ned 10–18, poletni urnik)",
      noteEn: "Ptuj Castle closed on Mondays ( Tue–Sun 10–18, summer schedule)",
      closedWeekdays: [1],
      closureLevel: "mainAttraction",
      source: "pmpo.si",
    },
  },
  {
    id: "celje",
    country: "SI",
    slug: "celje",
    name: "Celje",
    tagline: "Nekdanja prestolnica grofov Celjskih z impresivnim gradom",
    region: "stajerska",
    type: "city",
    description:
      "Celje je tretje največje mesto v Sloveniji, znano po srednjeveškem gradu Celjskih grofov — nekdaj najvplivnejšega plemiškega rodu na Slovenskem. Stari trg ohranja baročne fasade, ob Savinji pa se vije sprehajalna pot.",
    highlights: ["Stari grad Celje", "Stari trg", "Savinja", "Pokrajinski muzej"],
    activities: ["Obisk gradu", "Sprehod po starem mestu", "Muzej", "Kolo ob Savinji"],
    bestFor: ["kultura", "zgodovina", "družina"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/celje.jpg",
    coords: { lat: 46.2389, lng: 15.2675 },
    rating: 4.3,
    budget: "€",
    duration: "1 dan",
    costPerPerson: 15,
    featured: false,
    // F5.5: »Stari grad Celje je odprt vsak dan v letu!« ( gradovislovenije.si
    // + visitcelje.eu, preverjeno 2026-09; urnik se spreminja po mesecih —
    // jan 10–16, feb 9–17, mar 10–18, apr 9–19). Brez dni zaprtja.
    opening: {
      note: "Stari grad odprt vsak dan ( urnik po mesecih: jan 10–16 … apr 9–19)",
      noteEn: "Old Castle open daily ( monthly hours: Jan 10–16 … Apr 9–19)",
      closureLevel: "mainAttraction",
      source: "visitcelje.eu",
    },
  },
  // === PRIMORSKA — dodatne destinacije ===
  {
    id: "nova-gorica",
    country: "SI",
    slug: "nova-gorica",
    name: "Nova Gorica",
    tagline: "Mesto vrtnic na meji z Italijo",
    region: "primorska",
    type: "city",
    description:
      "Nova Gorica je mlado mesto zgrajeno po 2. svetovni vojni, znano kot 'mesto vrtnic'. Meji na italijansko Gorico — edina evropska mesti ki si delita trg (Trg Evrope). Casino, parki in mediteranski ambient.",
    highlights: ["Trg Evrope", "Park vrtnic", "Casino Perla", "Solkan most"],
    activities: ["Sprehod po parku", "Igre na srečo", "Mejni sprehod v Italijo", "Kolo ob Soči"],
    bestFor: ["wellness", "mesto", "poletje"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/nova-gorica.jpg",
    coords: { lat: 45.9636, lng: 13.6414 },
    rating: 4.2,
    budget: "€€",
    duration: "1 dan",
    costPerPerson: 30,
    featured: false,
  },
  // === KOROŠKA ===
  {
    id: "slovenj-gradec",
    country: "SI",
    slug: "slovenj-gradec",
    name: "Slovenj Gradec",
    tagline: "Alpsko mestece z bogato glasbeno tradicijo",
    region: "koroska",
    type: "city",
    description:
      "Slovenj Gradec je zgodovinsko mestece na severu Slovenije, obkroženo z Koroškimi Alpami. Znan po Dvorani slovenskih glasbenikov in rojstnem kraju Hugo Wolfa. Idealna izhodišča za pohode na Pohorje in Uršljo goro.",
    highlights: ["Dvorana slovenskih glasbenikov", "Stari trg", "Pohorje", "Uršlja gora"],
    activities: ["Pohodništvo", "Glasbeni koncerti", "Sprehod po starem mestu", "Smučanje"],
    bestFor: ["narava", "kultura", "mir"],
    bestSeason: ["spring", "summer", "autumn", "winter"],
    image: "/content/slovenj-gradec.jpg",
    coords: { lat: 46.5131, lng: 15.0864 },
    rating: 4.4,
    budget: "€",
    duration: "1 dan",
    costPerPerson: 15,
    featured: false,
  },
  {
    id: "dravograd",
    country: "SI",
    slug: "dravograd",
    name: "Dravograd",
    tagline: "Tromeja rek Drave, Meže in Mislinje",
    region: "koroska",
    type: "river",
    description:
      "Dravograd je majhno mestece na severu Slovenije kjer se stikajo tri reke — Drava, Meža in Mislinja. Obkrožen z gozdovi Kozjaka in Pohorja. Hidroelektrarna na Dravi in pohodniške poti ob reki.",
    highlights: ["Sotoče treh rek", "HE Dravograd", "Kozjak", "Pohodništvo"],
    activities: ["Pohodništvo", "Ribolov", "Kolo ob Dravi", "Fotografija narave"],
    bestFor: ["narava", "mir", "pohodništvo"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/dravograd.jpg",
    coords: { lat: 46.5864, lng: 15.0019 },
    rating: 4.1,
    budget: "€",
    duration: "1 dan",
    costPerPerson: 10,
    featured: false,
  },
  // === PREKMURJE ===
  {
    id: "murska-sobota",
    country: "SI",
    slug: "murska-sobota",
    name: "Murska Sobota",
    tagline: "Center Prekmurja z gradom ob jezeru",
    region: "prekmurje",
    type: "city",
    description:
      "Murska Sobota je središče Prekmurja — ravne panonske pokrajine na severovzhodu Slovenije. Grad Murska Sobota ob istoimenskem jezeru hrani Pokrajinski muzej. Znana po prekmurski gibanici in bučnem olju.",
    highlights: ["Grad Murska Sobota", "Sobotoško jezero", "Prekmurska gibanica", "Pokrajinski muzej"],
    activities: ["Obisk gradu", "Sprehod ob jezeru", "Kulinarične izkušnje", "Kolo po ravnini"],
    bestFor: ["kultura", "hrana", "družina"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/murska-sobota.jpg",
    coords: { lat: 46.6667, lng: 16.1667 },
    rating: 4.3,
    budget: "€",
    duration: "1 dan",
    costPerPerson: 18,
    featured: false,
  },
  {
    id: "lendava",
    country: "SI",
    slug: "lendava",
    name: "Lendava",
    tagline: "Dvojezično mesto z vinogradi in gradom na hribu",
    region: "prekmurje",
    type: "city",
    description:
      "Lendava je najbolj vzhodno mesto v Sloveniji, na meji z Madžarsko. Dvojezično (slovensko-madžarsko) mesto z gradom na hribu, ki ponuja panoramski pogled na vinograde Lendavskih goric. Pridelava vrhunskih belih vin.",
    highlights: ["Grad Lendava", "Vinogradi Lendavskih goric", "Dvojezična kultura", "Vinska klet"],
    activities: ["Vinska degustacija", "Obisk gradu", "Kolo po vinogradih", "Mejni sprehod"],
    bestFor: ["vino", "kultura", "hrana"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/lendava.jpg",
    coords: { lat: 46.5564, lng: 16.4544 },
    rating: 4.4,
    budget: "€€",
    duration: "1 dan",
    costPerPerson: 25,
    featured: false,
  },
  // === DOLENJSKA ===
  {
    id: "novo-mesto",
    country: "SI",
    slug: "novo-mesto",
    name: "Novo mesto",
    tagline: "Dolenjska prestolnica ob reki Krki",
    region: "dolenjska",
    type: "city",
    description:
      "Novo mesto je središče Dolenjske, zgrajeno v okljuku reke Krke. Stari trg z glavno ulico ohranja srednjeveški značaj. Znana po cvičku — tradicionalnem dolenjskem vinu, in po arheoloških najdbah halštatske kulture.",
    highlights: ["Stari trg", "Reka Krka", "Cviček", "Arheološki muzej"],
    activities: ["Sprehod po starem mestu", "Vinska degustacija", "Kolo ob Krki", "Muzej"],
    bestFor: ["kultura", "vino", "narava"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/novo-mesto.jpg",
    coords: { lat: 45.8039, lng: 15.1686 },
    rating: 4.4,
    budget: "€",
    duration: "1-2 dni",
    costPerPerson: 20,
    featured: false,
  },
  {
    id: "otocec",
    country: "SI",
    slug: "otocec",
    name: "Otočec",
    tagline: "Edini slovenski grad na otoku reke",
    region: "dolenjska",
    type: "castle",
    description: "Otočec je edini slovenski grad na otoku, obkrožen z reko Krko. Danes luksuzen hotel z golf igriščem in wellnessom. Romantično okolje za pare in izhodišče za kolesarjenje ob Krki.",
    highlights: ["Grad na otoku", "Reka Krka", "Golf", "Wellness"],
    activities: ["Golf", "Wellness", "Kolo ob Krki", "Romantični večerja"],
    bestFor: ["romantika", "wellness", "mir"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/otocec.jpg",
    coords: { lat: 45.6833, lng: 15.1833 },
    rating: 4.6,
    budget: "€€€",
    duration: "1-2 dni",
    costPerPerson: 70,
    featured: false,
  },
  // === BELA KRAJINA ===
  {
    id: "crnomelj",
    country: "SI",
    slug: "crnomelj",
    name: "Črnomelj",
    tagline: "Srce Bele krajine ob reki Kolpi",
    region: "bela-krajina",
    type: "city",
    description:
      "Črnomelj je središče Bele krajine — tople, mediteransko navdahnjene pokrajine na jugovzhodu Slovenije ob reki Kolpi. Znan po belokranjski pisanici (barvanih pirhih), steljnikih in tradicionalni belokranjski glasbi. Kolpa ponuja najtoplejše kopanje v Sloveniji.",
    highlights: ["Reka Kolpa", "Stari trg", "Belokranjska pisanica", "Steljniki"],
    activities: ["Kopanje v Kolpi", "Sprehod po starem mestu", "Kolo po Beli krajini", "Etnografski muzej"],
    bestFor: ["narava", "poletje", "družina"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/crnomelj.jpg",
    coords: { lat: 45.5747, lng: 15.1892 },
    rating: 4.3,
    budget: "€",
    duration: "1-2 dni",
    costPerPerson: 15,
    featured: false,
  },
  // ==========================================================================
  // TASK 62 (1.62.0): REGIONALNA POKRITOST — HRVAŠKA / ČRNA GORA / ALBANIJA
  // ==========================================================================
  // 16 novih destinacij zahodnega Balkana. isto shemo kot SI vnosi.
  // Iskrenost vsebine: opisi so EDITORIALNE (kurirane, konservativne — dobro
  // znane znamenitosti, brez izmišljenih specifikov); rating/budget/
  // costPerPerson so editorialne ocene v isti skali kot SI vnosi (primerljive
  // med sabo, niso API podatki). Koordinate so javno znane geografske točke
  // mest/znamenitosti; test task62 preverja koherence regija↔država↔FSQ bbox.
  // Slike: /content/*.jpg AI-generirane (z-ai, sept 2026, VLM spot-audit 3/3
  // PASS — dubrovnik/berat/durmitor), enaka konvencija kot SI slike.
  // featured: false pri vseh — homepage ostane 6 SI (znamka), regionalno
  // pokritost pokaže /destinacije + načrtovalnik potovanj (optgroup).
  // ==========================================================================

  // === HRVAŠKA — kontinentalna ===
  {
    id: "zagreb",
    country: "HR",
    slug: "zagreb",
    name: "Zagreb",
    tagline: "Hrvaška prestolnica z dunajskim šarmom in kavarniško kulturo",
    region: "kontinentalna-hrvaska",
    type: "city",
    description:
      "Zagreb je mesto na prelomu srednjeje in jugovzhodne Evrope z Dunaju podobnim jedrom: Gornji grad s pokrito tržnico in Lotrščakom, secesijske ulice spodnjega mesta in živahen Dolac zjutraj, ko kmetje razstavijo svoje pridelke. Advent na Gornjem mestu decembra med najbolj praznične v Evropi, poleti pa kava na Tkalčićevi ulici daje ritem mestu.",
    highlights: ["Gornji grad", "Trg bana Jelačića", "Tržnica Dolac", "Katedrala"],
    activities: ["Sprehod po Gornjem gradu", "Muzeji in galerije", "Advent v decembru", "Kava na Tkalčićevo"],
    bestFor: ["kultura", "mesto", "hrana"],
    bestSeason: ["spring", "summer", "autumn", "winter"],
    image: "/content/zagreb.jpg",
    coords: { lat: 45.815, lng: 15.9819 },
    rating: 4.5,
    budget: "€",
    duration: "2 dni",
    costPerPerson: 25,
    featured: false,
  },
  // === HRVAŠKA — Lika ===
  {
    id: "plitvicka-jezera",
    country: "HR",
    slug: "plitvicka-jezera",
    name: "Plitvička jezera",
    tagline: "UNESCO kaskada turkiznih jezer in slapov",
    region: "lika",
    type: "lake",
    description:
      "Najstarejši hrvaški narodni park je veriga šestnajstih jezer, ki se zalivajo druga v drugo čez travertinske barjera in slapove. Lesene brvi vodijo ob vodi skozi gozd, čez največje jezero Kozjak vozijo električne ladje. Barva vode se premika med turkizno in smaragdno od sezone in svetlobe.",
    highlights: ["Veliki slap", "Jezero Kozjak", "Lesene brvi", "Travertinske barjera"],
    activities: ["Sprehod po brveh", "Vožnja z ladjo po Kozjaku", "Fotografija", "Ogled Velikega slapa"],
    bestFor: ["narava", "fotografija", "družina"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/plitvicka-jezera.jpg",
    coords: { lat: 44.8654, lng: 15.582 },
    rating: 4.8,
    budget: "€€",
    duration: "1 dan",
    costPerPerson: 35,
    featured: false,
  },
  // === HRVAŠKA — Kvarner ===
  {
    id: "rijeka",
    country: "HR",
    slug: "rijeka",
    name: "Rijeka",
    tagline: "Prestolnica kulture z največjim hrvaškim pristaniščem",
    region: "kvartner",
    type: "city",
    description:
      "Rijeka je pristaniško mesto na Kvarnerju z avstro-ogrskim jedrom, dolgim Korzom in Trsatskim gradom na hribu nad mestom. Leta 2020 je bila evropska prestolnica kulture; velikonočni Riješki karneval je med največjimi v Evropi. Iz Rijeke vodijo trajekti na otoke in v Italijo — mesto je prehod v Kvarner.",
    highlights: ["Korzo", "Trsatski grad", "Mestni stolp", "Stolnica sv. Vida"],
    activities: ["Sprehod po Korzu", "Pogled s Trsata", "Riješki karneval", "Trajektni izleti na otoke"],
    bestFor: ["mesto", "kultura", "hrana"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/rijeka.jpg",
    coords: { lat: 45.3271, lng: 14.4422 },
    rating: 4.3,
    budget: "€",
    duration: "1-2 dni",
    costPerPerson: 20,
    featured: false,
  },
  // === HRVAŠKA — Istra ===
  {
    id: "pula",
    country: "HR",
    slug: "pula",
    name: "Pula",
    tagline: "Rimski amfiteater ob Jadranskem morju",
    region: "istra",
    type: "coast",
    description:
      "Pula je največje mesto Istre z najbolje ohranjenim rimskim amfiteaterom na svetu po Rimu — Arena iz 1. stoletja še danes sprejema koncerte in film na odprtem. Staro mestno jedro z Zlatim portalom in Stolnico sv. Marije se stiska na polotoku, okoli mesta pa ležijo plaže in istrska vinorodna vas.",
    highlights: ["Amfiteater Arena", "Zlati portal", "Stari trg", "Istrska riviera"],
    activities: ["Ogled Arene", "Sprehod po starem mestu", "Kopanje", "Vinske degustacije po Istri"],
    bestFor: ["kultura", "družina", "hrana"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/pula.jpg",
    coords: { lat: 44.8683, lng: 13.8481 },
    rating: 4.5,
    budget: "€€",
    duration: "1-2 dni",
    costPerPerson: 25,
    featured: false,
  },
  // === HRVAŠKA — Dalmacija ===
  {
    id: "zadar",
    country: "HR",
    slug: "zadar",
    name: "Zadar",
    tagline: "Mesto sončnega zahoda in morskih orgel",
    region: "dalmacija",
    type: "coast",
    description:
      "Zadar je dalmatinsko mesto na polotoku z rimskim tlorisom in romansko cerkvijo sv. Donata. Ob obali morske orgle igrajo na valove, desno pa Pozdrav soncu — instalacija, ob kateri se zberejo množice ob zahodu; Alfred Hitchcock je zadarški zahod imenoval najlepšega na svetu. Iz Zadra so najkrajši izleti na Kornate.",
    highlights: ["Morske orgle", "Pozdrav soncu", "Cerkev sv. Donata", "Rimske ruševine"],
    activities: ["Poslušanje morskih orgel", "Sončni zahod", "Sprehod po obzidju", "Izlet na Kornate"],
    bestFor: ["romantika", "kultura", "družina"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/zadar.jpg",
    coords: { lat: 44.1194, lng: 15.2314 },
    rating: 4.6,
    budget: "€€",
    duration: "1-2 dni",
    costPerPerson: 25,
    featured: false,
  },
  {
    id: "split",
    country: "HR",
    slug: "split",
    name: "Split",
    tagline: "Živo mesto znotraj Dioklecijanove palače",
    region: "dalmacija",
    type: "coast",
    description:
      "Srce Splita je Dioklecijanova palača iz 4. stoletja — rimski kompleks, v katerem danes živijo ljudje: v Peristilu kavare, v podzemljih tržnica, v Vaulted sobah butiki. Katedrala sv. Duje je najstarejša katedrala na svetu v neprekinjeni uporabi. Hrib Marjan ponudi pobeg v borovce nad mestom, iz pristanišča pa krmarijo trajekti na otoke.",
    highlights: ["Dioklecijanova palača", "Peristil", "Katedrala sv. Duje", "Marjan"],
    activities: ["Raziskovanje palače", "Sprehod na Marjan", "Plaža Bačvice", "Trajektni izleti na otoke"],
    bestFor: ["kultura", "mesto", "hrana"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/split.jpg",
    coords: { lat: 43.5081, lng: 16.4402 },
    rating: 4.6,
    budget: "€€",
    duration: "2 dni",
    costPerPerson: 30,
    featured: false,
  },
  {
    id: "hvar",
    country: "HR",
    slug: "hvar",
    name: "Hvar",
    tagline: "Najsončnejši jadranski otok sivine in levandule",
    region: "dalmacija",
    type: "coast",
    description:
      "Hvar je otok s skoraj 2800 sončnimi urami letno, pristaniškim mestom Beneškega videza in tvrdjavo Fortico na hribu. Notranjost otoka skriva levandulna polja in vinograde bogotinjave pošipine (vinska sorta). Pred pristaniščem ležijo Pakleni otoki — škriljasti zalivi za sidranje in kopanje.",
    highlights: ["Tvrdjava Fortica", "Hvarsko pristanišče", "Pakleni otoki", "Levandulna polja"],
    activities: ["Pogled s Fortice", "Izlet na Paklene otoke", "Vinska degustacija pošipine", "Kopanje v zalivih"],
    bestFor: ["romantika", "narava", "hrana"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/hvar.jpg",
    coords: { lat: 43.1729, lng: 16.5914 },
    rating: 4.7,
    budget: "€€€",
    duration: "2-3 dni",
    costPerPerson: 40,
    featured: false,
  },
  {
    id: "dubrovnik",
    country: "HR",
    slug: "dubrovnik",
    name: "Dubrovnik",
    tagline: "Srednjeveško obzidano mesto nad modrim Jadranom",
    region: "dalmacija",
    type: "coast",
    description:
      "Dubrovnik — dubrovniška republika, ki je stoletja tekmovala z Benetkami — je obzidano mesto na steni nad morjem, katerega Stradun povezuje vrata Pile in Ploče. Obzidje dolgo skoraj dva kilometra nudi najbolj znan mestni sprehod Jadrana; žičnica vzpelje na Srđ za pogled na staro mesto in otoke. Pred mestom leži gozdnati Lokrum.",
    highlights: ["Mestno obzidje", "Stradun", "Otok Lokrum", "Žičnica na Srđ"],
    activities: ["Sprehod po obzidju", "Križni hodnik frančiškanskega samostana", "Izlet na Lokrum", "Sončni zahod z Srđa"],
    bestFor: ["kultura", "romantika", "fotografija"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/dubrovnik.jpg",
    coords: { lat: 42.6507, lng: 18.0944 },
    rating: 4.8,
    budget: "€€€",
    duration: "2-3 dni",
    costPerPerson: 45,
    featured: false,
  },
  // === ČRNA GORA — Boka kotorska ===
  {
    id: "kotor",
    country: "ME",
    slug: "kotor",
    name: "Kotor",
    tagline: "Fjordu podobna Boka s srednjeveškim obzidanim mestom",
    region: "boka-kotorska",
    type: "coast",
    description:
      "Kotor leži na dnu Bokokotorskega zaliva, ki se zvija med strmimi gorami kot edini fjord Sredozemlja. Staro mestno jedro z mrežo trgov in uličic je pod Unesco zaščito; obzidje z gradom San Giovanni se vzpenja 1200+ stopnic nad mesto in nudi legendaren pogled na zaliv. V sosednjem Perastu baročni otok Gospa od Škrpjela.",
    highlights: ["Stari grad Kotor", "Obzidje San Giovanni", "Boka kotorska", "Perast"],
    activities: ["Sprehod po starem mestu", "Vzpon na obzidje", "Izlet v Perast", "Križarjenje po Boki"],
    bestFor: ["kultura", "romantika", "fotografija"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/kotor.jpg",
    coords: { lat: 42.4247, lng: 18.7714 },
    rating: 4.7,
    budget: "€€",
    duration: "1-2 dni",
    costPerPerson: 25,
    featured: false,
  },
  // === ČRNA GORA — primorje ===
  {
    id: "budva",
    country: "ME",
    slug: "budva",
    name: "Budva",
    tagline: "Stari grad na polotoku med plažami in borovci",
    region: "crnogorsko-primorje",
    type: "coast",
    description:
      "Budva je najbolj obiskano črnogorsko obmorsko mesto — staro mestno jedro na skalnatem polotoku z obzidjem, okrog njega pa niz plaž (Mogren, Jaz, Slovenska plaža). Poleti so ulice in terase polne, jeseni in pomladi pa staro mesto diha sproščeno. Fotografom najbolj znan motiv je otoček Sveti Stefan z nekdanjo vasjo-bivališče hotelom.",
    highlights: ["Stari grad Budva", "Plaža Mogren", "Sveti Stefan", "Plaža Jaz"],
    activities: ["Sprehod po starem mestu", "Kopanje na Mogrenu", "Razgled na Sveti Stefan", "Večeri na obali"],
    bestFor: ["družina", "romantika", "hrana"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/budva.jpg",
    coords: { lat: 42.2864, lng: 18.8424 },
    rating: 4.4,
    budget: "€€",
    duration: "1-2 dni",
    costPerPerson: 25,
    featured: false,
  },
  // === ČRNA GORA — notranjost ===
  {
    id: "podgorica",
    country: "ME",
    slug: "podgorica",
    name: "Podgorica",
    tagline: "Sproščeno glavno mesto na stičištru rek in planin",
    region: "osrednja-crna-gora",
    type: "city",
    description:
      "Podgorica je glavno in največje mesto Črne gore, zgrajeno ob sotočju Morače in Ribnice. Mestni ritem določajo korzo, kavarniške terase in Millenniumski most; Stara varoš ohranja ostanke otomanskega mesta s stolpom z uro. Odlična izhodiščna točka — do Skadarskega jezera, Budve in Durmitorja je vsakodnevni izlet.",
    highlights: ["Millenniumski most", "Stara varoš", "Stolp z uro", "Gorica"],
    activities: ["Sprehod po korzu", "Raziskovanje Stare varoši", "Kava ob Morači", "Izlet na Skadarsko jezero"],
    bestFor: ["mesto", "hrana", "kultura"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/podgorica.jpg",
    coords: { lat: 42.4304, lng: 19.2594 },
    rating: 4.2,
    budget: "€",
    duration: "1 dan",
    costPerPerson: 15,
    featured: false,
  },
  {
    id: "durmitor",
    country: "ME",
    slug: "durmitor",
    name: "Durmitor",
    tagline: "UNESCO gorovje nad Črnim jezerom in kanjonom Tare",
    region: "severna-crna-gora",
    type: "mountain",
    description:
      "Narodni park Durmitor je gorovje izdrobljeno z 18 ledeniških jezer — najbolj znano je Črno jezero ob Žabljaku, glavnem mestu planin. Kanjon reke Tare je najglobji v Evropi (1300 m) in dom raftinga med bregovi; panoramska cesta preko Sedla Soa povezuje Žabljak z jugom. Pozimi smučarišča, poleti pohodniške poti okrog jezer.",
    highlights: ["Črno jezero", "Kanjon Tare", "Žabljak", "Sedlo Soa"],
    activities: ["Pohod okrog Črnega jezera", "Rafting po Tari", "Panoramska vožnja čez Sedlo", "Smučanje pozimi"],
    bestFor: ["narava", "avantura", "adrenalin"],
    bestSeason: ["spring", "summer", "autumn", "winter"],
    image: "/content/durmitor.jpg",
    coords: { lat: 43.1544, lng: 19.122 },
    rating: 4.7,
    budget: "€€",
    duration: "2-3 dni",
    costPerPerson: 25,
    featured: false,
  },
  // === ALBANIJA — center ===
  {
    id: "tirana",
    country: "AL",
    slug: "tirana",
    name: "Tirana",
    tagline: "Barvita prestolnica z otomanskim jedrom in kavarniškim tempom",
    region: "osrednja-albanija",
    type: "city",
    description:
      "Tirana je prestolnica, ki se je po dolgih desetletjih odprla — fasade v barvah, Skanderbegov trg z mošejo Et'hem Bej in stolpom z uro, kavarnice v blokovskih ulicah. Žičnica Dajti Ekspres vzpenja na 1600 m nad mestom za pogled na ravnino in Jadran; muzej Bunk'Art v atomskem zaklonišču pripoveduje zgodovino 20. stoletja.",
    highlights: ["Skanderbegov trg", "Mošeja Et'hem Bej", "Bunk'Art", "Gora Dajti"],
    activities: ["Raziskovanje centra", "Žičnica na Dajti", "Muzeji", "Kavarniška kultura"],
    bestFor: ["mesto", "kultura", "hrana"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/tirana.jpg",
    coords: { lat: 41.3275, lng: 19.8187 },
    rating: 4.3,
    budget: "€",
    duration: "2 dni",
    costPerPerson: 15,
    featured: false,
  },
  // === ALBANIJA — jug ===
  {
    id: "berat",
    country: "AL",
    slug: "berat",
    name: "Berat",
    tagline: "Mesto tisočerih oken pod gradom ob reki Osum",
    region: "juana-albanija",
    type: "castle",
    description:
      "Berat je mesto pod Unesco zaščito, znano kot mesto tisočerih oken — bele otomanske hiše na hribu Mangalem se stopničasto vzpenjajo proti gradu na vrhu. Stari most čez reko Osum povezuje četrt Gorica; v gradu je Onufrijev muzej z ikonami. Okoli Berata so vinogradi, domačini ponujajo degustacije v tradicionalnih hišah.",
    highlights: ["Beratski grad", "Četrt Mangalem", "Stari most", "Onufrijev muzej"],
    activities: ["Sprehod po Mangalemu", "Obisk gradu", "Most čez Osum", "Vinska degustacija"],
    bestFor: ["kultura", "fotografija", "hrana"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/berat.jpg",
    coords: { lat: 40.7058, lng: 19.952 },
    rating: 4.6,
    budget: "€",
    duration: "1 dan",
    costPerPerson: 15,
    featured: false,
  },
  {
    id: "gjirokaster",
    country: "AL",
    slug: "gjirokaster",
    name: "Gjirokastër",
    tagline: "Mesto kamna — sive strehe pod mogočnim gradom",
    region: "juana-albanija",
    type: "castle",
    description:
      "Gjirokastër je Unesco mesto kamnitih hiš s strehami iz skodle, zgrajeno na strmem pobočju pod enim največjih balkanskih gradov. Stara baza ohranja otomansko trgovsko ulico z venci; rojstna hiša pisatelja Ismaila Kadareja je danes muzej. Nad dolino se sliši legenda o Zermu in dolini nimf — planine okrog mesta vabijo na pohode.",
    highlights: ["Gjirokastrski grad", "Stara baza", "Kamnite hiše", "Kadarejeva hiša"],
    activities: ["Obisk gradu", "Sprehod po bazarju", "Etnografski muzej", "Pohodi v okolico"],
    bestFor: ["kultura", "fotografija", "narava"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/gjirokaster.jpg",
    coords: { lat: 40.0758, lng: 20.1425 },
    rating: 4.6,
    budget: "€",
    duration: "1 dan",
    costPerPerson: 15,
    featured: false,
  },
  {
    id: "saranda",
    country: "AL",
    slug: "saranda",
    name: "Sarandë",
    tagline: "Sončno jonsko mesto nasproti Korfu",
    region: "juana-albanija",
    type: "coast",
    description:
      "Sarandë je najbolj južno albansko obmorsko mesto, nasproti grškega Korfu (trajekt 30 min). Obala južno od mesta skriva Ksamil z belimi plažami in otočki, notranjost pa antiko — Butrint je Unesco antični mesto med jezerom in kanalom. Pogled iz trdnjave Lëkurësi nad mestom večer ponudi sončni zahod nad Jonskim morjem.",
    highlights: ["Ksamil", "Antični Butrint", "Trdnjava Lëkurësi", "Pogled na Korfu"],
    activities: ["Kopanje v Ksamila", "Ogled Butrinta", "Sončni zahod iz Lëkurësija", "Trajekt na Korfu"],
    bestFor: ["družina", "romantika", "narava"],
    bestSeason: ["spring", "summer", "autumn"],
    image: "/content/saranda.jpg",
    coords: { lat: 39.8753, lng: 20.0063 },
    rating: 4.5,
    budget: "€€",
    duration: "2-3 dni",
    costPerPerson: 25,
    featured: false,
  },
];

// Pomožne funkcije za iskanje
export function getDestinationById(id: string): Destination | undefined {
  return DESTINATIONS.find((d) => d.id === id);
}

export function getFeaturedDestinations(): Destination[] {
  return DESTINATIONS.filter((d) => d.featured);
}

export function getDestinationsByRegion(region: string): Destination[] {
  return DESTINATIONS.filter((d) => d.region === region);
}

/** TASK 62: destinacije izbrane države (filterska os v UI). */
export function getDestinationsByCountry(country: CountryCode): Destination[] {
  return DESTINATIONS.filter((d) => d.country === country);
}

/**
 * TASK 62: države registra — primarna filterska os pokritosti (SI+HR+ME+AL).
 * Vrstni red je privzetek prikaza (SI prva — znamka platforme).
 */
export const COUNTRIES: { value: CountryCode; label: string }[] = [
  { value: "SI", label: "Slovenija" },
  { value: "HR", label: "Hrvaška" },
  { value: "ME", label: "Črna gora" },
  { value: "AL", label: "Albanija" },
];

/**
 * TASK 62: regija → država (skladiščenje optgroupov v filtrih). Popolna
 * preslikka VSIH regij v REGIONS — test task62 preverja pokritost +
 * koherence z Destinacijami.
 */
export const COUNTRY_OF_REGION: Record<string, CountryCode> = {
  // Slovenija
  gorenjska: "SI",
  primorska: "SI",
  osrednja: "SI",
  kras: "SI",
  stajerska: "SI",
  koroska: "SI",
  prekmurje: "SI",
  dolenjska: "SI",
  "bela-krajina": "SI",
  // Hrvaška
  "kontinentalna-hrvaska": "HR",
  istra: "HR",
  kvartner: "HR",
  lika: "HR",
  dalmacija: "HR",
  // Črna gora
  "boka-kotorska": "ME",
  "crnogorsko-primorje": "ME",
  "osrednja-crna-gora": "ME",
  "severna-crna-gora": "ME",
  // Albanija
  "osrednja-albanija": "AL",
  "juana-albanija": "AL",
};

export const REGIONS: { value: string; label: string }[] = [
  { value: "gorenjska", label: "Gorenjska" },
  { value: "primorska", label: "Primorska" },
  { value: "osrednja", label: "Osrednja Slovenija" },
  { value: "kras", label: "Kras" },
  { value: "stajerska", label: "Štajerska" },
  { value: "koroska", label: "Koroška" },
  { value: "prekmurje", label: "Prekmurje" },
  { value: "dolenjska", label: "Dolenjska" },
  { value: "bela-krajina", label: "Bela krajina" },
  // TASK 62: regionalne regije (HR/ME/AL) — vrstni red po državah COUNTRIES
  { value: "kontinentalna-hrvaska", label: "Kontinentalna Hrvaška" },
  { value: "istra", label: "Istra" },
  { value: "kvartner", label: "Kvarner" },
  { value: "lika", label: "Lika" },
  { value: "dalmacija", label: "Dalmacija" },
  { value: "boka-kotorska", label: "Boka kotorska" },
  { value: "crnogorsko-primorje", label: "Črnogorsko primorje" },
  { value: "osrednja-crna-gora", label: "Osrednja Črna gora" },
  { value: "severna-crna-gora", label: "Severna Črna gora" },
  { value: "osrednja-albanija", label: "Osrednja Albanija" },
  { value: "juana-albanija", label: "Južna Albanija" },
];

export const INTERESTS: { value: string; label: string; icon: string }[] = [
  { value: "narava", label: "Narava", icon: "🌿" },
  { value: "kultura", label: "Kultura", icon: "🏛️" },
  { value: "hrana", label: "Hrana & vino", icon: "🍷" },
  { value: "avantura", label: "Avantura", icon: "🧗" },
  { value: "adrenalin", label: "Adrenalin", icon: "⚡" },
  { value: "romantika", label: "Romantika", icon: "❤️" },
  { value: "družina", label: "Družina", icon: "👨‍👩‍👧" },
  { value: "wellness", label: "Wellness", icon: "💆" },
];

// TAG-ALIGN (P1, recenzija Faze 4): zgodovinski/vstranski ID-ji interesov,
// ki se nikoli niso ujemali z bestFor oznakami destinacij. "kulinarika" je
// ID onboarding profila in NLP parserja — fallback ocenjevalnik išče bestFor
// "hrana", zato je bila izbira "Hrana & vino" tiho ignorirana (na produkciji
// brez AI žetonov JE fallback pot primarna). Preslikava je aditivna: neznan
// ID ostane nespremenjen (AI prompt ga lahko še vedno uporabi, ocenjevalnik
// ga varno prezre).
const INTEREST_ALIASES: Record<string, string> = {
  kulinarika: "hrana",
  gastronomija: "hrana",
  "lokalna hrana": "hrana",
};

/**
 * TAG-ALIGN: normalizacija seznama interesov na kanonične vrednosti INTERESTS
 * (te se ujemajo z bestFor destinacij). Odstrani duplikate, ohrani vrstni
 * red. Pokliče se na strežniški meji (API) — ulovi VSE vire: NLP parser,
 * stari shranjeni načrti (localStorage), kviz, onboarding profil, ročni klici.
 */
export function normalizeInterests(interests: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of interests) {
    const value = INTEREST_ALIASES[raw] ?? raw;
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}
