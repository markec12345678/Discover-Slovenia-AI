// SLO-WINTER-1 — Smučarski vikend iz Ljubljane (SL).

import type { AdriaGuide } from "./types";

export const ADRIA_GUIDES_WINTER_SMUCI: AdriaGuide[] = [
  // Primerjalni smučarski vikend: Ljubljana → Bohinj (Vogel) → Ljubljana; Krvavec in Kranjska Gora kot alternativi.
  {
    slug: "smuci-vikend-iz-ljubljane",
    title: "Smučarski vikend iz Ljubljane: Vogel, Krvavec ali Kranjska Gora",
    metaTitle: "Smučarski vikend iz Ljubljane: Vogel ali Krvavec",
    description:
      "Tri dni, 160 kilometrov in primerjava treh smučišč: Vogel, Krvavec ali Kranjska Gora — cene vozovnic, zimske gume in spanje v Bohinju.",
    excerpt:
      "Tri dni, 160 kilometrov in ena odločitev: Vogel, Krvavec ali Kranjska Gora? Kako izbrati smučišče, kdaj postanejo zimske gume zakon in zakaj obe noči prespite v Bohinju.",
    route: "Ljubljana → Bohinj → Ljubljana",
    countries: ["SI"],
    days: 3,
    km: 160,
    heroImage: "/adria/smuci-vikend-iz-ljubljane.jpg",
    heroAlt:
      "Zasneženo smučišče Vogel nad Bohinjskim jezerom: snežne koče pod vrhovi Julijskih Alp in zasnežena strmina v zimskem dnevu",
    author: "Tanja Novak",
    date: "2026-10-27",
    readTime: 9,
    stops: [
      {
        name: "Bohinj",
        country: "SI",
        nights: 2,
        highlight:
          "Dve noči pod Voglom: gondola vas dvigne naravnost iz doline ob jezeru na proge z najlepšim razgledom v državi, večeri pa pripadajo gostilnam v Bohinjski Bistrici in sprehodom ob zamrznjenem jezeru. Od Ljubljane sem 80 kilometrov.",
      },
    ],
    sections: [
      {
        heading: "Katero smučišče izbrati: Vogel, Krvavec ali Kranjska Gora",
        body: [
          "Ta vikend je iz Ljubljane najlažji možni pobeg v sneg: do Bohinja vas pelje 80 kilometrov — 55 do Bleda po avtocesti, nato 25 po dolini ob jezero — in nazaj prav toliko, skupaj torej 160 kilometrov na tri dni. Etape so kratke, zato bo bolj kot vožnja odlovala izbira smučišča. Pozimi veljajo tudi trije okviri, ki jih letni vodniki zamolčijo: sezona teče od decembra do marca, tema pade kmalu po 16. uri, zimske gume pa so od 15. novembra do 15. marca zakonska obveznost in ne nasvet.",
          "Tri smučišča, tri filozofije. Vogel je od Ljubljane oddaljen 80 kilometrov in vleče z gondolo, ki vas dvigne naravnost iz doline ob Bohinjskem jezeru; dnevna vozovnica pride na okoli 45 evrov za odraslega, 39 za mlade in seniore ter 23 za otroke, razgled na jezero s proge pa je najlepši v deželi. Krvavec je z okoli 35 kilometri najbližje in narejen za krajši dan: okoli 45 evrov za odraslega in 28 za otroke. Kranjska Gora je z okoli 90 kilometri najdlje — okoli 49 evrov za odraslega, 44 za mladino in 30 za otroke — vrača pa z nočno smuko na Vitrancu in z vasjo, ki živi tudi zvečer. Glavna pot tega vodnika pelje na Vogel; Krvavec in Kranjska Gora sta tu kot alternativi.",
        ],
        list: [
          {
            title: "Vogel — razgled nad jezerom",
            text: "Gondola iz doline in okoli 80 kilometrov iz Ljubljane; dnevna vozovnica 45/39/23 evrov in razgled, ki ga ne ponudi nobena od drugih dveh. Izbira, če vam je pokrajina enako pomembna kot proga.",
          },
          {
            title: "Krvavec — za čas in krajši dan",
            text: "Okoli 35 kilometrov od Ljubljane, najkrajša vožnja od treh; dnevna vozovnica okoli 45 evrov za odraslega in 28 za otroke. Tu smučate, kadar sobota ne more biti cela.",
          },
          {
            title: "Kranjska Gora — za večerne ure",
            text: "Okoli 90 kilometrov in vozovnica okoli 49/44/30 evrov, zato pa nočna smuka na Vitrancu in vas, ki po temi ne zaspi. Izberite jo, kadar je večer enakovreden progi.",
          },
        ],
      },
      {
        heading: "Petek: 80 kilometrov do doline",
        body: [
          "Petkova vožnja je kratka in razločna: 55 kilometrov avtoceste do Bleda in 25 kilometrov po dolini ob Savi Bohinjki do jezera. Na avtocestnem odseku velja e-vinjeta — tedenska stane 16 evrov in pokriva vse domače odseke — nato pa cesta zapusti hitrost in se spusti v dolino, kjer sneg pogosto leži od Bleda dalje. Pred odhodom preverite gume: od 15. novembra do 15. marca so zimske gume obvezne po zakonu, tudi če je cesta črna, kot zimsko opremo pa štejejo tudi vseletne pnevmatike z vsaj 3 milimetri globokega profila.",
          "Prihod uredite tako, da bo vožnja zadnja naporna stvar dneva. Gostilne v Bohinjski Bistrici večerjajo med domačini, ob jezeru pa sta most in cerkev sv. Janeza pri Ribčevem Lasu dovolj razloga za kratek sprehod pod zmrzaljo — tema pade kmalu po 16. uri, luči v dolini pa se prižgejo zgodaj. Spanje v Bohinju pride opazno ceneje kot na Bledu: enaka gorenjska pokrajina, manj razglednic, nižji račun. Prespite obe noči tu in se zjutraj odpeljete do gondole, ki vas čaka ob koncu jezera.",
        ],
      },
      {
        heading: "Sobota: Vogel in jutranje smuči",
        body: [
          "Sobota je dan, zaradi katerega ste tukaj, zato začnite zgodaj. Žičnice na Voglu se običajno zavrtijo okoli pol devetih in kdor stoji pri gondoli pred prvo kabino, smuča po progi, ki je še njegova; kasneje dopoldne se iz doline prične stekati sobotna Slovenija in vrste za sedežnicami zadihajo drugače. Dnevna vozovnica stane okoli 45 evrov za odraslega, 39 za mlade in seniore ter 23 za otroke. Za mirnejša jutra obstaja poldnevna različica: velja od 11:30 in stane okoli 38, 33 oziroma 20 evrov.",
          "Kdor v ekipi ne smuča, ni obsojen na dolino. Panoramska gondola vozi nad smučišče tudi za razgled: povratna karta stane okoli 32 evrov za odraslega, 28 za mlade in seniore ter 15 za otroke, enosmerna pa okoli 24, 21 oziroma 12 evrov. Zgornja postaja je terasa, s katere se jezero vidi v celoti in se Julijske Alpe nadaljujejo v obzorje. Popoldne sonce omehča spodnje proge, terase se napolnijo in najlepše ure na snegu so prvo odprtje ter zadnji spusti — vmes kosilo z razgledom.",
        ],
        list: [
          {
            title: "Prva kabina",
            text: "Vogel se običajno odpre okoli pol devetih in ure takoj za odprtjem so najhladnejše, najtišje in najlepše dneva. Kdor zaspi, dobi isto smučišče — z drugo čakalno vrsto.",
          },
          {
            title: "Poldnevna vozovnica",
            text: "Velja od 11:30 in stane okoli 38 evrov za odraslega, 33 za mlade in seniore ter 20 za otroke. Vzemite jo, če se jutro začne počasi ali če smučate raje po omehčanem popoldanskem snegu.",
          },
          {
            title: "Gondola za ne-smučarje",
            text: "Povratna karta okoli 32/28/15 evrov, enosmerna okoli 24/21/12. Razgled na jezero in Julijce stoji tudi, ko proge počivajo, in je sam po sebi dovolj razloga za vikend.",
          },
        ],
      },
      {
        heading: "Nedelja: zamrznjeno jezero in odhod pred kolonami",
        body: [
          "Nedeljsko jutro pripada jezeru. Bohinj pozimi včasih zamrzne v belo ravnino in sprehod ob bregu je tišina, kakršne poletni vodniki ne morejo obljubiti: na vodi ni čolnov, ob mostu pri Ribčevem Lazu in cerkvi sv. Janeza komaj kakšen mimoidoči. In pravilo, ki ga vsak zimski vodnik dolguje bralcu: po ledu ne hodite. Ni varno, četudi se kdo domač sprehaja po njem — razgled z brega je enak, tveganje pa ne. Kava po sprehodu, ob bregu in v miru, je nato najboljši možen uvod v vožnjo domov.",
          "Odhod načrtujte pred kosilom. Povratnih 80 kilometrov teče po isti poti — 25 do Bleda in 55 po avtocesti do Ljubljane — in kdor se oprime zajtrka, pelje pred kolono, ki se po nedeljskem kosilu zgane iz Gorenjske proti mestu. Kratek postanek na Bledu se splača: otok in grad stojita pozimi skoraj prazna, pletna pa ne vozi. Vintgarske soteske v načrt ne dajajte — odprta je približno od aprila do oktobra, pozimi pač ne.",
        ],
      },
      {
        heading: "Kdaj pride polno — in kaj, če snega ni",
        body: [
          "Dva termina sta v smučanju izpostavljena kot nobena druga: božični teden in februarski zimski dopusti. Takrat se na vsa tri smučišča stisne polna država, nastanitve v dolinah podražijo in vikend, ki bi moral biti pobeg, postane gneča s smučmi. Če lahko izberete, izberite januar ali marec: enak sneg, precej manj ljudi. Izposojo opreme uredite pred vikendom — v večjih centrih po Gorenjskem dobite vse, a ob polnih terminih omarice rade ostanejo prazne, otroška oprema pa se izprazni prva.",
          "Kaj pa, če primanjkuje snega? Smučišča se odpirajo z njim: Vogel običajno okoli 19. decembra, sezona pa traja do okoli 4. aprila — odprtje je vsako leto odvisno od snežne odeje, zato razmere preverite pred odhodom. Če vas tak konec tedna doleti v Bohinju, vikend ni izgubljen: panoramska gondola vozi tudi brez smučanja, povratna karta stane okoli 32 evrov, zamrznjeno jezero v dolini pa je razlog, da se vračate tudi brez smuči.",
        ],
        list: [
          {
            title: "Termini, ki jih preskočite",
            text: "Božični teden in februar, ko so šolski zimski dopusti: proge polne, nastanitve dražje, parkirišča zasedena. Januar in marec imata isti sneg in precej več prostora.",
          },
          {
            title: "Izposoja pred vikendom",
            text: "V večjih centrih po Ljubljani in Gorenjskem najamete vso opremo, a jo rezervirajte pred vikendom; ob božiču in februarju se izprazni prva — in otroška pred vsem.",
          },
          {
            title: "Če snega ni",
            text: "Gondola na Vogel vozi za razgled tudi, ko proge počivajo: povratna karta okoli 32 evrov. Razgled na jezero in Julijce ne čaka na snežno odejo.",
          },
        ],
      },
    ],
    practical: [
      {
        title: "Zimske gume so zakon",
        text: "Od 15. novembra do 15. marca mora biti osebni avto v Sloveniji na zimskih gumah — obveznost iz zakona o pravilih cestnega prometa, ne priporočilo, in velja tudi, ko je cesta suha. Kot zimsko opremo štejejo tudi vseletne pnevmatike z vsaj 3 milimetri globokega profila. Zimske kontrole na cestah proti Gorenjski pozimi niso redkost.",
      },
      {
        title: "E-vinjeta za avtocesto",
        text: "Avtocestni odsek med Ljubljano in Bledom pokriva e-vinjeta: tedenska za osebni avto stane 16 evrov, kupite jo na evinjeta.dars.si ali na bencinskem servisu, velja pa od izbrane ure naprej. Kdor se ji želi izogniti, se pelje čez Kranj in Radovljico — počasneje, a brez računa.",
      },
      {
        title: "Izposoja opreme",
        text: "Smuči, vezi in čelade najamete v večjih športnih centrih po Ljubljani in Gorenjskem; cene se razlikujejo po centrih, rezervacija pa vam prihrani jutranje iskanje. Pred božičem in v februarju rezervirajte zgodaj — takrat se oprema izprazni, otroška pa pred vsem.",
      },
      {
        title: "Kratki dnevi in jutranja logika",
        text: "Decembra in januarja tema pade kmalu po 16. uri, smučanje pa je vseeno šport dneva: jutranje ure so najhladnejše, najtišje in najbolj prazne, popoldne pa se proge zmehčajo in napolnijo. Enako velja za ceste — jutranja vožnja na Gorenjsko je mirna, nedeljska popoldanska pa kolona.",
      },
      {
        title: "Spanje v Bohinju",
        text: "Dve noči pod Voglom sta vikend, kakršnega Bled ne ponudi: ista pokrajina in sneg, manj razglednic ter praviloma nižji račun. Penzioni, sobe in apartmaji v Bohinjski Bistrici in ob jezeru se ob božiču in februarju zapolnijo prvi — takrat rezervirajte zgodaj.",
      },
      {
        title: "Denar in kartice",
        text: "Slovenija je v evro coni in menjalnica ni potrebna; kartice sprejemajo od gondole do gostilne. Gotovino imejte za manjše koče in odročne postojanke, kjer terminal kdaj odpove; drugih potreb po njej na tem vikendu praktično ni.",
      },
      {
        title: "Gorivo",
        text: "Cene goriva so regulirane: 95-oktanski bencin stane okoli 1,67 evra na liter, dizel okoli 1,94 evra na liter, razlike med prodajalci pa so simbolične. Najdaljša etapa vikenda je 80 kilometrov — tankajte brez strategije.",
      },
    ],
    faqs: [
      {
        question: "Katero smučišče je najboljše za začetnike?",
        answer:
          "Krvavec. Proge so milejše, vožnja od Ljubljane najkrajša (okoli 35 kilometrov) in dan po potrebi skrajšate — če smučanje ne prime, izgubite najmanj. Kranjska Gora je večinsko lahka do srednje zahtevna in dobra druga izbira; Vogel je srednje zahteven in najlepši, zato primernejši od drugega dne naprej kot za prve smuke.",
      },
      {
        question: "Kdaj se odprejo smučišča?",
        answer:
          "Odvisno od snega — običajno sredi decembra. Vogel običajno odpre okoli 19. decembra in smuča do okoli 4. aprila; Krvavec in Kranjska Gora sledita podobnemu ritmu. Pred vikendom pa vselej preverite urnike in razmere na uradnih straneh smučišč, ker leto od leta ni enako.",
      },
      {
        question: "Potrebujem zimske gume?",
        answer:
          "Da, in to ni stvar okusa: od 15. novembra do 15. marca so v Sloveniji zimske gume obvezne po zakonu o pravilih cestnega prometa, tudi ko je cesta suha. Kot zimsko opremo štejejo tudi vseletne pnevmatike z vsaj 3 milimetri globokega profila. Brez njih ste ob kontroli kaznovani, s snegom na cesti pa predvsem nevarni.",
      },
      {
        question: "Koliko stane dan smučanja?",
        answer:
          "Na Voglu okoli 45 evrov za odraslega, 39 za mlade in seniore ter 23 za otroke; na Krvavcu okoli 45 evrov za odraslega in 28 za otroke; v Kranjski Gori okoli 49 evrov za odraslega, 44 za mladino in 30 za otroke. Na Voglu obstaja še poldnevna vozovnica, ki velja od 11:30, za okoli 38 evrov za odraslega. K temu prištejte izposojo opreme, ki jo rezervirajte vnaprej.",
      },
      {
        question: "Ali lahko z gondolo na Vogel tudi brez smučanja?",
        answer:
          "Da. Panoramska gondola dvigne iz doline ob Bohinjskem jezeru na razgledno postajo: povratna karta stane okoli 32 evrov za odraslega, 28 za mlade in seniore ter 15 za otroke, enosmerna pa okoli 24, 21 oziroma 12 evrov. Zgornja postaja je izhodišče sprehodov in teras z razgledom na jezero ter Julijce — pol dneva tudi za tiste, ki se smuči niti ne dotaknejo.",
      },
      {
        question: "Se ta vikend splača z otroki?",
        answer:
          "Se. Otroci vozovnice plačujejo po otroškem ceniku — na Voglu okoli 23 evrov, na Krvavcu 28, v Kranjski Gori 30 evrov — izposojo otroške opreme pa rezervirajte pred vikendom, ker se izprazni prva. Za prve smuke je najlažje na Krvavcu, februarja pa računajte na šolski dopust: več ljudi, dražje spanje. Kjer so na voljo smučarske šole, se prijavite vnaprej — otroški termini se polnijo najhitreje.",
      },
      {
        question: "Kaj, če je ob vikendu premalo snega?",
        answer:
          "Razmere preverite pred odhodom: odprtje je vsako leto odvisno od snežne odeje, Vogel pa se običajno zavrti okoli 19. decembra. Če proge mirujejo, vikend v Bohinju ni izgubljen — panoramska gondola vozi za razgled (povratna karta okoli 32 evrov), jezero včasih zamrzne v belo ravnino, gostilne v dolini pa so tople. Smuči lahko odpadejo; Gorenjska ne.",
      },
    ],
    relatedSlugs: ["slovenija-pozimi", "slovenija-v-7-dneh", "slovenija-z-otroki"],
    relatedSloveniaIds: ["bohinj", "ljubljana"],
  },
];
