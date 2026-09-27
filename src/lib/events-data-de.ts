/**
 * DE prekrivna plast za events-data.ts (W1-faza-2b, Issue #15 —
 * LLM prevod, 2026-09-27; ročno pregledani vzorci).
 * Isti vzorec kot events-data-en.ts: slovenski original ostaja vir resnice;
 * identifikatorji/datumi/kategorije so skupni in se NE prevajajo.
 */
import type { EventCategory } from "@/lib/events-data";

export interface EventDe {
  name: string;
  description: string;
}

export const EVENTS_DE: Record<string, EventDe> = {
  "ljubljanski-zimski-festival": {
    name: "Ljubljanski Winterfestival",
    description: "Top internationaler Festival für klassische und Kammermusik im Cankarjev Dom, der Oper und den Kirchen von Ljubljana. Eine Tradition, die bis ins Jahr 1952 zurückreicht.",
  },
  "pustni-karneval-ptuj": {
    name: "Kurentovanje — Ptujer Fasching",
    description: "Größter Karneval in Slowenien und einer der wichtigsten ethnografischen Festivals in Europa. Der Umzug der Kurenten — uralte Wesen mit roten Zungen und Kuhglocken — treibt den Winter durch die alten Straßen von Ptuj.",
  },
  "planica-nordic-festival": {
    name: "Planica Nordic Festival",
    description: "Weltcup im Skifliegen in der legendären Planica unter den Ponca-Gipfeln. Die besten Springer der Welt fliegen über 240 Meter auf der größten Skiflugschanze der Welt, begleitet von Langlauf- und Biathlon-Wettbewerben.",
  },
  "blejski-danovski-festival": {
    name: "Bleder Musikfestival",
    description: "Internationales Kammermusikfestival in Bled mit herausragenden Konzerten im Schloss Bled, auf der Insel Bled und in den Kirchen. Slowenische Musiker treten mit internationalen Gästen in der romantischen Alpenkulisse auf.",
  },
  "festival-soca": {
    name: "Soča-Festival",
    description: "Sport- und Musikfestival am smaragdgrünen Soča-Fluss mit Rafting, Kajak, Canyoning und Adrenalinkick am Tag. Abends am Fluss klingen alternative, Reggae- und World-Musik.",
  },
  "bled-days-kremsnita": {
    name: "Bleder Tage mit Kremšnita",
    description: "Traditionelle Feier der Bleder Kremšnita — der berühmten Sahnetorte mit Blätterteigdecke. Kostproben von Süßspeisen, Handwerkermarkt, Seeuferfestlichkeiten und ein prächtiges Feuerwerk über der Insel Bled.",
  },
  "ljubljana-festival": {
    name: "Ljubljana Festival",
    description: "Größter, ältester und wichtigster Sommerkultur-Festival in Slowenien. Konzerte von Weltklasse-Sinfonieorchestern, Oper, Ballett und Theater auf den Križanke und im Cankarjev Dom mit den weltbekanntesten Künstlern.",
  },
  "piran-music-nights": {
    name: "Piraner Musiknächte",
    description: "Romantische Musikabende im Kreuzgang des Minoritenklosters von Piran. Jazz, Kammermusik und Ethno-Konzerte mit internationalen Gästen an den frühsommerlichen Abenden am Adriatischen Meer.",
  },
  "kmecji-ohcet": {
    name: "Kmečki ohcet — Slowenische Bauernhochzeit",
    description: "Traditionelle Aufführung einer slowenischen Bauernhochzeit mit reichen Trachten, alten Tänzen, Vieh und Handwerk. Ein authentisches Fest des Landlebens in Dörfern ganz Sloweniens.",
  },
  "olive-festival": {
    name: "Olive Festival",
    description: "Feier der Olivenernte in slowenischem Istrien mit Verkostungen von extra nativem Olivenöl, lokalen istrischen Spezialitäten, Honig, Wein und geführten Touren durch die Olivenhaine am Meer.",
  },
  "festival-stara-trta": {
    name: "Festival Stara trta",
    description: "Festival um die älteste Rebe der Welt in Maribor — eingetragen im Guinness-Buch der Rekorde. Weinevents, Verkostungen von Blaufränkisch, kulturelles Programm und traditionelle Martinigans am Ufer der Drau.",
  },
  "bozicni-sejmi": {
    name: "Weihnachtsmärkte in Ljubljana und Maribor",
    description: "Romantische Weihnachtsmärkte mit Ständen für handgemachte Produkte, Honigplätzchen, Glühwein und gepresstem Apfelsaft. Die mittelalterlichen Altstädte von Ljubljana und Maribor erstrahlen in Girlanden und duftenden Tannen.",
  },
  "koroska-smucanje": {
    name: "Skitage Ribnica na Pohorju",
    description: "Traditionelles Skiregatt auf dem Pohorje bei Ribnica mit Musikprogramm und lokalen Spezialitäten. Ein Familienskitag.",
  },
  "prekmurje-bucka": {
    name: "Festival der Kürbisse und Kürbiskernöl",
    description: "Ein einzigartiger Festival in Prekmurje gewidmet Kürbissen und dem Prekmurje-Kürbiskernöl. Verkostungen, Workshops und traditionelle Musik.",
  },
  "dolenjska-cvicek": {
    name: "Cviček-Weinfestival in Novo mesto",
    description: "Feier des traditionellen Dolenjska-Cviček-Weins. Weingustierungen, kulinarische Stände und Musik am Fluss Krka.",
  },
  "bela-krajina-koline": {
    name: "Bela Krajina Koline und Opanka-Handwerk",
    description: "Traditionelle Koline (Winter-Schweineschlachtfest) in Bela Krajina mit dem Flechten von Maisgirlanden für Opanka-Schuhe und lokaler Musik. Authentische Bela-Krajina-Kultur.",
  },
  "koroska-music": {
    name: "Musica Cubicularis — Saal der slowenischen Musiker",
    description: "Kammermusikfestival in Slovenj Gradec mit Auftritten slowenischer und internationaler Musiker in historischen Locations.",
  },
  "prekmurje-porabje": {
    name: "Porabje — Treffen der Slowenen in den Nachbarländern",
    description: "Kultur-Festival in Lendava, das Slowenen aus Prekmurje, Porabje und den angrenzenden Regionen verbindet. Musik, Tanz und traditionelle Gerichte.",
  },
  "bled-winter-swim": {
    name: "Bleder Winter-Schwimm-Gedenkrennen",
    description: "Traditionelles Winter-Schwimm-Gedenkrennen auf dem Bleder See. Die mutigsten Schwimmer stürzen sich in den eiskalen See-Wasser im Februar. Ein Familienereignis mit heißen Schokolade und Cremetorte am Ufer.",
  },
  "zlati-lisjak-maribor": {
    name: "Goldener Fuchs — Weltcup im alpinen Skifahren",
    description: "Das traditionelle Weltcup-Rennen im Damen-Riesenslalom auf dem Pohorje. Die besten Skifahrerinnen der Welt treten auf der Golden-Fox-Strecke vor Tausenden von Zuschauern an.",
  },
  "vinska-vigred-maribor": {
    name: "Vinska vigred — Wein Festival",
    description: "Größtes Weinfest Sloweniens in Maribor mit über 200 Winzern aus allen slowenischen Regionen. Weinverkostungen, Workshops, kulinarische Spezialitäten und Musik an der Drau.",
  },
  "jurjevanje-bela-krajina": {
    name: "Jurjevanje in der Bela Krajina",
    description: "Ältestes Folklorefestival Sloweniens, das den Frühling und die Tradition der Bela Krajina feiert. Umzug bemalter Ostereier, traditionelle Tänke in Volkstrachten und Musik in Črnomelj.",
  },
  "ljubljanski-maraton": {
    name: "Ljubljana Marathon",
    description: "Internationaler Marathon in Ljubljana mit Strecken über 10 km, Halbmarathon und Marathon. Tausende Läufer aus ganz Europa laufen durch die Altstadt, entlang der Ljubljanica und durch den Tivoli-Park.",
  },
  "pivo-in-cvetje-lasko": {
    name: "Bier und Blumen Festival Laško",
    description: "Größtes Bier- und Blumenfest Sloweniens in Laško. Über 50.000 Besucher, Biermarkt, Konzerte von in- und ausländischen Künstlern, Blumenausstellung und Feuerwerk.",
  },
  "festival-solinarstva-secovlje": {
    name: "Salinenfest Sečovlje",
    description: "Fest der Salzgewinnung in den Sečovlje-Salinen mit Vorführung der traditionellen Salzproduktion, Verkostung von Salinerzeugnissen, Meeresfrüchten und lokalen Weinen an der Küste.",
  },
  "trnfest-ljubljana": {
    name: "Trnfest — Sommerfest Trnovo",
    description: "Traditionelles Augustfest im Ljubljaner Stadtteil Trnovo. Open-Air-Konzerte mit Jazz, Blues und World Music, Straßentheater, kreative Workshops und abendliches Treiben am Trnovo-Brücke.",
  },
  "okarina-festival-bled": {
    name: "Okarina Festival Bled",
    description: "Internationales Ethno-Musikfestival in Bled mit Musikern aus der ganzen Welt. Konzerte auf der Bled-Insel, im Schloss und am See. Slowenische und internationale Weltmusik-Interpreten.",
  },
  "celjski-sejem": {
    name: "Celje Messe",
    description: "Traditionelle Celje-Messe mit Ausstellungen von Handwerk, Landwirtschaft, lokalen Produkten und Fahrzeugen. Begleitprogramm mit Musik, Verkostungen und Kinderanimationen auf dem Messegelände.",
  },
  "bled-winter-magic": {
    name: "Bled Winter Magic — Weihnachtsdorf",
    description: "Romantisches Weihnachtsdorf am Ufer des Bleder Sees mit Holzhütten, Handwerkskunst, Honigplätzchen, Glühwein und gepresstem Apfelsaft. Beleuchtete Bled-Insel mit Sternen und duftende Tanne.",
  },
  "jamski-sejem-postojna": {
    name: "Postojner Grottenmesse",
    description: "Traditionelle Dezembermesse in Postojna nahe der Grotte mit Handwerksprodukten der Karstregion, Schinken, Teran-Wein, Keramik und Weihnachtsbeleuchtung. Live-Musik jeden Abend.",
  },
};
