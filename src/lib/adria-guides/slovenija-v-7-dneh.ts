// SLO-LOOP-1 — Slovenija v 7 dneh (SL) — domači krožni vodnik po Sloveniji.

import type { AdriaGuide } from "./types";

export const ADRIA_GUIDES_SLOOP_V7: AdriaGuide[] = [
  // Prvi domači krožni vodnik: Ljubljana → Bled → Bohinj → Bovec → Kobarid → Postojna → Piran → Ljubljana.
  {
    slug: "slovenija-v-7-dneh",
    title: "Slovenija v 7 dneh: popolni krog od Bleda prek Soče do Pirana",
    metaTitle: "Slovenija v 7 dneh: popolni krožni road trip",
    description:
      "Sedem dni in okoli 420 kilometrov: Bled in Bohinj, prelaz Vršič, turkizna Soča, Kobarid, Postojna in Piran — krog brez mej in izgubljenih ur.",
    excerpt:
      "Sedem dni, okoli 420 kilometrov in nobene meje: Bled, Vršič, turkizna Soča, jame Krasa in Piran — prvi krog, ki ga zapeljete povsem po Sloveniji.",
    route: "Ljubljana → Bled → Bohinj → Bovec → Kobarid → Postojna → Piran → Ljubljana",
    countries: ["SI"],
    days: 7,
    km: 420,
    heroImage: "/adria/slovenija-v-7-dneh.jpg",
    heroAlt:
      "Turkizna reka Soča v Bovcu, ki se vije pod skalnimi stenami Julijskih Alp med zelenimi bregovi in prodnimi plitvinami",
    author: "Tanja Novak",
    date: "2026-09-15",
    readTime: 11,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 1,
        highlight:
          "Dan prvi in izhodišče kroga: staro mesto pod gradom, sprehod po bregovih Ljubljanice in večer v gostilni, preden zjutraj odvijete na Gorenjsko.",
      },
      {
        name: "Bled",
        country: "SI",
        nights: 1,
        highlight:
          "Dan drugi, ob zori: pletna do otoka (20 evrov, dobrih 15 minut vsako smer), grad na skali (19 evrov) in obhod 6 kilometrov po ravni stezi. Kremšnita je obvezna, vrsta pred znamenito slaščičarno pa ne.",
      },
      {
        name: "Bohinj",
        country: "SI",
        nights: 1,
        highlight:
          "Bledova tišja sestra: Vogel (32 evrov povratno) z razgledom na Julijce in jezero, v katerem se lahko tudi kopate. Od tod čez Vršič v Bovec — 45 kilometrov serpentin.",
      },
      {
        name: "Bovec",
        country: "SI",
        nights: 1,
        highlight:
          "Turkizna Soča z vseh fotografij in adrenalin za en dan: rafting stane okoli 55 do 62 evrov na osebo. Prenočite pod Kaninom.",
      },
      {
        name: "Kobarid",
        country: "SI",
        nights: 1,
        highlight:
          "Muzej prve svetovne vojne, slap Kozjak in kostnica nad mestom; gastronomija je iz majhnega kraja naredila destinacijo. Od tod do Postojne okoli 90 kilometrov prek Cerknega.",
      },
      {
        name: "Piran",
        country: "SI",
        nights: 1,
        highlight:
          "Zadnji ovinek kroga: beneško staro mestno jedro, soline v zalivu in večerja z ribami. Zadnji dan je 105 kilometrov do Ljubljane.",
      },
    ],
    sections: [
      {
        heading: "Krog, ki ga naredite v enem dopustu",
        body: [
          "Vsi vodniki, ki jih doslej berete na tej strani, vas peljejo iz Slovenije; ta prvi pelje okrog nje. Krog teče v obratni smeri urinega kazalca: iz Ljubljane se dvignete na Gorenjsko, prestopite Vršič, se spustite v dolino Soče, ovijete Kras in se po obali obrnete v Ljubljano. Etape so kratke — do Bleda 55 kilometrov, čez prelaz v Bovec 45, od Kobari do Postojne okoli 90 — in skupaj se števec ustavi pri okoli 420 kilometrih. Najdaljša vožnja je zadnji dan, 105 kilometrov od Pirana do Ljubljane, in tudi ta je dolga le, če naletite na nedeljsko povratno kolono.",
          "Na tem krogu ni ne mej ne menjalnic: Slovenija je v schengenskem območju in v evro coni, zato dokumentov ne pokažete niti enkrat. Na avtocesti velja e-vinjeta — tedenska za osebni avto stane 16 evrov — in pokriva vse domače odseke; kupite jo na evinjeta.dars.si ali na bencinskem servisu, velja pa od izbrane ure naprej. Časovnica je prav tako prijazna: najlepši obdobji sta maj in junij ter september in oktober, ko so jutra hladna, planine polne barv in parkirišča na pol prazna. Julij in avgust prineseta vrh vsega — tudi vrste pri pletnah, gondolah in pred jamo.",
        ],
      },
      {
        heading: "Bled in Bohinj: prva dva dneva",
        body: [
          "Iz Ljubljane odvijete zgodaj; 55 kilometrov po avtocesti vas pripelje na Bled, še preden se množice zbudijo. Jezero obhodite peš — 6 kilometrov ravne steze v dobri uri in pol — otok pa si ogledate s pletno, lesenim čolnom z stoječim veslačem. Vožnja traja dobrih 15 minut vsako smer, karta za odraslega stane 20 evrov, otroška 10, na otoku pa vas čaka še 99 stopnic do cerkve. Grad na skali (19 evrov za odraslega) je dražji del dneva, razgled z njega pa edini, s katerega vidite jezero, otok in Karavanke v istem okviru.",
          "Tretji dan pripada Vintgarju in Bohinju. Soteska je štiri kilometre od Bleda; sprehod po 1,6 kilometra lesene steze stane 15 evrov za odraslega in 5 za otroke, odprta pa je približno od aprila do oktobra — odločite se že ob zajtrku, ker se ob deveti naredi kolona. Nato 25 kilometrov naprej na Bohinj, jezero brez gradu in razglednic, z vodo, v kateri se lahko kopate. Vogel se dviga nad južnim bregom: povratna gondola stane 32 evrov za odraslega in 15 za otroke, z vrha pa se Julijci razprostrejo v širino, zaradi katere Bled postane le uvod.",
        ],
        list: [
          {
            title: "Jutranja logika",
            text: "Pletno, grad in Vintgar opravite pred deveto; ob deseti se na Bledu zbudijo izletniki in prvi avtobusi. Večer ob jezeru je vedno mirnejši od jutra.",
          },
          {
            title: "Kremšnita brez čakanja",
            text: "Recept je povsod isti; slaščičarna z najdaljšo vrsto ni nič boljša od kavar ob jezeru. Kupite jo tam, kjer je senca in kjer sedež ni problem.",
          },
          {
            title: "Vogel namesto vzpona",
            text: "Gondola vas dvigne na razgled, ki bi si ga peš prislužili s celim dnem hoje; ob koncih tedna vozovnico kupite vnaprej, ker se pred postajo deli vrsta.",
          },
          {
            title: "Bohinj za kopanje",
            text: "Bled gledate z brega, na Bohinju pa se vanj zaplavate: travnata obala je najboljša plaža tega kroga in ne stane nič.",
          },
        ],
      },
      {
        heading: "Čez Vršič v dolino Soče",
        body: [
          "Četrti dan je dan prelaza. Iz Bohinja se čez Vršič v Bovec pelje 45 kilometrov, a kilometrov tu skoraj ne štejejo: cesta se zvije v 50 ozkih serpentin, se prebije na 1 611 metrov in je najvišja cestna točka v Sloveniji. Peljite počasi in brez napada, ob srečanju z avtobusom pa se umaknite na izsede, ki so za to narejeni. Na trentarski strani se ob cesti prikaže izvir Soče — reka, ki bo naslednje dni barvala vaš dopust, tukaj šele prihaja na dan. Pozimi je prelaz zaprt, ponavadi od novembra do maja; odprtje je odvisno od snežne odeje, obvoz pa teče po dolini mimo Tolmina.",
          "Bovec je prestolnica adrenalina: kajaki, soteskanje, kolesarjenje po starih vojaških cestah. Če izbirate eno stvar, naj bo rafting: pol dneva po Soči stane okoli 55 do 62 evrov na osebo, mirnejša družinska različica pa pride na zgornjo mejo cenika. Voda je takšna, da si jo zapomnite po hrbtenici tudi sredi julija, vodniki pa skrbijo, da se skupina smeji bolj kot trepeta. Za popoldne ne načrtujte nič — dolina deluje najbolje, ko ji pustite, da se zgodi, spat pa greste utrujeni na pravi način.",
        ],
        list: [
          {
            title: "Izvir Soče",
            text: "Kratka označena steza s prelaza vodi do kraja, kjer reka prihaja na dan izpod skal. Turkiz je tu od samega začetka, ljudi pa je najmanj zgodaj zjutraj.",
          },
          {
            title: "Rafting dopoldan",
            text: "Dopoldanski termini imajo na vodi manj ladij in mirnejši ritem; prijavite se dan prej, ker se skupine polnijo z odjavami hotelov.",
          },
          {
            title: "Slap Boka",
            text: "Slap, ki pada v dveh skokih s stene nad Bovcem, se vidi že z mostu na cesti proti Žagi; kratek ovinek do razgledne točke se splača.",
          },
        ],
      },
      {
        heading: "Kobarid in mirujoči zahod",
        body: [
          "Peti dan je najkrajša etapa — 23 kilometrov po dolini — in najpočasnejši dan kroga, kar je prav. Kobarid se je naučil živeti s svojo zgodovino: muzej prve svetovne vojne na trgu razloži soško fronto brez patosa, vstopnina je skromna, ogled pa traja ravno toliko, da razumete, kaj se je tu zgodilo in zakaj nad mestom stoji italijanska kostnica. Do nje vodijo stopnice in razgled, ki Sočo pokaže v celotnem ovinku. In potem je tu hrana: gastronomija je iz Kobari naredila destinacijo, ena najbolj znanih restavracij v državi pa ima rezervacije mesece vnaprej — okoli nje je zraslo dovolj dobrih gostiln za vsak proračun.",
          "Pred odhodom si vzemite jutro za slap Kozjak: iz Kobari je kratek sprehod ob potoku, steza pa se konča v skalni dvorani, kjer voda pada v zeleno kotanjo, ki si jo poleti prisvajajo kopalci. Vstopnina je simbolična glede na to, kar vidite. Tempa tega dne ne pospešujte — zahodna Slovenija deluje, kot da so jo umaknili iz urnika, in prav zato deluje. Naslednji dan vas čakajo jame in obala; tukaj še zadnjič počasi — idealno s kavo na trgu v Kobari.",
        ],
      },
      {
        heading: "Kras in Piran na zadnjem ovinku",
        body: [
          "Šesti dan je najdaljša etapa: od Kobari do Postojne okoli 90 kilometrov čez Cerkno, po cesti, ki se vije, a se splača, ker vas v Postojni čaka izbira dveh jam. Postojnska jama je velika predstava: vlakiček, ki je vključen v ceno, osvetljeni rovi in ogled, ki teče gladko kot po tirnicah; odrasla vstopnica stane okoli 35 evrov, kombinirana z Predjamskim gradom pa okoli 40. Škocjanske jame so druga šola: 22 evrov, voden ogled v manjših skupinah in kanjon, ob katerem se počutite v zemlji, ne v atrakciji. Kdor potuje z otroki, ki ljubijo vlake, izbere Postojno; kdor beži pred množicami, Škocjan.",
          "Iz Postojne vam do Pirana ostane še 55 kilometrov po cesti mimo Sežane in zadnji ovinek kroga. V Piran se peljete počasi: staro mestno jedro je za avte zaprto, parkirate na Fornacu ob vhodu v mesto, noter pa vstopite peš, kar je edina ureditev, ki deluje. Zvečer mesto odigra svojo najboljšo predstavo — svetloba na beneških fasadah, soline čez zaliv in večerja z ribami, ki so bile zjutraj še v isti vodi. Zadnji dan je 105 kilometrov do Ljubljane: po avtocesti, po zajtrku, brez naglice.",
        ],
        list: [
          {
            title: "Postojnska jama",
            text: "Odrasli okoli 35 evrov, vlakiček vključen, parkirišče pri jami pa brezplačno. Termin rezervirajte po spletu in izberite prvega dneva, da ste pred skupinami.",
          },
          {
            title: "Kombinirana karta",
            text: "Jama in Predjamski grad skupaj stane okoli 40 evrov. Grad je zrasel v steno nad vhodom v jamo, zgodba o razbojniškem vitezu Erazmu pa je otrokom boljša od filma.",
          },
          {
            title: "Škocjanske jame",
            text: "Odrasli 22 evrov, otroci do šestega leta starosti brezplačno, mlajši od osemnajstih pa okoli 10 evrov. Ogled je voden, skupine manjše, v veliki dvorani pa se zgodi občutek, da ste prav v zemlji.",
          },
          {
            title: "Piran zvečer",
            text: "Staro mestno jedro je čez dan polno; najlepše je po sedmi, ko izletniki odidejo in sedež najdete brez pogajanj.",
          },
        ],
      },
      {
        heading: "Kaj vodniki preskočijo",
        body: [
          "Ta krog ima tudi temno plat in vanjo moramo biti pošteni. Bled je najbolj obiskana točka države in julija ter avgusta to ni priporočilo, ampak opozorilo: ob deseti dopoldne je jezero obrobljeno z avtobusi, pletne plujejo v koloni, za kremšnito pa stoji vrsta, ki nima nobene zveze z okusom. Enako velja za Postojno opoldne in za Vogel ob sobotah. Izven vrha sezone se iste poti peljejo skoraj same. Če je edini možni termin julij, vse skupaj reši disciplina zore: kjer ste prvi, ni množic.",
          "Kaj je overrated? Bledski otok sam po sebi — cerkev je lepa, najlepši pogled nanj pa je s brega; slaščičarna z najdaljšo vrsto, ker je recept isti po vsem mestu; in Portorož, če niste prišli na kazino. Ljubljanski grad stane 19 evrov skupaj z žičnico, notranjost pa je takšna, da jo pozabite, še preden se spustite — vzpnite se raje peš po ulicah in prihranite denar za večerjo. In ne poskušajte se z avtom v piransko staro mestno jedro: zaprto je in ne bo vas izpustilo.",
        ],
      },
    ],
    practical: [
      {
        title: "E-vinjeta in hitrosti",
        text: "Na avtocestah velja e-vinjeta: tedenska za osebni avto stane 16 evrov, kupite jo na evinjeta.dars.si ali na bencinskem servisu, velja pa od izbrane ure. Hitrosti so 130 kilometrov na uro na avtocesti, 90 na ostalih cestah in 50 v naseljih; na Vršiču je edino pametno pravilo počasi.",
      },
      {
        title: "Kdaj voziti",
        text: "Maj in junij ter september in oktober sta najlepša: jutra so hladna, planine polne barv, jame in gondole pa brez čakanja. Julij in avgust prineseta vrste pri vseh velikih vstopih — kdor takrat pelje, naj dneve gradi okoli zgodnjih ur. Pozimi je krog možen, a je Vršič zaprt.",
      },
      {
        title: "Spanje",
        text: "Bled je najdražja noč kroga: nastanitve ob jezeru se v sezoni dvignejo prve. V Bohinju, Bovcu in Kobari spite občutno ugodneje v isti pokrajini, v Piranu pa cene rastejo s koncem tedna. V juliju in avgustu rezervirajte zgodaj.",
      },
      {
        title: "Parkiranje",
        text: "V Bledu in Bohinju se ob jezerih parkira po urah z avtomati; imejte drobiž ali aplikacijo. V Piranu je staro mestno jedro zaprto — parkirajte na Fornacu in vstopite peš. V conah v središču Ljubljane znaša ura od približno 1,20 do 2,40 evra.",
      },
      {
        title: "Denar in kartice",
        text: "Slovenija je v evro coni: menjalnica vam ni potrebna, kartice pa sprejemajo povsod, od hotelov do kmetij s sirom. Gotovino imejte za tržnice in stojnice; drugih potreb po njej na tem krogu praktično ni.",
      },
      {
        title: "Rezervacije",
        text: "Postojnska jama se obiskuje po terminih — v sezoni rezervirajte vsaj dan prej in izberite prvi termin. Za rafting v Bovcu se prijavite pred prihodom v dolino, vozovnico za Vogel pa ob koncih tedna kupite po spletu, ker kapaciteta gondole ni neskončna.",
      },
      {
        title: "Gorivo",
        text: "Cene goriva so regulirane: 95-oktanski bencin stane okoli 1,67 evra na liter, dizel okoli 1,94 evra na liter, razlike med prodajalci pa so simbolične. Tankajte brez strategije — najdaljša etapa kroga je 105 kilometrov.",
      },
    ],
    faqs: [
      {
        question: "Ali potrebujem vinjeto za ta krog?",
        answer:
          "Da, če vozite po avtocestah — na tem krogu zlasti odsek Ljubljana–Bled in povratek iz Pirana. Tedenska e-vinjeta za osebni avto stane 16 evrov in pokriva vse slovenske odseke; kupite jo na evinjeta.dars.si ali na bencinskem servisu, velja pa od izbrane ure. Avtocesti se lahko tudi izognete — država je majhna, ceste pa lepše, čeprav počasnejše.",
      },
      {
        question: "Kdaj je najboljši čas za ta krog?",
        answer:
          "Maj in junij ter september in oktober: vreme je stabilno, planine cvetijo ali pordečijo, parkirišča in termini pa dihajo. Julij in avgust prineseta vrh gneče pri vseh velikih vstopih. Pozimi je krog mogoč, a je Vršič zaprt — takrat peljite v dolino Soče mimo Tolmina.",
      },
      {
        question: "Ali se splača Postojna ali Škocjan?",
        answer:
          "Obe, a pošteno: Postojnska jama (okoli 35 evrov) je velika, gladko organizirana predstava z vlakičem in množicami, ki jih urnik obvladuje; Škocjanske jame (22 evrov) so divji kanjon v manjših skupinah, z občutkom, da ste v zemlji. Z majhnimi otroki ali vlakom na mislih — Postojna; s kamero in tišino na mislih — Škocjan.",
      },
      {
        question: "Koliko stane krog s skoraj vsemi vstopninami?",
        answer:
          "Seštejmo: Vintgar 15, pletna 20, Blejski grad 19, Vogel 32, rafting med 55 in 62 ter Postojna okoli 35 evrov — skupaj okoli 180 evrov na osebo. Z Škocjanom namesto Postojne pride račun na okoli 165 evrov. E-vinjeta (16 evrov) je edini strošek na avto in ne na osebo; gorivo in spanje sta ločeni vrstici.",
      },
      {
        question: "Kako je z mejami?",
        answer:
          "Ni jih. Slovenija je v schengenskem območju in celoten krog poteka po njenem ozemlju — dokumentov ne boste pokazali niti enkrat. Tudi valute ni treba menjati, saj je država v evro coni; kartice sprejemajo od Bleda do Pirana. Zadoščita običajna osebna dokumenta.",
      },
      {
        question: "Ali je Vršič odprt vse leto?",
        answer:
          "Ne. Prelaz na 1 611 metrih je pozimi zaprt, ponavadi od novembra do maja, odprtje pa je odvisno od snežne odeje. Če naletite na zaprto cesto, se iz Bohinja v dolino Soče peljite mimo Podbrda in Mosta na Soči — obvoz je daljši, a lep, in vse glavne točke kroga ostanejo dosegljive tudi pozimi.",
      },
      {
        question: "Kje spati z omejenim proračunom?",
        answer:
          "Ne na Bledu — tam so nočitve najdražje in se prve zapolnijo. Bohinj in Kobarid nudita občutno ugodnejše spanje v isti pokrajini, Bovec pa ima širok izbor turističnih kmetij in apartmajev. Izven sezone se cene po vsem krogu še spustijo; v juliju in avgustu pa rezervirajte mesece vnaprej.",
      },
    ],
    relatedSlugs: [
      "slovenija-v-10-dneh",
      "slovenija-z-otroki",
      "istria-vikend-iz-slovenije",
      "hrvaska-obala-prakticni-vodnik",
    ],
    relatedSloveniaIds: ["ljubljana", "bled", "soca", "piran"],
  },
];
