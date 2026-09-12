// ADRIA-1b — jadranski vodniki (6–10): koridor na jug — najem avta čez meje,
// Črna gora, Albanija, Bosna in Hercegovina ter hrvaški otoki.

import type { AdriaGuide } from "./types";

export const ADRIA_GUIDES_PART2: AdriaGuide[] = [
  // 6. Praktični priročnik najema: kaj urediti, preden avto pelje čez mejo.
  {
    slug: "najem-avta-cross-border",
    title: "Najem avta za potovanje iz Slovenije na Hrvaško, v Bosno, Črno goro in Albanijo",
    metaTitle: "Najem avta na jug: Hrvaška, Bosna, Črna gora, Albanija",
    description:
      "Kdaj se splača najem namesto lastnega avta, kaj preveriti pri agenciji, kako urediti prestop meje v Bosno, Črno goro in Albanijo ter varščino.",
    excerpt:
      "Praktični vodnik za najem avta, ki bo peljal čez meje: kaj mora pisati v pogodbi, kaj na zelenem kartonu, koliko varščine blokirajo in kdaj se najem splača.",
    route: "Ljubljana → Zagreb → Sarajevo → Mostar → Split → Ljubljana",
    countries: ["SI", "HR", "BA"],
    days: 7,
    km: 1200,
    heroImage: "/adria/najem-avta-cross-border.jpg",
    heroAlt:
      "Vrstica osebnih avtomobilov na sončnem parkirišču pred stavbo najemniške agencije, v ozadju cestni znak za avtocesto",
    author: "Tanja Novak",
    date: "2026-08-07",
    readTime: 12,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 0,
        highlight:
          "Prevzem: preden se usedete za volan, potrdite, da so Bosna in morebitne južne države vpisane v pogodbo, ne le ustno obljavljene.",
      },
      {
        name: "Zagreb",
        country: "HR",
        nights: 1,
        highlight:
          "Prva etapa in prva zaplatka HAC; zvečer Tkalćićeva ulica, ki pokaže, kako najet avto diha po avtocesti.",
      },
      {
        name: "Sarajevo",
        country: "BA",
        nights: 2,
        highlight:
          "Baščaršija, ćevapi in Tunel spasa — dva dneva, ki upravičita doplačilo za bosanski prestop v pogodbi.",
      },
      {
        name: "Mostar",
        country: "BA",
        nights: 2,
        highlight:
          "Stari most in tekija v Blagaju ob izviru Bune, slapi Kravice pa na dometu enem dnevnem izletu iz mesta.",
      },
      {
        name: "Split",
        country: "HR",
        nights: 1,
        highlight:
          "Dioklecijanova palača in slovo na Rivi pred zadnjo etapo domov, na kateri cestnine niso v ceni najema.",
      },
    ],
    sections: [
      {
        heading: "Lasten avto ali najem: najprej računica",
        body: [
          "Večina Slovencev na jug pelje lastni avtomobil in to je večinoma pametna odločitev. Najem pa pride v poštev, ko je domači avto za daljšo pot prestar ali premajhen, ko želite na 1 500 kilometrih sedeže, ki jih hrbet še drži, ali ko se potopljeni v južne dežave nočete ukvarjati s tem, kaj bo z avtom, ko se vrnete. Odločitev je vedno računica in nikoli sentiment.",
          "Pri lastnem avtu računate z obrabo, morebitnim podaljšanjem kritja zavarovanja na jug in z dejstvom, da vse napake na poti ostanejo vaše. Pri najemu pa so stroški vidnejši: najemnina, doplačila za države, varščina in čas, ki ga prebijete pri številku agencije. Za teden ali dva je lastni avto praviloma cenejši; najem začne zmagovati, ko je pot dolga, dežave na njej pa štiri.",
          "Ker najet avto iz slovenske agencije pomeni tudi slovensko rezervo in slovenski telefon za pomoč na poti, je ta vodnik napisan predvsem z vidika prevzema doma. Za najem v Zagrebu ali Splitu velja enaka logika, le pogodba je takrat hrvaška in prestopi se urejajo po njenih določilih.",
        ],
        list: [
          {
            title: "Kaj prištejete lastnemu avtomobilu",
            text: "Obrabo in vzdrževanje po dolgi poti, podaljšanje kritja avtojamstva na izbrane države in urejanje zelenega kartona pri zavarovalnici.",
          },
          {
            title: "Kaj prištejete najemu",
            text: "Najemnino, doplačilo za vsako izbrano državo, blokirano varščino na kartici in krajši dopust ob pogodbenih drobnih tiskih.",
          },
          {
            title: "Kdaj najem zmaga",
            text: "Dolg krog skozi več dežav, starejši domači avto, potovanje v najbolj vročem delu poletja in vsak primer, ko potrebujete klimatsko napravo, ki dela.",
          },
          {
            title: "Kdaj zmaga lastni avto",
            text: "Krajša pot, izkušen avto in voznik, ki ima urejeno zavarovanje in dokumente — pri tednu dni po Hrvaški je račun skoraj vedno na njegovi strani.",
          },
        ],
      },
      {
        heading: "Pogodba in dovoljenje za prestop meje",
        body: [
          "Najpomembnejši list na tem potovanju ni karta niti potni list, ampak najemna pogodba. Vsaka država, v katero želite voziti, mora biti v njej izrecno navedena. Za Hrvaško je odobritev samoumevna in nikoli ni vprašanj; za Bosno in Hercegovino jo je treba zaprositi, za Črno goro in Albanijo pa se zgodi, da je agencija ne podeli ne glede na doplačilo. Zato vprašanje zastavite še pred rezervacijo, ne šele ob prevzemu.",
          "Manjše domače agencije južne meje rade izključujejo iz strahu pred škodami na slabših cestah, večje mednarodne pa jih ponavadi omogočijo ob enkratnem ali dnevnem doplačilu. Tisto, kar vam povedali na številku, naj bi se prav tako končalo v pogodbi: ustna odobritev ob izročitvi ključev namreč ne pomeni ničesar, če se na meji ali po nesreči izkaže drugače.",
          "Ob urejanju prestopov preverite še kilometrino. Za pot po jugu izberite ponudbo z neomejenimi kilometri, sicer vas bo vsak ovinek po Boki ali Hercegovini stal več, kot je vreden. Če se vožnje delite, naj bo vsak voznik vpisan v pogodbo — tudi ta postavka je cenejša pred odhodom kot pa kazen po nesreči.",
        ],
      },
      {
        heading: "Zavarovanje, zeleni karton in varščina",
        body: [
          "Osnovno zavarovanje s kritjem škode je v ceni, a praviloma z lastnim deležem, ki ob nesreči pride iz vašega žepa. Dodatno kritje, ki delež zniža ali odpade, se splača pri vsaki poti, na kateri se boste peljali po kamnitih ulicah, makadamih in otoških cestah. Preverite predvsem, ali so v kritju stekla, pnevmatike in podvozje, kajti ravno te tri postavke na jugu trpijo največ.",
          "Zeleni karton je listina, ki dokazuje, da je avto zavarovan za tretje osebe v tujini, in pripada floti agencije. Za Hrvaško je vpis vedno pokrit, za Bosno pogosto, za Črno goro in Albanijo pa vpisa ni nujno. Ob prevzemu zahtevajte karton in si ga preberite: države so na njem označene s kraticami, prečrtana kratica pa pomeni, da se tja ne peljete.",
          "Varščino blokirajo ob prevzemu na kreditni kartici — debetne pogosto niso sprejete — in jo sprostijo po vrnitvi, kar lahko traja tudi nekaj tednov. Znesek je odvisen od kategorije vozila in višine lastnega deleža, običajno nekje med nekaj sto in prek tisoč evrov, zato na kartici pustite dovolj prostora na limiti. Stanje avta fotografirajte ob prevzemu in ob vrnitvi; pet minut s telefonom najmanj dvakrat v življenju prihrani prepir.",
        ],
      },
      {
        heading: "Enosmerni najemi: kdaj imajo smisel",
        body: [
          "Enosmerni najem — prevzem v Ljubljani, vračilo v Splitu ali Zagrebu — je mogoč predvsem pri večjih agencijah, a doplačilo je praviloma visoko in pri čezmejnih kombinacijah še višje, pogosto v višini nekaj dni najema. Zato se izplača le, če se domov vračate trajektom brez avta ali letalom, torej kadar krožna vožnja preprosto ni možna.",
          "Za klasični krog iz Slovenije na jug in nazaj je smiselna le povratna izposoja. Vračilo v isti agenciji je brez presenečenj, izposojevalna mesta na letališču Brnik pa so odprta dlje v večer, kar se ob poznejših vrnitvah izkaže za priročnejše, kot se zdi ob rezervaciji.",
          "Pri načrtovanju vračila preverite urnik izposojevalnice za nedelje in praznike ter možnost oddaje ključev izven delovnega časa. Če avto vračate ob šesti zjutraj pred odhodom na etapo, hočete, da je postopek zabeležen, in ne odvisen od tega, kdaj bo nekdo prišel odpreti pisarno.",
        ],
      },
      {
        heading: "Cene, rezervacija in skrite postavke",
        body: [
          "Cena najema ima izrazit sezonski ritem. Za julij in avgust rezervirajte že spomladi, saj se najboljša razmerja med ceno in kategorijo izpraznijo zgodaj, poleti pa ostanejo dražji razredi in avtomati. Junij in september lahko prineseta opazno nižjo ceno na dan, tedenski najem pa je cenejši od vsotedenskega — razlika pokriva kakšen dodaten dan na obali.",
          "V ceni, ki jo vidiš ob rezervaciji, redko stoji vse. Pregledati je treba doplačila: mladega voznika, če je komu manj kot petindvajset let; dodatnega voznika; otroški sedež, če je potreben; prevzem na letališču; doplačilo za vsako državo prestopa; gorivo po dogovoru o vrnitvi s polnim rezervoarjem, ki je najbolj poštena rešitev in edina, ki jo priporočamo.",
          "Velikost avta izberite po jugu, ne po avtocesti. Kompakten avto je v ozkih ulicah Hvara, Kotorja in Mostarja milost, parkirišča pa so oblikovana po avtomobilih iz časa, ko jih je bilo manj. Kabriolet ali terenski avtomobil na tej poti prineseta zgodbo, kompakten pa mirno živčevje.",
        ],
      },
      {
        heading: "Vzorčni teden z najetim avtom",
        body: [
          "Da priročnik ne ostane pri teoriji, je tu krog, na katerem se vse našteto izkaže v praksi: sedem dni, okoli 1 200 kilometrov, dve državi izven schengenskega območja v eni pogodbi. Prvi dan se odpeljete v Zagreb, drugi dan pa skozi Posavino in mejno kontrolo do Sarajeva, kamor prispete še za popoldanski sprehod po Baščaršiji.",
          "Tretji in četrti dan pripadata Sarajevu: en dan za staro mesto od sebilja do Vijećnice in mosta Latina, drugi za Tunel spasa in vzpenjačo na Trebević. Peti dan vas dolina Neretve mimo Konjica pelje v Mostar, šesti dan pa je za Stari most, Blagaj in slape Kravice. Sedmi dan se po obali vrnete skozi Split in po avtocesti domov — ta dan je najdaljši, zato ga začnite zgodaj.",
          "Na tem krogu morata biti v pogodbi vpisana Hrvaška in Bosna in Hercegovina, na zelenem kartonu pa vpis BA. Cestnine plačujete sproti: v Sloveniji velja e-vinjeta, ki jo pri domači floti praviloma pokriva registracija, a to potrdite ob prevzemu; na Hrvaškem plačujete po odsekih na zaplatkah; v Bosni naletite na posamične nizke cestnine na avtocestnih odsekih.",
        ],
      },
    ],
    practical: [
      {
        title: "Dovoljenje za prestop meje",
        text: "Vsaka država, v katero želite voziti, mora biti izrecno vpisana v najemno pogodbo. Za Hrvaško je odobritev samoumevna, za Bosno in Hercegovino jo je treba zaprositi, za Črno goro in Albanijo pa se zgodi, da agencija ne podeli. Vožnja v državo, ki ni v pogodbi, razveljavi zavarovalno kritje.",
      },
      {
        title: "Zeleni karton pri najemu",
        text: "Karton pripada floti agencije, zato skupaj s pogodbo zahtevajte tudi njega in preverite vpise: Hrvaška je pokrita vedno, Bosna velikokrat, Črna gora in Albanija pa vpisa nujno nimata. Prečrtana kratica na kartonu pomeni, da se v to državo z tem avtom ne peljete.",
      },
      {
        title: "Varščina in kartice",
        text: "Varščino blokirajo ob prevzemu na kreditni kartici, debetne pogosto niso sprejete. Sprostitev po vrnitvi lahko traja do nekaj tednov, zato na limiti pustite prostor. Stanje avta fotografirajte ob prevzemu in ob vrnitvi, pa naj bodo slike še tako navidez odveč.",
      },
      {
        title: "Vinjete in cestnine na poti",
        text: "Slovensko e-vinjeto ima domača flota praviloma urejeno, a to potrdite pri prevzemu. Hrvaške vinjete ni: cestnine plačate po odsekih na zaplatkah HAC in niso vključene v najem. V Bosni, Črni gori in Albaniji naletite na posamične cestnine, ki jih prav tako plačate ločeno.",
      },
      {
        title: "Dokumenti, ki jih vozite s sabo",
        text: "V avtu imejte najemno pogodbo, izvod prometnega dovoljenja in zeleni karton flote. Na kontrolah v državah izven schengenskega območja jih bodo želeli videti, zato naj bodo v predalu pri roki in ne pod prtljago na dnu prtljažnika.",
      },
      {
        title: "Kdaj rezervirati",
        text: "Za julij in avgust rezervirajte že spomladi: izbor kategorij in cen je tedaj najširši, v vrhu sezone pa ostanejo dražji razredi. Tedenski najem je cenejši od vsotedenskega, junij in september pa prineseta nižje cene brez vrhunskih množic.",
      },
    ],
    faqs: [
      {
        question: "Ali lahko z najetim avtom iz Slovenije vozim v Bosno, Črno goro in Albanijo?",
        answer:
          "Odvisno od agencije in pogodbe. Mednarodna družba bosanski prestop običajno dovoli ob doplačilu, Črna gora in Albanija pa sta v pogodbah pogosto izključeni. Zato vprašanje rešite pred rezervacijo: države morajo biti vpisane v pogodbo, ustna odobritev ob izročitvi ključev ne šteje.",
      },
      {
        question: "Kaj se zgodi, če z najetim avtom vozim v državo, ki ni navedena v pogodbi?",
        answer:
          "Kršitev pogodbe: zavarovalno kritje preneha veljati, škodo, ukradene predmete ali okvaro pa bi poravnali sami, do višine vrednosti avtomobila vred. Če vas je v takšno državo pot zavila nepričakovano, se pred prehodom javite agenciji in uredite doplačilo z vpisom.",
      },
      {
        question: "Koliko varščine mi bodo blokirali?",
        answer:
          "Znesek je odvisen od kategorije avtomobila in višine lastnega deleža; običajno gre za vsoto nekaj sto do prek tisoč evrov. Blokirajo jo na kreditni kartici ob prevzemu in sprostijo po vrnitvi ter preverbi stanja, kar lahko traja tudi nekaj tednov — v tem času naj bo znesek kar najmanj obremenjen.",
      },
      {
        question: "Ali se splača enosmerni najem, na primer prevzem v Ljubljani in vračilo v Splitu?",
        answer:
          "Le v redkih primerih. Medkrajevno doplačilo je visoko, čezmejno pa še višje in pogosto višje od cene nekaj dni najema. Splača se, če se vračate letalom ali trajektom brez avta; sicer vzemite krožni najem in se vrnili po isti agenciji.",
      },
      {
        question: "Ali potrebujem zeleni karton, če najamem avto?",
        answer:
          "Karton pripada floti agencije in ga dobite skupaj s pogodbo. Pomembni so vpisi na njem: za Hrvaško je pokrit vedno, za Bosno, Črno goro in Albanijo pa preverite kratico pri prevzemu. Če vpisa ni, v tej smeri z najetim avtom ne peljete.",
      },
      {
        question: "Kdaj je najem avta cenejši?",
        answer:
          "Zunaj vrha sezone. Junij in september sta lahko precej ugodnejša od avgusta, tedenski najem pa cenejši od vsotedenskega. Rezervirajte zgodaj, izberite neomejeno kilometrino in avto vrnite s polnim rezervoarjem — te tri poteze skupaj prinesejo največ.",
      },
    ],
    relatedSlugs: [
      "kotor-crna-gora-iz-slovenije",
      "albanija-z-avtom-iz-slovenije",
      "hrvaska-obala-prakticni-vodnik",
    ],
    relatedSloveniaIds: ["ljubljana", "maribor", "celje"],
  },

  // 7. Boka Kotorska: fjordski prizor, dosegljiv z osebnim avtomobilom.
  {
    slug: "kotor-crna-gora-iz-slovenije",
    title: "Kotor in Črna gora iz Slovenije: road trip prek Pelješkega mosta",
    metaTitle: "Kotor in Črna gora z avtom iz Slovenije",
    description:
      "Road trip v Črno goro: Split in Dubrovnik na poti, Pelješki most, Boka Kotorska, Perast, Lovćen in Budva. Okoli 750 km in 7 dni z nasveti za mejo.",
    excerpt:
      "Črna gora je bližje, kot se zdi: Pelješki most odpelje mimo Bosne, za Dubrovnikom pa se odpre Boka, zaliv, ki ga gledate še, ko ste že doma. Sedemdnevni načrt z mejami in evri.",
    route: "Ljubljana → Split → Dubrovnik → Kotor → Perast → Lovćen → Budva",
    countries: ["SI", "HR", "ME"],
    days: 7,
    km: 750,
    heroImage: "/adria/kotor-crna-gora-iz-slovenije.jpg",
    heroAlt:
      "Staro mestno jedro Kotorja ob Boki Kotorski z obzidjem, ki se vzpenja po strmem pobočju proti trdnjavi na vrhu hriba",
    author: "Marko Kovač",
    date: "2026-08-12",
    readTime: 9,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 0,
        highlight:
          "Zgodnji izhod po avtocesti: prvi dan gre za okoli 460 kilometrov do Splita, da se dolga pot razdeli na dva obvladljiva dela.",
      },
      {
        name: "Split",
        country: "HR",
        nights: 1,
        highlight:
          "Nočitev na pol poti: Dioklecijanova palača zvečer in jutranja kava na Rivi, preden se nadaljuje proti Pelješkemu mostu.",
      },
      {
        name: "Ston",
        country: "HR",
        nights: 0,
        highlight:
          "Solane in srednjeveško obzidje ob vhodu na Pelješac ter školjke v konobi — pravi postanek po prehodu Pelješkega mostu.",
      },
      {
        name: "Dubrovnik",
        country: "HR",
        nights: 1,
        highlight:
          "Obzidje in Stradun na poti, ker stoji komaj dobrih 90 kilometrov pred Kotorem in ker bi bilo škoda ga preskočiti.",
      },
      {
        name: "Kotor",
        country: "ME",
        nights: 3,
        highlight:
          "Baza za Boko: staro mestno jedro pod Obzidjem, ki se po več kot tisoč stopnicah povzpne do trdnjave San Giovanni.",
      },
      {
        name: "Perast",
        country: "ME",
        nights: 0,
        highlight:
          "Baročno mestece ob Boki in čoln na otoček Gospa od Škrpjela, kjer čolnarji pripeljejo in počakajo.",
      },
      {
        name: "Lovćen",
        country: "ME",
        nights: 0,
        highlight:
          "Serpentine iz Kotorja čez Njeguše do mavzoleja na Jezerskem vrhu; pogled sega od Jadrana do Skadarskega jezera.",
      },
      {
        name: "Budva",
        country: "ME",
        nights: 1,
        highlight:
          "Staro mestno jedro na rtu in plaže riviere kot slovo pred povratkom, ki ga začnete zgodaj zjutraj.",
      },
    ],
    sections: [
      {
        heading: "Zaliv, ki je videti kot fjord",
        body: [
          "Boka Kotorska ni fjord v strogem pomenu, a občutek je prav takšen: gore se dvigajoju neposredno iz morja, voda med njimi je globoko mirna, obale pa si sledijo kot odstavki iste zgodbe. Ta prizor je od Ljubljane oddaljen okoli 750 kilometrov, kar pomeni, da je Črna gora z osebnim avtom najbolj oddaljena dežela, ki jo še smiselno naredite v enem tednu dopusta.",
          "Pot ima dva dela. Prvi vodi po znanem koridorju mimo Splita in Dubrovnika, kjer Pelješki most od leta 2022 omogoča vožnjo mimo bosanskega koridorja Neum. Drugi del je kratek in počasen: za Dubrovnikom preidete mejo, obalna cesta se ovije okoli Boke in pot se spremeni v tisto, zaradi katere ste se odpeljali.",
          "Črna gora ni v Evropski uniji in ni v schengenskem območju, zato boste dvakrat na kontroli — enkrat tja, enkrat nazaj. Zato pa se vam ob vrnitvi ni treba ubadati z menjalnico: država ima evro za uradno valuto, plačila pa se dokončajo s kartico v vsakem mestu in z gotovino v vsaki konobi.",
        ],
      },
      {
        heading: "Pelješki most in pot do Dubrovnika",
        body: [
          "Prvi dan je najdaljša etapa: okoli 460 kilometrov do Splita, kar pomeni pet do šest ur z odmori. Nočitev v Splitu pot razdeli na dva človeška dneva in zvečer prinese palačo, v kateri se življenje nikoli ni ustavilo, jutranja kava na Rivi pa najboljši možni start proti jugu.",
          "Drugi dan se po avtocesti spustite do Ploč, kjer cesta zavije na Pelješki most. Po prehodu se ustavite v Stonu: solane delujejo po stoletnem redu, obzidje nad mestom je med najdaljšimi srednjeveškimi v Evropi, školjke iz Mali Stona pa so razlog, da ta postanek ni izbirni. Od tod se po obalni cesti peljete do Dubrovnika, kamor prispete še za večerjo pod obzidjem.",
          "Tretji dan je kratek in polepšan: dobrih 90 kilometrov do meje in naprej do Kotorja. Mejo s Črno goro preidete na prehodu Karasovići–Deleliji; v sezoni se tam znvažijo kolone, zato je jutro boljši čas od popoldneva. Po prehodu se cesta spusti k morju in kmalu se pred vami odpre Boka — trenutek, ki ga boste najrajši ponovili.",
        ],
      },
      {
        heading: "Boka: Kotor, Perast in Obzidje",
        body: [
          "Kotor je mesto, ki ga spoznavate v plasteh. Staro mestno jedro je labirint trgov in ulic s stotimi cerkvami in tisočerimi muckami, Obzidje nad njim pa se po stopnicah — kakih tisoč in več jih je — povzpne do trdnjave San Giovanni. Vzpon vzame kakšni uri in pol mirnega tempa in se poplača s pogledom na celoten zaliv; pojutrišnjem je zanka za noge najboljša ideja dneva.",
          "Perast leži petnajst minut vožnje severneje in je nasprotje: ena obala, ena ulica, palače iz časov, ko je bilo mesto pomorska sila. Pred njim stojita dva otočka: sv. Jurij z benediktinskim samostanom in Gospa od Škrpjela, ki so ga prebivalci stoletja nasipavali s kamnom in ladjami, dokler ni zrasel otoček s cerkvijo. Čolnarji vas odpeljejo in počakajo, vožnja traja kakih deset minut.",
          "V sezoni v Kotor pristajajo križarke in mesto se jih zaveda po glavnem trgu. Najboljši dan je tisti, ko ladja ni v pristanišču; če je, se umaknite na Obzidje ali v Perast in se v staro mesto vrnite po popoldanski uri, ko se skupine umaknejo na ladje.",
        ],
        list: [
          {
            title: "Obzidje Kotorja",
            text: "Več kot tisoč stopnic do trdnjave San Giovanni; vzpon zgodaj zjutraj ali proti večeru, s točo vode in z nagrado v obliki najboljšega pogleda na Boko.",
          },
          {
            title: "Gospa od Škrpjela, Perast",
            text: "Nasipani otoček s cerkvijo in muzejem, do katerega vas peljejo čolnarji z obale; skupaj z ogledom mesteca naredite izlet za dopoldne.",
          },
          {
            title: "Serpentine na Lovćen",
            text: "Stara cesta iz Kotorja s pogledom na zaliv pod sabo; vsako ovinek je razlog za postanek, zato vozite počasi in brez načrta.",
          },
          {
            title: "Razgledna točka nad Kotorjem",
            text: "Pred serpentinami, na cesti proti Njegušam: mestno jedro pod tablico na dnu zaliva, s katerim se konča vsak album s te poti.",
          },
          {
            title: "Sveti Stefan",
            text: "Otočka s starih zidovi, danes hotelska ekskluziva, ki se gleda z razgledne točke ob cesti proti Budvi — postanek petih minut in pogled, ki ostane.",
          },
        ],
      },
      {
        heading: "Lovćen, Njeguši in Budva",
        body: [
          "Če se iz Kotorja peljete na Lovćen, se na jugovzhod odpravite po stari cesti skozz Njeguše. Vasica v hribovskem kotlu je rojstni kraj Njegoša in dom pršuta in sira, ki ju prodajajo v vsaki hiši; cesta naprej se vzpne v narodni park Lovćen, kjer na Jezerskem vrhu stoji mavzolej, vklesan v vrh gore. Vhod je dolgo stopnišče, nagrada pa razgled, ki sega od Jadrana prek Skadarskega jezera do albanskih gora.",
          "Cez dan se lahko vrnete v Kotor po isti serpentinini ali zaključite krog na budvanski rivieri. Budva je najbolj mestni del Črne gore: staro jedro na rtu, plaže ob rivieri in večeri, ki se ne končajo zgodaj. Petnajst kilometrov južneje se ob cesti pokaže Sveti Stefan, otoček, ki je postal logotip države.",
          "Kdor ima dan več, ga lahko zapusti za Skadarsko jezero, ki se začne takoj za Lovćenom na meji z Albanijo, ali za podaljšek do Ulcinja. Temu vodniku pa je najbližja različica s tremi nočmi v Kotorju in eno v Budvi, ker tako pot do meje in nazaj ostane čimbolj kratka.",
        ],
      },
      {
        heading: "Meja, evri in kdaj na pot",
        body: [
          "Mejo s Črno goro preidete dvakrat in vsakokrat s kontrolo, saj država ni v schengenskem območju. Glavni prehod na tej smeri je Karasovići–Deleliji; v juliju in avgustu se pred njim naberejo zamude od pol ure naprej, ob koncih tedna pa še več. Zgodnje jutro je najbolj zanesljiva ura, povečer pa druga; čakalne čase se splača preveriti pred odhodom.",
          "Za dokumente velja preprosto pravilo: potni list je varna izbira. Osebna izkaznica se na tem prehodu za državljane Evropske unije v zadnjih letih občasno priznava, a praksa se je spreminjala, zato pogoje preverite pred odhodom — najmanj prijeten trenutek za ugotavljanje je kolona pred zaporno roko.",
          "Najlepši meseci za Boko so junij in september: morje je toplo, večeri mirni, cene dostopnejše. Julij in avgust prineseta vrhunec vsega skupaj — tudi križark in kolon. Maj je svež in cvetoč, a morje takrat še zidi od mraza; oktober je na jadranski strani Črne gore pogosto še topel in mil.",
        ],
      },
      {
        heading: "Kje spati in kaj jesti",
        body: [
          "V Kotorju spanje izberite med starim mestnim jedrom, kjer so apartmaji v kamnitih hišah, in okolico zaliva — Dobrota in Prčanj sta mirnejši, a še vedno ob vodi. Budva prinese najširšo ponudbo in najvišje avgustovske cene; kampi ob Boki in rivieri pa rešujejo račun, če pot poteka s šotorom ali prikolico.",
          "Jedi iščite ob Boki: riba na gradelah, črni rižot in školjke, ob tem pa njeguški pršut in sir z gorske vasi, ki jih nese cesta na Lovćen. Vino po jedi naj bo vranac, črnogorska sorta, ki se vendarle ne pije na razglas, ampak ob pogledu na zaliv, kamor spada.",
        ],
      },
    ],
    practical: [
      {
        title: "Meja s Črno goro",
        text: "Črna gora ni v schengenskem območju, zato mejo preidete s kontrolo; glavni prehod za smer iz Dubrovnika je Karasovići–Deleliji. V juliju in avgustu se tam naberejo zamude, zato odidite zgodaj zjutraj ali preverite čakalne čase pred odhodom. Za dokumente velja potni list kot varna izbira.",
      },
      {
        title: "Zeleni karton",
        text: "Za Črno goro zeleni karton običajno potrebuje vpis države — to pred odhodom preverite pri svoji zavarovalnici, saj brez vpisa meja ne bi smela prepustiti. Z najetim avtom uredite vpis pri agenciji, ki vam mora pokazati karton s kratico ME.",
      },
      {
        title: "Evro in plačila",
        text: "Črna gora ima evro kot uradno valuto, menjalnica torej ne potrebujete. Kartice sprejemajo v mestih in turističnih krajih; za manjše konobe, tržnice in vstopnine ob razgledih imejte gotovino.",
      },
      {
        title: "Cestnine in gorivo",
        text: "Vinčete Črna gora nima; posamične odseke, na primer predor Sozina na poti proti Baru, se plača po odsekih, na trasi do Kotorja in Budve pa cestnine praktično ni. Črpalke so goste ob glavnih cestah in sprejemajo kartice.",
      },
      {
        title: "Zdravstveno zavarovanje",
        text: "Evropska kartica zdravstvenega zavarovanja v Črni gori ne velja, saj država ni v Evropski uniji. Pred odhodom sklenite turistično zdravstveno zavarovanje, ki krije zdravljenje in morebitni prevoz domov.",
      },
      {
        title: "Razdalje in časi",
        text: "Od Ljubljane do Kotorja je okoli 750 kilometrov; vožnjo razdelite na dva dni z nočitvijo v Splitu ali Dubrovniku. Dubrovnik in Kotor ločita dobrih 90 kilometrov, Kotor in Budva pa dobrih 20; serpentina na Lovćen zahteva počasno vožnjo in preračun na uro in več.",
      },
    ],
    faqs: [
      {
        question: "Koliko kilometrov je od Ljubljane do Kotorja?",
        answer:
          "Okoli 750 kilometrov, kar pomeni devet do deset ur vožnje z mejama in odmori. V enem kosu je to mogoče, a ne pametno; ta načrt pot razdeli z nočitvijo v Splitu in Dubrovniku, povratek pa vodi po isti osi in se začne zgodaj zjutraj.",
      },
      {
        question: "Ali potrebujem potni list za Črno goro?",
        answer:
          "Potni list je varna izbira. Osebna izkaznica se za državljane Evropske unije na tem prehodu občasno priznava, a praksa se je v zadnjih letih spreminjala, zato pogoje preverite pred odhodom. Za otroke veljajo enaka pravila — vsak potrebuje svoj dokument.",
      },
      {
        question: "Koliko časa traja prestop meje pri Dubrovniku?",
        answer:
          "Izven vrha sezone minute, v juliju in avgustu pa od pol ure do ure in več, ob koncih tedna še dlje. Glavni prehod je Karasovići–Deleliji; zgodnje jutro in pozen večer sta najbolj zanesljiva. Pred odhodom preverite čakalne čase, saj se pretok dneva razlikuje.",
      },
      {
        question: "Ali se Boko Kotorsko da obiskati kot izlet iz Dubrovnika?",
        answer:
          "Da, dobrih 90 kilometrov je premalo za izgovor, in en dan v Kotorju s postankom v Perastu je sicer mogoč. A ta zaliv zaživi še, ko se turisti vrnejo na avtobuse — zato so v tem načrtu tri noči v Kotorju in ena v Budvi, ne ena sama dnevna vožnja.",
      },
      {
        question: "Kdaj je najlepše v Boki?",
        answer:
          "Junij in september: morje je toplo, večeri mirni, kolone krajše, križark manj. Julij in avgust prineseta največ vsega skupaj, maj cvetoče hribovje in svežino, oktober pa na obali pogosto še poletne temperature z manj ljudmi.",
      },
      {
        question: "Ali se splača vzpon na Obzidje Kotorja?",
        answer:
          "Da, in to je edina stvar na tej poti, za katero ni alternativnega mnenja. Več kot tisoč stopnic se premaga v dobri uri in pol, zgoraj pa se zaliv razprostre v celoti. Pojdite zgodaj zjutraj ali proti večeru, vzemite vodo in obutev, ne pajočke.",
      },
      {
        question: "Kako se iz Kotorja najbolje vrne v Slovenijo?",
        answer:
          "Obalna osa čez Dubrovnik in Pelješki most je najbolj tekoča: dobrih 750 kilometrov do Ljubljane je v enem dnevu mogočih, če se odpeljete pred sedmo zjutraj in mejo pri Karasovićih učinkovito izognete z umikom na zgodnje dopoldne. Pametneje je pot razdeliti s prenočitvijo v Splitu ali Zadru — zadnji dan je tako samo še avtocesta domov, ne pa maraton, ki ga začnete po kosilu.",
      },
    ],
    relatedSlugs: [
      "hrvaski-otoki-iz-slovenije",
      "albanija-z-avtom-iz-slovenije",
      "hrvaska-obala-prakticni-vodnik",
    ],
    relatedSloveniaIds: ["ljubljana", "piran", "portoroz"],
  },


  // 8. Albanija: najdaljša etapa koridorja — Tirana, Ksamil, Butrint, Gjirokastër.
  {
  slug: "albanija-z-avtom-iz-slovenije",
  title: "Albanija z avtom iz Slovenije: dva tisoč kilometrov do Ksamila in nazaj",
  metaTitle: "Albanija z avtom iz Slovenije: road trip v 10 dneh",
  description:
    "Road trip v Albanijo iz Slovenije: meja pri Sukobinu, zeleni karton, leki in ceste, Tirana, Ksamil, Butrint in Gjirokastër v desetih dneh.",
  excerpt:
    "Najdaljša etapa jadranskega koridorja: 900 kilometrov do Tirane, leki v denarnici, ovinki namesto avtocest in Ksamil na koncu poti. Deset dni, 2 000 kilometrov in štiri kontrole — potovanje, ki si ga boste še leta pripovedovali.",
  route: "Ljubljana → Split → Dubrovnik → Podgorica → Shkodër → Tirana → Ksamil → Gjirokastër",
  countries: ["SI", "HR", "ME", "AL"],
  days: 10,
  km: 2000,
  heroImage: "/adria/albanija-z-avtom-iz-slovenije.jpg",
  heroAlt:
    "Kamnito mesto Gjirokastër s strehami iz skrilavca in gradom na hribu, po ulici sprehajalci poletnega jutra.",
  author: "Tanja Novak",
  date: "2026-08-16",
  readTime: 13,
  stops: [
    {
      name: "Ljubljana",
      country: "SI",
      nights: 0,
      highlight:
        "Zgodnji izhod doma: prva etapa meri dobrih 460 kilometrov do Splita, zato vsaka ura, ki jo prihranite zjutraj, pomeni manj vožnje v najbolj vročem delu dneva.",
    },
    {
      name: "Split",
      country: "HR",
      nights: 1,
      highlight:
        "Prva razpolovitev poti: večer v Dioklecijanovi palači in jutro na Rivi, preden se cesta čez Pelješki most vije proti Dubrovniku.",
    },
    {
      name: "Dubrovnik",
      country: "HR",
      nights: 1,
      highlight:
        "Zadnja evrska postaja pred jugovzhodom: Stradun in obzidje na enem popoldnevu, saj je od tod do Podgorice le dobrih 150 kilometrov.",
    },
    {
      name: "Podgorica",
      country: "ME",
      nights: 1,
      highlight:
        "Zadnja noč v evrih: četrt Stara Varoš ob Morači za večer in jutro, rezervirano za črnogorsko kontrolo in kratko etapo do albanske meje.",
    },
    {
      name: "Shkodër",
      country: "AL",
      nights: 1,
      highlight:
        "Prvi stik z Albanijo: trdnjava Rozafa nad sotočjem rek Drin in Bunë ter ulica Kolë Idromeno, mestna dnevna soba s kavaricami in sprehajalci.",
    },
    {
      name: "Tirana",
      country: "AL",
      nights: 2,
      highlight:
        "Skanderbegov trg, Et'hem Bey džamija, Blok s kavaricami in gondola na Dajti — dva dneva sta za prestolnico prava mera in ne luksuz.",
    },
    {
      name: "Ksamil",
      country: "AL",
      nights: 2,
      highlight:
        "Plaže pod tremi otočki in Butrint dvajset minut stran: baza za jug, kjer jutro pomeni morje, popoldne pa starine in senco borov.",
    },
    {
      name: "Gjirokastër",
      country: "AL",
      nights: 1,
      highlight:
        "Kamnito mesto pod gradom in zadnja noč pred povratkom: strehe iz skrilavca, bazar in — če vam dan ustreza — tržni dan.",
    },
  ],
  sections: [
    {
      heading: "Zakaj Albanija — in zakaj v desetih dneh",
      body: [
        "Od Ljubljane do Tirane je po cesti dobrih 900 kilometrov — približno toliko, kolikor jih je do Amsterdama, le da pot ne teče po ravnini, ampak po hrvaški obali, čez črnogorsko hribovje in v deželo, v kateri boste menjali evre za leke. Ta oddaljenost naredi selekcijo: do Ksamila se nihče ne zapelje slučajno in prav zato obala še diha drugače. Kdor je avgusta iskal parkirno mesto na rivi v Hvaru ali v Dubrovniku, ve, kaj išče na jugu: ceno stopnjo nižje, gnečo stopnjo nižje in plažo, na katero še pride z brisačo.",
        "Zemljepisna logika poti je enostavna: Albanija leži za Hrvaško in Črno goro in vsak obvoz prek Srbije ali Makedonije pomeni več kilometrov in več mej, kot jih pot potrebuje. Zato je osa Ljubljana – Split – Dubrovnik – Podgorica – Shkodër edina, ki jo priporočam: 460 kilometrov do Splita poje prvi dan, 230 do Dubrovnika drugi, Pelješki most pa od leta 2022 vodi mimo bosanskega Neuma in s tem tudi mimo njegovih dveh mej. Obala, ki jo poznate, vas odpelje do dežele, ki je še ne.",
        "Ta krog je najdaljša etapa te serije vodnikov: deset dni, okoli 2 000 kilometrov in štiri države, od katerih zadnja vzame polovico časa in večino vtisov. Deset dni je spodnja meja, ne luksuz — štirje dnevi gredo za vožnjo tja in nazaj, južni Albaniji pa morate pustiti vsaj tri noči, sicer se 900 kilometrov do Tirane ne splača. Kdor ima teden dni, naj ostane pri Boki; kdor ima dva, lahko doda Berat ali dolino Valbone in Albanijo spozna v celoti.",
      ],
    },
    {
      heading: "Meje, dokumenti in zeleni karton",
      body: [
        "Na tem krogu ste štirikrat na kontroli — po dvakrat na vsaki meji izven schengenskega območja. Slovenija in Hrvaška od leta 2023 delita schengensko območje, zato prvo mejo preidete brez ustavljanja; o stroških na njej odloča HAC z zaplatkami po odsekih, ne pa carinik. Prvi postanek z listinami je meja s Črno goro pri Karasovićih, drugi meja z Albanijo pri Sukobinu in Muriqanu. V juliju in avgustu se pred obema naberejo kolone; zgodnje jutro je najbolj zanesljiva ura v obeh smereh.",
        "Za Črno goro in Albanijo je zeleni karton obvezen in vpis obeh držav se pri zavarovalnici uredi v petih minutah — najcenejših pet minut celotnega potovanja. Če kratica AL na kartonu ni, vas na Muriqanu ne bodo obrnili: ob prehodu stojijo kioski, kjer za okoli 15 evrov kupite mejno zavarovanje za petnajst dni. Rešitev je solidna in povsem zakonita, a vprašajte se, zakaj bi zavarovanje plačevali dvakrat, če domači vpis stane drobiž ali nič.",
        "Za dokumente velja staro pravilo poti na jugovzhod: potni list je varna izbira. Z osebno izkaznico državljani Evropske unije na obeh mejah večinoma pridejo čez, a praksa se je menjavala od leta do leta in od prehoda do prehoda, najmanj primeren trenutek za ugotavljanje pa je kolona pred zaporno roko. V predalu imejte potni list, prometno dovoljenje in zeleni karton skupaj — kontrole so kratke in vljudne, radi pa vidijo vse tri listine naenkrat.",
      ],
    },
    {
      heading: "Lek, menjalnice in cene",
      body: [
        "Albanija ni v evroobmočju in plačilna valuta je lek: en evro je vreden približno sto lekov, kar računanje poenostavi bolj, kot se zdi — ceno v lekih delite s sto in imate evre. Menjalnice so povsod: v Tirani stojijo na vsakem vogalu, v Shkodru, Ksamilu in Gjirokastëru pa vsaj po ena ob glavni ulici; tečaji so si podobni, provizije majhne ali sploh jih ni, zato menjave ni treba načrtovati kot podvig. Evri, ki jih vzamete s seboj, imajo eno samo nalogo: da jih enkrat zamenjate.",
        "Kartice v mestih delujejo brez zagat: hoteli, restavracije in trgovine v Tirani ter na turističnem jugu jih sprejemajo brez pretresovanja. Po deželi pa vlada gotovina — črpalke ob magistralah, tržnice in stojnice z dobrotami računajo v lekih, zato imejte zalogo, ki pokrije dan vožnje in jutro na tržnici. Gorivo je ceneje kot v Sloveniji in na Hrvaškem, kar na krogu s tremi ali štirimi rezervoarji prinese občuten znesek, ki se na jugu hitro najde, kamor ga dati.",
        "Cenovna gladina je stopnjo pod hrvaško obalo, in to ne le pri kavi: soba, večerja z vinom in ležalnik gredo po isti logiki, le številke so manjše. Iskreno pa mora biti tudi to: Ksamil ni več skrivnost in avgustovske cene to pokažejo — raven je še vedno pod Dubrovnikom in Hvarom, zunaj vrha sezone pa se razlika še poveča. Edini strošek, ki ga enakovredna hrvaška pot nima, je petnajst evrov mejnega zavarovanja; vse ostalo račun vleče navzdol.",
      ],
    },
    {
      heading: "Ceste: petsto kilometrov ni petsto kilometrov",
      body: [
        "Cestna resnica Albanije je deljena. Od Podgorice do Shkodra peljeta črnogorski odsek čez Tuzi in SH1 po albanski strani — skupaj dobrih 60 kilometrov umirjene vožnje; od Shkodra proti Tirani vajeti prevzamejo odseki A1, ki po kakovosti držijo korak z zahodom. Vse ostalo so magistrale: ceste z enim imenom in tisoč obrazi, tu nove, tu luknjaste, polne ovinkov, kolesarjev brez luči, pešcev na robu vozišča in traktorjev brez napovedi. Temu primerna je hitrost: povprečno računajte na petdeset do šestdeset kilometrov na uro.",
        "Iz tega sledi najpomembnejši preračun poti: petsto kilometrov v Albaniji ni petsto kilometrov v Avstriji. Etapo, ki jo avtocesta vzame v štirih urah, tu drži cel dan — pot od Tirane do Ksamila meri dobrih 290 kilometrov in zahteva pet do šest ur, Shkodër–Tirana pa je 95 kilometrov za dobri dve uri. Zato načrt dneva pišite v urah in števec pustite števcu. Ponoči pa ne vozite: razsvetljava je skromna, obrobe cest pa zasedejo pešci, kolesarji in živina, ki jih žaromet najde šele deset metrov pred sabo.",
      ],
      list: [
        {
          title: "Hitrost in preračun časa",
          text: "Povprečna hitrost na magistralah pade na 50–60 km/h; etapa 300 kilometrov traja pet do šest ur in ne tri. Načrt dneva pišite v urah in vsaki etapi prištejite rezervo za postanke, luknje in iskanje poti.",
        },
        {
          title: "Kolesarji, pešci in živina",
          text: "Na vozišče se zagrne vse živo: kolesar brez luči, pešec na robu, krava na sredini. Vozite s predpostavko, da bo za vsakim ovinkom nekdo — in praviloma bo tudi bil.",
        },
        {
          title: "Prehitevanje",
          text: "Prehitevanje na magistralah poteka z dogovorom migalk in z roko iz okna. Počakajte na raven odsek z dolgim pogledom; podvig na ovinku je najkrajša pot do lokalnega mehanika.",
        },
        {
          title: "Črpalke in rezervoar",
          text: "Črpalk je ob magistralah dovolj, a ne enakomerno: natočite pri polovici rezervoarja in ne šele pri rezervni lučki. Gotovina v lekih pride prav tam, kjer terminal odkloni tujo kartico.",
        },
      ],
    },
    {
      heading: "Tirana: dve noči, en trg in ena gondola",
      body: [
        "Tirana je mesto, ki ga spoznavate peš in s kavo v roki. Središče je Skanderbegov trg s kipom narodnega junaka na konju; ob njem stoji Et'hem Bey džamija, majhna in bela, edina v mestu s freskami, ki so komunizem preživele — razglasili so jo za spomenik in zaprli, barve pa so ostale. Ob trg se naslanjata še stolp z uro in Narodni muzej z mozaičnim pročeljem, sam trg pa je očiščen avtomobilov in narejen za ljudi, kar v prestolnici ni samoumevno.",
        "Iz trga se podate v Blok, četrt, ki je bila v komunizmu zaprta cona: v njej so stale hiše politbiroja, vhod pa varovali vojaki, navaden meščan pa se je lahko le vprašal, kaj je za ograjo. Danes je to najglasnejši del Tirane — kavarne na vsakem vogalu, pivnice z domačim pivom in bari, ki zgodaj ne zapirajo. Sprehod čez Blok je najkrajša lekcija o tem, kaj se z mestom zgodi v eni sami generaciji.",
        "Za slovo od mesta poskrbi gondola z vzhodnega robu: petnajst minut vožnje vas dvigne na Dajti, na okoli 1 600 metrih, kjer je zrak opazno hladnejši, gozd tiho in pogled čez ravnino sega vse do morja, ki ste ga pustili za sabo. Če vam ostane popoldan, ga dajte Bunk'Artu, muzeju v nekdanjem protiatomskem zaklonišču. Dve noči v Tirani sta ravno prav: prva za trg, džamijo in Blok, druga za gondolo in muzej.",
      ],
    },
    {
      heading: "Jug: Ksamil, Butrint in kameno mesto",
      body: [
        "Ksamil je razglednica, ki je Albanijo raznesla po svetu: trije otočki v turkizni vodi, do katerih se pride s plavanjem ali z najetim čolnom, borova obala in plitvina, ki se segreva, kot bi bila kopel. Avgustovska resnica je manj idilična — ob desetih dopoldne je plaža že razdeljena do zadnjega brisača, zato jutro reši vse: ob sedmih je voda vaša in otočki še brez obiskovalcev. Dvajset minut južneje čaka Butrint, grško-rimsko mesto ob laguni, vpisano na Unescov seznam: gledališče, mestna vrata, rimske kopeli in beneška trdnjava, vse skozi gozd, v katerem se vse tiho sveti. Ogled naredite zgodaj zjutraj, še pred vročino in avtobusi.",
        "Pot na sever vodi čez Delvinë in se po dobrih 90 kilometrih vzpne v Gjirokastër, kamnito mesto pod gradom — drugi Unescov vpis tega potovanja. Strehe iz skrilavca, hiše, ki se držijo pobočja s kamnitimi stopnicami med seboj, in bazar pod obzidjem delujejo kot kulisa, ki se je ni dalo posneti nikjer drugje. Grad na vrhu hrani zbirko orožja in pogled na dolino reke Drinos; če vas dan ujame s tržnim dnem, se v bazar nateče podeželje in mesto zaživi po starem. Zato je zadnja noč tukaj in ne v Tirani: kamnito jutro je najlepši začetek dolge povratne etape.",
        "Povratek vodi po isti osi in to ni lenoba, ampak računica. Smer čez Skopje sicer na papirju nariše lep lok, a prinese dve novi državi na zeleni karti, dve sveži meji in ceste, katerih kakovost ne pozna pravila — koridor čez Črno goro in hrvaško obalo pa ste že prevozili in poznate do zadnjega ovinka. Zadnji dan je najdaljši od vseh: okoli 1 000 kilometrov in dve kontroli. Kdor lahko, ga razdeli z nočitvijo v Podgorici ali Dubrovniku; kdor ne more, odide pred svitom in pride domov v temi — na srečo je to na vsej poti edini takšen dan.",
      ],
    },
  ],
  practical: [
    {
      title: "Meja s Črno goro",
      text: "Mejo s Črno goro boste prečili dvakrat, pri Karasovićih tja in na povratku nazaj. V juliju in avgustu se pred prehodom naberejo kolone od pol ure naprej, zgodnje jutro pa je najbolj zanesljiva ura v obeh smereh. Zeleni karton z vpisano kratico ME uredite še pred odhodom.",
    },
    {
      title: "Meja z Albanijo in zavarovanje",
      text: "Albansko mejo preidete pri Sukobinu in Muriqanu, s kontrolo v obeh smereh. Zeleni karton z vpisano kratico AL je obvezen; če vpisa ni, na sami meji kupite mejno zavarovanje za okoli 15 evrov, ki pokriva petnajst dni. Vpis pri domači zavarovalnici je cenejši in urejen v petih minutah.",
    },
    {
      title: "Lek in gotovina",
      text: "Albanija ni v evroobmočju: plačujete v lekih, en evro pa je vreden približno sto lekov, kar računanje poenostavi. Menjalnice so povsod, kartice pa delujejo v mestih in večjih hotelih. Za črpalke, tržnice in manjše gostilne imejte gotovino v lekih; zaloge dopolnjujte v Tirani ali Shkodru in ne na zadnji črpalki pred Ksamilom.",
    },
    {
      title: "Cestnine skozi štiri države",
      text: "Slovenska e-vinjeta pokriva samo Slovenijo, na Hrvaškem pa cestnino plačujete po odsekih na zaplatkah HAC. V Črni gori na trasi proti albanski meji cestnine ni, v Albaniji pa jih na tej smeri praktično tudi ne. Gorivo je v Albaniji ceneje kot v Sloveniji in na Hrvaškem, kar na tako dolgem krogu prinese lepo postavko.",
    },
    {
      title: "Ceste in preračun časa",
      text: "V Albaniji vas do Shkodra pelje SH1, proti Tirani pa odseki A1; južneje prevladajo magistrale s povprečno hitrostjo 50–60 km/h. Etapa Tirana–Ksamil meri okoli 290 kilometrov in traja pet do šest ur — računajte v urah, ne v kilometrih. Ponoči ne vozite: razsvetljava je skromna, obrobe cest pa zasedejo pešci in živina.",
    },
    {
      title: "Kdaj na pot",
      text: "Junij in september sta za ta krog najboljša: morje je toplo, meje krajše, Ksamil pa še pred najhujšim prilivom. Julij in avgust prineseta vse naenkrat — gnečo na plažah in kolone na vseh štirih kontrolah. Maj je svež, oktober pa je na obali pogosto še lep, a dan v gorah neha zgodaj.",
    },
    {
      title: "Zdravstveno zavarovanje",
      text: "Evropska kartica zdravstvenega zavarovanja v Črni gori in Albaniji ne velja, saj nobena od držav ni v Evropski uniji. Pred odhodom sklenite turistično zavarovanje, ki krije zdravljenje in morebitni prevoz domov, ter imejte ob sebi kartico z dovolj prostora na limiti — v zasebnih ambulantah plačilo pade najprej na vas.",
    },
  ],
  faqs: [
    {
      question: "Koliko kilometrov je od Ljubljane do Tirane?",
      answer:
        "Po koridorju čez Split, Dubrovnik in Podgorico je dobrih 900 kilometrov, kar z mejama in odmori pomeni dvanajst do štirinajst ur vožnje. V enem kosu je to mogoče, a ne pametno — ta načrt pot razdeli s postanki v Splitu, Dubrovniku in Podgorici, tako da je vsak dan razen zadnjega v meji človeškega.",
    },
    {
      question: "Ali potrebujem potni list za Črno goro in Albanijo?",
      answer:
        "Potni list je varna izbira za obe državi. Z osebno izkaznico državljani Evropske unije na obeh mejah večinoma pridejo čez, a praksa se je spreminjala in se razlikuje od prehoda do prehoda, zato pogoje preverite pred odhodom. Za otroke velja enako pravilo: vsak potnik potrebuje svoj dokument.",
    },
    {
      question: "Kaj storim, če zelena karta nima vpisa za Albanijo?",
      answer:
        "Na prehodu Muriqan vas ne bodo obrnili: ob meji se za okoli 15 evrov kupi mejno zavarovanje, ki pokriva petnajst dni. Boljša rešitev je vpis kratic AL pri zavarovalnici pred odhodom, ki stane drobiž ali nič. Z najetim avtomom pa naj vpis preveri agencija skupaj s pogodbo.",
    },
    {
      question: "Ali se v Albaniji lahko plačuje v evrih?",
      answer:
        "Ne, uradna valuta je lek in vsakdanje plačilo gre v lekih — en evro je vreden približno sto lekov, torej ceno v lekih samo delite s sto. Nekateri hotelji in ponudniki nastanitve sicer zaračunavajo v evrih, a kavo, gorivo in tržnico vedno plačate v lekih. Menjalnice so povsod, tudi v manjših mestih.",
    },
    {
      question: "Kako dolgo traja vožnja od Tirane do Ksamila?",
      answer:
        "Okoli 290 kilometrov in pet do šest ur, saj povprečna hitrost na magistralah pade na 50–60 km/h. Ovinki, naselja in promet se seštevajo, zato kilometrov ne pretvarjajte v ure po avtocestni logiki. Etapo začnite zgodaj in si vmes privoščite pravo kosilo, ne le postanek za gorivo.",
    },
    {
      question: "Je vožnja po Albaniji varna?",
      answer:
        "Da, a je drugačna: ceste so ožje, promet manj urejen, na vozišču pa pešci, kolesarji in živina. Vozi se počasi in previdno, nočne vožnje pa se raje izognite. Vozila parkirajte na varovanih parkiriščih in v njih ne puščajte stvari na vidnem mestu.",
    },
    {
      question: "Kdaj je najboljši čas za ta road trip?",
      answer:
        "Junij in september: morje je toplo, gneča v Ksamilu precej manjša, kolone na mejah krajše. Julij in avgust prineseta največ ljudi in najvišje cene — še vedno pod hrvaškimi, a vseeno. Maj je svež, oktober pa lahko na obali še preseneča s poletnimi dnevi.",
    },
  ],
  relatedSlugs: [
    "kotor-crna-gora-iz-slovenije",
    "najem-avta-cross-border",
    "sarajevo-mostar-iz-slovenije",
  ],
  relatedSloveniaIds: ["ljubljana", "piran", "triglav"],
},

