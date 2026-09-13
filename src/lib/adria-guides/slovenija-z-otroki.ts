// SLO-LOOP-1 — Slovenija z otroki (SL) — domači krožni vodnik po Sloveniji.

import type { AdriaGuide } from "./types";

export const ADRIA_GUIDES_SLOOP_OTROCI: AdriaGuide[] = [
  {
    slug: "slovenija-z-otroki",
    title: "Slovenija z otroki: družinski krog v 7 dneh",
    metaTitle: "Slovenija z otroki: družinski krog v 7 dneh",
    description:
      "Sedem dni in okoli 420 kilometrov z otroki: Ljubljana, Bled, Postojnska jama in Terme Olimia — kratke etape, vlakiček v jami in bazeni za zadnje dneve.",
    excerpt:
      "Družinski krog, ki ga prenesejo tudi malčki: Bled s pletno in s kolesom, vlakiček v Postojnski jami, na koncu pa dva dneva v Termah Olimia. Vsaka etapa pod dvema urama, bazeni na koncu.",
    route: "Ljubljana → Bled → Postojna → Terme Olimia → Ljubljana",
    countries: ["SI"],
    days: 7,
    km: 420,
    heroImage: "/adria/slovenija-z-otroki.jpg",
    heroAlt:
      "Pletna čoln s črtastim senčnikom na Blejskem jezeru, v ozadju zeleni otok s cerkvijo in zvonikom ob gozdnatih pobočjih",
    author: "Tanja Novak",
    date: "2026-10-06",
    readTime: 10,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 1,
        highlight:
          "Prva noč v mestu, ki ga naredite peš: center brez avtov, grad z žičnico in sladoled ob Ljubljanici. Uvod je kratek, ker je do Bleda samo 55 kilometrov.",
      },
      {
        name: "Bled",
        country: "SI",
        nights: 2,
        highlight:
          "Dva dneva za jezero, narejeno na vse mogoče načine: s pletno na otok, s kolesom po ravninski stezi okoli jezera, z grajskega obzidja s pogledom. Vintgar je štiri kilometre stran in povsem raven.",
      },
      {
        name: "Postojna",
        country: "SI",
        nights: 1,
        highlight:
          "Vlakiček, ki vas odpelje v samo goro, je za otroke vlak v pravljavo, Predjama pa viteška zgodba v steni pečine. Transfer zjutraj, jama ob odprtju, grad popoldne.",
      },
      {
        name: "Terme Olimia",
        country: "SI",
        nights: 2,
        highlight:
          "Zadnja baza brez pakiranja: Aqualuna za čofotanje, Olimje s čokoladnico in živalmi ob samostanu. Domov je potem le še okoli 105 kilometrov.",
      },
    ],
    sections: [
      {
        heading: "Slovenija, ki jo ljubijo otroci",
        body: [
          "Z otroki v avtu drži eno samo pravilo: krajše je boljše. Ta krog ga spoštuje do zadnjega kilometra — Ljubljana do Bleda 55, Bled do Postojne okoli 100, Postojna do Term Olimia okoli 155 in zadnji skok domov okoli 105 kilometrov. Najdaljša etapa se zgodi enkrat na teden in tudi ta je končana, preden se v zadnjih sedežih prižge druga risanka. Skupaj se števec ustavi pri okoli 420 kilometrih; drugi to vzamejo za en dolg avtocestni dan, tukaj je to ves dopust.",
          "Druga prednost je tišja: mej in carin ni, Slovenija je v schengenskem območju in na evru, zato nihče ne stoji v koloni z jokajočim malčkom na zadnjem sedežu. Pitna voda teče iz pip povsod, urejenih igrišč je več, kot jih tedenski načrt prenese, tudi zdravstvo ni dlje kot vožnja do naslednje etape. A kompaktnost ni vabilo k natrpavanju: ta krog deluje, ker je počasen, ne zato, ker bi bližina kaj rešila sama. Dve urejeni postaji na dan sta strop, ne izziv.",
        ],
      },
      {
        heading: "Ljubljana za male noge",
        body: [
          "Prvi dan in prva noč pripadata mestu, ki je do družin pošteno vljudno: center je zaprt za avte, malčki pa lahko tekajo po tlakovcih brez skrbi, ki jo povsod prinaša promet. Na grad vas pelje žičnica, ki je sama po sebi polovica izleta. Vstopnica s povratno žičnico odraslega stane okoli 19 evrov, otroške karte so ugodnejše, z grajskega stolpa pa se vidi, kako majhno mesto sploh je — ravno prav, da otroci obvladajo obseg, starši pa tempo.",
          "Hiša eksperimentov je postaja, ob kateri otroci pozabijo, da so v muzeju, ker je tu vse prijeti dovoljeno: pol ure noter in ne izidejo iz razstave, ampak iz laboratorija, pogosto pa se ujameta tudi starši. Staro mesto nato naredite kot pohod po ulici vodnjakov — na Mestnem trgu stoji baročni vodnjak treh kranjskih rek, po centru pa je pitnih vodnjakov toliko, da se kozarec napolni na vsakem vogalu in da malčki štejejo, koliko so jih ulovili. Sladoled ob Ljubljanici ob koncu ni nagrada za trud, ampak dogovor, ki drži ves dan.",
        ],
      },
      {
        heading: "Bled: grad, pletna in kolo",
        body: [
          "Dneva dva in tri pripadata jezeru, ki ga naredite na vse načine, ki jih družina prenese. Grad na skali nad vodo je klasična prva postaja — odrasli 19, otroci 7 evrov — z razgledom, ki razloži, zakaj se tukaj ustavi vsak. Pletna je druga: tradicionalni čoln, pri katerem veslač vesla stoje; na otok vas pelje kakšnih 15 minut v vsako smer. Povratna vožnja stane odrasle 20, otroke 10 evrov, na otoku pa vas čaka 99 stopnic do cerkve — z malčkom v naročju edini resen vzpon tega dopusta.",
          "Najboljša naložba na Bledu pa so kolesa: steza okoli jezera meri dobrih 6 kilometrov in je povsem ravninska, tako da šolarji naredijo krog sami, malčki sedijo v prikolici, starši pa vozijo za vsemi. Po njej se gre počasi, z zastanki za kremšnito in za kamenje ob vodi. Štiri kilometre od Bleda je Vintgarska soteska: 1,6 kilometra ravnega sprehoda po mivki in deskah, ob reki, ki vas drži vse do konca — odrasli 15, otroci do 15 let 5 evrov. Voziček večino poti zdrži, a daske na ožinah puščajo ravno toliko prostora — z dojenčkom je nosilček lažja odločitev.",
        ],
        list: [
          {
            title: "Pletna na otok",
            text: "Povratna vožnja stane 20 evrov za odrasle in 10 za otroke, vsaka smer traja kakšnih 15 minut, na otoku pa čaka 99 stopnic. Zjutraj je čakanja najmanj.",
          },
          {
            title: "Kolo okoli jezera",
            text: "Dobrih 6 kilometrov ravninske steze: šolarji vozijo sami, malčki sedijo v prikolici, vsi skupaj pa se ustavljajo za kremšnito. En krog je ravno prav dolg popoldan.",
          },
          {
            title: "Vintgarska soteska",
            text: "1,6 kilometra ravnega sprehoda ob reki, štiri kilometre od Bleda. Odrasli 15, otroci do 15 let 5 evrov; odprta približno od aprila do oktobra.",
          },
          {
            title: "Blejski grad",
            text: "Grad nad jezerom z razgledom na otok; vstopnica odrasle stane 19, otroke 7 evrov. Peš je do njega kratek vzpon, z avtom pa se peljete do vrata.",
          },
        ],
      },
      {
        heading: "Postojna: vlak v pravljavo",
        body: [
          "Četrti dan zjutraj zapustite Bled in po okoli 100 kilometrih čez Ljubljano in dolino prispete v Postojno — transfer po ravnini in avtocesti, brez ovinkov, ki bi v zadnjih sedežih obračali želodce. V jami se nato zgodi tisto, zaradi česar otroci to pot sploh prenesejo: vlakiček, ki vas odpelje v samo goro. Vožnja je v vstopnino vključena in prav ta podzemna proga je za večino otrok vrhunec tedna; sprehod med stebri, ki sledi, se omenja še dneve.",
          "Vstopnina za odrasle je okoli 35 evrov, kombinirana z gradom pa pride okoli 40 — za družino edina pametna izbira, ker vsebuje še Predjamo. Otroci od 6 do 15 let plačajo okoli 24 evrov. V jami je hladno tudi julija: puloverji za vse, tudi za tiste, ki vztrajajo, da zunaj peče. Rezervacija je del načrta — prvi jutranji termin pomeni krajše čakanje, sveže otroške baterije in ogled, pri katerem fotografirate množice, ne pa biti v njih.",
          "Popoldne je na vrsti Predjamski grad, zabit v steno pečine: dvorišče, obzidje in razgled, zgodba o vitezu Erazmu, ki je obleganje preživel s skrivnim rovom, pa je prav tista vrsta pravljice, ki jo šolarji poslušajo do konca. Parkirišče pri Postojnski jami je brezplačno, kar z družino ni malenkost; obisk jame vzame dober kos dopoldneva, zato ga načrtujte kot glavni dogodek dneva in ne kot postanek med drugimi. Če bo otrok po jami utrujen, bo utrujen na pravi način — zadnja ura dneva pa naj pripada igrišču, ne še avtu.",
        ],
        list: [
          {
            title: "Vlakiček v jami",
            text: "Vožnja z vlakičkom je vstopnini vključena in je za otroke vrhunec potovanja; sedež spredaj ni zagotovljen, a pridejo vsi.",
          },
          {
            title: "Kombinirana vstopnica",
            text: "Jama in Predjamski grad skupaj odrasle stanejo okoli 40 evrov, otroke od 6 do 15 let okoli 24 — družinsko edina smiselna varianta.",
          },
          {
            title: "Predjamski grad",
            text: "Viteška zgodba v steni pečine; samostojna vstopnica stane okoli 24 evrov, kombinirana pa se vedno izide ugodneje.",
          },
        ],
      },
      {
        heading: "Olimia: zadnji dnevi v vodi",
        body: [
          "Peti dan je najdaljša etapa kroga — okoli 155 kilometrov od Postojne do Term Olimia — a še vedno manj kot dve uri vožnje. Odpeljite takoj po zajtrku, da najmlajši prespijo največji del, in prispeli boste prav za kosilo. Popoldne se družina spusti v Aqualuno: družinska vstopnica za dva odrasla in otroka se giblje med 50 in 67 evrov, popoldanska po 15. uri pa stane 16 do 20 evrov na osebo — ura, ki se s transferjem, prijavo in kosilom sama od sebe izide.",
          "Šesti dan avto stoji — in to je treba jemati kot pohvalo, ne kot pomanjkljivost. Cel dan v termah je namen tega dela potovanja: drče za šolarje, plitve lagune za malčke, ležalniki za starše, ki se usedejo prvič v tednu, odmori brez urnika. Popoldne se za kratek izlet zapeljete do Olimja: čokoladnica ob samostanu čokolado izdeluje pred očmi obiskovalcev, živali ob samostanu pa so ravno prav krotke za malčke. Samostan s staro lekarno je tisti del za starše; za otroški račun poskrbita čokolada in osel.",
          "Sedmi dan je samo še vožnja domov — okoli 105 kilometrov in najlažja etapa kroga, ker so vsi utrujeni na pravi način. Skušnjava, da bi zadnjima dnema dodali še en ogled, je velika in napačna: ta del poti deluje ravno zato, ker ničesar ni treba. Starši, ki dopust končajo tako, da se tudi sami speljejo po drči, se vrnejo domov kot ljudje — in to je merilo, po katerem se družinski dopusti ocenjujejo.",
        ],
        list: [
          {
            title: "Aqualuna",
            text: "Družinska vstopnica za dva odrasla in otroka 50 do 67 evrov; po 15. uri karta stane 16 do 20 evrov. Plitve lagune za malčke, drče za šolarje.",
          },
          {
            title: "Olimje",
            text: "Čokoladnica ob samostanu in živali za krmilenje: kratek izlet, ki se ga da narediti med dvema kopanjema.",
          },
          {
            title: "Dan brez avta",
            text: "En cel dan brez pakiranja, sedežev in iskanja parkirišča je najboljša odločitev tega tedna — in najtežja za načrtovalce.",
          },
        ],
      },
      {
        heading: "Ritem, ki deluje",
        body: [
          "Vsa logika tega kroga gre skozi eno besedno zvezo: dopoldan ogled, popoldne voda. Jame in gradove naredite ob odprtju, ko so množice majhne in otroške glave sveže; bazeni in jezera prevzamejo popoldne, ko se temperatura dvigne in strpnost izteče. Vsaka etapa je pod dvema urama in vsak transfer je zjutraj — po kosilu se ne vozi. Z malčki sta dve glavni postaji na dan strop; šolarji prenesejo tri, a tudi zanje pustite prost čas za kamne ob reki.",
          "Kaj ne deluje, je prav tako jasno. Etap, daljših od dveh ur, ali vožnje čez gorske prelaze ta krog sploh ne pozna: vse poti vodijo po ravnini in avtocesti, torej nič, kar bi v zadnjih sedežih obračalo želodce. Množice ob enajsti uri na Bledu in pred Postojno so realne, a izogljive — karte in termine rezervirajte zgodaj, ob odprtju pa ste pred avtobusi. Pretirčan načrt je tretja napaka: dve postaji na dan sta strop, dan počitka pa ni izguba, ampak cilj.",
          "Če se ritma držite, se domov vračate s tremi stvarmi: spečimi otroki, telefonom, polnim fotografij, in občutkom, da je bil to tudi vaš dopust. Okoli 420 kilometrov na teden je število, ki ga avto komaj opazi; otroci ga ne bodo pomnili po avtu, ampak po vlaku, ki vozi v jamo, in po stopnicah, ki so jih na otoku šteli na glas.",
        ],
      },
    ],
    practical: [
      {
        title: "Vinjeta in gorivo",
        text: "Tedenska e-vinjeta za osebni avto stane 16 evrov in pokriva ves krog; kupite jo na evinjeta.dars.si ali na bencinskem servisu, velja pa od izbrane ure naprej. Gorivo je regulirano — 95-ji okoli 1,67, dizel okoli 1,94 evra za liter — z 420 kilometri na teden pa račun za tank ne bo tema dopusta. Hitrosti: 130 po avtocesti, 90 po glavnih cestah, 50 skozi kraje.",
      },
      {
        title: "Voziti z otroki",
        text: "Otroci morajo po zakonu sedeti v varnostnih sedežih, ki ustrezajo starosti in višini — to uredite pred potjo, ne na parkirišču. Etape so kratke in po ravnini, zato vožnja ni najtežji del dneva; kljub temu načrtujte postanke, ker se otroška potrpežljivost meri v prigrizkih, ne v kilometrih. Meje na tem krogu ni: Slovenija je v schengenskem območju, dokumentov torej nikamor ne vabite.",
      },
      {
        title: "Spanje",
        text: "Z družino se splačajo apartmaji in sobe z družinskimi ležišči: zajtrki gredo hitreje, večeri ceneje, pralni stroj pa reši teden. Na Bledu je v sezoni dražje in polno, v Postojni preprosteje, v Termah Olimia pa zadnji dnevi delujejo kot počitek na recept — vse je na enem mestu, bazeni gostom pa so pogosto že vključeni v nočitev.",
      },
      {
        title: "Rezervacije",
        text: "Postojnska jama obiskovalce pelje z vlakičkom po terminih — v sezoni karto za prvi jutranji termin kupite vsaj nekaj dni prej. Za Terme Olimia julija in avgusta rezervirajte zgodaj, saj kapacitete zmanjkajo; na Bledu poleti pridite pred deveto, če želite pletno brez čakanja na soncu.",
      },
      {
        title: "Kaj vlaga v kovček",
        text: "Kopalke za vsak dan tedna, dobesedno: voda je na tem krogu povsod — jezero na Bledu, Aqualuna v Olimii. Puloverji v jamo, tudi ko zunaj peče; dežena jakna v hribe; nosilček za Vintgar, kjer voziček na ožinah zagotovo zadene; prigrizki v avto, ker etapa pod dvema urama vseeno postane dolga, če je nekdo lačen.",
      },
      {
        title: "Budžet: vstopnine za 2+2",
        text: "Seštevek za družino z dvema odraslima in dvema otrokoma: Blejski grad 52 evrov (19+19+7+7), pletna 60 (20+20+10+10), Vintgar 40 (15+15+5+5), kombinirana postojnska karta okoli 128 (40+40+24+24) — skupaj 280 evrov. Družinska karta za Aqualuno doda še 50 do 67 evrov, če bazenov ni v nočitvi, ljubljanski grad pa še dve odrasli vstopnici. Realno računajte okoli 300 evrov vstopnin za družino 2+2 na teden; vinjeta je zraven še 16 evrov.",
      },
      {
        title: "Parkiranja",
        text: "V centru Ljubljane ura parkiranja stane okoli 1,20 do 2,40 evra — raje kot ulični prostor izberite eno od parkirišč ob robu in center naredite peš. Pri Postojnski jami je parkirišče brezplačno, kar družinski proračun veseli; na Bledu v sezoni mest zmanjka že dopoldne, zato pridite zgodaj. Gostje v Termah Olimia parkirajo ob nastanitvi.",
      },
    ],
    faqs: [
      {
        question: "Ali je Slovenija varna z otroki?",
        answer:
          "Da, in to na vse načine, ki jih starši na poti iščejo: pitna voda iz pipe, nizek kriminal in zdravstvo v sorazmerni bližini vsake etape. Center Ljubljane je zaprt za avte, ceste so urejene, na tem krogu pa ni območij, zaradi katerih bi spreminjali načrt.",
      },
      {
        question: "Koliko stane teden z vstopninami?",
        answer:
          "Blejski grad, pletna, Vintgar in kombinirana postojnska karta se za družino 2+2 seštejejo v 280 evrov; z družinsko karto za Aqualuno (50 do 67 evrov) ali ljubljanskim gradom se znesek dvigne. Realno računajte okoli 300 evrov vstopnin za družino 2+2 na teden, vinjeta doda še 16 evrov.",
      },
      {
        question: "Ali je Vintgar primeren za voziček?",
        answer:
          "Delno. Pot je ravninska in dolga 1,6 kilometra, a je podlaga mestoma makadam in deske, ožine pa puščajo ravno toliko prostora, da voziček gre skozi z rezervo. Z malčkom, ki že sedi, ni težav; z dojenčkom je nosilček lažja odločitev.",
      },
      {
        question: "Kaj z najstniki?",
        answer:
          "Pletna in čokoladnica za najstnike nista program. Z Bleda jih rešita kolo okoli jezera v hitrejšem tempu in Vogel — povratna žičnica stane odrasle 32, mlajše 15 evrov; za rafting po Soči pa berite vodnik Slovenija v 7 dneh, ki zahod drži okoli njega.",
      },
      {
        question: "Kdaj je najboljše obdobje?",
        answer:
          "Maj, junij in september so najlepši meseci: manj ljudi, nižje cene, voda pa še vedno topla. A šolski koledar je realnost — če lahko potujete le julija in avgusta, vse deluje, le rezervacije in jutranje termine je treba jemati resno. Z malčki, ki šole še ne obiskujejo, izkoristite junij ali september.",
      },
      {
        question: "Ali so Terme Olimia primerne za malčke?",
        answer:
          "Da. Aqualuna je poleg drč zasnovana tudi s plitvimi lagunami, kjer malčki stojijo in se igrajo brez skrbi; družinska vstopnica za dva odrasla in otroka se giblje med 50 in 67 evrov. Za popoldne je cenejša karta po 15. uri, ki stane 16 do 20 evrov.",
      },
      {
        question: "Kaj, če dežuje?",
        answer:
          "Ta krog ima naraven dežni načrt: Postojnska jama je pod zemljo in suha, Hiša eksperimentov v Ljubljani pod streho, bazeni v Termah Olimia pa dež jemljejo kot še eno vodo. Kolo okoli Bleda prestavite na naslednje jutro — vreme na Gorenjskem se vrti hitro.",
      },
    ],
    relatedSlugs: [
      "slovenija-v-7-dneh",
      "slovenija-vikend",
      "slovenija-hrvaska-10-dni",
      "hrvaski-otoki-iz-slovenije",
    ],
    relatedSloveniaIds: ["bled", "postojna", "ljubljana"],
  },
];
