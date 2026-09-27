/**
 * DE prekrivna plast za slovenia-data.ts (W1 faza 1 — Issue #15 V0).
 *
 * DE prevodi tekstovnih polj (isti vzorec kot slovenia-data-en.ts).
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

export const DESTINATIONS_DE: Record<string, DestinationEn> = {
  bled: {
    tagline: "Die Perle der Alpen mit mittelalterlicher Burg und Insel",
    description: "Der Bleder See mit seiner einzigartigen Insel, auf der Kirche und Glockenturm stehen, ist Sloweniens berühmteste Postkartenansicht. Die mittelalterliche Burg auf dem Fels bietet Panoramablicke, die nahe Vintgar-Klamm lädt zu einem kurzen Spaziergang durch den Kalkstein an einem ruhigen Fluss ein. Ein Stück Bleder Cremeschnitte (kremšnita) in einer Seebäckerei ist das Pflichtsündchen.",
    highlights: ["Bleder Insel", "Burg Bled", "Vintgar-Klamm", "Cremeschnitte"],
    activities: ["Pletna-Fahrt zur Insel", "Burgbesuch", "Klammspaziergang", "Schwimmen"],
    duration: "1–2 Tage",
  },
  bohinj: {
    tagline: "Wilde, unberührte Schönheit des Triglav-Nationalparks",
    description: "Der Bohinjer See ist der größere, wildere Bruder des Bleder Sees, vollständig im Triglav-Nationalpark. Die Vogel-Seilbahn bietet Panoramablicke auf die Julischen Alpen, der Savica-Wasserfall liegt einen kurzen Waldweg entfernt. Ideal für alle, die Ruhe und eine aktive Flucht in die Natur suchen.",
    highlights: ["Bohinjer See", "Vogel", "Savica-Wasserfall", "Triglav-Nationalpark"],
    activities: ["Wandern", "Skifahren", "Kajak", "Vogel-Seilbahn"],
    duration: "1–2 Tage",
  },
  ljubljana: {
    tagline: "Grüne, kreative Hauptstadt mit der Drachenbrücke",
    description: "Ljubljana ist eine kleine, aber lebendige Hauptstadt, in der sich mittelalterliche Architektur und eine moderne Kulinarik-Szene mischen. Die Burg bietet Panoramablick, die Prešeren-Platz mit der Drachenbrücke ist das Herz der Stadt, an der Ljubljanica entfaltet sich Kaffee und Gespräch.",
    highlights: ["Burg Ljubljana", "Drachenbrücke", "Prešeren-Platz", "Park Tivoli"],
    activities: ["Burgbesuch", "Altstadtrundgang", "Kulinarik-Tour", "Rad an der Ljubljanica"],
    duration: "2 Tage",
  },
  postojna: {
    tagline: "24 km unterirdische Gänge und ein Märchenreich der Tropfsteine",
    description: "Die Postojna-Höhle ist das größte touristische Höhlensystem Europas mit einer einzigartigen unterirdischen Bahn. Hier lebte auch der Grottenolm — das Endemit, das Legenden von Drachenjungen inspirierte. Die Predjama-Burg, in eine 123 Meter hohe Felswand gehauen, liegt nur 9 km entfernt.",
    highlights: ["Unterirdische Bahn", "Tropfsteine", "Grottenolm", "Predjama-Burg"],
    activities: ["Höhlentour mit Bahn", "Predjama-Burg besuchen", "Fotografie"],
    duration: "1 Tag",
  },
  piran: {
    tagline: "Sloweniens Venedig mit steinernen Gassen und dem Tartini-Platz",
    description: "Piran ist ein Küstenstädtchen mit venezianischem Aussehen, in dem sich enge Gassen zwischen Steinhäusern drängen. Der Tartini-Platz, der Hauptplatz mit Marmorbelag, ist dem Geiger Giuseppe Tartini gewidmet. Die Kirche St. Georg auf dem Hügel blickt über die Adria.",
    highlights: ["Tartini-Platz", "Kirche St. Georg", "Küste", "Alte Gassen"],
    activities: ["Altstadtrundgang", "Sonnenuntergang", "Meeresküche", "Salinen-Besuch"],
    duration: "1 Tag",
  },
  soca: {
    tagline: "Der smaragdgrüne Fluss zwischen den Julischen Alpen für Adrenalin-Abenteuer",
    description: "Die Soča ist einer der wenigen Flüsse, die ihre smaragdgrüne Farbe das ganze Jahr behält. Sie schlängelt sich durch Tolmin und Bovec und bietet erstklassiges Rafting, Kajak und Canyoning. Dazwischen liegen die Soča-Schluchten — Naturbecken im Kalkstein, perfekt zur Sommerabkühlung.",
    highlights: ["Soča-Schluchten", "Bovec", "Tolmin", "Festung Kluže"],
    activities: ["Rafting", "Kajak", "Canyoning", "Zipline"],
    duration: "2–3 Tage",
  },
  triglav: {
    tagline: "2864 m hohes Nationalsymbol mit unzähligen Wegen",
    description: "Der Triglav ist Sloweniens höchster Gipfel und Nationalsymbol, er ziert das Staatswappen. Der Aufstieg erfordert technisches Wandern, ist bei guter Vorbereitung aber in ein bis zwei Tagen machbar. Auf dem Gipfel steht der Aljaž-Turm — die höchstgelegene Zuflucht des Landes.",
    highlights: ["Gipfel 2864 m", "Aljaž-Turm", "Triglav-Rose", "Wandern"],
    activities: ["Wandern", "Alpinismus", "Fotografie"],
    duration: "2 Tage",
  },
  kobarid: {
    tagline: "Geschichte, Isonzofront und Kulinarik in einem Dorf",
    description: "Kobarid ist ein Dörfchen an der Soča, bekannt für das Kobarid-Museum, das die blutige Isonzofront des Ersten Weltkriegs dokumentiert. Die Napoleonbrücke über die Soča und der Kolovrat bieten Panoramablicke. Hiša Franko, eines der besten Restaurants der Region, führt die moderne Tolminer Küche.",
    highlights: ["Kobarid-Museum", "Napoleonbrücke", "Kolovrat", "Hiša Franko"],
    activities: ["Museum", "Wandern", "Kulinarik-Erlebnis", "Rad an der Soča"],
    duration: "1 Tag",
  },
  maribor: {
    tagline: "Die zweitgrößte Stadt mit dem ältesten Weinstock der Welt",
    description: "Maribor liegt an der Drau, umgeben von den Weingärten des Pohorje. Der Alte Weinstock, über 400 Jahre alt, steht im Guinness-Buch der Rekorde. Die Stadt bietet einen lebendigen Altstadtkern, die Weingarten-Fluren des Pohorje und Winterskilauf.",
    highlights: ["Alter Weinstock", "Pohorje", "Hauptplatz", "Weinbau"],
    activities: ["Besuch des Alten Weinstocks", "Skifahren am Pohorje", "Weinverkostung", "Altstadt"],
    duration: "1–2 Tage",
  },
  portoroz: {
    tagline: "Das slowenische Seebad mit Casino und Wellness",
    description: "Portorož ist Sloweniens bekanntestes Seebad mit langem Sandstrand, Hotels mit Wellness-Centern und Casino. Die Uferpromenade verbindet Portorož mit Piran, die Salzfelder von Sečovlje bieten ein einzigartiges Naturerlebnis und Heilschlamm.",
    highlights: ["Strand", "Casino", "Salzfelder Sečovlje", "Wellness"],
    activities: ["Schwimmen", "Wellness", "Glücksspiel", "Rad am Meer"],
    duration: "2–3 Tage",
  },
  vintgar: {
    tagline: "Ein kurzer Spaziergang durch Kalkstein an einem stillen Fluss",
    description: "Die Vintgar-Klamm ist eine 1,6 km lange Schlucht an der Radovna, nur 4 km von Bled entfernt. Holzwege führen an kristallklarem Wasser vorbei, an einem Wasserfall und natürlichen Becken. Der Spaziergang dauert etwa eine Stunde und eignet sich für alle Altersgruppen.",
    highlights: ["Wasserfall Šum", "Holzwege", "Kristallklars Wasser", "Natürliche Becken"],
    activities: ["Spaziergang", "Fotografie", "Naturbeobachtung"],
    duration: "1 Tag",
  },
  rogaska: {
    tagline: "Das älteste slowenische Heilbad mit Mineralwasser",
    description: "Rogaška Slatina ist ein elegantes Kurort mit 400-jähriger Tradition, bekannt für das Mineralwasser Donat Mg mit dem höchsten Magnesiumgehalt der Welt. Jugenststil-Architektur, Parks und Wellness-Center bieten ganzjährige Entspannung.",
    highlights: ["Donat Mg", "Jugendstil-Architektur", "Grand Hotel", "Wellness"],
    activities: ["Wellness", "Mineralwasser-Trinken", "Parkspaziergänge", "Massagen"],
    duration: "2 Tage",
  },
  ptuj: {
    tagline: "Sloweniens älteste Stadt mit römischer Geschichte",
    description: "Ptuj ist Sloweniens älteste dokumentierte Stadt, in der Römerzeit als Poetovio gegründet. Die mittelalterliche Burg auf dem Hügel bietet Panoramablick auf die Drau, die Altstadt bewahrt Barockarchitektur. Bekannt für das Kurentovanje — das größte Karnevalsfest Mitteleuropas.",
    highlights: ["Burg Ptuj", "Römische Ausgrabungen", "Kurentovanje", "Drau"],
    activities: ["Burgbesuch", "Altstadtrundgang", "Fasnachtsfestival", "Spaziergang an der Drau"],
    duration: "1 Tag",
  },
  celje: {
    tagline: "Ehemalige Hauptstadt der Grafen von Celje mit beeindruckender Burg",
    description: "Celje ist Sloweniens drittgrößte Stadt, bekannt für die mittelalterliche Burg der Grafen von Celje — einst das einflussreichste Adelsgeschlecht der slowenischen Länder. Der Alte Markt bewahrt Barockfassaden, an der Savinja entlang zieht sich ein Spazierweg.",
    highlights: ["Alte Burg Celje", "Alter Markt", "Savinja", "Regionalmuseum"],
    activities: ["Burgbesuch", "Altstadtrundgang", "Museum", "Rad an der Savinja"],
    duration: "1 Tag",
  },
  "nova-gorica": {
    tagline: "Die Rosenstadt an der Grenze zu Italien",
    description: "Nova Gorica ist eine junge Stadt, gebaut nach dem Zweiten Weltkrieg, bekannt als „Stadt der Rosen“. Sie grenzt an das italienische Gorizia — die einzigen europäischen Städte, die sich einen Platz teilen (Platz Europa). Casino, Parks und mediterranes Flair.",
    highlights: ["Platz Europa", "Rosengarten", "Casino Perla", "Brücke von Solkan"],
    activities: ["Parkspaziergang", "Glücksspiel", "Grenzspaziergang nach Italien", "Rad an der Soča"],
    duration: "1 Tag",
  },
  "slovenj-gradec": {
    tagline: "Alpenstädtchen mit reicher Musikertradition",
    description: "Slovenj Gradec ist ein historisches Städtchen im Norden Sloweniens, umgeben von den Kärntner Alpen. Bekannt für die Halle slowenischer Musiker und als Geburtsstadt von Hugo Wolf. Ideale Ausgangspunkte für Wanderungen auf Pohorje und Uršlja gora.",
    highlights: ["Halle slowenischer Musiker", "Alter Markt", "Pohorje", "Uršlja gora"],
    activities: ["Wandern", "Konzerte", "Altstadtrundgang", "Skifahren"],
    duration: "1 Tag",
  },
  dravograd: {
    tagline: "Dreifluss-Ecke von Drau, Meža und Mislinja",
    description: "Dravograd ist ein kleines Städtchen im Norden Sloweniens, wo sich drei Flüsse treffen — Drau, Meža und Mislinja. Umgeben von den Wäldern des Kozjak und Pohorje. Wasserkraftwerk an der Drau und Wanderwege am Fluss.",
    highlights: ["Zusammenfluss dreier Flüsse", "Wasserkraftwerk Dravograd", "Kozjak", "Wandern"],
    activities: ["Wandern", "Angeln", "Rad an der Drau", "Naturfotografie"],
    duration: "1 Tag",
  },
  "murska-sobota": {
    tagline: "Zentrum der Prekmurje mit Schloss am See",
    description: "Murska Sobota ist das Zentrum der Prekmurje — der flachen pannonischen Landschaft im Nordosten Sloweniens. Das Schloss Murska Sobota am gleichnamigen See beherbergt das Regionalmuseum. Bekannt für die Prekmurje-Gibanica und Kürbisöl.",
    highlights: ["Schloss Murska Sobota", "Sobota-See", "Prekmurje-Gibanica", "Regionalmuseum"],
    activities: ["Schlossbesuch", "Spaziergang am See", "Kulinarik-Erlebnisse", "Rad im Flachland"],
    duration: "1 Tag",
  },
  lendava: {
    tagline: "Zweisprachige Stadt mit Weingärten und Schloss auf dem Hügel",
    description: "Lendava ist Sloweniens östlichste Stadt, an der Grenze zu Ungarn. Zweisprachige (slowenisch-ungarische) Stadt mit einem Schloss auf dem Hügel, das Panoramablick auf die Weingärten der Lendava-Hügel bietet. Anbau erstklassiger Weißweine.",
    highlights: ["Schloss Lendava", "Weingärten der Lendava-Hügel", "Zweisprachige Kultur", "Weinkeller"],
    activities: ["Weinverkostung", "Schlossbesuch", "Rad durch die Weingärten", "Grenzspaziergang"],
    duration: "1 Tag",
  },
  "novo-mesto": {
    tagline: "Hauptstadt der Dolenjska an der Krka",
    description: "Novo mesto ist das Zentrum der Dolenjska, gebaut im Bogen des Flusses Krka. Der Alte Markt mit der Hauptstraße bewahrt mittelalterlichen Charakter. Bekannt für den Cviček — den traditionellen Dolenjska-Wein — und archäologische Funde der Hallstattkultur.",
    highlights: ["Alter Markt", "Fluss Krka", "Cviček", "Archäologisches Museum"],
    activities: ["Altstadtrundgang", "Weinverkostung", "Rad an der Krka", "Museum"],
    duration: "1–2 Tage",
  },
  otocec: {
    tagline: "Sloweniens einzige Burg auf einer Flussinsel",
    description: "Otočec ist Sloweniens einzige Burg auf einer Insel, umgeben vom Fluss Krka. Heute ein Luxushotel mit Golfplatz und Wellness. Romantische Umgebung für Paare und Ausgangspunkt für Radtouren an der Krka.",
    highlights: ["Burg auf der Insel", "Fluss Krka", "Golf", "Wellness"],
    activities: ["Golf", "Wellness", "Rad an der Krka", "Romantisches Dinner"],
    duration: "1–2 Tage",
  },
  crnomelj: {
    tagline: "Das Herz der Bela krajina am Fluss Kolpa",
    description: "Črnomelj ist das Zentrum der Bela krajina — einer warmen, mediterran angehauchten Landschaft im Südosten Sloweniens am Fluss Kolpa. Bekannt für die Bela-krajina-Pisanica (bemalte Eier), die Steljniki-Heiden und traditionelle Musik. Die Kolpa bietet das wärmste Badewasser Sloweniens.",
    highlights: ["Fluss Kolpa", "Alter Markt", "Bela-krajina-Pisanica", "Steljniki-Heiden"],
    activities: ["Baden in der Kolpa", "Altstadtrundgang", "Rad durch die Bela krajina", "Ethnografisches Museum"],
    duration: "1–2 Tage",
  },
  zagreb: {
    tagline: "Kroatiens Hauptstadt mit Wiener Charme und Kaffeekultur",
    description: "Zagreb ist eine Stadt an der Nahtstelle Mittel- und Südosteuropas mit einem Wien ähnlichen Kern: die Oberstadt mit überdachtem Markt und dem Lotrščak-Turm, die Jugendstilstraßen der Unterstadt und der lebendige Dolac am Morgen, wenn Bauern ihre Erzeugnisse aufbauen. Der Advent in der Oberstadt gehört im Dezember zu den festlichsten Europas, im Sommer gibt der Kaffee in der Tkalčićeva-Straße der Stadt den Takt.",
    highlights: ["Oberstadt", "Ban-Jelačić-Platz", "Markt Dolac", "Kathedrale"],
    activities: ["Rundgang Oberstadt", "Museen und Galerien", "Advent im Dezember", "Kaffee in der Tkalčićeva"],
    duration: "2 Tage",
  },
  "plitvicka-jezera": {
    tagline: "UNESCO-Kaskade türkiser Seen und Wasserfälle",
    description: "Der älteste kroatische Nationalpark ist eine Kette von sechzehn Seen, die sich über Travertindämme und Wasserfälle ineinander ergießen. Holzstiege führen am Wasser durch den Wald, über den größten See Kozjak fahren elektrische Boote. Die Wasserfarbe wandert je nach Jahreszeit und Licht zwischen Türkis und Smaragd.",
    highlights: ["Großer Wasserfall", "See Kozjak", "Holzstiegen", "Travertindämme"],
    activities: ["Stiegenrundgang", "Bootsfahrt auf dem Kozjak", "Fotografie", "Großer Wasserfall"],
    duration: "1 Tag",
  },
  rijeka: {
    tagline: "Kulturhauptstadt mit Kroatiens größtem Hafen",
    description: "Rijeka ist eine Hafenstadt an der Kvarner-Bucht mit österreichisch-ungarischem Kern, dem langen Korzo und der Trsat-Burg auf dem Hügel über der Stadt. 2020 war sie europäische Kulturhauptstadt; der Oster-Karneval von Rijeka gehört zu den größten Europas. Von Rijeka führen Fähren zu den Inseln und nach Italien — die Stadt ist das Tor zum Kvarner.",
    highlights: ["Korzo", "Burg Trsat", "Stadtturm", "Kathedrale St. Vid"],
    activities: ["Korzo-Spaziergang", "Blick vom Trsat", "Karneval von Rijeka", "Fährenausflüge zu den Inseln"],
    duration: "1–2 Tage",
  },
  pula: {
    tagline: "Römisches Amphitheater an der Adria",
    description: "Pula ist Istriens größte Stadt mit dem am besten erhaltenen römischen Amphitheater der Welt nach Rom — die Arena aus dem 1. Jahrhundert beherbergt bis heute Konzerte und Open-Air-Kino. Die Altstadt mit Goldenem Tor und der Kathedrale Santa Maria drängt sich auf der Halbinsel, um die Stadt liegen Strände und istrische Winzerdörfer.",
    highlights: ["Amphitheater Arena", "Goldenes Tor", "Alter Platz", "Istrische Riviera"],
    activities: ["Arena-Besuch", "Altstadtrundgang", "Baden", "Weinverkostungen in Istrien"],
    duration: "1–2 Tage",
  },
  zadar: {
    tagline: "Stadt des Sonnenuntergangs und der Meeresorgel",
    description: "Zadar ist eine dalmatinische Stadt auf einer Halbinsel mit römischem Grundriss und der romanischen Kirche St. Donat. An der Küste spielt die Meeresorgel mit den Wellen, daneben der Gruß an die Sonne — eine Installation, bei der sich zur Sonnenuntergangsstunde Mengen sammeln; Alfred Hitchcock nannte Zadars Untergang den schönsten der Welt. Von Zadar sind es die kürzesten Ausflüge zu den Kornaten.",
    highlights: ["Meeresorgel", "Gruß an die Sonne", "Kirche St. Donat", "Römische Ruinen"],
    activities: ["Meeresorgel hören", "Sonnenuntergang", "Rundgang auf den Mauern", "Ausflug zu den Kornaten"],
    duration: "1–2 Tage",
  },
  split: {
    tagline: "Lebendige Stadt im Inneren des Diokletianpalasts",
    description: "Das Herz von Split ist der Diokletianpalast aus dem 4. Jahrhundert — ein römisches Komplex, in dem heute Menschen leben: Cafés im Peristyl, Märkte in den Katakomben, Boutiquen in den Gewölben. Die Kathedrale des Hl. Domnius ist die älteste ununterbrochen genutzte Kathedrale der Welt. Der Hügel Marjan bietet die Flucht in die Kiefern über der Stadt, vom Hafen legen Fähren zu den Inseln ab.",
    highlights: ["Diokletianpalast", "Peristyl", "Kathedrale des Hl. Domnius", "Marjan"],
    activities: ["Palast erkunden", "Spaziergang auf den Marjan", "Strand Bačvice", "Fähren zu den Inseln"],
    duration: "2 Tage",
  },
  hvar: {
    tagline: "Die sonnigste Adria-Insel aus Lavendel und Stein",
    description: "Hvar ist eine Insel mit fast 2800 Sonnenstunden im Jahr, einer venezianisch anmutenden Hafenstadt und der Festung Fortica auf dem Hügel. Das Inselinnere verbirgt Lavendelfelder und Weingärten der bogotinjava pošipina (Rebsorte). Vor dem Hafen liegen die Pakleni-Inseln — Schieferbuchten zum Ankern und Baden.",
    highlights: ["Festung Fortica", "Hafen von Hvar", "Pakleni-Inseln", "Lavendelfelder"],
    activities: ["Blick von der Fortica", "Ausflug zu den Pakleni-Inseln", "Pošip-Verkostung", "Baden in Buchten"],
    duration: "2–3 Tage",
  },
  dubrovnik: {
    tagline: "Mittelalterliche Mauerstadt über dem blauen Adria",
    description: "Dubrovnik — die Republik, die jahrhundertelang mit Venedig wetteiferte — ist eine Mauerstadt an der Klippe über dem Meer, deren Stradun die Tore Pile und Ploče verbindet. Die fast zwei Kilometer langen Mauern bieten den berühmtesten Stadtrundgang der Adria; die Seilbahn hinauf zum Srđ bietet Blick auf Altstadt und Inseln. Vor der Stadt liegt die bewaldete Insel Lokrum.",
    highlights: ["Stadtmauern", "Stradun", "Insel Lokrum", "Seilbahn auf den Srđ"],
    activities: ["Rundgang auf den Mauern", "Franziskanerkreuzgang", "Ausflug nach Lokrum", "Sonnenuntergang vom Srđ"],
    duration: "2–3 Tage",
  },
  kotor: {
    tagline: "Eine fjordähnliche Bucht mit mittelalterlicher Mauerstadt",
    description: "Kotor liegt am Grund der Bucht von Kotor, die sich zwischen steilen Bergen wie der einzige Fjord des Mittelmeers windet. Die Altstadt mit ihrem Netz aus Plätzen und Gassen steht unter UNESCO-Schutz; die Mauern mit der Festung San Giovanni steigen über 1200 Stufen über die Stadt und bieten legendären Blick auf die Bucht. Im benachbarten Perast liegt die Barockinsel Gospa od Škrpjela.",
    highlights: ["Altstadt Kotor", "Mauern von San Giovanni", "Bucht von Kotor", "Perasto"],
    activities: ["Altstadtrundgang", "Aufstieg auf die Mauern", "Ausflug nach Perasto", "Kreuzfahrt durch die Bucht"],
    duration: "1–2 Tage",
  },
  budva: {
    tagline: "Altstadt auf einer Halbinsel zwischen Stränden und Kiefern",
    description: "Budva ist Montenegros meistbesuchter Badeort — Altstadt auf einer felsigen Halbinsel mit Mauern, darum herum eine Kette von Stränden (Mogren, Jaz, Slowenischer Strand). Im Sommer sind Straßen und Terrassen voll, im Herbst und Frühjahr atmet die Altstadt entspannt. Das bekannteste Fotomotiv ist das Inselchen Sveti Stefan mit dem ehemaligen Dorf-Hotel.",
    highlights: ["Altstadt Budva", "Strand Mogren", "Sveti Stefan", "Strand Jaz"],
    activities: ["Altstadtrundgang", "Baden am Mogren", "Blick auf Sveti Stefan", "Abende an der Küste"],
    duration: "1–2 Tage",
  },
  podgorica: {
    tagline: "Entspannte Hauptstadt am Schnittpunkt von Flüssen und Bergen",
    description: "Podgorica ist Montenegros Hauptstadt und größte Stadt, erbaut am Zusammenfluss von Morača und Ribnica. Den Rhythmus geben Korzo, Kaffeeterrassen und die Millenniumsbrücke; die Stara Varoš bewahrt osmanische Reste mit dem Uhrturm. Ausgegangspunkt — der Skutarisee, Budva und Durmitor sind Tagesausflüge.",
    highlights: ["Millenniumsbrücke", "Stara Varoš", "Uhrturm", "Gorica"],
    activities: ["Korzo-Spaziergang", "Stara Varoš erkunden", "Kaffee an der Morača", "Ausflug zum Skutarisee"],
    duration: "1 Tag",
  },
  durmitor: {
    tagline: "UNESCO-Gebirge über dem Schwarzen See und der Tara-Schlucht",
    description: "Der Nationalpark Durmitor ist ein von 18 Gletscherseen durchsetztes Gebirge — bekanntestes ist der Schwarze See bei Žabljak, der Bergstadt. Die Schlucht der Tara ist die tiefste Europas (1300 m) und Heimat des Raftings zwischen den Ufern; die Panoramastraße über das Sedlo Soa verbindet Žabljak mit dem Süden. Im Winter Skigebiete, im Sommer Wanderwege um die Seen.",
    highlights: ["Schwarzer See", "Tara-Schlucht", "Žabljak", "Sedlo Soa"],
    activities: ["Wanderung um den Schwarzen See", "Rafting auf der Tara", "Panoramafahrt über das Sedlo", "Winterskilauf"],
    duration: "2–3 Tage",
  },
  tirana: {
    tagline: "Bunte Hauptstadt mit osmanischem Kern und Kaffeetempo",
    description: "Tirana ist eine Hauptstadt, die sich nach langen Jahrzehnten geöffnet hat — farbige Fassaden, der Skanderbeg-Platz mit der Et'hem-Bej-Moschee und dem Uhrturm, Cafés in den Blockstraßen. Die Dajti-Ekspres-Seilbahn steigt auf 1600 m über der Stadt für den Blick über Ebene und Adria; das Museum Bunk'Art in einem Atombunker erzählt das 20. Jahrhundert.",
    highlights: ["Skanderbeg-Platz", "Et'hem-Bej-Moschee", "Bunk'Art", "Berg Dajti"],
    activities: ["Zentrum erkunden", "Seilbahn auf den Dajti", "Museen", "Kaffeekultur"],
    duration: "2 Tage",
  },
  berat: {
    tagline: "Die Stadt der tausend Fenster unter der Burg an der Osum",
    description: "Berat ist eine UNESCO-geschützte Stadt, bekannt als Stadt der tausend Fenster — die weißen osmanischen Häuser des Viertels Mangalem steigen treppenartig zur Burg auf der Spitze hinauf. Die alte Brücke über den Fluss Osum verbindet das Viertel Gorica; in der Burg liegt das Onufri-Museum mit Ikonen. Um Berat herum liegen Weingärten, mit Verkostungen in traditionellen Häusern.",
    highlights: ["Burg von Berat", "Viertel Mangalem", "Alte Brücke", "Onufri-Museum"],
    activities: ["Rundgang im Mangalem", "Burgbesuch", "Brücke über die Osum", "Weinverkostung"],
    duration: "1 Tag",
  },
  gjirokaster: {
    tagline: "Die Stadt aus Stein — graue Dächer unter einer gewaltigen Burg",
    description: "Gjirokastër ist eine UNESCO-Stadt aus Steinhäusern mit Schindeldächern, erbaut an einem steilen Hang unter einer der größten Burgen des Balkans. Der alte Basar bewahrt die osmanische Handelstraße mit ihren Bogengängen; das Geburtshaus des Schriftstellers Ismail Kadare ist heute Museum. Über dem Tal schwebt die Legende von Zerm und den Najaden — die Berge rundum laden zum Wandern ein.",
    highlights: ["Burg von Gjirokastër", "Alter Basar", "Steinhäuser", "Kadare-Haus"],
    activities: ["Burgbesuch", "Basar-Rundgang", "Ethnografisches Museum", "Wanderungen in der Umgebung"],
    duration: "1 Tag",
  },
  saranda: {
    tagline: "Sonnige Ionische Stadt gegenüber Korfu",
    description: "Saranda ist Albaniens südlichste Badestadt, gegenüber dem griechischen Korfu (Fähre 30 Min). Die Küste südlich der Stadt verbirgt Ksamil mit weißen Stränden und Inselchen, das Landesinnere die Antike — Butrint ist eine UNESCO-Antikenstadt zwischen See und Kanal. Der Blick von der Festung Lëkurësi über der Stadt schenkt am Abend den Sonnenuntergang über dem Ionischen Meer.",
    highlights: ["Ksamil", "Antikes Butrint", "Festung Lëkurësi", "Blick auf Korfu"],
    activities: ["Baden in Ksamil", "Butrint besuchen", "Sonnenuntergang von Lëkurësi", "Fähre nach Korfu"],
    duration: "2–3 Tage",
  },
};

/** DE overlay za destinacijo po id (fallback null → SL izvirnik). */
export function getDeDestination(id: string): DestinationEn | null {
  return DESTINATIONS_DE[id] ?? null;
}