// 9. Bosna in Hercegovina: Sarajevo, Mostar in Hercegovina z osebnim avtom.
  {
    slug: "sarajevo-mostar-iz-slovenije",
    title: "Sarajevo in Mostar z avtom iz Slovenije: teden v Bosni in Hercegovini",
    metaTitle: "Sarajevo, Mostar in Hercegovina z avtom iz Slovenije",
    description:
      "Teden v Bosni z avtom iz Slovenije: Sarajevo, Mostar, Blagaj in slapi Kravice s nasveti o meji, zeleni karti, markah in povratku po obali ali Posavini.",
    excerpt:
      "Bosna je bližje, kot se zdi: Sarajevo je od Ljubljane oddaljen okoli 520, Mostar pa okoli 580 kilometrov. Sedemdnevni načrt z mejami, markami, dolino Neretve in povratkom po obali ali Posavini.",
    route: "Ljubljana → Zagreb → Sarajevo → Mostar → Blagaj → Kravice → Ljubljana",
    countries: ["SI", "HR", "BA"],
    days: 7,
    km: 1300,
    heroImage: "/adria/sarajevo-mostar-iz-slovenije.jpg",
    heroAlt:
      "Stari most v Mostarju, svetel kamniti lok nad zeleno reko Neretvo, na bregovih kamnite hiše s strehami iz peščenjaka",
    author: "Marko Kovač",
    date: "2026-08-20",
    readTime: 10,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 0,
        highlight:
          "Prva etapa je kratkih 140 kilometrov do Zagreba; če odidete pozno dopoldne, je večer na Tkalćićevi še cel in meja pred vami jutri.",
      },
      {
        name: "Zagreb",
        country: "HR",
        nights: 1,
        highlight:
          "Nočitev, ki pot razdeli na dva človeška dela: zvečer Tkalćićeva, zjutraj pa zgodnja vožnja do meje pri Slavonskem Brodu, preden se nabere promet.",
      },
      {
        name: "Sarajevo",
        country: "BA",
        nights: 2,
        highlight:
          "Dve noči za mesto v kotli pod Trebevićem: Baščaršija, ćevapi v somunu, Tunel spasa in večerni pogled z žičnice na mesto, ki se pretaka med kulturami.",
      },
      {
        name: "Mostar",
        country: "BA",
        nights: 2,
        highlight:
          "Stari most in skakači, Kujundžiluk z bakrorezjem ter dnevi, ki jih razdelite med mesto in izlete v Počitelj, Kravice in Blagaj.",
      },
      {
        name: "Počitelj",
        country: "BA",
        nights: 0,
        highlight:
          "Utrjeno mestece ob magistrali proti morju: kamnite stopnje se vzpenjajo do stolpa s pogledom na dolino Neretve, konoba v senci pa hladi sredino dneva.",
      },
      {
        name: "Slapi Kravice",
        country: "BA",
        nights: 0,
        highlight:
          "Tufaste zavese, visoke kakih petindvajset metrov, pod katerimi se kopajo v mrzli vodi; vstopnina je nizka, jutro pa prinese senco in prazne steze.",
      },
      {
        name: "Blagaj",
        country: "BA",
        nights: 1,
        highlight:
          "Zadnja nočitev pod steno, iz katere udari izvir Bune: tekija ob vodi, počitniške hiše med murvami in najboljši zajtrk na tej poti.",
      },
    ],
    sections: [
      {
        heading: "Zakaj Bosna in koliko je daleč",
        body: [
          "Večina Slovencev pelje na jug po isti črti: čez Zagreb na obalo in po obali nazaj. Bosna in Hercegovina leži tik ob tej črti, a jo večinoma preskočimo, in to je škoda. Do Sarajeva je od Ljubljane okoli 520, do Mostarja okoli 580 kilometrov — razdalji, ki ju poznamo s poti na južno Dalmacijo, prineseta pa popolnoma drugo deželo. Tam, kjer se hrvaška obala po juliju zgosti v en sam promet, se po bosanskih magistralah še vedno pelje mirno: ti, kamion in redko še kdo.",
          "Računica je prepričljiva. Kosilo v Baščaršiji stane za tretjino manj kot na hrvaški obali, pred Tunelom spasa ni vrste, ćevapi, burek in begova čorba pa so hrana, kakršne na drugi strani meje ne dobiš. Nad tem pa je tu zgodovina, kakršne v Evropi ne ponudi nobena druga prestolnica: osmanska in habsburška doba se v Sarajevu sekata na sto metrih, v Mostarju pa reka deli mesto na dva bregova, ki se slišita, čeprav govorita drugače. Kdor je Hrvaško že odpeljal do zadnjega ovinka, tu najde naslednji jug.",
          "Ta pot ni obalna in ni kopališka. Cilji so mesta, reka in gorovje; kdor računa na plavanje in ležalnik, naj ostane pri Dalmaciji. Najlepši meseci so maj, junij in september, avgust pa tu pomeni žgočo vročino: nad petintrideset stopinj v Mostarju ni nič posebnega, v Sarajevu, ki leži v kotli pod Trebevićem, pa je za kakih pet stopinj hladneje. Pozimi je na poti med Sarajevom in Konjicom prehod Ivan sedlo, ki zna biti zaprt za tovornjake ali poledenel — zimske različice te poti raje ne načrtujte.",
        ],
      },
      {
        heading: "Meja, potni list in zelena karta",
        body: [
          "Bosna in Hercegovina ni v Evropski uniji in ni v schengenskem območju, zato vsak prehod pomeni kontrolo — dvakrat, tja in nazaj. Na smeri iz Zagreba se meja prečka pri Slavonskem Brodu–Bosanskem Brodu, kamor pelje hrvaška avtocesta A3; za povratek po obali je glavni prehod Doljani, kamor pelje cesta iz Dubrovnika proti Mostarju. Oba sta urejena in dovolj široka, a v sezoni se pred obema nabereta koloni, ki sta ob koncih tedna najdaljši. Zgodnje jutro ostaja najbolj zanesljiva ura v obeh smereh.",
          "Potni list je dokument, ki ga na to pot vzamete. Osebna izkaznica se za državljane Evropske unije na bosanskih prehodih praviloma priznava, a praksa je od prehoda do prehoda različna in najmanj primeren trenutek za ugotavljanje je vrsta pred zaporno roko. Za otroke velja enako pravilo kot drugod na Balkanu: vsak potrebuje svoj dokument. Pri kontroli skupaj z dokumenti izročite zeleni karton in prometno dovoljenje — prosili vas bodo za oboje, zato naj ležita v predalu in ne na dnu prtljažnika.",
          "Zeleni karton dokazuje, da je vaše vozilo zavarovano za škodo, ki jo povzroči drugim, in na njem so vpisane države, v katere smete voziti. Večina slovenskih zavarovanj Bosno in Hercegovino pokriva in vpis BA imate, a ne vsi paketi — razlike so med zavarovanji, ne med državami. Zato en klic pred odhodom prihrani najdražjo napako te poti: kdor pride na mejo brez vpisa, tam kupi mejno zavarovanje, ki je dražje, kot bi bil podaljšek doma, in časovno omejeno. Karton vozite v avtu, ne v prtljagi.",
        ],
      },
      {
        heading: "Marka, cestnine in ceste",
        body: [
          "V Bosni se plačuje s konvertibilno marko, ki je fiksno pripeta na evro: en evro je približno 1,96 marke. Menjalnice in banke so v vsakem mestu in tečaji se razlikujejo za drobiž, zato doma menjati ni treba. Kartice na črpalkah in v večjih trgovinah delujejo, a gotovina tu še vedno zmaga: na tržnicah, v majhnih konobah in za vstopnine kartica pogosto ne gre, bankomati pa zaračunavajo provizije, ki se jih raje izogne. Založite se z nekaj sto evri in jih menjajte sproti po potrebi.",
          "Gorivo kupujete v markah; črpalk je na glavnih smereh dovolj, a manj, kot smo vajeni na Hrvaškem, zato rezervoarja ne puščajte pod polovico na odseku med Konjicem in Jablanico. Na avtocestnih odsekih A1 okoli Zenice in Sarajeva so cestnine posamične in nizke — po nekaj mark na odsek, plačilo pa možno v markah ali s kartico — in skupaj znesejo manj kot ena daljša hrvaška zaplatka. Magistrala med Sarajevom in Mostarom je brez cestnine, ker avtoceste tam ni.",
          "Povezava Sarajevo–Mostar je magistrala M17: dvopasovna cesta, ki se vzpne na prehod Ivan sedlo in nato sledi dolini Neretve mimo Konjica in Jablanice. Je ena lepših voženj na tem delu Evrope — reka je smaragdna, soteske tesne, vasi prisedle na obale — a hkrati počasna: kakih 130 kilometrov se naredi v dobrih dveh urah, ker na njej peljejo kamioni, avtobusi in vsi, ki so se jim pridružili. Prehitevanje tvegajte le, kjer je pogled čist; sicer pustite kamionu, da določa ritem.",
        ],
      },
      {
        heading: "Sarajevo: dva dneva pod Trebevićem",
        body: [
          "Prvi dan pripada Baščaršiji, osmanskemu staremu mestu, v katerem se pod sebiljem, lesenim vodnjakom s trga, križajo uličice bakrorezcev in parfumerjev. Kosilo tu ni restavracija, ampak ćevapđinica: petica ćevapov v toplem somunu s čebulo stane okoli tri do štiri evre in je najboljša kosilna računica na tej poti. Od tod je do Latinskega mosta, ob katerem je leta 1914 Gavrilo Princip ustrelil Franja Ferdinanda in s tem sprožil prvo svetovno vojno, pet minut hoje; do Vijećnice, psevdomavrske mestne palače, ki je po granatiranju leta 1992 gorela kot knjižnica, pa komaj deset.",
          "Drugi dan nosita Tunel spasa in Trebević. Tunel pod vzletiščem je bil med obleganjem devetdesetih edina povezava mesta z okolico; danes je muzej na južnem robu mesta, do katerega pelje kratka vožnja ali mestni avtobus, ogled pa vzame dobro uro. Popoldne vas žičnica, ki od leta 2018 znova vozi, dvigne nad mesto: z vrha se pokaže celoten kotli — minareti, rdeče strehe in zelene grape — ob cesti navzdol pa leži opuščena proga za bob z olimpijskih iger 1984, ves v grafitih.",
          "Zvečeri se življenje preseli na nabrežja Miljacke: sprehajajo se družine, ob Vijećnici se pije kava, pekarna v Baščaršiji pa peče jutranji burek že v noči. Za nočitev izberite okolico starega mesta — apartmaji v kamnitih hišah nad Baščaršijo so pogosto cenejši, kot kaže prva cifra, in jutro se začne pet minut od ćevapov. Dva dneva za Sarajevo nista pretiravanje: mesto ima plast za plastjo, ogledate pa si ga tudi z mestnim avtobusom in žičnico brez avta.",
        ],
      },
      {
        heading: "Mostar, Blagaj, Počitelj in slapi Kravice",
        body: [
          "Mostar se najavlja že z magistrale: cesta se spusti iz hribov, pred vami pa se odpre kotlina z reko in mestom na obeh bregovih. Stari most, ki so ga po vojni zgradili znova iz kamna istih kamnolomov, je središče, okrog njega pa Kujundžiluk, stara ulica obrtnikov in trgovcev, ki je najlepša zgodaj zjutraj, preden se napolni. Poleti z mostu skočijo skakači mostarskega kluba; za skok predhodno zbirajo prostovoljne prispevke in če se zbirka ne sešteje, skoka ni — nekaj mark v klobuček je poštena cena za to, kar vidite.",
          "Za okolico so v tem načrtu rezervirani trije dnevi: Mostar in Blagaj skupaj nosita bazo, iz katere se dela izlete. Na jug vodi magistrala mimo Počitelja, utrjenega mesteca iz osmanskih časov, katerega kamnite hiše se stopničasto vzpenjajo do stolpa s pogledom na dolino Neretve. Od tod je do slapov Kravice četrt ure vožnje: tufaste zavese, visoke kakih petindvajset metrov, se pretakajo v mrzlo jezero pod njimi, vstopnina je nizka, jutro pa prinese senco in svetlobo, ki jih opoldne ni več. Oboje skupaj vzame dobri pol dneva, če izhajate iz Mostarja.",
          "Zadnjo nočitev naredite v Blagaju, vasi pod steno, iz katere z močnim curkom udari izvir Bune, eden najmočnejših kraških izvirov na Balkanu. Ob vodi stoji tekija, derviški samostan iz šestnajstega stoletja in najbolj fotografiran prizor te poti, restavracije na bregu pa strežejo postrvi iz Bune pod murvami. Zjutraj, preden pridejo izletniki, je dolina še tiho in voda zelena kot steklo — najboljši zajtrk tega potovanja je tu, ne v Sarajevu.",
        ],
        list: [
          {
            title: "Tekija v Blagaju",
            text: "Derviški samostan ob izviru Bune pod steno; ogled je kratek, pravi čas pa jutro, ko je dolina še v senci in parkirišče še prazno.",
          },
          {
            title: "Počitelj",
            text: "Utrjeno mestece ob magistrali: stopnje do stolpa, Hadži-Alijeva mošeja in pogled na Neretvo. Ura zadošča, dve ne škodujeta.",
          },
          {
            title: "Slapi Kravice",
            text: "Tufasti slapovi na zatoku Trebižata: vstopnina nizka, kopanje mogoče, jutro najboljši čas. Naredi se iz Mostarja ali Blagaja v pol dneva.",
          },
          {
            title: "Konjic in Jablanica",
            text: "Dva postanka na magistrali med Sarajevom in Mostarom: Konjic s starim mostom in rezbarskimi delavnicami, Jablanica z jezerom, ob katerem se hladi lokalni. Vsakemu dajte dvajset minut.",
          },
        ],
      },
      {
        heading: "Povratek: obala ali Posavina",
        body: [
          "Doma se vrnete po eni od dveh poti in obe sta dolgi dnevi. Obalna vodi iz Blagaja čez prehod Doljani na Pelješac, čez Pelješki most in mimo Dubrovnika do Splita, od tod pa po avtocesti do Zagreba in Ljubljane: dobrih 700 kilometrov, na poti pa Ston, Dubrovnik in morje. Pozor na kontroli — prehod na Hrvaško je zunanja schengenska meja, zato se ob Doljanih dokumenti pregledajo temeljiteje, kot smo vajeni med Hrvaško in Slovenijo, kjer kontroli ni več.",
          "Posavska pot je vlakno, ki pelje nazaj po isti osi: iz Blagaja čez Mostar in Sarajevo na A1, čez Zenico in Doboj do starega prehoda čez Savo in po hrvaški A3 do Zagreba. Okoli 650 kilometrov, večinoma po avtocesti, le odsek Blagaj–Sarajevo je počasen. Mejo pri Slavonskem Brodu že poznate z odhoda, zato veste, kdaj je najbolj prazna: zgodaj zjutraj, preden se iz Bosne zvrstijo delovni migranti in tovornjaki.",
          "Katera je boljša, je stvar okusa. Obalna prinese morje, Dubrovnik in vinograde Pelješaca; posavska hitrejši prihod in manj vtisov na enkrat. V obeh primerih velja eno pravilo: zadnji dan se začne ob svitu, da se konča še pred mrakom. Ves krog meri okoli 1 300 kilometrov, povprečno kakih 180 na dan. Če lahko dodate osmi dan, ga dodajte — nočitev v Zadru ali Zagrebu spremeni zadnjo etapo iz dolžine v del potovanja.",
        ],
      },
    ],
    practical: [
      {
        title: "Meja in prehodi",
        text: "Bosna in Hercegovina ni v schengenskem območju, zato mejo preidete s kontrolo v obeh smereh. Na avtocestni smeri iz Zagreba je prehod Slavonski Brod–Bosanski Brod, na obalni smeri pa Doljani pri Čapljini. V sezoni se pred obema naberejo kolone, ki so ob koncih tedna najdaljše; zgodnje jutro je najbolj zanesljiva ura.",
      },
      {
        title: "Zeleni karton za BA",
        text: "Pred odhodom pri zavarovalnici preverite, ali je na vašem zelenem kartonu vpisana kratica BA. Večina slovenskih zavarovanj Bosno pokriva, a ne vsi paketi. Brez vpisa na meji kupite mejno zavarovanje, ki je dražje in časovno omejeno, zato zadevo raje uredite doma s podaljškom kritja.",
      },
      {
        title: "Marka in gotovina",
        text: "Konvertibilna marka je fiksno pripeta na evro: en evro je približno 1,96 marke. Menjalnice so v vsakem mestu, doma menjati ni treba. Kartice delujejo na črpalkah in v trgovinah, a za tržnice, konobe in vstopnine zmaguje gotovina; bankomati zaračunavajo visoke provizije, zato raje menjajte v menjalnici.",
      },
      {
        title: "Cestnine in ceste",
        text: "Na odsekih A1 med Zenico in Sarajevom so cestnine posamične in nizke, plačajo se na zaplatkah v markah ali s kartico. Magistrala Sarajevo–Mostar je brez cestnine, a počasna: kamioni, ovinki in dolina, ki jo je škoda peljati hitro. Ob glavnih cestah je vozišče dobro, na stranskih pa znajo biti luknje.",
      },
      {
        title: "Kdaj na pot",
        text: "Najlepše je od aprila do junija in septembra: sveže, zeleno in brez vrhunskih temperatur. Julij in avgust sta v Hercegovini zelo vroča — nad 35 stopinj v Mostarju ni nič posebnega — Sarajevo pa je zaradi lege v kotli milejše. Pozimi prehod Ivan sedlo med Sarajevom in Konjicom zna biti zaprt za tovornjake ali poledenel; tedaj pot raje odpove.",
      },
      {
        title: "Zdravstveno zavarovanje",
        text: "Evropska kartica zdravstvenega zavarovanja v Bosni in Hercegovini ne velja, saj država ni v Evropski uniji. Pred odhodom sklenite turistično zavarovanje, ki krije zdravljenje in morebitni prevoz domov. Zdravstvena oskrba v večjih mestih je dobra, plačilo pa se zahteva takoj.",
      },
    ],
    faqs: [
      {
        question: "Koliko kilometrov je od Ljubljane do Sarajeva in Mostarja?",
        answer:
          "Do Sarajeva je okoli 520, do Mostarja okoli 580 kilometrov. V enem kosu se da, a ni pametno: v tem načrtu prvi dan pelje do Zagreba, drugi pa čez mejo pri Slavonskem Brodu v Sarajevo, kamor prispete še za popoldanski sprehod po Baščaršiji.",
      },
      {
        question: "Ali potrebujem potni list za Bosno in Hercegovino?",
        answer:
          "Potni list je varna izbira, osebna izkaznica pa se za državljane Evropske unije na bosanskih prehodih praviloma priznava. Praksa je od prehoda do prehoda različna, zato pogoje preverite pred odhodom. Za otroke velja enako — vsak potrebuje svoj dokument.",
      },
      {
        question: "Ali moje avto zavarovanje velja v Bosni?",
        answer:
          "Odvisno od vpisa BA na zelenem kartonu. Večina slovenskih zavarovanj Bosno in Hercegovino pokriva, a ne vsi paketi, zato en klic pred odhodom ne boli. Če vpisa ni, na meji kupite mejno zavarovanje — dražje in omejeno na določeno število dni, zato je doma rešitev cenejša.",
      },
      {
        question: "Kateri denar velja v Bosni in kje menjavam?",
        answer:
          "Konvertibilna marka; en evro je približno 1,96 marke. Menjalnice in banke so v vsakem mestu in tečaji se razlikujejo za drobiž, zato doma menjati ni treba. Za gorivo potrebujete gotovino v markah oziroma kartico, ki na večjih črpalkah deluje.",
      },
      {
        question: "Kako se peljem iz Sarajeva v Mostar?",
        answer:
          "Po magistrali M17 čez Ivan sedlo, Konjic in Jablanico — kakih 130 kilometrov brez cestnine. Cesta je ovinkasta in lepa, peljejo pa se jo kamioni, zato računajte dve uri in več. Za razgled nad Neretvo se ustavite v Konjicu ali pri Jablanici; vožnja je polovica doživetja.",
      },
      {
        question: "Kako se vrnem — čez Dubrovnik ali po Posavini?",
        answer:
          "Obalna pot vodi čez Doljane, Pelješki most in Dubrovnik, posavska pa čez Sarajevo in Slavonski Brod po avtocesti. Obe sta dolgi okoli 700 kilometrov; obalna je lepša in prinese kontrolo na hrvaški zunanji schengenski meji, posavska pa hitrejša. V vsakem primeru se zadnji dan pelje zgodaj zjutraj.",
      },
      {
        question: "Ali je varno potovati v Bosno z osebnim avtom?",
        answer:
          "Mesta, glavne ceste in turistični kraji so varni in popolnoma redni; slovenske tablice nikjer niso problem. Avto parkirajte na urejenih parkiriščih in iz njega ne puščajte drage opreme na vidnem. Za sprehode v odročni naravi se držite utrjenih in označenih poti — minirana območja iz vojne so sicer večinoma očiščena, a previdnosti ni nikoli preveč.",
      },
    ],
    relatedSlugs: [
      "ljubljana-dubrovnik-road-trip",
      "kotor-crna-gora-iz-slovenije",
      "najem-avta-cross-border",
      "hrvaska-obala-prakticni-vodnik",
    ],
    relatedSloveniaIds: ["ljubljana", "maribor", "celje"],
  },

  // 10. Hrvaški otoki: Krk, Hvar, Korčula in Brač z avtom na trajektu.
  {
    slug: "hrvaski-otoki-iz-slovenije",
    title: "Hrvaški otoki z avtom iz Slovenije: Krk, Hvar, Korčula in Brač",
    metaTitle: "Hrvaški otoki z avtom iz Slovenije: Hvar, Korčula, Brač",
    description:
      "Krk, Hvar, Korčula in Brač z osebnim avtom: trajekti Jadrolinije, rezervacije poleti, Pakleni otoci, Zlatni rat in devetdnevni načrt iz Ljubljane.",
    excerpt:
      "Otoški dopust z lastnim avtom: Krk prek mosta, trajekt v Stari Grad, Pakleni otoki, Korčula in Zlatni rat pred povratkom. Trajekte in nastanitve uredite še doma — poleti rezervacija ni priporočilo, ampak pogoj.",
    route: "Ljubljana → Krk → Split → Hvar → Korčula → Brač → Ljubljana",
    countries: ["SI", "HR"],
    days: 9,
    km: 1100,
    heroImage: "/adria/hrvaski-otoki-iz-slovenije.jpg",
    heroAlt:
      "Zlatni rat pri Bolu na Braču, svetel prodni rt, ki se razliva v modro morje, nad njim pobočje z borovci",
    author: "Tanja Novak",
    date: "2026-08-25",
    readTime: 11,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 0,
        highlight:
          "Prva etapa gre čez Postojno in Rijeko do Krka, kakih 210 kilometrov; most čez Tihi kanal pomeni, da otok dosežete brez prvega trajekta.",
      },
      {
        name: "Krk",
        country: "HR",
        nights: 1,
        highlight:
          "Nočitev na otoku brez trajekta: mesto Krk s kaštelom Frankopanov, Vrbnik z žlahtino in glagolico, Baška pa s ploščo, ki jo pozna vsaka šolska učilnica.",
      },
      {
        name: "Split",
        country: "HR",
        nights: 1,
        highlight:
          "Izhodišče za otoke: popoldan Dioklecijanova palača, zvečer Riva, zjutraj pa pristanišče in trajekt, ki ste ga rezervirali že tedne prej.",
      },
      {
        name: "Hvar",
        country: "HR",
        nights: 2,
        highlight:
          "Dve noči za najbolj sončni otok Jadrana: grad nad mestom, taksi čolni na Paklene otoke in staroirigacijska ravnica pri Starem Gradu.",
      },
      {
        name: "Korčula",
        country: "HR",
        nights: 2,
        highlight:
          "Kamnito mesto Marka Pola na drobnem polotoku: čez preliv Orebić–Dominče vas pelje petnajstminutni trajekt, ki vozi vse leto.",
      },
      {
        name: "Brač",
        country: "HR",
        nights: 2,
        highlight:
          "Zadnji otok ima dva razloga: Zlatni rat, rt, ki s valovi in vetrom spreminja obliko, ter Vidovo goro, ki se s 780 metri ponaša kot najvišji vrh vseh jadranskih otokov.",
      },
    ],
    sections: [
      {
        heading: "Otoški dopust, ki se začne v lastnem avtu",
        body: [
          "Otoški dopust z lastnim avtom ima svojo logiko. Ni nujno najcenejša — letalo in najem se včasih izideta ugodneje — je pa tista, pri kateri je avto del rešitve in ne del problema: prtljaga gre z vami, otok se odpre tudi tam, kamor avtobus ne vozi, povratek pa ne visi od letalskega urnika. Cena te logike so trajekti, ki jih je treba rezervirati, in kopenske etape, ki jih je treba pametno razdeliti. Kdor to uredi še doma, se na obali ne ukvarja z logistiko več.",
          "Krk je prvi korak in hkrati dokaz, da izjeme obstajajo: otok, ki ga od leta 1980 povezuje most in na katerega zato ne pelje niti en trajekt. V tem načrtu je postaja na poti proti Splitu — ena nočitev, dovolj za mesto Krk, Vrbnik in Baško — in s tem se najdaljša kopenska etapa razdeli na dva obvladljiva dneva. Split, od Ljubljane oddaljen okoli 460 kilometrov, je potem izhodišče za trajekte: odtod se pelje na Hvar, Korčulo in Brač, tri otoke, ki se naredijo v enem dopustu, če se ne mudi.",
          "Kdaj? Junij in september sta za otoke napisana bolje kot avgust: morje je toplo, trajekti vozijo polno, a gužve še ni, cene nastanitev pa so opazno nižje. Julij in avgust prineseta vrhunec vsega skupaj, tudi rezervacijsko dramatiko, ki jo ta vodnik poskuša odpraviti še doma. Maj je svež in primeren za hojo in kolo, oktober pa še dovolj topel, da se da kopati — le dnevi so krajši in trajekti redkejši.",
        ],
      },
      {
        heading: "Krk: most, glagolica in žlahtina",
        body: [
          "Most na Krk je vstopna točka in hkrati mali obred: dva loka nad ožino Tihi kanal, povezana nad otočkom Sv. Marko, skupaj dobrih 1 400 metrov; odprta je bila leta 1980 in dolgo je nosila Titovo ime. Cestnine na mostu od leta 2020 ni več, zato je prehod čezenj tako preprost kot vsak drug most v življenju. Krk je eden največjih jadranskih otokov in njegove ceste so kratke: od mosta do mesta Krk je dobrih dvajset minut, do Vrbnika pol ure, do Baške pa tričetrt.",
          "V mestu Krk se sprehodite po starem jedru pod kaštelom Frankopanov in po obzidju, s katerega se vidi ves zaliv — počasi, ker v ozkih ulicah srečujete več mačk kot avtov. Vrbnik, naseljen na klifu nad morjem, je vas konob, kjer točijo žlahtino, domačo belo sorto, ki uspeva le na tem otoku — kozarec na terasi nad morjem je najkrajša pot do razumevanja Kvarnerja. Baška ima najbolj znan prodni zaliv otoka in cerkev sv. Lucije v Jurandvoru, kjer so odkrili Bašćansko ploščo, rojstni list hrvaške književnosti; original hranijo v Zagrebu, zgodba pa ostane tu.",
          "Večerja na Krku ima domač imenik: šurlice, krčka testenina, z jagnjetino ali v omaki iz žlahtine, in jagnjetina z žara, ob tem pa kozarec vrbniške žlahtine, hladnejši od večera. Nastanitev rezervirajte v mestu Krk ali Vrbniku — otoške razdalje so kratke, zato lokacija ni usodna. Usodna je bližina miru: julija in avgusta se v ozkih ulicah starega mesta sprehajajo množice do pozne noči, zato je soba obrnjena stran od glavne ulice vredna več kot petnajst minut krajše poti do plaže.",
        ],
      },
      {
        heading: "Trajekti: rezervacija je del načrta",
        body: [
          "Za avto na otok je odgovorna Jadrolinija, glavni trajektar te strani Jadrana; hitri katamarani za potnike vozijo tudi pri zasebnih prevoznikih, a avtov ne sprejemajo. Split je izhodišče: od tod trajekti plujejo v Stari Grad na Hvarju, v Supetar na Braču in v Velo Luku na Korčuli, zadnja linija pa se ustavi še v Ubliju na Lastovu. Manjši prevozi — Sućuraj–Drvenik na vzhodnem koncu Hvara in Orebić–Dominče na Pelješcu — vozijo pogosto in na kratkih poteh, zato se na njih ceni predvsem potrpežljivost, rezervacija pa praviloma ni potrebna.",
          "Od junija do avgusta je rezervacija z avtom obvezna — in to tedne prej, ne dneve. Mest na palubi je končno število in na linijah iz Splita se resnično zgodi, da brez rezervacije ostaneš na celini, medtem ko ladja odpluje brez tebe. Rezervacija gre prek spleta, potrditev natisnite ali imejte v telefonu, na pristanišče pa pridite uro pred odhodom: vrste za vkrcanje se sestavijo zgodaj, vrstni red pa se določi po prihodu in ne po vljudnosti.",
          "Cena je del računice, ki jo naredite še doma. Split–Stari Grad z avtom in potniki pride v sezoni okoli 40 do 50 evrov v eno smer; Split–Supetar pride nekoliko ceneje, najkrajša prevoza, Sućuraj–Drvenik in Orebić–Dominče, pa stojita le del te vsote. Na tem krogu so štirje prevozi, ki se jih da prešteti po prstih. Celoten krog meri okoli 1 100 kilometrov, prevozi v njem pa skupaj kakih tri ure in več plovbe. Izven sezone se na večino linij vkrcava brez rezervacije in cene so nižje.",
        ],
        list: [
          {
            title: "Split–Stari Grad",
            text: "Glavna linija za Hvar, približno dve uri plovbe. Najbolj obremenjen prevoz te poti — rezervirajte in pridite uro prej.",
          },
          {
            title: "Split–Supetar",
            text: "Petdeset minut do Brača, plovbe so pogoste in vozijo pozno v večer; zadnji dan na otoku se z njo dobro zaključi.",
          },
          {
            title: "Sućuraj–Drvenik",
            text: "Kakih dvajset minut čez kanal na vzhodnem koncu Hvara; vozi od zgodnjega jutra in rešuje prehod na Korčulo brez vračanja v Split.",
          },
          {
            title: "Orebić–Dominče",
            text: "Petnajst minut čez preliv na Korčulo, plovbe pogoste skozi ves dan. Najlažji način, da se z avtom spravite na otok.",
          },
        ],
      },
      {
        heading: "Hvar: grad, lavanda in Pakleni otoci",
        body: [
          "Trajekt pristane v Starem Gradu, najstarejšem mestu na Hvarju, ki so ga grški naseljenci ustanovili pred kakšnimi 2 400 leti. Ob pristanišču stoji Tvrdalj, utrjena hiša renesančnega pesnika Petra Hektorovića z ribnikom in napisom nad vhodom; okoli mesta pa leži starogradska ravnica, antična mreža parcel in suhozidov, vpisana na Unescov seznam in obdelana še danes po isti logiki. Do mesta Hvara je od tod deset kilometrov oziroma petnajst minut vožnje po dobri cesti.",
          "Mesto Hvar je trg, obzidje in grad: na Španjolo se vzpenjate po stopnicah nad strehami, zgoraj pa se odpre pogled na Paklene otoke, verigo sivih otočkov pred mestom. Do njih vozijo taksi čolni s rive, dvosmerna vozovnica pride okoli deset evrov na osebo, za dan pa zadostujeta brisača in voda. Dopoldne je na Paklenih najlepše — morje čisto, sence v borovih gozdovih, izletniške ladje pa še niso prišle.",
          "V notranjosti se okrog Vela Grablja in Brusja razprostirajo nasadi sivke, ki pokrijejo otok z vijoličnim konec junija in v prvih dneh julija; ob cestah se prodaja sivkino olje in milo, polja pa so manjša, kot obljubljajo razglednice — vonj ob cvetenju je pač resničen. Za bazo izberite po sebi: mesto Hvar je najdražje, najbolj hrupno in najbolj živo, Stari Grad pa mirnejši, cenejši in bližje trajektu; z avtom je razlika med njima petnajst minut.",
        ],
      },
      {
        heading: "Korčula: mesto Marka Pola",
        body: [
          "Prehod z Hvarja na Korčulo je edini dan te poti, ki ga je treba zamisliti prej. Z avtom ga naredite takole: čez otoško cesto do Sućuraja na vzhodnem koncu, kratki trajekt v Drvenik na celini, nato slabih sto kilometrov obale — mimo bosanskega Neuma vas pelje Pelješki most — do Orebića in petnajst minut trajekta čez preliv v Dominče. Druga možnost je vrnitev v Split in trajekt v Velo Luko, ki pluje kakih tri ure in vozi naprej na Lastovo: daljše, a bolj sproščeno, če dan dopušča.",
          "Mesto Korčula se dviga na drobnem polotoku nasproti Orebića: obzidje, stolnica in ulice, razporejene po ribji kosti, tako da burja ne zapiha po njih vse naenkrat. Tu stoji domnevna rojstna hiša Marka Pola — Benečani si njegovo rojstvo lastijo tudi sami, a hiša s stolpom in razgledom je vredna ogleda ne glede na to, kdo ima prav. Poleti se na trgu pleše moreška, mečevalni ples, ki ga Korčula goji od sedemnajstega stoletja.",
          "Če vam ostane kakšen dan, ga porabite za Lastovo, naravni park in najbolj odročen naseljen otok te smeri; na njegov Ubli pristane isti trajekt, ki se ustavi v Veli Luki. Za ta načrt pa Korčula zadošča: dve noči pomenita en dan za mesto in počasno jutro ob prelivu, drugega pa za vasi — Lumbardo z vinogradi grk na jugu ter Čaro in Smokvico v notranjosti, kjer doma pošip, belo sorto, iz katere zrastejo nekatera najboljša dalmatinska vina.",
        ],
      },
      {
        heading: "Brač: Zlatni rat, Vidova gora in pot domov",
        body: [
          "Na Brač vodita dve poti in obe potrebujeta Split: trajekt iz Vele Luke, ki pluje kakih tri ure, ali vožnja iz Dominča čez Orebić, Pelješac in obalo do Splita, dobri dve uri in pol za volanom. Pred Splitom se naniza še petdeset minut do Supetarja. Za prevoz v Supetar imejte v sezoni rezervacijo, saj je v vrhu sezone ta prevoz prvi kandidat za čakalno vrsto.",
          "Supetar je glavno mesto in pristanišče, a razlog za nočitev je Bol na južni obali. Zlatni rat, prodni rt, ki se pod valovi in vetrom premika levo in desno, nikoli ni dvakrat iste oblike — kdor se vrne čez pet let, ga ne najde tam, kjer ga je pustil. Parkirišča nad plažo so poleta plačljiva in polna že dopoldne; pridite zgodaj ali parkirajte v Bolu in zadnjih petnajst minut naredite peš, kar je pravzaprav najlepši prihod na plažo na Jadranu.",
          "Nad Bolom se dviga Vidova gora, 780 metrov in najvišji vrh vseh jadranskih otokov. Cesta iz notranjosti otoka pripelje do parkirišča pod vrhom, od koder je do razgleda še kratka hoja; zgoraj se Zlatni rat pokaže v celoti — včasih skupaj s Hvarjem in Pelješacem v isti sliki — in jutranja svetloba je daleč najboljša. Pot domov je ena sama etapa: jutranji trajekt iz Supetara v Split, avtocesta mimo Zadra in Zagreba do Ljubljane, okoli 460 kilometrov. Če dan dopušča, ga omehčajte z nočitvijo v Zadru ali na Krku.",
        ],
      },
    ],
    practical: [
      {
        title: "Rezervacija trajektov",
        text: "Glavne prevoze — Split–Stari Grad in Split–Supetar — rezervirajte tedne prej, če potujete med junijem in avgustom; enako velja za linijo v Velo Luko. Potrditev imejte natisnjeno ali v telefonu in na pristanišče prispete uro pred vkrcanjem. Brez rezervacije v vrhu sezone obstaja resnična možnost, da ostaneš na celini.",
      },
      {
        title: "Vinjete in cestnine",
        text: "Slovenska e-vinjeta krije le Slovenijo; na Hrvaškem cestnino plačujete po odsekih na zaplatkah HAC, tako na poti čez Rijeko kot proti Splitu. Most na Krk je od leta 2020 brez cestnine. Na zaplatkah delujejo kartice in gotovina, vrste pa so krajše, če se peljete zgodaj.",
      },
      {
        title: "Katamarani za pešce",
        text: "Hitri katamarani med Splitom, Hvarjem in Korčulo so cenejši in hitrejši od trajektov, a vozijo samo potnike — avtov ne sprejemajo. Prav pridejo za dneve brez avta in za potnike, ki na otoke odhajajo lahčje. Redi so sezonski in se razlikujejo med prevozniki, zato jih preverite pred odhodom.",
      },
      {
        title: "Parkirišča na otokih",
        text: "Poleti so parkirišča v mestih plačljiva in polnijo se zgodaj: v Hvarju in mestu Korčuli so cone, v Bolu pa plačljiva cona nad Zlatnim ratom, ki je do desetih dopoldne pogosto že polna. Plačuje se po urah, avtomatske blagajne pa sprejemajo kovanec ali aplikacijo — drobiž imejte pri roki.",
      },
      {
        title: "Avto na otoku: da ali ne",
        text: "Na Krku je avto samoumevna izbira, na Hvarju koristna — med Starim Gradom, Hvarjem in vasmi v notranjosti je preveč kilometrov za kolesa in pešce. Korčulsko mesto in Supetar se obidata peš, za Bol in vasi v notranjosti pa je avto prav prišel. Na otoških cestah je kompakten avto milost, velik pa ovira.",
      },
      {
        title: "Kdaj na otoke",
        text: "Junij in september sta najboljša: morje toplo, gužva obvladljiva in cene nižje. Julij in avgust pomenita vrhunec — rezervacije tedni prej, polna parkirišča in skupne plaže. Maj je svež in primeren za hojo in kolo, oktober pa še dovolj topel za kopanje, le trajekti vozijo redkeje.",
      },
    ],
    faqs: [
      {
        question: "Koliko trajektov potrebujem za ta načrt?",
        answer:
          "Trije so nujni: Split–Stari Grad na poti na Hvar, Orebić–Dominče na poti na Korčulo in Supetar–Split na povratku. Četrti, Sućuraj–Drvenik, skrajša prehod z Hvarja na Korčulo in se ga splača narediti. Vsi glavni prevozi imajo v sezoni rezervacijo, preliv pa se pogosto naredi kar na mestu.",
      },
      {
        question: "Kdaj moram rezervirati trajekt z avtom?",
        answer:
          "Če potujete med junijem in avgustom, tedne prej — najpozneje takrat, ko rezervirate nastanitev. Mest na palubi je končno število in brez rezervacije v vrhu sezone resnično lahko ostaneš na celini. Izven sezone se na večino linij vkrcava brez rezervacije, a še vedno pridite zgodaj.",
      },
      {
        question: "Koliko stane trajekt Split–Stari Grad z avtom?",
        answer:
          "V sezoni okoli 40 do 50 evrov v eno smer za avto in potnike. Krajši prevozi so cenejši: Split–Supetar pride nekoliko manj, Sućuraj–Drvenik in Orebić–Dominče pa le del te vsote. Cene se s sezono premikajo, zato trenutni cenik preverite pri Jadroliniji.",
      },
      {
        question: "Ali se splača voziti avto na vse otoke?",
        answer:
          "Na Krk in Hvar gotovo — razdalje po otoku so predolge za pešce. Mesto Korčula in Supetar se obidata peš, za Bol, Lumbardo in vasi v notranjosti pa je avto prav prišel. Ne pozabite, da avto na trajektu v sezoni zahteva rezervacijo, to pa pomeni načrt.",
      },
      {
        question: "Kako pridem z avtom iz Hvarja na Korčulo?",
        answer:
          "Najpogosteje čez Sućuraj: trajekt v Drvenik, nato slabih sto kilometrov obale mimo Neuma in čez Pelješki most do Orebića, od tod pa petnajst minut trajekta v Dominče. Alternativa je vrnitev v Split in trajekt v Velo Luko, ki vozi naprej na Lastovo. Obe poti zasedeta poln dan.",
      },
      {
        question: "Koliko kilometrov je od Ljubljane do Splita?",
        answer:
          "Okoli 460 kilometrov, kar pomeni štiri do pet ur vožnje z odmori. V tem načrtu se etapa razdeli s postankom na Krku, ki je od Ljubljane oddaljen okoli 210 kilometrov. Od Krka do Splita je nato najdaljša kopenska etapa potovanja — naredite jo z odmorom ob Zadru.",
      },
      {
        question: "Kateri otok izpustiti, če imam manj dni?",
        answer:
          "Korčulo — najdlje je in zahteva največ logistike, saj se z avtom nanjo pride čez Hvar ali čez Split. Skrajšajte na Hvar in Brač ter dodajte dan Splitu, ki ga ta načrt sicer le dotakne. Če imate še manj časa, ostanite na Krku in izpeljite dneve kot izlete iz njega.",
      },
    ],
    relatedSlugs: [
      "hrvaska-obala-prakticni-vodnik",
      "slovenija-hrvaska-10-dni",
      "bled-plitvice-split",
    ],
    relatedSloveniaIds: ["ljubljana", "piran", "portoroz"],
  },
];
