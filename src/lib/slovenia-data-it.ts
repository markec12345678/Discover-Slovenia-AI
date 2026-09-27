/**
 * IT prekrivna plast za slovenia-data.ts (W1 faza 1 — Issue #15 V0).
 *
 * IT prevodi tekstovnih polj (isti vzorec kot slovenia-data-en.ts).
 * Slovenki original ostaja vir resnice; identifikatorji (id/slug/region/type/
 * bestFor/bestSeason keys, coords, slike, cene) so skupni in se NE prevajajo.
 *
 * KLJUČI = `id` polja iz slovenia-data.ts (38 destinacij — pokritost 38/38).
 * Dolžine highlights/activities se ujemajo z originalom.
 * Prevod: strojni (AI iz SL izvirnika z EN referenco, ročno urejen) +
 * označen v UI (mtNotice — provenance kanon platforme) do revizije.
 */
import type { DestinationEn } from "./slovenia-data-en";

export type { DestinationEn } from "./slovenia-data-en";

export const DESTINATIONS_IT: Record<string, DestinationEn> = {
  bled: {
    tagline: "La perla delle Alpi con castello medievale e isola",
    description: "Il lago di Bled, con la sua isola unica su cui sorgono chiesa e campanile, è la più celebre cartolina slovena. Il castello medievale sulla roccia offre viste panoramiche, la vicina gola di Vintgar invita a una breve passeggiata nel calcare lungo un fiume tranquillo. Una fetta di kremšnita in pasticceria sul lago è il dolce peccato obbligato.",
    highlights: ["Isola di Bled", "Castello di Bled", "Gola di Vintgar", "Kremšnita"],
    activities: ["Giro in pletna all'isola", "Visita al castello", "Passeggiata nella gola", "Nuoto"],
    duration: "1-2 giorni",
  },
  bohinj: {
    tagline: "Bellezza selvaggia e intatta del Parco nazionale del Triglav",
    description: "Il lago di Bohinj è il fratello maggiore e più selvaggio del lago di Bled, interamente dentro il Parco nazionale del Triglav. La funivia del Vogel offre viste panoramiche sulle Alpi Giulie, la cascata Savica è a breve cammino nel bosco. Ideale per chi cerca tranquillità e una fuga attiva nella natura.",
    highlights: ["Lago di Bohinj", "Vogel", "Cascata Savica", "Parco nazionale del Triglav"],
    activities: ["Escursionismo", "Sci", "Kayak", "Funivia del Vogel"],
    duration: "1-2 giorni",
  },
  ljubljana: {
    tagline: "Capitale verde e creativa con il ponte del drago",
    description: "Lubiana è una capitale piccola ma vivace, dove l'architettura medievale si mescola con una scena gastronomica contemporanea. Il castello offre una vista panoramica, piazza Prešeren con il ponte del drago è il cuore della città e lungo la Ljubljanica si snoda la vita di caffè e chiacchiere.",
    highlights: ["Castello di Lubiana", "Ponte del drago", "Piazza Prešeren", "Parco Tivoli"],
    activities: ["Visita al castello", "Passeggiata nel centro storico", "Tour gastronomico", "Bici lungo la Ljubljanica"],
    duration: "2 giorni",
  },
  postojna: {
    tagline: "24 km di gallerie sotterranee e un regno fatato di stalattiti",
    description: "La grotta di Postumia è il più grande sistema carsico turistico d'Europa, con un unico trenino sotterraneo. Vi abitava anche il proteo — l'endemita che ha ispirato le leggende sui cuccioli di drago. Il castello di Predjama, scavato in una parete di 123 metri, è a soli 9 km.",
    highlights: ["Trenino sotterraneo", "Stalattiti", "Proteo", "Castello di Predjama"],
    activities: ["Tour della grotta in trenino", "Visita al castello di Predjama", "Fotografia"],
    duration: "1 giorno",
  },
  piran: {
    tagline: "La Venezia slovena con vicoli di pietra e piazza Tartini",
    description: "Pirano è una cittadina marinara dall'aspetto veneziano, dove i vicoli stretti si stringono tra case di pietra. Piazza Tartini, dai pavimenti marmorei, è dedicata al violinista Giuseppe Tartini. La chiesa di San Giorgio sul colle domina il mare Adriatico.",
    highlights: ["Piazza Tartini", "Chiesa di San Giorgio", "Lungomare", "Vecchi vicoli"],
    activities: ["Passeggiata nel centro storico", "Tramonto", "Pesce fresco", "Visita alle saline"],
    duration: "1 giorno",
  },
  soca: {
    tagline: "Il fiume smeraldo tra le Alpi Giulie per avventure adrenaliniche",
    description: "L'Isonzo è uno dei pochi fiumi che mantiene il suo colore smeraldo tutto l'anno. Si snoda attraverso Tolmino e Plezzo, offrendo rafting, kayak e canyoning di prima classe. Lungo il percorso le gole dell'Isonzo — piscine naturali scavate nel calcare, ideali per rinfrescarsi d'estate.",
    highlights: ["Gole dell'Isonzo", "Plezzo", "Tolmino", "Fortezza Kluže"],
    activities: ["Rafting", "Kayak", "Canyoning", "Zip-line"],
    duration: "2-3 giorni",
  },
  triglav: {
    tagline: "2864 m, simbolo della nazione con innumerevoli sentieri",
    description: "Il Triglav è la cima più alta della Slovenia e simbolo nazionale, presente nello stemma. L'ascesa richiede escursionismo tecnico, ma con buona preparazione è raggiungibile in uno o due giorni. In cima sta la torre Aljaž — il rifugio più alto del paese.",
    highlights: ["Vetta a 2864 m", "Torre Aljaž", "Fiore del Triglav", "Escursionismo"],
    activities: ["Escursionismo", "Alpinismo", "Fotografia"],
    duration: "2 giorni",
  },
  kobarid: {
    tagline: "Storia, Fronte dell'Isonzo e gastronomia in un solo paese",
    description: "Caporetto è un paesino sull'Isonzo, celebre per il Museo di Caporetto che documenta la cruenta Fronte dell'Isonzo della Prima guerra mondiale. Il ponte di Napoleone e il Kolovrat offrono viste panoramiche. Hiša Franko, uno dei migliori ristoranti della regione, propone la cucina tolminiana contemporanea.",
    highlights: ["Museo di Caporetto", "Ponte di Napoleone", "Kolovrat", "Hiša Franko"],
    activities: ["Museo", "Escursionismo", "Esperienza gastronomica", "Bici lungo l'Isonzo"],
    duration: "1 giorno",
  },
  maribor: {
    tagline: "La seconda città con la vite più antica del mondo",
    description: "Maribor si trova sulla Drava, circondata dai vigneti del Pohorje. La Vecchia Vite, vecchia di oltre 400 anni, è iscritta nel Guinness dei primati. La città offre un vivace centro storico, i filari del Pohorje e lo sci in inverno.",
    highlights: ["La Vecchia Vite", "Pohorje", "Piazza principale", "Viticoltura"],
    activities: ["Visita alla Vecchia Vite", "Sci sul Pohorje", "Degustazione di vini", "Centro storico"],
    duration: "1-2 giorni",
  },
  portoroz: {
    tagline: "La località balneare slovena con casinò e wellness",
    description: "Portorose è la località balneare slovena più celebre, con una lunga spiaggia sabbiosa, hotel con centri benessere e il casinò. La passeggiata a mare collega Portorose a Pirano, le saline di Sicciole offrono un'esperienza naturale unica e il fango terapeutico.",
    highlights: ["Spiaggia", "Casinò", "Saline di Sicciole", "Wellness"],
    activities: ["Nuoto", "Wellness", "Giochi d'azzardo", "Bici lungo il mare"],
    duration: "2-3 giorni",
  },
  vintgar: {
    tagline: "Una breve passeggiata nel calcare lungo un fiume tranquillo",
    description: "La gola di Vintgar è una gola di 1,6 km lungo il fiume Radovna, a soli 4 km da Bled. I ponti di legno accompagnano lungo acque cristalline, passando una cascata e vasche naturali. La passeggiata dura circa un'ora ed è adatta a tutte le età.",
    highlights: ["Cascata Šum", "Ponti di legno", "Acqua cristallina", "Vasche naturali"],
    activities: ["Passeggiata", "Fotografia", "Osservazione della natura"],
    duration: "1 giorno",
  },
  rogaska: {
    tagline: "La più antica stazione termale slovena con acqua minerale",
    description: "Rogaška Slatina è un'elegante località termale con 400 anni di tradizione, celebre per l'acqua minerale Donat Mg con il più alto contenuto di magnesio al mondo. L'architettura liberty, i parchi e i centri benessere offrono relax tutto l'anno.",
    highlights: ["Donat Mg", "Architettura liberty", "Grand Hotel", "Wellness"],
    activities: ["Wellness", "Degustazione di acqua minerale", "Passeggiate nel parco", "Massaggi"],
    duration: "2 giorni",
  },
  ptuj: {
    tagline: "La città più antica della Slovenia con storia romana",
    description: "Ptuj è la città documentata più antica della Slovenia, fondata in epoca romana come Poetovio. Il castello medievale sul colle offre una vista panoramica sulla Drava, il centro storico conserva l'architettura barocca. Celebre per il Kurentovanje — il più grande carnevale dell'Europa centrale.",
    highlights: ["Castello di Ptuj", "Reperti romani", "Kurentovanje", "Drava"],
    activities: ["Visita al castello", "Passeggiata nel centro storico", "Festival di carnevale", "Passeggiata lungo la Drava"],
    duration: "1 giorno",
  },
  celje: {
    tagline: "L'antica capitale dei conti di Celje con un castello imponente",
    description: "Celje è la terza città della Slovenia, celebre per il castello medievale dei conti di Celje — un tempo la casata nobiliare più influente delle terre slovene. La piazza vecchia conserva facciate barocche, lungo la Savinja si snoda un percorso di passeggio.",
    highlights: ["Castello vecchio di Celje", "Piazza vecchia", "Savinja", "Museo regionale"],
    activities: ["Visita al castello", "Passeggiata nel centro storico", "Museo", "Bici lungo la Savinja"],
    duration: "1 giorno",
  },
  "nova-gorica": {
    tagline: "La città delle rose al confine con l'Italia",
    description: "Nova Gorica è una città giovane costruita dopo la Seconda guerra mondiale, nota come 'città delle rose'. Confina con Gorizia italiana — le uniche città europee che condividono una piazza (Piazza Europa). Casinò, parchi e clima mediterraneo.",
    highlights: ["Piazza Europa", "Parco delle rose", "Casinò Perla", "Ponte di Salcano"],
    activities: ["Passeggiata nel parco", "Giochi d'azzardo", "Passeggiata al confine in Italia", "Bici lungo l'Isonzo"],
    duration: "1 giorno",
  },
  "slovenj-gradec": {
    tagline: "Cittadina alpina con ricca tradizione musicale",
    description: "Slovenj Gradec è una storica cittadina nel nord della Slovenia, circondata dalle Alpi Carinziane. Celebre per la Sala dei musicisti sloveni e come città natale di Hugo Wolf. Punti di partenza ideali per escursioni sul Pohorje e sull'Uršlja gora.",
    highlights: ["Sala dei musicisti sloveni", "Piazza vecchia", "Pohorje", "Uršlja gora"],
    activities: ["Escursionismo", "Concerti", "Passeggiata nel centro storico", "Sci"],
    duration: "1 giorno",
  },
  dravograd: {
    tagline: "Il confluenza dei fiumi Drava, Meža e Mislinja",
    description: "Dravograd è una piccola cittadina nel nord della Slovenia dove si incontrano tre fiumi — Drava, Meža e Mislinja. Circondata dai boschi del Kozjak e del Pohorje. Central idroelettrica sulla Drava e sentieri lungo il fiume.",
    highlights: ["Confluenza dei tre fiumi", "Idroelettrica di Dravograd", "Kozjak", "Escursionismo"],
    activities: ["Escursionismo", "Pesca", "Bici lungo la Drava", "Fotografia naturalistica"],
    duration: "1 giorno",
  },
  "murska-sobota": {
    tagline: "Il centro della Prekmurja con castello sul lago",
    description: "Murska Sobota è il centro della Prekmurja — la piatta campagna pannonica del nordest sloveno. Il castello di Murska Sobota affianco al lago omonimo ospita il Museo regionale. Celebre per la gibanica prekmurska e l'olio di zucca.",
    highlights: ["Castello di Murska Sobota", "Lago di Sobota", "Gibanica prekmurska", "Museo regionale"],
    activities: ["Visita al castello", "Passeggiata along il lago", "Esperienze gastronomiche", "Bici in pianura"],
    duration: "1 giorno",
  },
  lendava: {
    tagline: "Città bilingue con vigneti e castello sul colle",
    description: "Lendava è la città più orientale della Slovenia, al confine con l'Ungheria. Città bilingue (sloveno-ungherese) con un castello sul colle che offre una vista panoramica sui vigneti dei colli di Lendava. Produzione di vini bianchi di prima classe.",
    highlights: ["Castello di Lendava", "Vigneti dei colli di Lendava", "Cultura bilingue", "Cantina"],
    activities: ["Degustazione di vini", "Visita al castello", "Bici tra i vigneti", "Passeggiata di confine"],
    duration: "1 giorno",
  },
  "novo-mesto": {
    tagline: "La capitale della Dolenjska sul fiume Krka",
    description: "Novo mesto è il centro della Dolenjska, costruita nell'ansa del fiume Krka. La piazza vecchia con la via principale conserva il carattere medievale. Celebre per il cviček — il vino tradizionale della Dolenjska — e per i reperti archeologici della cultura di Hallstatt.",
    highlights: ["Piazza vecchia", "Fiume Krka", "Cviček", "Museo archeologico"],
    activities: ["Passeggiata nel centro storico", "Degustazione di vini", "Bici lungo la Krka", "Museo"],
    duration: "1-2 giorni",
  },
  otocec: {
    tagline: "L'unico castello sloveno su un'isola fluviale",
    description: "Otočec è l'unico castello sloveno su un'isola, circondato dal fiume Krka. Oggi hotel di lusso con campo da golf e wellness. Ambiente romantico per coppie e punto di partenza per il cicloturismo lungo la Krka.",
    highlights: ["Castello sull'isola", "Fiume Krka", "Golf", "Wellness"],
    activities: ["Golf", "Wellness", "Bici lungo la Krka", "Cena romantica"],
    duration: "1-2 giorni",
  },
  crnomelj: {
    tagline: "Il cuore della Bela krajina sul fiume Kolpa",
    description: "Črnomelj è il centro della Bela krajina — un paesaggio caldo e mediterraneo nel sud-est della Slovenia lungo il fiume Kolpa. Celebre per la pisanica della Bela krajina (uova colorate), gli steljniki e la musica tradizionale. La Kolpa offre l'acqua più calda per il bagno in Slovenia.",
    highlights: ["Fiume Kolpa", "Piazza vecchia", "Pisanica della Bela krajina", "Steljniki"],
    activities: ["Bagno nella Kolpa", "Passeggiata nel centro storico", "Bici nella Bela krajina", "Museo etnografico"],
    duration: "1-2 giorni",
  },
  zagreb: {
    tagline: "Capitale croata con fascino viennese e cultura dei caffè",
    description: "Zagabria è una città al confine tra Europa centrale e sudorientale, con un nucleo simile a Vienna: la Città alta con il mercato coperto e la torre Lotrščak, le strade liberty della città bassa e il vivace Dolac al mattino, quando i contadini espongono i loro prodotti. L'Avvento in Città alta a dicembre è tra i più festosi d'Europa, d'estate il caffè in via Tkalčićeva dà il ritmo alla città.",
    highlights: ["Città alta", "Piazza Ban Jelačić", "Mercato Dolac", "Cattedrale"],
    activities: ["Passeggiata nella Città alta", "Musei e gallerie", "Avvento a dicembre", "Caffè in Tkalčićeva"],
    duration: "2 giorni",
  },
  "plitvicka-jezera": {
    tagline: "Cascata UNESCO di laghi turchesi e cascate",
    description: "Il più antico parco nazionale croato è una catena di sedici laghi che si riversano l'uno nell'altro oltre dighe travertinose e cascate. Le passerelle di legno accompagnano lungo l'acqua attraverso il bosco, sul lago più grande, il Kozjak, navigano barche elettriche. Il colore dell'acqua oscilla tra turchese e smeraldo secondo stagione e luce.",
    highlights: ["Grande cascata", "Lago Kozjak", "Passerelle di legno", "Barriere travertinose"],
    activities: ["Passeggiata sulle passerelle", "Giro in barca sul Kozjak", "Fotografia", "Visione della Grande cascata"],
    duration: "1 giorno",
  },
  rijeka: {
    tagline: "Capitale della cultura con il più grande porto croato",
    description: "Fiume è una città portuale sul Quarnaro con un nucleo asburgico, il lungo Korzo e il castello di Tersatto sul colle sopra la città. Nel 2020 è stata capitale europea della cultura; il Carnevale di Fiume a Pasqua è tra i più grandi d'Europa. Da Fiume partono traghetti per le isole e l'Italia — la città è la porta del Quarnaro.",
    highlights: ["Korzo", "Castello di Tersatto", "Torre civica", "Cattedrale di San Vito"],
    activities: ["Passeggiata sul Korzo", "Vista da Tersatto", "Carnevale di Fiume", "Escursioni in traghetto alle isole"],
    duration: "1-2 giorni",
  },
  pula: {
    tagline: "Anfiteatro romano sul mare Adriatico",
    description: "Pola è la città più grande dell'Istria con l'anfiteatro romano meglio conservato del mondo dopo Roma — l'Arena del I secolo ospita ancora concerti e cinema all'aperto. Il centro storico con l'Arco d'oro e la Cattedrale di Santa Maria si stringe sulla penisola, attorno alla città si distendono spiagge e villaggi vitivinicoli istriani.",
    highlights: ["Anfiteatro Arena", "Arco d'oro", "Piazza vecchia", "Riviera istriana"],
    activities: ["Visita all'Arena", "Passeggiata nel centro storico", "Bagno", "Degustazioni di vini in Istria"],
    duration: "1-2 giorni",
  },
  zadar: {
    tagline: "La città del tramonto e dell'organo di mare",
    description: "Zara è una città dalmata su una penisola con impianto romano e la chiesa romanica di San Donato. Sulla costa l'organo di mare suona con le onde, accanto il Saluto al sole — un'installazione attorno alla quale si raccolgono le folle al tramonto; Alfred Hitchcock definì il tramonto di Zara il più bello del mondo. Da Zara partono le escursioni più brevi per le Kornati.",
    highlights: ["Organo di mare", "Saluto al sole", "Chiesa di San Donato", "Rovine romane"],
    activities: ["Ascolto dell'organo di mare", "Tramonto", "Passeggiata sulle mura", "Escursione alle Kornati"],
    duration: "1-2 giorni",
  },
  split: {
    tagline: "Città viva dentro il palazzo di Diocleziano",
    description: "Il cuore di Spalato è il palazzo di Diocleziano del IV secolo — un complesso romano in cui oggi vive la gente: caffè nel Peristilio, mercati nei sotterranei, boutique nelle sale voltate. La cattedrale di San Doimo è la più antica cattedrale al mondo in uso continuo. Il colle Marjan offre una fuga tra i pini sopra la città, dal porto salpano traghetti per le isole.",
    highlights: ["Palazzo di Diocleziano", "Peristilio", "Cattedrale di San Doimo", "Marjan"],
    activities: ["Esplorazione del palazzo", "Passeggiata sul Marjan", "Spiaggia Bačvice", "Traghetti verso le isole"],
    duration: "2 giorni",
  },
  hvar: {
    tagline: "L'isola adriatica più soleggiata di lavanda e pietra",
    description: "Hvar è un'isola con quasi 2800 ore di sole l'anno, una cittadina portuale dall'aspetto veneziano e la fortezza Fortica sul colle. L'interno nasconde campi di lavanda e vigneti della bogotinjava pošipina (vitigno autoctono). Davanti al porto stanno le isole Pakleni — calette di scisto per ancoraggi e bagni.",
    highlights: ["Fortezza Fortica", "Porto di Hvar", "Isole Pakleni", "Campi di lavanda"],
    activities: ["Vista dalla Fortica", "Escursione alle isole Pakleni", "Degustazione di pošip", "Bagno nelle calette"],
    duration: "2-3 giorni",
  },
  dubrovnik: {
    tagline: "Città medievale cinta di mura sopra l'azzurro Adriatico",
    description: "Ragusa — la repubblica che per secoli gareggiò con Venezia — è una città murata sulla scogliera sul mare, il cui Stradun collega le porte Pile e Ploče. Le mura lunghe quasi due chilometri offrono la passeggiata urbana più celebre dell'Adriatico; la funivia sale sul Monte Srđ per la vista sulla città vecchia e le isole. Davanti alla città si stende l'boscosa isola di Lokrum.",
    highlights: ["Mura cittadine", "Stradun", "Isola di Lokrum", "Funivia sul Srđ"],
    activities: ["Passeggiata sulle mura", "Chiostro francescano", "Escursione a Lokrum", "Tramonto dal Srđ"],
    duration: "2-3 giorni",
  },
  kotor: {
    tagline: "Una baia simile a un fiordo con città medievale murata",
    description: "Cattaro siede sul fondo delle Bocche di Cattaro, che si attorcigliano tra monti ripidi come unico fiordo del Mediterraneo. Il centro storico con la rete di piazze e vicoli è protetto UNESCO; le mura con la fortezza San Giovanni salgono oltre 1200 scalini sopra la città e offrono una vista leggendaria sulla baia. Nella vicina Perasto sta l'isola barocca Gospa od Škrpjela.",
    highlights: ["Città vecchia di Cattaro", "Mura di San Giovanni", "Bocche di Cattaro", "Perasto"],
    activities: ["Passeggiata nella città vecchia", "Salita sulle mura", "Escursione a Perasto", "Croccata delle Bocche"],
    duration: "1-2 giorni",
  },
  budva: {
    tagline: "Città vecchia su una penisola tra spiagge e pini",
    description: "Budua è la località balneare montenegrina più visitata — centro storico su una penisola rocciosa con mura, attorno una serie di spiagge (Mogren, Jaz, Spiaggia slovena). D'estate strade e terrazze sono piene, in autunno e primavera la città vecchia respira tranquilla. Il soggetto più celebre per i fotografi è l'isoletta Santo Stefano con l'antico borgo-hotel.",
    highlights: ["Città vecchia di Budua", "Spiaggia Mogren", "Santo Stefano", "Spiaggia Jaz"],
    activities: ["Passeggiata nella città vecchia", "Bagno al Mogren", "Vista su Santo Stefano", "Serate sul lungomare"],
    duration: "1-2 giorni",
  },
  podgorica: {
    tagline: "Capitale rilassata al crocevia di fiumi e montagne",
    description: "Podgorica è la capitale e città più grande del Montenegro, costruita alla confluenza della Morača e della Ribnica. Il ritmo lo danno il korzo, le terrazze dei caffè e il Ponte del Millennio; Stara Varoš conserva resti ottomani con la torre dell'orologio. Ottimo punto di partenza — il lago di Scutari, Budua e il Durmitor sono escursioni quotidiane.",
    highlights: ["Ponte del Millennio", "Stara Varoš", "Torre dell'orologio", "Gorica"],
    activities: ["Passeggiata sul korzo", "Esplorazione della Stara Varoš", "Caffè sulla Morača", "Escursione al lago di Scutari"],
    duration: "1 giorno",
  },
  durmitor: {
    tagline: "Montagne UNESCO sopra il Lago Nero e il canyon della Tara",
    description: "Il parco nazionale del Durmitor è un massiccio costellato di 18 laghi glaciali — il più celebre è il Lago Nero accanto a Žabljak, capitale di montagna. Il canyon del fiume Tara è il più profondo d'Europa (1300 m) e sede del rafting tra le rive; la panoramica strada del Sedlo Soa collega Žabljak con il sud. D'inverno piste da sci, d'estate sentieri attorno ai laghi.",
    highlights: ["Lago Nero", "Canyon della Tara", "Žabljak", "Sedlo Soa"],
    activities: ["Trekking attorno al Lago Nero", "Rafting sulla Tara", "Panoramica del Sedlo", "Sci d'inverno"],
    duration: "2-3 giorni",
  },
  tirana: {
    tagline: "Capitale colorata con nucleo ottomano e ritmo da caffè",
    description: "Tirana è una capitale che dopo lunghi decenni si è aperta — facciate colorate, piazza Scanderbeg con la moschea Et'hem Bej e la torre dell'orologio, caffè nelle strade dei blocchi. La funivia Dajti Ekspres sale a 1600 m sopra la città per la vista sulla pianura e l'Adriatico; il museo Bunk'Art in un rifugio atomico racconta il Novecento.",
    highlights: ["Piazza Scanderbeg", "Moschea Et'hem Bej", "Bunk'Art", "Monte Dajti"],
    activities: ["Esplorazione del centro", "Funivia sul Dajti", "Musei", "Cultura dei caffè"],
    duration: "2 giorni",
  },
  berat: {
    tagline: "La città delle mille finestre sotto il castello sull'Osum",
    description: "Berat è una città protetta UNESCO, celebre come città delle mille finestre — le bianche case ottomane del quartiere Mangalem salgono a gradinate verso il castello in cima. Il vecchio ponte sul fiume Osum collega il quartiere Gorica; nel castello sta il Museo Onufri con le icone. Attorno a Berat vigneti, con degustazioni nelle case tradizionali.",
    highlights: ["Castello di Berat", "Quartiere Mangalem", "Vecchio ponte", "Museo Onufri"],
    activities: ["Passeggiata nel Mangalem", "Visita al castello", "Ponte sull'Osum", "Degustazione di vini"],
    duration: "1 giorno",
  },
  gjirokaster: {
    tagline: "La città di pietra — tetti grigi sotto un castello possente",
    description: "Gjirokastër è una città UNESCO di case in pietra con tetti in scandole, arroccata su un pendio ripido sotto uno dei più grandi castelli dei Balcani. Il vecchio bazar conserva la strada mercantile ottomana con i suoi portici; la casa natale dello scrittore Ismail Kadare è oggi museo. Sulla valle aleggia la leggenda di Zerm e delle ninfe — le montagne attorno invitano alle escursioni.",
    highlights: ["Castello di Gjirokastër", "Vecchio bazar", "Case di pietra", "Casa di Kadare"],
    activities: ["Visita al castello", "Passeggiata nel bazar", "Museo etnografico", "Escursionismo nei dintorni"],
    duration: "1 giorno",
  },
  saranda: {
    tagline: "Città soleggiata dello Ionio di fronte a Corfù",
    description: "Saranda è la città balneare albanese più meridionale, di fronte alla greca Corfù (traghettata di 30 min). La costa a sud della città nasconde Ksamil con spiagge bianche e isolette, l'interno l'antichità — Butrinto è una città antica UNESCO tra lago e canale. La vista dalla fortezza Lëkurësi sopra la città regala al tramonto il sole sul mar Ionio.",
    highlights: ["Ksamil", "Antica Butrinto", "Fortezza Lëkurësi", "Vista su Corfù"],
    activities: ["Bagno a Ksamil", "Visita a Butrinto", "Tramonto da Lëkurësi", "Traghettata per Corfù"],
    duration: "2-3 giorni",
  },
};

/** IT overlay za destinacijo po id (fallback null → SL izvirnik). */
export function getItDestination(id: string): DestinationEn | null {
  return DESTINATIONS_IT[id] ?? null;
}
