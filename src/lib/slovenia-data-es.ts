/**
 * ES prekrivna plast za slovenia-data.ts (W12 faza 1 — smer 2).
 *
 * W1 (Issue #15 V0, 1.126.0): ES prekrivna plast za slovenia-data.ts.
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

export const DESTINATIONS_ES: Record<string, DestinationEn> = {
  bled: {
    tagline: "La perla de los Alpes con un castillo medieval y una isla",
    description: "El lago de Bled, con su única isla coronada por una iglesia y un campanario, es el paisaje más icónico de Eslovenia. El castillo medieval, emplazado en un acantilado, ofrece vistas panorámicas, mientras que el desfiladero de Vintgar invita a un paseo breve a través de piedra caliza junto a un tranquilo río. Una porción de tarta de nata de Bled (kremšnita) en una pastelería junto al lago es el dulce obligatorio.",
    highlights: ["Isla de Bled", "Castillo de Bled", "Desfiladero de Vintgar", "Tarta de nata de Bled (kremšnita)"],
    activities: ["Travesía en barca pletna hasta la isla", "Visita al castillo", "Paseo por el desfiladero", "Nadar"],
    duration: "1-2 días",
  },
  bohinj: {
    tagline: "Una salvaje y virgen belleza del Parque Nacional Triglav",
    description: "El lago de Bohinj es el hermano mayor y más salvaje del lago de Bled, ubicado en su totalidad dentro del Parque Nacional Triglav. El teleférico Vogel ofrece vistas panorámicas de los Alpes Julios, y la cascada Savica es una corta ruta senderista a través del bosque. Ideal para quienes buscan tranquilidad y una escapada activa a la naturaleza.",
    highlights: ["Lago de Bohinj", "Vogel", "Cascada Savica", "Parque Nacional Triglav"],
    activities: ["Senderismo", "Esquí", "Kayak", "Teleférico Vogel"],
    duration: "1-2 días",
  },
  ljubljana: {
    tagline: "Una capital verde y creativa con el Puente del Dragón",
    description: "Liubliana es una pequeña pero animada capital donde la arquitectura medieval se fusiona con la escena culinaria contemporánea. El castillo de Liubliana ofrece vistas panorámicas, la plaza de Prešeren con el Puente del Dragón es el corazón de la ciudad, y las orillas del río Liubljanica cobran vida con el café y la conversación.",
    highlights: ["Castillo de Liubliana", "Puente del Dragón", "Plaza de Prešeren", "Parque de Tivoli"],
    activities: ["Visita al castillo", "Paseo por el casco antiguo", "Tour gastronómico", "Ruta en bicicleta por el Liubljanica"],
    duration: "2 días",
  },
  postojna: {
    tagline: "24 km de pasajes subterráneos y un reino de hadas de estalactitas",
    description: "La cueva de Postojna es el mayor sistema de cuevas turísticas de Europa, con un tren subterráneo único. También es el hogar de la proteus, un endemismo que inspiró leyendas sobre crías de dragón. El castillo de Predjama, tallado en una pared de acantilado de 123 metros, se encuentra a solo 9 km de distancia.",
    highlights: ["Tren subterráneo", "Estalactitas", "Proteus (pez humano)", "Castillo de Predjama"],
    activities: ["Tour de cuevas en tren", "Visita al castillo de Predjama", "Fotografía"],
    duration: "1 día",
  },
  piran: {
    tagline: "La Venecia eslovena con callejones de piedra y la Plaza Tartini",
    description: "Piran es un pueblo costero de estilo veneciano, donde las callejuelas estrechas se estrechan entre casas de piedra. La Plaza Tartini, la plaza principal con pavimento de mármol, está dedicada al violinista Giuseppe Tartini. La Iglesia de San Jorge en la colina ofrece vistas al Mar Adriático.",
    highlights: ["Plaza Tartini", "Iglesia de San Jorge", "La costa", "Callejuelas antiguas"],
    activities: ["Paseo por el casco antiguo", "Ver el atardecer", "Degustación de marisco", "Visita a las salinas"],
    duration: "1 día",
  },
  soca: {
    tagline: "Un río esmeralda entre los Alpes Julianos para aventuras con adrenalina",
    description: "La Soča es uno de los pocos ríos que mantiene su color esmeralda durante todo el año. Serpentea por Tolmin y Bovec, donde ofrece rafting de primer nivel, kayak y descenso de cañones. A lo largo de su curso se encuentran las gargantas de la Soča — piscinas naturales talladas en la caliza, perfectas para refrescarse en verano.",
    highlights: ["Gargantas de la Soča", "Bovec", "Tolmin", "Fortaleza de Kluže"],
    activities: ["Rafting", "Kayak", "Descenso de cañones", "Zip-line"],
    duration: "2-3 días",
  },
  triglav: {
    tagline: "Símbolo nacional de 2.864 m con innumerables senderos",
    description: "El Triglav es el pico más alto de Eslovenia y un símbolo nacional que incluso aparece en el escudo del país. La ascensión requiere senderismo técnico, pero con una buena preparación es alcanzable en uno o dos días. En la cumbre se alza la torre de Aljaž — el refugio más alto del país.",
    highlights: ["Cumbre de 2.864 m", "Torre de Aljaž", "Rosa del Triglav", "Senderismo"],
    activities: ["Senderismo", "Alpinismo", "Fotografía"],
    duration: "2 días",
  },
  kobarid: {
    tagline: "Historia, el Frente del Isonzo y gastronomía en un mismo pueblo",
    description: "Kobarid es un pequeño pueblo junto al río Soča, famoso por el Museo de Kobarid, que documenta la sangrienta batalla del Frente del Isonzo durante la Primera Guerra Mundial. El puente de Napoleón sobre el río Soča y la cresta de Kolovrat ofrecen vistas panorámicas. Hiša Franko, uno de los mejores restaurantes de la región, sirve la cocina contemporánea de Tolmin.",
    highlights: ["Museo de Kobarid", "Puente de Napoleón", "Kolovrat", "Hiša Franko"],
    activities: ["Visita al museo", "Senderismo", "Experiencia gastronómica", "Rutas en bicleta junto al Soča"],
    duration: "1 día",
  },
  maribor: {
    tagline: "La segunda ciudad de Eslovenia, hogar de la vid más antigua del mundo",
    description: "Maribor se encuentra en el río Drava, rodeada de viñedos de Pohorje. La Vieja Vides, con más de 400 años de antigüedad, está inscrita en el Libro Guinness de los Récords. La ciudad ofrece un animado casco antiguo, las laderas vinícolas de Pohorje y esquí en invierno.",
    highlights: ["La Vieja Vides", "Pohorje", "Plaza Principal", "Cultura del vino"],
    activities: ["Visita a la Vieja Vides", "Esquí en Pohorje", "Degustación de vinos", "Paseo por el casco antiguo"],
    duration: "1-2 días",
  },
  portoroz: {
    tagline: "Estación balnearia eslovena con casino y bienestar",
    description: "Portorož es la estación balnearia más famosa de Eslovenia, con una larga playa de arena, hoteles con centros de bienestar y un casino. El paseo marítimo conecta Portorož con Piran, mientras que las salinas de Sečovlje ofrecen una experiencia natural única y tratamientos de bienestar con lodo.",
    highlights: ["Playa", "Casino", "Salinas de Sečovlje", "Bienestar"],
    activities: ["Natación", "Bienestar", "Juegos de azar", "Ciclismo junto al mar"],
    duration: "2-3 días",
  },
  vintgar: {
    tagline: "Un corto paseo por un cañón de piedra caliza junto a un tranquilo río",
    description: "El desfiladero de Vintgar es un cañón de 1,6 km de longitud a orillas del río Radovna, a solo 4 km de Bled. Pasarelas de madera serpentan junto a aguas cristalinas, pasando por una cascada y piscinas naturales. El paseo dura aproximadamente una hora y es apto para todas las edades.",
    highlights: ["Cascada de Šum", "Pasarelas de madera", "Agua cristalina", "Piscinas naturales"],
    activities: ["Pasear", "Fotografía", "Observación de la naturaleza"],
    duration: "1 día",
  },
  rogaska: {
    tagline: "El balneario más antiguo de Eslovenia con agua mineral",
    description: "Rogaška Slatina es un elegante balneario con una tradición de 400 años, famoso por su agua mineral Donat Mg, con el contenido más alto de magnesio del mundo. La arquitectura modernista, los parques y los centros de bienestar ofrecen relajación durante todo el año.",
    highlights: ["Donat Mg", "Arquitectura modernista", "Gran Hotel", "Bienestar"],
    activities: ["Bienestar", "Degustación de agua mineral", "Paseos por el parque", "Masajes"],
    duration: "2 días",
  },
  ptuj: {
    tagline: "La ciudad más antigua de Eslovenia con historia romana",
    description: "Ptuj es la ciudad más antigua registrada de Eslovenia, fundada en la época romana como Poetovio. El castillo medieval en la colina ofrece vistas panorámicas sobre el río Drava, mientras el casco antiguo conserva su arquitectura barroca. Es famosa por el Kurentovanje, el mayor festival de carnaval de Europa Central.",
    highlights: ["Castillo de Ptuj", "Restos romanos", "Kurentovanje", "Río Drava"],
    activities: ["Visita al castillo", "Paseo por el casco antiguo", "Festival de carnaval", "Paseo por la orilla del río Drava"],
    duration: "1 día",
  },
  celje: {
    tagline: "Antigua capital de los condes de Celje con un impresionante castillo",
    description: "Celje es la tercera ciudad más grande de Eslovenia, conocida por su castillo medieval de los Condes de Celje, antaño la dinastía noble más influyente de las tierras eslovenas. La Plaza Vieja conserva sus fachadas barrocas, y un paseo serpentea a lo largo del río Savinja.",
    highlights: ["Castillo Viejo de Celje", "Plaza Vieja", "Río Savinja", "Museo Regional"],
    activities: ["Visita al castillo", "Paseo por el casco antiguo", "Visita al museo", "Ruta en bicleta por el río Savinja"],
    duration: "1 día",
  },
  "nova-gorica": {
    tagline: "La ciudad de las rosas en la frontera con Italia",
    description: "Nova Gorica es una ciudad joven construida después de la Segunda Guerra Mundial, conocida como la 'ciudad de las rosas'. Limita con la ciudad italiana de Gorizia — las únicas dos ciudades europeas que comparten una misma plaza (Plaza de Europa). Un casino, parques frondosos y una atmósfera mediterránea completan el escenario.",
    highlights: ["Plaza de Europa", "Parque de las Rosas", "Casino Perla", "Puente de Solkan"],
    activities: ["Paseo por el parque", "Juegos de azar", "Paseo fronterizo a Italia", "Ciclismo por el Soča"],
    duration: "1 día",
  },
  "slovenj-gradec": {
    tagline: "Un pueblo alpino con rica tradición musical",
    description: "Slovenj Gradec es un histórico pueblo del norte de Eslovenia, rodeado por los Alpes Carintios. Conocido por la Sala de los Músicos Eslovenos y por ser el lugar de nacimiento del compositor Hugo Wolf. Es el punto de partida ideal para excursiones a pie por Pohorje y Uršlja Gora.",
    highlights: ["Sala de los Músicos Eslovenos", "Plaza Vieja", "Pohorje", "Uršlja Gora"],
    activities: ["Senderismo", "Conciertos de música", "Paseo por el casco antiguo", "Esquí"],
    duration: "1 día",
  },
  dravograd: {
    tagline: "Donde confluyen los ríos Drava, Meža y Mislinja",
    description: "Dravograd es un pequeño pueblo del norte de Eslovenia donde se encuentran tres ríos: el Drava, el Meža y el Mislinja. Está rodeado por los bosques de Kozjak y Pohorje. Entre sus puntos de interés destacan la central hidroeléctrica del Drava y los senderos de senderismo a orillas del río.",
    highlights: ["Confluencia de tres ríos", "Central hidroeléctrica de Dravograd", "Kozjak", "Senderismo"],
    activities: ["Senderismo", "Pesca", "Cicloturismo por el Drava", "Fotografía de naturaleza"],
    duration: "1 día",
  },
  "murska-sobota": {
    tagline: "El corazón de Prekmurje con un castillo junto al lago",
    description: "Murska Sobota es el centro de Prekmurje, la llana región panónica del noreste de Eslovenia. El Castillo de Murska Sobota, junto al lago del mismo nombre, alberga el Museo Regional. Conocida por la gibanica prekmurja, una pasta tradicional capas, y el aceite de semilla de calabaza.",
    highlights: ["Castillo de Murska Sobota", "Lago de Sobota", "Gibanica prekmurja", "Museo Regional"],
    activities: ["Visita al castillo", "Paseo junto al lago", "Experiencias culinarias", "Rutas en bicicleta por la llanura"],
    duration: "1 día",
  },
  lendava: {
    tagline: "Ciudad bilingüe con viñedos y un castillo en la colina",
    description: "Lendava es la ciudad más oriental de Eslovenia, situada en la frontera con Hungría. Esta ciudad bilingüe (esloveno-húngara) alberga un castillo en la colina que ofrece vistas panorámicas a los viñedos de las colinas de Lendavske gorice. La zona produce vinos blancos de alta gama.",
    highlights: ["Castillo de Lendava", "Viñedos de las colinas de Lendavske gorice", "Cultura bilingüe", "Bodega de vinos"],
    activities: ["Degustación de vinos", "Visita al castillo", "Ruta en bicicleta por los viñedos", "Paseo transfronterizo"],
    duration: "1 día",
  },
  "novo-mesto": {
    tagline: "La capital de Dolenjska en el río Krka",
    description: "Novo mesto es el centro de la región de Dolenjska, construido en un meandro del río Krka. La Plaza Vieja y su calle principal conservan su carácter medieval. La ciudad es famosa por el cviček — el vino tradicional de Dolenjska — y por los hallazgos arqueológicos de la cultura de Hallstatt.",
    highlights: ["Plaza Vieja", "Río Krka", "Cviček", "Museo Arqueológico"],
    activities: ["Paseo por el casco antiguo", "Degustación de vinos", "Ruta en bicicleta por el Krka", "Visita al museo"],
    duration: "1-2 días",
  },
  otocec: {
    tagline: "El único castillo esloveno en una isla fluvial",
    description: "Otočec es el único castillo de Eslovenia situado en una isla, rodeado por las aguas del río Krka. En la actualidad, es un hotel de lujo con campo de golf y instalaciones de bienestar. Un entorno romántico para parejas y punto de partida para el ciclismo a lo largo del Krka.",
    highlights: ["Castillo en la isla", "Río Krka", "Golf", "Bienestar"],
    activities: ["Golf", "Bienestar", "Ruta en bicicleta por el Krka", "Cena romántica"],
    duration: "1-2 días",
  },
  crnomelj: {
    tagline: "El corazón de la región de Bela Krajina en el río Kolpa",
    description: "Crnomelj es el centro de Bela Krajina, una cálida región de influencia mediterránea en el sureste de Eslovenia, situada en el río Kolpa. Conocida por sus huevos de Pascua pintados (pisanica), sus brezales y su música tradicional de Bela Krajina. El río Kolpa ofrece las aguas más cálidas para nadar de Eslovenia.",
    highlights: ["Río Kolpa", "Plaza Vieja", "Pisanica de Bela Krajina", "Brezales"],
    activities: ["Baño en el río Kolpa", "Paseo por el casco antiguo", "Ruta ciclista por Bela Krajina", "Museo etnográfico"],
    duration: "1-2 días",
  },
  zagreb: {
    tagline: "La capital croata con el encanto vienés y la cultura del café",
    description: "Zagreb es una ciudad en la encrucijada de Europa Central y del Sudeste, con un núcleo de época austrohúngara: la ciudad alta con su mercado cubierto y la torre Lotrščak, las calles modernistas de la ciudad baja y el animado mercado Dolac por la mañana cuando los agricultores exponen sus productos. Su feria de Adviento es una de las más festivas de Europa en diciembre, mientras que el café de verano en la calle Tkalčićeva marca el ritmo de la ciudad.",
    highlights: ["Ciudad Alta", "Plaza de Ban Jelačić", "Mercado Dolac", "Catedral"],
    activities: ["Paseo por la Ciudad Alta", "Museos y galerías", "Adviento en diciembre", "Café en la calle Tkalčićeva"],
    duration: "2 días",
  },
  "plitvicka-jezera": {
    tagline: "Una cascada de lagos y cascadas turquesas del Patrimonio Mundial de la UNESCO",
    description: "El parque nacional más antiguo de Croacia es una cadena de dieciséis lagos que se derraman unos en otros sobre barreras de travertino y cascadas. Pasarelas de madera recorren el agua a través del bosque, y barcas eléctricas cruzan el lago más grande, Kozjak. El color del agua varía entre el turquesa y el esmeralda según la estación y la luz.",
    highlights: ["Gran Salto", "Lago Kozjak", "Pasarelas de madera", "Barreras de travertino"],
    activities: ["Paseo por las pasarelas", "Travesía en barco por Kozjak", "Fotografía", "Visita al Gran Salto"],
    duration: "1 día",
  },
  rijeka: {
    tagline: "Capital de cultura con el mayor puerto de Croacia",
    description: "Rijeka es una ciudad portuaria en el golfo de Kvarner, con un núcleo austrohúngaro, el largo paseo de Korzo y el castillo de Trsat en la colina sobre la ciudad. Fue Capital Europea de Cultura en 2020; su carnaval de Pascua es uno de los más grandes de Europa. Desde Rijeka parten ferries hacia las islas e Italia — la ciudad es la puerta de entrada al Kvarner.",
    highlights: ["Korzo", "Castillo de Trsat", "Torre de la ciudad", "Catedral de San Vito"],
    activities: ["Paseo por Korzo", "Vista desde Trsat", "Carnaval de Rijeka", "Excursiones en ferry a las islas"],
    duration: "1-2 días",
  },
  pula: {
    tagline: "Anfiteatro romano en el Adriático",
    description: "Pula es la ciudad más grande de Istria, hogar del anfiteatro romano mejor conservado del mundo después de Roma — el anfiteatro del siglo I sigue acogiendo conciertos y cine al aire libre. El casco antiguo con la Puerta Dorada y la Catedral de Santa María se extiende en una península, rodeado de playas y pueblos vinícolas de Istria.",
    highlights: ["Anfiteatro Arena", "Puerta Dorada", "Plaza del Viejo Mercado", "Riviera de Istria"],
    activities: ["Visita al Anfiteatro Arena", "Paseo por el casco antiguo", "Natación", "Degustaciones de vinos de Istria"],
    duration: "1-2 días",
  },
  zadar: {
    tagline: "La ciudad de las puestas de sol y los órganos del mar",
    description: "Zadar es una ciudad dálmata en una península con un plano romano y la iglesia románica de San Donato. En el paseo marítimo, los órganos del mar tocan con las olas, junto al Saludo al Sol — una instalación donde se reúnen multitudes al atardecer; Alfred Hitchcock calificó el atardecer de Zadar como el más bello del mundo. Desde Zadar, las excursiones a las islas Kornati son las más cortas.",
    highlights: ["Órganos del mar", "Saludo al Sol", "Iglesia de San Donato", "Ruinas romanas"],
    activities: ["Escuchar los órganos del mar", "Ver el atardecer", "Paseo por las murallas", "Excursión a las Kornati"],
    duration: "1-2 días",
  },
  split: {
    tagline: "Una ciudad viva dentro del Palacio de Diocleciano",
    description: "El corazón de Split es el Palacio de Diocleciano del siglo IV — un complejo romano donde la gente sigue viviendo: cafés en el Peristilo, un mercado en los sótanos y tiendas en las salas abovedadas. La Catedral de San Domnius es la catedral más antigua del mundo en uso continuo. La colina de Marjan ofrece un escape en pinos sobre la ciudad, y desde el puerto zarpan los ferries hacia las islas.",
    highlights: ["Palacio de Diocleciano", "Peristilo", "Catedral de San Domnius", "Marjan"],
    activities: ["Explorar el palacio", "Paseo por Marjan", "Playa de Bačvice", "Trayectos en ferry a las islas"],
    duration: "2 días",
  },
  hvar: {
    tagline: "La isla más soleada del Adriático de lavanda y vino",
    description: "Hvar tiene casi 2.800 horas de sol al año, un puerto de aspecto veneciano y la fortaleza Fortica en la colina. El interior de la isla esconde campos de lavanda y viñedos de la variedad de vino pošip. Frente al puerto se encuentran las islas Pakleni — calas rocosas para fondear y bañarse.",
    highlights: ["Fortaleza Fortica", "Puerto de Hvar", "Islas Pakleni", "Campos de lavanda"],
    activities: ["Vista desde Fortica", "Excursión a las islas Pakleni", "Degustación de vino pošip", "Baño en las calas"],
    duration: "2-3 días",
  },
  dubrovnik: {
    tagline: "Ciudad medieval amurallada sobre el Adriático azul",
    description: "Dubrovnik — la República de Ragusa que compitió con Venecia durante siglos — es una ciudad amurallada que se alza sobre el mar, cuyo Stradun une las puertas de Pile y Ploče. El paseo por la muralla, de casi dos kilómetros, es el más famoso del Adriático; un teleférico sube a Srđ para contemplar la vista de la ciudad antigua y las islas. Frente a la ciudad se encuentra la isla boscosa de Lokrum.",
    highlights: ["Murallas de la ciudad", "Stradun", "Isla de Lokrum", "Teleférico a Srđ"],
    activities: ["Paseo por las murallas", "Claustro del monasterio franciscano", "Excursión a Lokrum", "Atardecer desde Srđ"],
    duration: "2-3 días",
  },
  kotor: {
    tagline: "Una bahía similar a un fiordo con una ciudad amurallada medieval",
    description: "Kotor se encuentra en el fondo de la bahía de Kotor, que serpentea entre montañas escarpadas como el único fiordo del Mediterráneo. El casco antiguo, protegido por la UNESCO, es una red de plazas y callejuelas; las murallas del castillo de San Giovanni suben más de 1.200 escalones sobre la ciudad para ofrecer una legendaria vista de la bahía. En la cercana Perast se encuentra la isla barroca de Nuestra Señora de las Roca.",
    highlights: ["Casco antiguo de Kotor", "Murallas de San Giovanni", "Bahía de Kotor", "Perast"],
    activities: ["Paseo por el casco antiguo", "Ascenso a las murallas", "Excursión a Perast", "Crucero por la bahía"],
    duration: "1-2 días",
  },
  budva: {
    tagline: "Una ciudad antigua en una península entre playas y pinos",
    description: "Budva es el destino costero más visitado de Montenegro: su casco antiguo se encuentra en un promontorio rocoso y amurallado, rodeado de playas (Mogren, Jaz, Playa Eslovena). En verano, las calles y terrazas bulle de vida, mientras que en primavera y otoño, la ciudad antigua respira con calma. El motivo más fotografiado es la pequeña isla de Sveti Stefan, con su antiguo pueblo de pescadores convertido en hotel.",
    highlights: ["Ciudad Antigua de Budva", "Playa de Mogren", "Sveti Stefan", "Playa de Jaz"],
    activities: ["Paseo por el casco antiguo", "Nadar en Mogren", "Vista panorámica de Sveti Stefan", "Noches en la costa"],
    duration: "1-2 días",
  },
  podgorica: {
    tagline: "Relajada capital donde se encuentran ríos y montañas",
    description: "Podgorica es la capital y ciudad más grande de Montenegro, construida en la confluencia de los ríos Morača y Ribnica. Su ritmo lo marcan el paseo del korzo, las terrazas de cafeterías y el Puente del Milenio; Stara Varoš conserva restos de la ciudad otomana con su torre del reloj. Una excelente base de partida —el Lago de Skadar, Budva y Durmitor son todas excursiones de un día.",
    highlights: ["Puente del Milenio", "Stara Varoš", "Torre del reloj", "Gorica"],
    activities: ["Paseo por el korzo", "Explorar Stara Varoš", "Café junto al Morača", "Excursión al Lago de Skadar"],
    duration: "1 día",
  },
  durmitor: {
    tagline: "UNESCO masivo sobre el lago Negro y el cañón del Tara",
    description: "El Parque Nacional Durmitor es una cadena montañosa surcada por 18 lagos glaciares, siendo el más conocido el Lago Negro, situado junto a Žabljak, la capital de la montaña de la región. El cañón del río Tara es el más profundo de Europa (1.300 m) y es el hogar del rafting entre sus orillas boscosas; la carretera panorámica a través del puerto de Sedlo conecta Žabljak con el sur. En invierno, las pistas de esquí; en verano, senderos de senderismo alrededor de los lagos.",
    highlights: ["Lago Negro", "Cañón del Tara", "Žabljak", "Puerto de Sedlo"],
    activities: ["Paseo alrededor del Lago Negro", "Rafting por el Tara", "Conducción panorámica por el puerto de Sedlo", "Esquí en invierno"],
    duration: "2-3 días",
  },
  tirana: {
    tagline: "Colorida capital con núcleo otomano y ritmo de cafeterías",
    description: "Tirana es una capital que se abrió tras décadas de aislamiento — fachadas de colores, la plaza Skanderbeg con la mezquita Et'hem Bey y el reloj de la torre, cafeterías en las calles de bloques. El teleférico Dajti Ekspres sube a 1600 m sobre la ciudad para una vista sobre la llanura y el Adriático; el museo Bunk'Art en un refugio nuclear narra la historia del siglo XX.",
    highlights: ["Plaza Skanderbeg", "Mezquita Et'hem Bey", "Bunk'Art", "Monte Dajti"],
    activities: ["Explorar el centro", "Teleférico a Dajti", "Museos", "Cultura de cafeterías"],
    duration: "2 días",
  },
  berat: {
    tagline: "La ciudad de las mil ventanas debajo del castillo",
    description: "Berat es una ciudad protegida por la UNESCO, conocida como la ciudad de las mil ventanas: las casas otomanas blancas en la colina de Mangalem se escalonan hacia el castillo en la cima. El viejo puente sobre el río Osum conecta el barrio de Gorica; dentro del castillo se encuentra el museo de Onufri con sus iconos. Los viñedos rodean Berat, y los locales ofrecen degustaciones en casas tradicionales.",
    highlights: ["Castillo de Berat", "Barrio de Mangalem", "Puente Viejo", "Museo de Onufri"],
    activities: ["Paseo por Mangalem", "Visita al castillo", "Puente sobre el Osum", "Degustación de vinos"],
    duration: "1 día",
  },
  gjirokaster: {
    tagline: "Ciudad de piedra — tejados grises bajo un imponente castillo",
    description: "Gjirokastra es una ciudad patrimonio de la UNESCO, famosa por sus casas de piedra con tejados de pizarra, construida en una empinada ladera bajo uno de los mayores castillos de los Balcanes. El viejo bazar conserva una calle comercial otomana con arcos; la casa natal del escritor Ismail Kadare es hoy un museo. Las montañas que rodean la ciudad invitan a hacer senderismo por el valle.",
    highlights: ["Castillo de Gjirokastra", "Viejo bazar", "Casas de piedra", "Casa de Kadare"],
    activities: ["Visita al castillo", "Paseo por el bazar", "Museo etnográfico", "Senderismo por los alrededores"],
    duration: "1 día",
  },
  saranda: {
    tagline: "Soleada ciudad jonia frente a Corfú",
    description: "Saranda es la ciudad costera más meridional de Albania, situada frente a la isla griega de Corfú (trayecto en ferry de 30 minutos). La costa al sur de la ciudad esconde Ksamil con sus playas blancas e islotes; mientras que tierra adentro yace la antigüedad — Butrint, ciudad antigua de la UNESCO entre un lago y un canal. La fortaleza de Lëkurësi, sobre la ciudad, enmarca el atardecer sobre el mar Jónico.",
    highlights: ["Ksamil", "Antigua Butrint", "Fortaleza de Lëkurësi", "Vista de Corfú"],
    activities: ["Nadar en Ksamil", "Visita a Butrint", "Atardecer desde Lëkurësi", "Ferry a Corfú"],
    duration: "2-3 días",
  },
};

/** ES overlay za destinacijo po id (fallback null → SL izvirnik). */
export function getEsDestination(id: string): DestinationEn | null {
  return DESTINATIONS_ES[id] ?? null;
}
