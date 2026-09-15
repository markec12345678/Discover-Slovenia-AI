// SLO-LOOP-1 — Vikend v Sloveniji (SL) — domači krožni vodnik po Sloveniji.

import type { AdriaGuide } from "./types";

export const ADRIA_GUIDES_SLOOP_VIKEND: AdriaGuide[] = [
  {
    slug: "slovenija-vikend",
    title: "Vikend v Sloveniji: Ljubljana in Bled v treh dneh",
    metaTitle: "Vikend v Sloveniji: Ljubljana in Bled v treh dneh",
    description:
      "Trije dnevi in 120 kilometrov: Ljubljana v petek zvečer, Bled ob jutranji svetlobi, Vintgar in odločitev o povratku — direkt ali čez Postojno.",
    excerpt:
      "Petek v Ljubljani, sobota na Bledu, nedelja po vaši meri: krog, krajši od enega dolgega dneva za volanom na Hrvaškem. Slovenija je majhna — in to je prednost.",
    route: "Ljubljana → Bled → Ljubljana",
    countries: ["SI"],
    days: 3,
    km: 120,
    heroImage: "/adria/slovenija-vikend.jpg",
    heroAlt:
      "Ljubljansko staro mestno jedro ob reki Ljubljanici s kamnitim mostom z balustradami, grad pa stoji na hribu nad rdečimi strehami",
    author: "Marko Kovač",
    date: "2026-09-29",
    readTime: 8,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 1,
        highlight:
          "Petkova postaja: avto pustite na robu centra in si mesto vzemite peš — Tromostovje, Ljubljanica, vzpon na grad proti večeru in večerja v starem mestu, preden se naslednje jutro začne ob jezeru.",
      },
      {
        name: "Bled",
        country: "SI",
        nights: 1,
        highlight:
          "Sobotna noč in jutro, ki se štejeta: večerja ob jezeru, potem pa zgodnja pletna, grad nad jezerom in soteska Vintgar štiri kilometre stran — vse pred deseto uro.",
      },
    ],
    sections: [
      {
        heading: "Trije dnevi, dva kraja, nič suvega",
        body: [
          "Ta krog je najkrajši vodnik na tej platformi in ravno zato najlažje izvedljiv. Od Ljubljane do Bleda je 55 kilometrov po avtocesti, od Bleda do Vintgarja štirje, po okolici še kakšnih pet, nazaj pa spet 55 — skupaj 120 kilometrov, kar je manj, kot jih na Hrvaškem naredite v enem samem dolgem avtocestnem dnevu. Na vikendu ta majhnost pomeni eno samo: več časa zunaj avta kot v njem. Slovenija je majhna država, kar ni pomanjkljivost, ampak glavna prednost.",
          "Zakaj ravno Ljubljana in Bled? Ker se dopolnjujeta in ker ju avtocesta poveže v manj kot uro vožnje. Petek je mesten: sprehod po starem mestu, grad nad njim, večerja ob Ljubljanici. Sobota je alpska: jezero, grad na skali, pletna na otok in soteska v ozadju. Tretje postaje na vikendu ni treba iskati — vsak dodan kraj pomeni krajšanje obeh, ki ga nosita. In ker gre za čisto domači krog, na poti ni ne mej ne menjalnic: Slovenija je v schengenskem območju, povsod pa velja evro.",
        ],
      },
      {
        heading: "Ljubljana v enem popoldnevu in večeru",
        body: [
          "V petek prispete popoldne in naredite eno samo parkirno potezo: avto pustite na robu centra, kjer ura stane okoli 1,20 do 2,40 evrov, potem pa ga ne dotaknete več. Staro mestno jedro je majhno in se prepohodi v enem popoldnevu — Tromostovje, Prešernov trg in niz ulic ob Ljubljanici so jedro, ki si ga vzamete peš. Proti večeru se vzpnite na grad — vstopnica s povratno žičnico stane 19 evrov — in si mesto ogledate od zgoraj, ko se pod vami prižigajo prve luči.",
          "Večer je razlog, da Ljubljana na tem krogu ni le odskok: kava ob Ljubljanici, večerja v gostilni v starem mestu in terase, ki ob petkih živijo dlje kot do devetih. Naslednje jutro ne zaspate — zajtrk porabite kot gorivo in se odpeljete po avtocesti proti Bledu, da pridete ob jezero, preden se okoli njega nabere sobotna gneča.",
        ],
        list: [
          {
            title: "Tromostovje in staro mesto",
            text: "Jedro med reko in vznožjem gradu prepohodite v enem popoldnevu; ozke ulice na obeh straneh Ljubljanice so ves uvod, ki ga Ljubljana potrebuje.",
          },
          {
            title: "Ljubljanski grad",
            text: "Vstopnica s povratno žičnico stane 19 evrov; vzpon proti večeru se splača sam sebi, ko mesto pod gradom prižiga luči.",
          },
          {
            title: "Kava ob Ljubljanici",
            text: "Breg in Petkovsko sprehajališče sta en dolg niz teras; petkovo popoldne je to najboljši kotiček mesta in ne zahteva ničesar razen časa.",
          },
          {
            title: "Petkova večerja",
            text: "Stare gostilne so v petek polne, zato mizo rezervirajte že dopoldne; mesto ima jedi za vse žepne, od preprostih do svečanih.",
          },
        ],
      },
      {
        heading: "Bled brez množic",
        body: [
          "Za Bled obstaja ena ura, ki odloča vse, in to je jutranja. Ob jezeru pred osmo je voda mirna, pletna na obali čakajo prve goste in nad jezerom ni še sence gneče; po deseti se ista pokrajina spremeni v prizorišče, po katerem se sprehaja pol Ljubljane z družinskimi kolesi. Zato soboto naredite v obratnem vrstnem redu, kot ga pišejo brošure: najprej grad na skali — 19 evrov — in prva pletna na otok — 20 evrov za odrasle, 10 za otroke — šele nato zajtrk in kremšnita.",
          "Popoldne pripada Vintgarju, soteski štiri kilometre od Bleda: 1,6 kilometra lesenih stez ob reki Radovni, vstopnina 15 evrov za odrasle in 5 za otroke, odprto pa je približno od aprila do oktobra. Tudi tu jutro bije popoldne, a na vikendu zadostuje že zgodnje popoldne, če ste z gradom in pletno končali pred enajsto. Zadnji del dneva pustite jezeru: obhod po urejeni stezi meri okoli 6 kilometrov in vzame kakšno uro in pol — in je, za razliko od vsega dnevnega, brezplačen.",
        ],
        list: [
          {
            title: "Blejski grad",
            text: "19 evrov vstopnine za grad na skali nad jezerom; zgodnja ura pomeni, da pogled delite s pešci, ne z avtobusi.",
          },
          {
            title: "Pletna na otok",
            text: "Povratna vožnja s pletno stane 20 evrov za odrasle in 10 za otroke; na otoku vas čaka še 99 stopnic do cerkve.",
          },
          {
            title: "Soteska Vintgar",
            text: "15 evrov za odrasle, 5 za otroke; soteska je od Bleda štiri kilometre stran in odprta približno od aprila do oktobra.",
          },
          {
            title: "Obhod jezera",
            text: "Okoli 6 kilometrov po urejeni stezi, kakšna ura in pol hoje; najboljši brezplačni del dneva, posebno proti večeru.",
          },
        ],
      },
      {
        heading: "Kaj izpustiti brez slabe vesti",
        body: [
          "Vikend je kratek, zato je tudi seznam izpuščenih stvari del načrta in ne neprijetnost. Škocjanskih jam na ta krog ne spravite: ogledi potekajo po terminih, vožnja tja pa bi vzela polovico sobote, ki je na tem krogu namenjena Bledu. Vzpon na Triglav je še jasen primer: to je planinska tura z zgodnjo uro in pravo opremo, ne postaja na izletu — kdor Triglav prišteje med tri dni, ni računal na vzpon, ampak na goro. Oboje pustite za daljši krog.",
          "Iz muzejev ne poskušajte pregledati vseh: Ljubljana jih ima več, kot jih vikend premore, in njihova najboljša uporaba je deževen dan ali zelo vroč popoldne, ne seznam, ki ga dokončate. En muzej, ki vas res zanima, je več vreden kot pet obiskanih po obveznosti. In če vas med soboto na Bledu premami še Bohinj — upravičeno, saj je blizu — raje odločite: ali Vintgar ali Bohinj, oboje v enem dnevu pa je že zbiranje, ne potovanje.",
        ],
      },
      {
        heading: "Tretji dan: direkt ali z ovinkom",
        body: [
          "Nedeljsko jutro je na Bledu najlepše v celem vikendu: nočni gostje se odpeljejo domov, na jezeru ostane mir, ki ga sobota ni poznala, večina lokalov pa je še odprtih. Zajtrk ob vodi, kratek obhod ali le kava z razgledom — potem pa odločitev, ki je na tem krogu edino pravo razpotje: direktno domov ali z ovinkom čez Postojno. Direktno pomeni 55 kilometrov avtoceste in ste domov pred kosilom.",
          "Ovinek je za eno vrsto ljudi: za tiste, ki jih podzemlje resnično vleče. Od Bleda do Postojne je okoli 100 kilometrov, od tam do Ljubljane pa še 53 — namesto direktnih 55 kilometrov torej podaljšek, ki se ga lotite le, če jame nosite na seznamu že dlje časa. Vstopnina je okoli 35 evrov, ogledi pa potekajo po terminih, ki jih rezervirate vnaprej. Če se vam ob nedelji zdi to le še ena vstopnina na koncu polnega vikenda, jo preskočite brez slabe vesti: Postojna je čudovita, a najboljša je kot del daljšega kroga, ne kot utrujen prilepek na nedeljo.",
        ],
      },
    ],
    practical: [
      {
        title: "E-vinjeta za vikend",
        text: "Za avtocesto Ljubljana–Bled potrebujete e-vinjeto; tedenska za osebni avto stane okoli 16 evrov in pokriva ves vikend s ponedeljkom vred. Kupite jo na evinjeta.dars.si ali na bencinskem servisu, velja pa od izbrane ure — nastavite začetek na petek dopoldne in je zadeva rešena do naslednjega petka.",
      },
      {
        title: "Parkiranje v Ljubljani",
        text: "V centru se ura parkiranja giblje med okoli 1,20 in 2,40 evrov, odvisno od cone in dneva. Naredite eno samo potezo: parkirajte na robu starega mesta in ostalo opravite peš — iskanje prostega mesta v samem jedru je najslabši možen začetek petkovega večera.",
      },
      {
        title: "Parkiranje na Bledu",
        text: "Parkirišča ob jezeru so plačljiva po urah; v sezoni in ob koncih tedna se napolnijo že dopoldne. Zgodnja ura tukaj ne reši le množic na gradu, ampak tudi prostor za avto — in obratno: kdor pride po deseti, plača z živci.",
      },
      {
        title: "Nočitev: petek Ljubljana, sobota Bled",
        text: "Bled je ob koncih tedna dražji in se polni prvi, zato sobotno noč rezervirajte, še preden se dogovorite o čemerkoli drugem. V Ljubljani je petkova noč milejša do žepa, nastanitev blizu centra pa ni nujna — mesto je dovolj majhno, da se zjutraj odpeljete na avtocesto iz katerega koli predela.",
      },
      {
        title: "Sobotno jutro na Bledu",
        text: "Po deseti uri se iz Bleda naredi prizorišče: parkirišča polna, čakanje na pletno, promet na stezi okoli jezera. Bodite tam pred osmo — takrat je jezero tisto, zaradi katerega so vas starši nekoč vozili tja, in ne tisto, ki ga delite z avtobusi.",
      },
      {
        title: "Brez avta?",
        text: "Med Ljubljano in Bledom obstaja javni prevoz, vikend brez avta torej ni nemogoč. A računajte: na Vintgar in zgodnje jutro okoli jezera se z lastnim avtom pride precej preprosteje, vozni red pa se s sobotnim jutrom ne prima na vaše načrte, ampak na svoj urnik.",
      },
    ],
    faqs: [
      {
        question: "Ali trije dni zadostijo za Ljubljano in Bled?",
        answer:
          "Da, pod enim pogojem: jutranjo disciplino. Ljubljana se naredi v enem popoldnevu in večeru, Bled v enem dnevu, ki se začne pred osmo uro. Kdor spi do desetih, vidi množice, ne kraja — trije dnevi sta za ta dva kraja več kot dovolj, a samo zjutraj.",
      },
      {
        question: "Koliko stane tak vikend z vstopninami?",
        answer:
          "Štiri glavne postavke — ljubljanski grad 19 evrov, Blejski grad 19 evrov, pletna 20 evrov in Vintgar 15 evrov — skupaj pride okoli 75 do 80 evrov na osebo. Pridodate spanje, hrano in gorivo, kar je na 120 kilometrih drobnost. Otroci imajo povsod ugodnejše vstopnine, zato se družinski seštevek izide mileje.",
      },
      {
        question: "Kdaj priti na Bled, da ni množic?",
        answer:
          "Pred osmo uro spomladi in septembra; v juliju in avgustu tudi takrat ne računajte na samoto, ampak le na manj ljudi. Grad in prvo pletno opravite ob odprtju, obhod jezera pa premaknite na večer, ko se dnevni gostje že vračajo.",
      },
      {
        question: "Ali potrebujem avto?",
        answer:
          "Ne nujno — javni prevoz med Ljubljano in Bledom obstaja in vikend z njim gre. A Vintgar je od Bleda štiri kilometre in zgodnje jutro okoli jezera se naredi lažje z lastnim avtom. Če pridete z vlakom ali letalom, si avto vzemite vsaj za soboto.",
      },
      {
        question: "Kaj, če je Vintgar zaprt?",
        answer:
          "Soteska je odprta približno od aprila do oktobra — pozimi je zaprta. Takrat se krog spremeni, ne pa tudi pokvari: zimski Bled v megli in snegu je lep na svoj način, obhod jezera ostane, muzeji v Ljubljani pa so ravno prava dolžina za en deževen dan.",
      },
      {
        question: "Ali potrebujem vinjeto?",
        answer:
          "Da, če se peljete po avtocesti: tedenska e-vinjeta za osebni avto stane okoli 16 evrov in pokriva ves vikend. Kupite jo na spletu ali na bencinskem servisu. Alternativa je stara cesta mimo Kranja in Radovljice — brez vinjete, a počasnejša; na vikendu se to šteje kot žrtev časa.",
      },
    ],
    relatedSlugs: [
      "slovenija-v-7-dneh",
      "istria-vikend-iz-slovenije",
      "slovenija-v-10-dneh",
      "bled-plitvice-split",
    ],
    relatedSloveniaIds: ["ljubljana", "bled", "vintgar"],
  },
];
