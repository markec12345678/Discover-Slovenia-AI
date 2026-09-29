/**
 * FR prekrivna plast za slovenia-data.ts (W12 faza 1 — smer 2).
 *
 * W1 (Issue #15 V0, 1.126.0): FR prekrivna plast za slovenia-data.ts.
 * Slovenki original ostaja vir resnice — ta datoteka ponuja nemške prevode
 * tekstovnih polj (isti vzorec kot slovenia-data-en.ts). Struktura: Partial po
 * poljih; identifikatorji (id/slug/region/type/bestFor/bestSeason keys,
 * coords, slike, cene) so skupni in se NE prevajajo.
 *
 * KLJUČI = `id` polja iz slovenia-data.ts (38 destinacij — pokritost 38/38
 * po ID). Dolžine highlights/activities se ujemajo z originalom.
 * Prevod: strojni (LLM, iz SL izvirnika z EN referenco) + označen v UI
 * (mtNotice — provenance kanon platforme) do človeške revizije.
 */
import type { DestinationEn } from "./slovenia-data-en";

export type { DestinationEn } from "./slovenia-data-en";

export const DESTINATIONS_FR: Record<string, DestinationEn> = {
  bled: {
    tagline: "Perle des Alpes avec son château médiéval et son île",
    description: "Le lac de Bled, avec son île unique sur laquelle se dresse une église avec son clocher, est la vue la plus emblématique de la Slovénie. Le château médiéval perché sur une falaise offre des panoramas à couper le souffle, tandis que la gorge de Vintgar propose une promenade courte à travers un calcaire le long d'une rivière tranquille. Une part de gâteau à la crème (kremšnita) dans une pâtisserie au bord du lac est le péché mignon obligatoire.",
    highlights: ["L'île de Bled", "Le château de Bled", "La gorge de Vintgar", "La kremšnita"],
    activities: ["Balade en pletna jusqu'à l'île", "Visite du château", "Promenade dans la gorge", "Baignade"],
    duration: "1-2 jours",
  },
  bohinj: {
    tagline: "Sauvage et intouchable, la beauté du parc national du Triglav",
    description: "Le lac de Bohinj est le grand frère sauvage du lac de Bled, niché au cœur du parc national du Triglav. Le téléphérique de Vogel offre des panoramas sur les Alpes juliennes, et la cascade Savica se reached par une courte randonnée en forêt. Idéal pour ceux qui recherchent la tranquillité et une immersion active dans la nature.",
    highlights: ["Lac de Bohinj", "Vogel", "Cascade Savica", "Parc national du Triglav"],
    activities: ["Randonnée", "Ski", "Kayak", "Téléphérique de Vogel"],
    duration: "1-2 jours",
  },
  ljubljana: {
    tagline: "Une capitale verte et créative avec le Pont du Dragon",
    description: "Ljubljana est une petite capitale animée où l'architecture médiévale se marie à une scène culinaire contemporaine. Le château de Ljubljana offre des vues panoramiques, la place Prešeren avec le Pont du Dragon est le cœur battant de la ville, et les rives de la Ljubljanica s'animent avec le café et les conversations.",
    highlights: ["Château de Ljubljana", "Pont du Dragon", "Place Prešeren", "Parc Tivoli"],
    activities: ["Visite du château", "Promenade dans la vieille ville", "Tour gastronomique", "Cyclisme le long de la Ljubljanica"],
    duration: "2 jours",
  },
  postojna: {
    tagline: "24 km de galeries souterraines et un royaume féerique de stalactites",
    description: "La grotte de Postojna est le plus grand système de grottes touristiques d'Europe, avec son unique petit train souterrain. Elle abrite également le protée — un endémique qui a inspiré les légendes sur les bébés dragons. Le château de Predjama, taillé dans une falaise de 123 mètres, se trouve à seulement 9 km de là.",
    highlights: ["Petit train souterrain", "Stalactites", "Protée (poisson humain)", "Château de Predjama"],
    activities: ["Visite de la grotte en train", "Visite du château de Predjama", "Photographie"],
    duration: "1 jour",
  },
  piran: {
    tagline: "La Venise slovène avec ses ruelles pavées et la place Tartini",
    description: "Piran est une petite ville côtière de style vénitien, où les ruelles étroites s'entremêlent entre des maisons en pierre. La place Tartini, la place principale avec ses pavés en marbre, est dédiée au violoniste Giuseppe Tartini. L'église Saint-Georges sur la colline surplombe la mer Adriatique.",
    highlights: ["Place Tartini", "Église Saint-Georges", "Le front de mer", "Vieilles ruelles"],
    activities: ["Balade dans la vieille ville", "Admirer le coucher de soleil", "Dégustation de fruits de mer", "Visite des salines"],
    duration: "1 jour",
  },
  soca: {
    tagline: "Une émeraude des Alpes Juliennes pour des aventures adrénalinesques",
    description: "La Soča est l'une des rares rivières à conserver sa couleur émeraude toute l'année. Elle serpente à travers Tolmin et Bovec, offrant un rafting, du kayak et du canyoning de premier ordre. En chemin, les gorges de la Soča — des piscines naturelles sculptées dans le calcaire, parfaites pour se rafraîchir en été.",
    highlights: ["Gorges de la Soča", "Bovec", "Tolmin", "Forteresse de Kluže"],
    activities: ["Rafting", "Kayak", "Canyoning", "Tyrolienne"],
    duration: "2-3 jours",
  },
  triglav: {
    tagline: "Symbole national à 2 864 m avec d'innombrables sentiers",
    description: "Le Triglav est le plus haut sommet de Slovénie et un symbole national qui figure même sur les armoiries du pays. L'ascension demande une randonnée technique, mais avec une bonne préparation, elle est réalisable en un ou deux jours. Au sommet se dresse la tour d'Aljaž — le plus haut refuge du pays.",
    highlights: ["Sommet à 2 864 m", "Tour d'Aljaž", "Rose du Triglav", "Randonnée"],
    activities: ["Randonnée", "Alpinisme", "Photographie"],
    duration: "2 jours",
  },
  kobarid: {
    tagline: "Histoire, frontière de l'Isonzo et gastronomie dans un même village",
    description: "Kobarid est un petit village situé sur la rivière Soča, célèbre pour son musée qui documente le sanglant front de l'Isonzo de la Première Guerre mondiale. Le pont Napoléon sur la Soča et la crête de Kolovrat offrent des vues panoramiques. La maison Franko, l'une des meilleures restaurants de la région, sert une cuisine contemporaine du Tolmin.",
    highlights: ["Musée de Kobarid", "Pont Napoléon", "Kolovrat", "Maison Franko"],
    activities: ["Visite du musée", "Randonnée", "Expérience culinaire", "Cyclisme le long de la Soča"],
    duration: "1 jour",
  },
  maribor: {
    tagline: "La deuxième plus grande ville de Slovénie, berceau de la plus vieille vigne du monde",
    description: "Maribor s'étend le long de la Drave, entourée des vignobles de Pohorje. La Vigne Vieille, âgée de plus de 400 ans, est inscrite dans le Livre des records Guinness. La ville propose un centre-ville animé, les coteaux viticoles de Pohorje et des sports d'hiver.",
    highlights: ["La Vigne Vieille", "Pohorje", "Place principale", "Viticulture"],
    activities: ["Visite de la Vigne Vieille", "Ski à Pohorje", "Dégustation de vins", "Promenade dans le centre historique"],
    duration: "1-2 jours",
  },
  portoroz: {
    tagline: "Station balnéaire slovène avec casino et bien-être",
    description: "Portorož est la station balnéaire la plus célèbre de Slovénie, avec une longue plage de sable, des hôtels avec centres de bien-être et un casino. La promenade en bord de mer relie Portorož à Piran, tandis que les salines de Sečovlje offrent une expérience nature unique et des soins de bien-être à la boue thérapeutique.",
    highlights: ["Plage", "Casino", "Salines de Sečovlje", "Bien-être"],
    activities: ["Baignade", "Bien-être", "Jeux d'argent", "Vélo le long de la mer"],
    duration: "2-3 jours",
  },
  vintgar: {
    tagline: "Une courte promenade à travers un calcaire bordé d'une rivière paisible",
    description: "La gorge de Vintgar est un canyon de 1,6 km le long de la rivière Radovna, à seulement 4 km de Bled. Des passerelles en bois serpentent à côté des eaux cristallines, passant à côté d'une cascade et de piscines naturelles. La promenade dure environ une heure et convient à tous les âges.",
    highlights: ["Cascade de Šum", "Passerelles en bois", "Eau cristalline", "Piscines naturelles"],
    activities: ["Randonnée", "Photographie", "Observation de la nature"],
    duration: "1 jour",
  },
  rogaska: {
    tagline: "La plus ancienne station thermale de Slovénie, célèbre pour ses eaux minérales",
    description: "Rogaška Slatina est une station thermale élégante avec une tradition de 400 ans, réputée pour son eau minérale Donat Mg, la plus riche en magnésium au monde. L'architecture Art Nouveau, les parcs et les centres de bien-être offrent une détente toute l'année.",
    highlights: ["Donat Mg", "Architecture Art Nouveau", "Grand Hotel", "Bien-être"],
    activities: ["Bien-être", "Dégustation d'eaux minérales", "Promenades dans les parcs", "Massages"],
    duration: "2 jours",
  },
  ptuj: {
    tagline: "La plus ancienne ville de Slovénie avec une histoire romaine",
    description: "Ptuj est la plus ancienne ville enregistrée de Slovénie, fondée à l'époque romaine sous le nom de Poetovio. Le château médiéval sur la colline offre des vues panoramiques sur la Drava, tandis que le centre historique a conservé son architecture baroque. Elle est célèbre pour le Kurentovanje — le plus grand festival de carnaval d'Europe centrale.",
    highlights: ["Château de Ptuj", "Remp romains", "Kurentovanje", "Drava"],
    activities: ["Visite du château", "Promenade dans la vieille ville", "Festival de carnaval", "Promenade le long de la Drava"],
    duration: "1 jour",
  },
  celje: {
    tagline: "Ancienne capitale des comtes de Celje avec son imposante forteresse",
    description: "Celje est la troisième plus grande ville de Slovénie, célèbre pour son château médiéval des comtes de Celje — autrefois la dynastie noblaire la plus influente des terres slovènes. La Vieille Place conserve ses façades baroques, et une promenade sinueuse longe la rivière Savinja.",
    highlights: ["Château de Celje", "Vieille Place", "Savinja", "Musée régional"],
    activities: ["Visite du château", "Promenade dans la vieille ville", "Musée", "Cyclisme le long de la Savinja"],
    duration: "1 jour",
  },
  "nova-gorica": {
    tagline: "La ville des roses sur la frontière italienne",
    description: "Nova Gorica est une jeune ville construite après la Seconde Guerre mondiale, connue comme la 'ville des roses'. Elle jouxte la ville italienne de Gorizia — les deux seules villes européennes partageant une même place (Place de l'Europe). Un casino, des parcs verdoyants et une ambiance méditerranéenne complètent le tableau.",
    highlights: ["Place de l'Europe", "Parc des roses", "Casino Perla", "Pont de Solkan"],
    activities: ["Promenade dans le parc", "Jeux de hasard", "Promenade transfrontalière en Italie", "Cyclisme le long de la Soča"],
    duration: "1 jour",
  },
  "slovenj-gradec": {
    tagline: "Une ville alpine riche en tradition musicale",
    description: "Slovenj Gradec est une ville historique du nord de la Slovénie, entourée par les Alpes carinthiennes. Connue pour la Salle des Musiciens slovènes et comme lieu de naissance du compositeur Hugo Wolf. C'est le point de départ idéal pour des randonnées sur le Pohorje et l'Uršlja Gora.",
    highlights: ["Salle des Musiciens slovènes", "Vieille Place", "Pohorje", "Uršlja Gora"],
    activities: ["Randonnée pédestre", "Concerts de musique", "Promenade dans la vieille ville", "Ski"],
    duration: "1 jour",
  },
  dravograd: {
    tagline: "Le confluent des rivières Drave, Meža et Mislinja",
    description: "Dravograd est une petite ville du nord de la Slovénie où trois rivières — la Drave, la Meža et la Mislinja — se rejoignent. Elle est entourée par les forêts de Kozjak et de Pohorje. Parmi les points d'intérêt, on trouve une centrale hydroélectrique sur la Drave et des sentiers de randonnée le long des rives.",
    highlights: ["Confluent de trois rivières", "Centrale hydroélectrique de Dravograd", "Kozjak", "Randonnée"],
    activities: ["Randonnée", "Pêche", "Cyclisme le long de la Drave", "Photographie de la nature"],
    duration: "1 jour",
  },
  "murska-sobota": {
    tagline: "Le cœur de la région de Prekmurje avec son château au bord du lac",
    description: "Murska Sobota est le cœur de la région de Prekmurje, une plaine de la Pannonie située dans le nord-est de la Slovénie. Le château de Murska Sobota, situé au bord du lac du même nom, abrite le Musée régional. La ville est connue pour sa gibanica de Prekmurje et son huile de graines de potiron.",
    highlights: ["Château de Murska Sobota", "Lac de Sobota", "Gibanica de Prekmurje", "Musée régional"],
    activities: ["Visite du château", "Promenade au bord du lac", "Expériences culinaires", "Cyclisme dans la plaine"],
    duration: "1 jour",
  },
  lendava: {
    tagline: "Ville bilingue avec ses vignobles et son château sur la colline",
    description: "Lendava est la ville la plus orientale de Slovénie, située à la frontière hongroise. Cette ville bilingue (slovène-hongroise) abrite un château sur la colline qui offre une vue panoramique sur les vignobles des collines de Lendavske gorice. La région est réputée pour la production de vins blancs de grande qualité.",
    highlights: ["Château de Lendava", "Vignobles des collines de Lendavske gorice", "Culture bilingue", "Cave à vin"],
    activities: ["Dégustation de vins", "Visite du château", "Cyclisme à travers les vignobles", "Promenade transfrontalière"],
    duration: "1 jour",
  },
  "novo-mesto": {
    tagline: "La capitale de la région de Dolenjska sur la rivière Krka",
    description: "Novo mesto est le centre de la région de Dolenjska, construite dans un méandre de la rivière Krka. La Place Vienne et sa rue principale conservent leur caractère médiéval. La ville est célèbre pour son cviček — le vin traditionnel de Dolenjska — et pour ses découvertes archéologiques de la culture de Hallstatt.",
    highlights: ["Place Vienne", "Rivière Krka", "Cviček", "Musée archéologique"],
    activities: ["Promenade dans la vieille ville", "Dégustation de vin", "Cyclisme le long de la Krka", "Visite du musée"],
    duration: "1-2 jours",
  },
  otocec: {
    tagline: "Le seul château slovène sur une île fluviale",
    description: "Otočec est le seul château slovène situé sur une île, entouré par les eaux de la rivière Krka. Aujourd'hui, c'est un hôtel de luxe avec un terrain de golf et des installations de bien-être. Un cadre romantique pour les couples et un point de départ pour le cyclisme le long de la Krka.",
    highlights: ["Château sur l'île", "Rivière Krka", "Golf", "Bien-être"],
    activities: ["Golf", "Bien-être", "Vélo le long de la Krka", "Dîner romantique"],
    duration: "1-2 jours",
  },
  crnomelj: {
    tagline: "Le cœur de la région de Bela krajina sur la rivière Kolpa",
    description: "Črnomelj est le centre de la région de Bela krajina — un paysage chaud et inspiré par la Méditerranère, dans le sud-est de la Slovénie, sur la rivière Kolpa. Connue pour ses œufs de Pâques peints (pisanica), la lande et la musique traditionnelle de Bela krajina. La Kolpa offre les eaux les plus chaudes pour la baignade en Slovénie.",
    highlights: ["Rivière Kolpa", "Vieux marché", "Pisanica de Bela krajina", "Landes"],
    activities: ["Baignade dans la Kolpa", "Promenade dans la vieille ville", "Vélo à travers Bela krajina", "Musée ethnographique"],
    duration: "1-2 jours",
  },
  zagreb: {
    tagline: "La capitale croate avec le charme viennois et la culture des cafés",
    description: "Zagreb est une ville à la croisée de l'Europe centrale et du sud-est, avec un cœur d'époque austro-hongroise : la Haute-Ville avec son marché couvert et la tour Lotrščak, les rues Art Nouveau de la Basse-Ville, et le marché animé de Dolac le matin. Son marché de l'Avent est l'un des plus festifs d'Europe en décembre, tandis que le café d'été dans la rue Tkalčićeva rythme la ville.",
    highlights: ["Haute-Ville", "Place Ban Jelačić", "Marché Dolac", "Cathédrale"],
    activities: ["Promenade dans la Haute-Ville", "Musées et galeries", "Marché de l'Avent en décembre", "Café dans la rue Tkalčićeva"],
    duration: "2 jours",
  },
  "plitvicka-jezera": {
    tagline: "Cascade de lacs et cascades turquoises, site UNESCO",
    description: "Le plus ancien parc national de Croatie est une chaîne de seize lacs qui se déversent les uns dans les autres au-dessus de barrières de travertin et de cascades. Des passerelles en bois longent l'eau à travers la forêt, et des bateaux électriques traversent le plus grand lac, Kozjak. La couleur de l'eau passe du turquoise à l'émeraude en fonction de la saison et de la lumière.",
    highlights: ["Grande Cascade", "Lac Kozjak", "Passerelles en bois", "Barrières de travertin"],
    activities: ["Promenade sur les passerelles", "Croisière sur le lac Kozjak", "Photographie", "Vue sur la Grande Cascade"],
    duration: "1 jour",
  },
  rijeka: {
    tagline: "Capitale culturelle avec le plus grand port de Croatie",
    description: "Rijeka est une ville portuaire sur le golfe de Kvarner, avec un cœur austro-hongrois, la longue promenade du Korzo et le château de Trsat sur la colline surplombant la ville. Capitale européenne de la culture en 2020, son carnaval de Pâques est l'un des plus grands d'Europe. Des ferries partent de son port vers les îles et l'Italie — la ville est la porte d'entrée du Kvarner.",
    highlights: ["Korzo", "Château de Trsat", "Tour de la ville", "Cathédrale Saint-Vitus"],
    activities: ["Promenade sur le Korzo", "Vue depuis Trsat", "Carnaval de Rijeka", "Excursions en ferry vers les îles"],
    duration: "1-2 jours",
  },
  pula: {
    tagline: "Un amphithéâtre romain sur la mer Adriatique",
    description: "Pula est la plus grande ville d'Istrie, abritant le plus bel amphithéâtre romain au monde après celui de Rome — l'Arena du Ier siècle accueille encore aujourd'hui des concerts et du cinéma en plein air. Le cœur historique avec la Porte d'Or et la Cathédrale Sainte-Marie s'étire sur une péninsule, entouré de plages et de villages viticoles istriens.",
    highlights: ["Amphithéâtre de l'Arena", "Porte d'Or", "Vieille Place", "Rivière d'Istrie"],
    activities: ["Visite de l'Arena", "Promenade dans la vieille ville", "Baignade", "Dégustation de vins d'Istrie"],
    duration: "1-2 jours",
  },
  zadar: {
    tagline: "La ville des couchers de soleil et des orgues marines",
    description: "Zadar est une ville dalmate sur une péninsule, dotée d'un plan en damier romain et de l'église romane Saint-Donat. Sur le front de mer, les orgues marines jouent avec les vagues, à côté du Salut au Soleil — une installation qui attire les foules au crépuscule ; Alfred Hitchcock a qualifié le coucher de soleil de Zadar de plus beau du monde. Les îles Kornati sont les plus proches à partir d'ici.",
    highlights: ["Les orgues marines", "Le Salut au Soleil", "L'église Saint-Donat", "Les ruines romaines"],
    activities: ["Écouter les orgues marines", "Admirer le coucher de soleil", "Se promener sur les remparts", "Excursion aux îles Kornati"],
    duration: "1-2 jours",
  },
  split: {
    tagline: "Une ville vivante au sein du palais de Dioclétien",
    description: "Le cœur de Split est le palais de Dioclétien du IVe siècle — un complexe romain où des gens vivent encore : des cafés sur le Péristyle, un marché dans les caves, des boutiques dans les halls voûtés. La cathédrale Saint-Duje est la plus vieille cathédrale du monde en utilisation continue. La colline de Marjan offre une échappée dans les pins surplombant la ville, et des ferries partent du port vers les îles.",
    highlights: ["Palais de Dioclétien", "Péristyle", "Cathédrale Saint-Duje", "Marjan"],
    activities: ["Explorer le palais", "Promenade sur Marjan", "Plage de Bačvice", "Excursions en ferry vers les îles"],
    duration: "2 jours",
  },
  hvar: {
    tagline: "L'île la plus ensoleillée de la mer Adriatique, de la lavande et du vin",
    description: "Hvar jouit de près de 2 800 heures de soleil par an, d'une ville portuaire d'inspiration vénitienne et de la forteresse Fortica sur la colline. L'intérieur de l'île abrite des champs de lavande et des vignobles de pošip (un cépage local). En face du port s'étendent les îles Pakleni — des criques rocheuses parfaites pour mouiller et nager.",
    highlights: ["Forteresse Fortica", "Port d'Hvar", "Îles Pakleni", "Champs de lavande"],
    activities: ["Vue depuis Fortica", "Excursion aux îles Pakleni", "Dégustation de vin pošip", "Baignade dans les criques"],
    duration: "2-3 jours",
  },
  dubrovnik: {
    tagline: "Cité médiévale fortifiée au-dessus de l'Adriatique bleue",
    description: "Dubrovnik — la république de Raguse qui rivalisa avec Venise pendant des siècles — est une ville fortifiée qui s'élève de la mer, dont la Stradun relie les portes de Pile et de Ploče. Le parcours sur le mur, long de près de deux kilomètres, est la plus célèbre promenade urbaine de l'Adriatique ; un téléphérique grimpe jusqu'à Srđ pour offrir une vue sur la vieille ville et les îles. L'île boisée de Lokrum se trouve juste au large.",
    highlights: ["Les remparts de la ville", "La Stradun", "L'île de Lokrum", "Le téléphérique de Srđ"],
    activities: ["Promenade sur les remparts", "Le cloître du monastère franciscain", "Excursion à Lokrum", "Le coucher du soleil depuis Srđ"],
    duration: "2-3 jours",
  },
  kotor: {
    tagline: "Une baie de type fjord avec une ville médiévale fortifiée",
    description: "Kotor est niché au fond de la baie de Kotor, qui sinue entre des montagnes escarpées, comme le seul fjord de la Méditerranée. La vieille ville, inscrite au patrimoine de l'UNESCO, se présente comme un labyrinthe de places et de ruelles ; les remparts du château San Giovanni s'élèvent à plus de 1200 marches au-dessus de la ville pour offrir une vue légendaire sur la baie. À proximité, à Perast, se trouve l'îlot baroque Notre-Dame du Rocheau.",
    highlights: ["Vieille ville de Kotor", "Remparts de San Giovanni", "Baie de Kotor", "Perast"],
    activities: ["Promenade dans la vieille ville", "Escalade des remparts", "Excursion à Perast", "Croisière dans la baie"],
    duration: "1-2 jours",
  },
  budva: {
    tagline: "Une vieille ville sur une péninsule entre plages et pins",
    description: "Budva est la station balnéaire la plus visitée du Monténégro — un noyau historique sur une péninsule rocheuse et fortifiée, entourée de plages (Mogren, Jaz, Slovenska plaža). En été, les rues et les terrasses sont bondées ; au printemps et en automne, la vieille ville respire la détente. Le site le plus photographié est l'îlot de Sveti Stefan, avec son ancien village de pêcheurs transformé en hôtel.",
    highlights: ["Ville vieille de Budva", "Plage de Mogren", "Sveti Stefan", "Plage de Jaz"],
    activities: ["Balade dans la vieille ville", "Baignade à Mogren", "Vue sur Sveti Stefan", "Soirées au bord de l'eau"],
    duration: "1-2 jours",
  },
  podgorica: {
    tagline: "La capitale détendue où rivières et montagnes se rencontrent",
    description: "Podgorica est la capitale et la plus grande ville du Monténégro, construite au confluent des rivières Morača et Ribnica. Le rythme de la ville est rythmé par le korzo, les terrasses de cafés et le pont du Millénaire ; la vieille ville (Stara Varoš) conserve les vestiges de la ville ottomane avec sa tour à horloge. Un excellent point de départ — le lac de Skadar, Budva et le Durmitor sont tous accessibles pour des excursions d'une journée.",
    highlights: ["Pont du Millénaire", "Stara Varoš (vieille ville)", "Tour à l'horloge", "Colline de Gorica"],
    activities: ["Promenade sur le korzo", "Exploration de la vieille ville (Stara Varoš)", "Café au bord de la Morača", "Excursion au lac de Skadar"],
    duration: "1 jour",
  },
  durmitor: {
    tagline: "UNESCO massif au-dessus du lac de Crno et du canyon de la Tara",
    description: "Le parc national du Durmitor est un massif montagneux parsemé de 18 lacs glaciaires — le plus célèbre étant le lac de Crno, près de Žabljak, la capitale des montagnes de la région. Le canyon de la rivière Tara est le plus profond d'Europe (1 300 m) et abrite du rafting entre ses rives boisées ; la route panoramique par le col de Sedlo relie Žabljak au sud. En hiver, les pistes de ski sont ouvertes, tandis qu'en été, des sentiers de randonnée serpentent autour des lacs.",
    highlights: ["Lac de Crno", "Canyon de la Tara", "Žabljak", "Col de Sedlo"],
    activities: ["Randonnée autour du lac de Crno", "Rafting sur la Tara", "Route panoramique par le col de Sedlo", "Ski en hiver"],
    duration: "2-3 jours",
  },
  tirana: {
    tagline: "Une capitale colorée avec un noyau ottoman et un rythme café",
    description: "Tirana est une capitale qui s'est ouverte après des décennies de fermeture — façades colorées, place Skanderbeg avec la mosquée Et'hem Bey et la tour de l'horloge, cafés dans les rues de blocs. Le téléphérique Dajti Ekspres grimpe à 1 600 m au-dessus de la ville pour une vue sur la plaine et l'Adriatique ; le musée Bunk'Art, installé dans un abri antiatomique, raconte l'histoire du XXe siècle.",
    highlights: ["Place Skanderbeg", "Mosquée Et'hem Bey", "Bunk'Art", "Montagne Dajti"],
    activities: ["Explorer le centre", "Téléphérique de Dajti", "Musées", "Culture café"],
    duration: "2 jours",
  },
  berat: {
    tagline: "La ville aux mille fenêtres sous le château",
    description: "Berat est une ville protégée par l'UNESCO, connue comme la ville aux mille fenêtres — les maisons ottomanes blanches sur la colline de Mangalem s'élègent en escalier vers le château au sommet. Le vieux pont sur la rivière Osum relie le quartier de Gorica ; à l'intérieur du château se trouve le musée Onufri avec ses icônes. Autour de Berat s'étendent des vignobles, où les habitants proposent des dégustations dans des maisons traditionnelles.",
    highlights: ["Château de Berat", "Quartier Mangalem", "Vieux pont", "Musée Onufri"],
    activities: ["Promenade dans Mangalem", "Visite du château", "Pont sur l'Osum", "Dégustation de vin"],
    duration: "1 jour",
  },
  gjirokaster: {
    tagline: "La cité de pierre — toits gris sous un château majestueux",
    description: "Gjirokastër est une ville classée UNESCO, célèbre pour ses maisons en pierre et toits en ardoise, construite sur un escarpement sous l'un des plus grands châteaux des Balkans. L'ancienne bazar conserve une rue commerciale ottomane avec des arcades ; la maison natale de l'écrivain Ismail Kadare est aujourd'hui un musée. Les montagnes environnantes invitent à des randonnées au-dessus de la vallée.",
    highlights: ["Château de Gjirokastër", "Ancien bazar", "Maisons en pierre", "Maison de Kadare"],
    activities: ["Visite du château", "Promenade dans le bazar", "Musée ethnographique", "Randonnées dans les environs"],
    duration: "1 jour",
  },
  saranda: {
    tagline: "Une ville ensoleillée de la mer Ionienne, en face de Corfou",
    description: "Saranda est la ville côtière la plus méridionale d'Albanie, en face de l'île grecque de Corfou (trajet en ferry de 30 minutes). La côte au sud de la ville abrite Ksamil avec ses plages de sable blanc et ses îlots ; à l'intérieur des terres se trouve l'antiquité — Butrint, une ancienne ville classée UNESCO, située entre un lac et un canal. La forteresse de Lëkurësi, surplombant la ville, offre un cadre magnifique pour admirer le coucher de soleil sur la mer Ionienne.",
    highlights: ["Ksamil", "Butrint antique", "Forteresse de Lëkurësi", "Vue sur Corfou"],
    activities: ["Baignade à Ksamil", "Visite de Butrint", "Coucher de soleil depuis Lëkurësi", "Ferry pour Corfou"],
    duration: "2-3 jours",
  },
};

/** FR overlay za destinacijo po id (fallback null → SL izvirnik). */
export function getFrDestination(id: string): DestinationEn | null {
  return DESTINATIONS_FR[id] ?? null;
}
