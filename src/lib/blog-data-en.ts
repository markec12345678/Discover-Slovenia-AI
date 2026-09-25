// English blog articles — Tier 1 #5 (TASK 32): EN blog na /en/vodici.
//
// POGODBA PARITETE (varovana v task32-blog-en.test.ts): EN množica je
// 1:1 prevod SL množice (src/lib/blog-data.ts) — istih 16 slugov, iste
// kategorije, datumi, readTime, slike, avtorji in relatedDestination.
// Samo title/excerpt/content so prevedeni.
//
// Slovenska lastna imena jedi in krajev (kremšnita, žlikrofi, gibanica,
// Vintgar …) ostanejo izvirna — to je angleški zapis o Sloveniji, ne
// iznižen kulturni prevod.

import type { BlogCategory, BlogPost } from "@/lib/blog-data";

/** EN oznake kategorij ( isti vrstni red kot SL BLOG_CATEGORIES). */
export const BLOG_CATEGORIES_EN: { value: BlogCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "narava", label: "Nature" },
  { value: "kulinarika", label: "Cuisine" },
  { value: "kultura", label: "Culture" },
  { value: "avantura", label: "Adventure" },
  { value: "nasveti", label: "Tips" },
];

export const BLOG_POSTS_EN: BlogPost[] = [
  {
    slug: "blejsko-jezero-vodic",
    title: "Lake Bled: The Complete Visitor's Guide",
    excerpt:
      "Lake Bled is Slovenia's most recognisable postcard view. Discover the best time to visit, what to do and how to make the most of a day at this Alpine gem.",
    content: `## Why Lake Bled?

Lake Bled is the unmistakable symbol of Slovenia — a medieval castle on a cliff, an island with a church in the middle of the lake and crystal-clear water framed by the Julian Alps. Just 45 minutes' drive from Ljubljana and 2 hours from Vienna, Bled is ideal for a day trip or a romantic weekend.

## The best time to visit

It is most beautiful from **May to October**, when temperatures are pleasant and the lake is warm enough for swimming. At six in the morning the lake belongs to silence and soft dawn light — a photographer's paradise. In winter it sometimes freezes over, offering a unique sight, though most activities are limited then.

## What you must not miss

1. **A pletna boat ride to the island** — a traditional wooden boat rowed Bled-style, a skill passed down through generations of Bled locals. The ride takes 15 minutes, followed by the 99 steps up to the church.
2. **Bled Castle** — Slovenia's oldest castle (first mentioned in 1011) offers the finest view of the lake from its nearly 100-metre cliff.
3. **Vintgar Gorge** — a 1.6 km gorge along the Radovna river, only 4 km away.
4. **Kremšnita** — the famous cream cake has been made at the Smon pastry shop by the lake since 1953.

## Tips for your visit

- **Castle tickets**: ~€15 for adults, includes the museum and lookout.
- **Pletna ride**: ~€16 per person (queues are common at weekends).
- **Free of charge**: the walk around the lake (3.5 km, ~1 hour), swimming off the bathing pier.
- Bike rental (€10/day) is an excellent way to explore the surroundings.

## Where to sleep

The choice is wide — from the luxurious Grand Hotel Toplice on the lakeside to friendly guesthouses in the villages of Podhom and Ribno. Book early, especially in summer.`,
    image: "/content/blejsko-jezero-vodic.jpg",
    category: "narava",
    author: "Tanja Novak",
    date: "2026-03-12",
    readTime: 5,
    relatedDestination: "bled",
  },
  {
    slug: "soca-adrenalinski-vodnik",
    title: "The Soča River: An Adventure Guide for Summer",
    excerpt:
      "The emerald river between the Julian Alps is an adrenaline playground. From rafting to canyoning — discover the best adventure activities along the Soča.",
    content: `## Emerald beauty

The Soča is one of the few rivers in the world that keeps its distinctive emerald colour all year round. It winds 138 km past Tolmin, Bovec and Kobarid, through the Julian Alps and Triglav National Park. Its famous description — "the river that flows sky" — was written by the poet Simon Gregorčič.

## The best adrenaline activities

### Rafting
The classic run from Bovec to Trnovo ob Soči takes 2 hours and is suitable even for beginners. Price: €35–45 per person. Best conditions run from May to September.

### Kayaking
For experienced paddlers the Soča offers grade III–IV sections. Beginners can start on the calmer stretch near Srpenica. A guided trip: €50–65.

### Canyoning
Descending wild gorges with jumps into natural pools and slides down natural chutes. Suša, Fratarca and Predelica are the best-known gorges. Price: €50–70, duration 3–4 hours.

### Zip-line
A network of steel cables above the Učja valley (the longest is 700 m) lets you fly over the treetops. €40–55.

## What to do in bad weather

The Soča valley is rarely rainy in summer, but do watch the forecast — storms in the mountains can raise water levels suddenly. On a rainy day visit:

- **The Kobarid Museum** — the history of the Isonzo Front
- **Kluže Fortress** — a 15th-century fort
- **Tolmin Gorge** — the deepest gorge in Slovenia

## Where to stay

Bovec is the epicentre of activity, but Cezsoča and Čezsoča offer quieter accommodation. Adventurers can also try the Soča Rocks campsite.`,
    image: "/content/soca-adrenalinski-vodnik.jpg",
    category: "avantura",
    author: "Matej Horvat",
    date: "2026-02-18",
    readTime: 6,
    relatedDestination: "soca",
  },
  {
    slug: "slovenska-kulinarika-7-jedi",
    title: "Slovenian Cuisine: 7 Dishes You Must Try",
    excerpt:
      "From štruklji rolls to potica — Slovenian cooking is surprisingly diverse. Here are the 7 dishes that define the Slovenian table.",
    content: `## A small nation, great culinary diversity

Slovenian cuisine is a crossroads of three worlds — Alpine, Mediterranean and Pannonian. On a small stretch of land you will find fresh seafood, game from the forests, grape varieties unknown elsewhere and desserts handed down through generations.

## 7 dishes you must try

### 1. Štruklji
Boiled or baked rolls of stretched dough with almost countless fillings — from tuna to walnuts. The best known are filled with tarragon, apple or poppy seeds.

### 2. Žlikrofi
Idrija žlikrofi are the Slovenian take on ravioli — small pinched dough pockets with a potato filling. Protected with the Traditional Reputation mark since 2002.

### 3. Kranjska klobasa
The Carniolan sausage is protected with an EU geographical indication. Ingredients: pork, bacon, garlic, salt and pepper. Never any potato or milk added. It is best served with buckwheat groats and sauerkraut.

### 4. Ajdovi žganci
A traditional farmhouse dish — buckwheat porridge with crackling breadcrumbs, often served with soured milk. Simple, filling and full of important minerals.

### 5. Soča trout
Slovenia's Soča river is home to the Soča trout — an endemic species with pink flesh. It is grilled, poached in broth or smoked. Freshly caught is best, of course.

### 6. Prekmurska gibanica
Slovenia's most famous dessert — a layered cake of curd cheese, poppy seeds, walnuts and apples, each layer separated by stretched dough. Protected with the Traditional Reputation mark.

### 7. Potica
A festive rolled loaf baked for every Slovenian occasion — from Christmas to weddings. The classic fillings are walnut or raisin, but there are more than 80 varieties.

## Where to try them

For an authentic experience visit **Hiša Franko** (Kobarid), **Gostilna As** (Ljubljana) or **Ošterija Debeluh** (Brežice). For a budget option seek out village **gostilnas**, where recipes are handed down through the generations.`,
    image: "/content/slovenska-kulinarika-7-jedi.jpg",
    category: "kulinarika",
    author: "Petra Kovač",
    date: "2026-01-22",
    readTime: 7,
  },
  {
    slug: "triglav-vzpon-vodic",
    title: "Triglav: Climbing Slovenia's Highest Peak",
    excerpt:
      "Triglav (2864 m) is the national symbol and the highest peak in Slovenia. Prepare properly — a guide to gear, routes and the best time for the ascent.",
    content: `## Why Triglav?

Triglav is not just Slovenia's highest peak — it is the national symbol that crowns the country's coat of arms. Legend has it that a true Slovenian must climb it at least once in a lifetime. On its summit stands the Aljaž Tower, the highest-lying shelter in the country.

## Two main routes

### 1. Via the Triglavska koča hut (easier variant, 2 days)
The most popular direction. From the Vrata valley a well-marked path leads to the Triglavska koča hut (1525 m), an overnight stay, then the ascent the next day via the Tominškova pot path. The hardest part is the ridge climb with steel cables.

### 2. Via the Staničeva koča hut (harder variant, 2 days)
A beautiful but more demanding route. It requires more climbing on fixed ropes.

### A one-day ascent?
It is possible for experienced hikers, but we recommend an overnight stay — plus you will catch the sunrise from the summit.

## Gear

**Mandatory:**
- Hiking boots with good grip
- A helmet (falling rock)
- At least 2 litres of water
- Warm layers (even in summer it is 10–15 °C at the top)
- A short via ferrata lanyard and sit harness for the ridge
- The gaps between the steel cables are 20–30 m — use self-protection

**Recommended:**
- Trekking poles
- A hat and sunglasses
- Spare socks
- First aid kit

## The best time

The ascent is feasible from **July to September**. Outside this season conditions are alpine — winter gear and experience required. Even in summer, check the forecast — storms in the mountains are dangerous.

## Tips

- Book your hut bed at least 2 months ahead (summers sell out).
- Start early (5–6 a.m.) for safer conditions on the ridge.
- Don't linger too long on the summit — the weather can change fast.
- Respect nature: carry your rubbish out with you.

Triglav is not the destination — it is the journey. Enjoy the hike, not just the summit.`,
    image: "/content/triglav-vzpon-vodic.jpg",
    category: "avantura",
    author: "Blaž Zupan",
    date: "2026-02-03",
    readTime: 8,
    relatedDestination: "triglav",
  },
  {
    slug: "piran-slovenska-obala-24-ur",
    title: "Piran and the Slovenian Coast in 24 Hours",
    excerpt:
      "How to make the most of 24 hours on the Slovenian coast? Discover Piran, Portorož and the Sečovlje salt pans in one day — with the best food and views.",
    content: `## The Slovenian coast — small but magnificent

Slovenia has only 47 km of coastline, yet every metre is worth the visit. Piran is the most picturesque town — Venetian architecture, narrow lanes and Tartini Square. Portorož is more modern, with hotels and a casino. The Sečovlje salt pans are a nature reserve with a unique salt-making tradition.

## A morning stroll through Piran

Start your day at 8 a.m. in Tartini Square — Central Europe's largest marble-paved square. It was once the harbour; now it is the heart of the town. See the birthplace of the violinist Giuseppe Tartini (1692–1770), whose statue stands in the middle.

Climb the steep steps to **the Church of St George** (14th c.) — the best view over the town and the sea. The bell tower is a replica of St Mark's campanile in Venice.

## Lunch: seafood

The Slovenian coast serves the best seafood in the country. Top picks:

- **Pavel** (Piran) — fine dining with local ingredients
- **Fritolin pri Cantini** (Izola) — fresh fish, simply done
- **Ribic** (Portorož) — a local gostilna with excellent shellfish

Order **grilled cuttlefish**, **black cuttlefish risotto** or **Koper tuna**.

## Afternoon: the Sečovlje salt pans

Ten minutes' drive from Portorož lie the Sečovlje salt pans — a unique salt-pan reserve with a 700-year tradition. Walk the salt fields, learn the salters' craft and visit the museum. Entry: €5.

The pans are also **home to the smallest land tortoise in Slovenia** — the Hermann's tortoise. With luck you will spot one.

## Evening: sunset and wine

Piran is famous for its sunsets. The best view is from the pier below the Church of St George, where the sun sinks into the Adriatic. Afterwards settle into one of the town wine bars and try **malvazija** or **refošk** — two local varieties.

## Tips for a day visit

- **Park in Fiesa** (€1.50/h) and take the shuttle bus into Piran (free).
- If you have time, visit Koper and Izola too — buses run every 30 minutes.
- The swimming season runs from June to September.
- Bike rental (€10/day) is a great way to see the whole coast.`,
    image: "/content/piran-slovenska-obala-24-ur.jpg",
    category: "kultura",
    author: "Maja Dolenc",
    date: "2026-03-04",
    readTime: 6,
    relatedDestination: "piran",
  },
  {
    slug: "zima-v-sloveniji-smucanje-thermalni",
    title: "Winter in Slovenia: Skiing and Thermal Springs",
    excerpt:
      "A Slovenian winter offers two sides — adrenaline skiing in the Julian Alps and relaxation in thermal springs. Discover the best destinations for the winter months.",
    content: `## A Slovenian two-faced winter

The Slovenian winter is full of surprises. One day you ski powder at 2000 m; the next you unwind in 38 °C thermal water. All within half a day's drive. For those seeking an active winter, Slovenia is a hidden European destination.

## The best ski resorts

### Kranjska Gora
Slovenia's best-known ski resort with 18 slopes and 30 km of runs. Every year it hosts the Alpine skiing World Cup (the Vitranc). Suitable for families and beginners. Day pass: €38–45.

### Mariborsko Pohorje
The largest night skiing operation in Slovenia and home of the legendary Golden Fox race. 41 km of runs, just 10 minutes from central Maribor. Day pass: €33–40.

### Vogel (Bohinj)
Skiing with the finest view in Slovenia — a panorama of Lake Bohinj and Triglav. 22 km of runs at 1800 m. Day pass: €37–42.

### Kanin (Bovec)
The highest-lying ski resort in Slovenia (up to 2300 m). Often open until May. Demanding runs, best for experienced skiers. Day pass: €42–48.

## Thermal springs

After a hard day on the slopes nothing beats warm thermal water. Slovenia's spa towns have a long tradition.

### Rogaška Slatina
An elegant spa with a 400-year tradition. Donat Mg mineral water has the highest magnesium content in the world. Pools up to 36 °C.

### Terme Čatež
Slovenia's largest thermal resort with summer and winter pool complexes. Ideal for families. Water up to 36 °C.

### Terme Dobrna
Slovenia's oldest spa (1418). A romantic atmosphere, less commercial than the others. Perfect for couples.

### Terme Olimia
A modern spa with a wellness centre and the largest sauna complex in Slovenia (Sauna Village). Water up to 35 °C.

## The ideal winter weekend

**Friday**: arrive in Kranjska Gora, ski in the afternoon, dinner in a gostilna.
**Saturday**: morning skiing, then drive to Terme Čatež (1.5 h), relax in the thermal water.
**Sunday**: a late breakfast, a sauna, then home.

## Tips for a winter visit

- Follow **snow conditions** on the slovenia.info portal.
- **Family deals**: many resorts offer free passes for children under 6.
- **Thermal resorts** are often cheaper than ski hotels — the combination makes sense.
- The **December Christmas markets** in Ljubljana and Maribor are a must.`,
    image: "/content/zima-v-sloveniji-smucanje-thermalni.jpg",
    category: "nasveti",
    author: "Saša Krajnc",
    date: "2026-01-08",
    readTime: 7,
  },
  {
    slug: "vintgarska-soteska-vodic",
    title: "Vintgar Gorge: A Guide to the Natural Gem by Bled",
    excerpt:
      "A 1.6 km gorge along the Radovna river just 4 km from Bled — wooden walkways, Šum waterfall and crystal-clear water. Everything for a perfect visit.",
    content: `## A natural gem 4 km from Bled

Vintgar Gorge is a 1.6 km canyon the Radovna river has carved into the limestone between Bled and Gorje. It was discovered in 1891, when the local mayor Jakob Žumer stepped into the gorge at low water and announced a natural treasure. Since then it has been one of the most visited natural attractions in Slovenia.

## A walk on the wooden walkways

Wooden paths, anchored into the rock walls alongside the river, lead through the gorge. The walk takes 1–1.5 hours and suits all ages. Along the way you pass rapids, pools, natural basins and finally the Šum waterfall — Slovenia's largest river waterfall by volume.

## What to see

1. **Šum waterfall** — a 13-metre fall that closes the gorge
2. **The wooden bridges** — airy structures fixed to the rock walls
3. **Hudomušnica** — the most thrilling section with the fastest water
4. **The lookout point** — a view over the Bled basin and Mount Košuta

## The best time to visit

The gorge is open from April to October. It is at its best in **June and September**, when the water is clearest. July and August bring crowds — start early, by 8 a.m. After rain the water rises and the gorge turns even more dramatic, though the walkways may close at high water.

## Tips for your visit

- **Tickets**: €10 for adults, €2 for children. Parking is free.
- **Weather limit**: the gorge closes at high water — check the website.
- **Clothing**: light hiking shoes; it is 5–10 °C cooler inside the gorge.
- **Cameras**: bring a polarising filter to cut reflections off the water.

## Combining it with Bled

Vintgar Gorge is the perfect add-on to a visit to Bled. We recommend the gorge in the morning (8:00) and Bled in the afternoon — the castle and a kremšnita. Together they make a perfect day trip.`,
    image: "/content/vintgarska-soteska-vodic.jpg",
    category: "narava",
    author: "Lara Zupan",
    date: "2026-04-05",
    readTime: 5,
    relatedDestination: "vintgar",
  },
  {
    slug: "cvicek-in-dolenjska-kuhinja",
    title: "Cviček and Dolenjska Cuisine: A Guide to Local Flavours",
    excerpt:
      "Cviček is the king of Dolenjska wines, and the local cooking is farmhouse-simple and full of flavour. Discover the best dishes and winemakers.",
    content: `## Cviček — the king of Dolenjska

Cviček is a traditional Dolenjska wine with a protected designation of origin. It is made from a blend of red and white varieties (žlahtnina, modra frankinja, kraljevina, laški rizling). Low alcohol (8–10%), fresh acidity, a red colour with a ruby hue. Cviček belongs on the everyday table and is the best companion to Dolenjska cooking.

## The culinary heritage of Dolenjska

Dolenjska cuisine is farmhouse food — simple and full of flavour. It is built on local ingredients: potatoes, cabbage, pork, game and mushrooms. Every dish has its own history and belongs to a particular season.

## 5 dishes you must try

### 1. Štruklji
Dolenjska štruklji are boiled or baked rolls of stretched dough, most often filled with curd cheese, tarragon or apples. They are served as a side or as dessert.

### 2. Matevž
A traditional dish of beans and potatoes, mashed with cracklings. Rich in protein, simple to make, thoroughly Slovenian.

### 3. Ajdovi žganci
Buckwheat porridge with breadcrumbs, served with soured milk or cracklings. Simple, filling and full of minerals.

### 4. Koline and blood sausage
Pig-slaughter feasts are still an important December event in Dolenjska. Blood sausage with buckwheat groats and fine breadcrumbs is the classic.

### 5. Pogača
Dolenjska pogača is a yeast flatbread with cracklings. Serve it warm, best with cviček.

## The best wineries

- **Vinska klet Cviček** (Novo mesto) — specialises in cviček with tastings
- **Klet Golje** (Vipava) — more Primorska in style, an excellent blend
- **Domačija Škerl** (Dolenjske Toplice) — a family cellar with authentic cooking

## A culinary tour of Dolenjska

For the full experience book a one-day wine-and-food tour: a morning tasting in Novo mesto, lunch at a farmhouse on the Krka river, an afternoon stroll in Otočec and dinner in the castle. Price: €80–120 per person.

## Tips

- Cviček is best young — don't keep it longer than a year.
- Dolenjska gostilnas often close on Sunday evenings — check opening hours.
- The best time to visit: September and October, for the harvest and the koline season.`,
    image: "/content/cvicek-in-dolenjska-kuhinja.jpg",
    category: "kulinarika",
    author: "Petra Kovač",
    date: "2026-07-12",
    readTime: 6,
    relatedDestination: "novo-mesto",
  },
  {
    slug: "bohinj-pozimi",
    title: "Bohinj in Winter: Skiing, Hikes and Warm Baths",
    excerpt:
      "Bohinj in winter is a quiet, snowy paradise. Skiing on Vogel, hikes to Komna and relaxation in warm baths — a guide to a winter visit.",
    content: `## Winter peace in Triglav National Park

Bohinj in winter is everything Bled is not — quiet, wild, authentic. When the tourist bustle of Bled settles, Bohinj keeps its calm. Snowy Alpine pastures, a frozen lake and chimney smoke rising from the villages. For a true Alpine winter, Bohinj is the best choice.

## Skiing on Vogel

Vogel is the ski resort with the finest view in Slovenia — Lake Bohinj and Triglav from the cable car. 22 km of runs at 1800 m. Day pass: €37–42. The resort is open from December to April; the best conditions come in February and March.

For families with children the nearby Soriška planina is ideal — smaller, cheaper and less crowded.

## Winter hikes

### Komna (1520 m)
The easiest winter hike. From Koča na Voglu take the lift, then 2 hours' walking to Komna. Overnight in the mountain hut, return the next day. Views of the Julian Alps.

### Savica Waterfall
The famous Savica waterfall is reachable in winter too. A 20-minute walk from the car park. Winter is the most dramatic season — the falls partially freeze.

### Pokljuka
The Pokljuka plateau is a skiing and biathlon arena. Winter tours through the forest and across the plateau, accessible by car.

## A warm bath in nature

Bohinj has a long tradition of warm baths. The best known is the **bathhouse in Stara Fužina** — a wooden building with a dizzy view over the snowy valley. Entry: €25 for 2 hours.

## Where to eat and sleep

- **Hotel Jezero** (Ribčev Laz) — right on the lake, a relaxed atmosphere
- **Penzion Mantova** (Stara Fužina) — a family guesthouse with excellent food
- **Gostilna Rupa** (Stara Fužina) — traditional Bohinj cooking

Budget option: apartments in the village of Srednja vas (€50–70/night).

## Tips for a winter visit

- **Winter gear**: snow chains for the car are mandatory; ski gear rents on Vogel.
- **Forecast**: check mountain conditions before heading into the hills.
- **Slope opening**: Vogel opens with at least 30 cm of snow — follow vogel.si.
- **Lake Bohinj**: check each year whether the lake freezes — never trust the ice unless skating is officially open.

Bohinj in winter is not just a destination — it is an experience of peace and nature at its most authentic.`,
    image: "/content/bohinj-pozimi.jpg",
    category: "narava",
    author: "Lara Zupan",
    date: "2026-04-18",
    readTime: 6,
    relatedDestination: "bohinj",
  },
  {
    slug: "kolesarjenje-ob-dravi",
    title: "Cycling the Drava: From Maribor to Ptuj",
    excerpt:
      "The Drava cycling trail is one of the finest in Slovenia. 35 km from Maribor to Ptuj through vineyards and villages. A guide to a perfect day trip.",
    content: `## A cycling paradise along the Drava

The Drava cycling trail is a 35 km route from Maribor to Ptuj that runs alongside the Drava river. One of the most popular cycling paths in Slovenia, suitable for families and leisure riders. The terrain is flat, asphalted and separated from car traffic.

## The start: Maribor

Begin in Maribor, on the Lent — the oldest part of the town by the Drava. See the Old Vine (the oldest grapevine in the world, 400+ years) and the Main Square. Before picking up your rental bike (€15/day), fortify yourself with a local coffee in one of the Lent cafés.

## Cycling through the Haloze vineyards

After 10 km you leave Maribor and enter the Haloze vineyards. The trail winds along the Drava past villages:
- **Mariborsko jezero** — a reservoir lake with a summer beach
- **Kamnica** — the first village with a wine cellar
- **Limbuš** — locally known for its riverside terrace with a view
- **Selnica ob Dravi** — a traditional farming village

## A stop in Vurberk

Halfway lies Vurberk — a village with a castle (a 13th-century fortification) and one of the oldest wine cellars in the region. Stop for lunch at the Vurberk gostilna — traditional Štajerska cooking with a Rhenish riesling.

## Arrival in Ptuj

After 35 km and 3–4 hours in the saddle you arrive in Ptuj — the oldest town in Slovenia. Be sure to see:
- **Ptuj Castle** on the hill above the town, with its museum
- **The Old Square** with its Baroque town hall
- **The Roman remains** — relics of Poetovio
- **Terme Ptuj** — to unwind after the ride

## Bike rental and logistics

- **Rental**: in Maribor at Sobotnič stations (€15/day)
- **Return**: in Ptuj at the Sobotnič outlet, or ride back to Maribor by train (€5)
- **Your own bike**: allowed everywhere; a helmet is a must
- **Local transport**: the Ptuj–Maribor train runs hourly, bike transport €3

## Tips

- **Best time**: April to October. Prettiest in May (orchards in blossom) and September (harvest).
- **Weather**: summer afternoons can be windy — expect a prevailing northerly.
- **Gear**: a hat, sunglasses and at least 2 litres of water per person.
- **Families**: the trail suits children from about 8 years up. For younger kids we recommend a bike trailer.

Cycling the Drava is the ideal day trip — nature, history and cuisine rolled into one unforgettable ride.`,
    image: "/content/kolesarjenje-ob-dravi.jpg",
    category: "avantura",
    author: "Matej Horvat",
    date: "2026-05-22",
    readTime: 5,
    relatedDestination: "maribor",
  },
  {
    slug: "kam-na-pohorju",
    title: "Exploring Pohorje: A Guide to Skiing, Hiking and More",
    excerpt:
      "Pohorje is Slovenia's largest mountain range — skiing, hiking, a gondola and traditional cuisine. A guide to the best spots on the Pohorje massif.",
    content: `## Pohorje — Slovenia's largest massif

Pohorje is Slovenia's largest mountain range, stretching from Maribor to Slovenj Gradec. In winter a ski resort; in summer a hiking paradise. Length 60 km, the highest peak Črni vrh (1543 m). The best-known centres: Mariborsko Pohorje, Ribniško Pohorje and Kope.

## Skiing in winter

### Mariborsko Pohorje
Slovenia's largest ski resort with 41 km of runs and the biggest night-skiing operation. Home of the legendary Golden Fox (the women's World Cup giant slalom). Day pass: €33–40. Open from December to March.

### Ribniško Pohorje
A family resort, less visited. 13 km of runs, ideal for beginners and children. Day pass: €25–30. Holiday chalets and apartments nearby.

### Kope
The westernmost part of Pohorje on the Austrian border. A smaller resort, great for ski touring and cross-country skiing.

## Hiking in summer

### Črni vrh (1543 m)
The highest peak of Pohorje. The trailhead is in Slovenj Gradec, 4–5 hours' walking. On the summit a lookout tower with the finest view over Koroška.

### Bistriški slom
One of the loveliest waterfalls on Pohorje. 20 m high, reachable by car. Entry €3, open May to October.

### Lovrenška jezera
Seven high moorland lakes at 1500 m. Reached from Hoče on a 3-hour walk. Unique flora and fauna.

## Tourism and attractions

### The Mariborsko Pohorje gondola
The newest attraction — a gondola from the edge of Maribor to the top of Pohorje. A 10-minute ride with panoramic views over the town and vineyards. Return ticket: €12.

### The Hubelj springs
The largest spring on Pohorje, feeding the Hubelj river. Reached from Slovenj Gradec, 1.5 hours on foot.

### Boč
The easternmost outpost of Pohorje, a botanical reserve with rare plants. The hike from Poljčana takes 2 hours.

## Pohorje specialities

- **Pohorski žlikrofi** — the local take on Idrija žlikrofi, filled with chicken
- **Pohorska omaka** — a thick mushroom sauce over žganci
- **Bukovniška voda** — a traditional birch sap drink from local trees
- **Pohorje cheese** — a hard cheese from farmhouse dairies on the pastures

## Where to sleep

- **Hotel Arena** (Mariborsko Pohorje) — a modern 4* hotel by the slopes
- **The Črni vrh mountain hut** — a simple hut on the summit, overnight €25
- **Turistična kmetija Žigon** (Ribnica na Pohorju) — a farmhouse with food
- **Apartmaji Ribnica** — self-contained apartments, €50–70/night

## Tips

- **Ski passes**: book online in advance (20% off)
- **Hiking trails**: check they are open before you set out
- **Families**: Mariborsko Pohorje is best for children (an all-round offer)
- **Evening activity**: night skiing on Mariborsko Pohorje every Friday and Saturday

Pohorje is a year-round destination with something for every taste — from adrenaline on the slopes to peace in the forest.`,
    image: "/content/kam-na-pohorju.jpg",
    category: "nasveti",
    author: "Blaž Zupan",
    date: "2026-09-08",
    readTime: 7,
    relatedDestination: "maribor",
  },
  {
    slug: "slapovi-slovenije",
    title: "The Waterfalls of Slovenia: The 10 Finest to Visit",
    excerpt:
      "Slovenia is a land of waterfalls — from the 80-metre Boka to the most-visited Šum. Discover the 10 most beautiful waterfalls and how to visit them.",
    content: `## A land of waterfalls

Slovenia is one of the richest countries in the world for waterfalls by area. More than 300 major falls, most of them in the Alpine and pre-Alpine regions. They are natural jewels that brighten any hike. Here are the 10 finest.

## 1. Boka Waterfall (106 m)

Slovenia's highest waterfall, plunging from below the Bokova peč wall into the Soča valley. Reached from the village of Žaga near Bovec (1 hour's walk). Most dramatic in spring, when the flow is strongest.

## 2. Savica Waterfall (78 m)

Slovenia's most famous waterfall — it closes Vintgar Gorge and feeds Lake Bohinj. France Prešeren found the inspiration for his poem "The Baptism at the Savica" right here. Entry €3, reachable by car.

## 3. Kozjak Waterfall (15 m)

Slovenia's most picturesque waterfall, hidden in the Kozjak gorge near Kobarid. It drops into a karst chamber surrounded by a green-blue pool. Entry €3, a 20-minute walk from Kobarid.

## 4. Peričnik Waterfall (52 m)

A waterfall in the village of Gozd Martuljek, just 5 km from Kranjska Gora. Double-tiered, with a path behind the curtain of water. Reachable by car, free of charge.

## 5. Šum Waterfall (13 m)

The fall that closes Vintgar Gorge. Slovenia's most-visited waterfall thanks to the gorge. Gorge entry €10.

## 6. Rinka Waterfall (90 m)

A waterfall in the Logar Valley (the Solčava region). One of Slovenia's finest, plunging from below the Okrešelj amphitheatre. Entry €3, drivable to the trailhead.

## 7. Kozjača Waterfall (30 m)

A hidden fall in the Kamniška Bistrica valley. A 3-hour walk from the trailhead, at its best in May and June.

## 8. Virje Waterfall (12 m)

A smaller but romantic fall in the village of Virje on the Bistrica river. Reachable by car, perfect for a summer swim.

## 9. Bistriški slom (20 m)

A waterfall on Pohorje near Bistrica. Reachable by car, entry €3. Best for families.

## 10. Iglica Waterfall (28 m)

A fall in the Vrata valley below Triglav. It plunges from beneath the face of Mojstrovka. Reachable by car, visible from the main road.

## The best time to visit

- **Spring (April–June)**: the strongest flow, the most dramatic look
- **Summer (July–August)**: less water, but easier access and stable weather
- **Autumn (September–October)**: the leaves in colour, fewer visitors
- **Winter**: some falls freeze — a unique sight, though access is harder

## Gear for waterfall visits

- **Hiking boots** — the rock is slippery
- **A hat and sunglasses** — reflections even in the shade
- **A polarising filter** for your camera — it cuts reflections on the water
- **A rain jacket** — at high flow you will feel the spray

## Tips

- **Respect nature**: never step into the water near a fall — erosion can give way
- **Safety**: keep children under watch — the pools are deep
- **Photography**: morning or evening light works best

Slovenia's waterfalls are a natural gallery you can tour in a single adventure.`,
    image: "/content/slapovi-slovenije.jpg",
    category: "narava",
    author: "Lara Zupan",
    date: "2026-05-09",
    readTime: 7,
  },
  {
    slug: "ljubljana-v-48-urah",
    title: "Ljubljana in 48 Hours: The Perfect Weekend Itinerary",
    excerpt:
      "How to make the most of 48 hours in Ljubljana? A guide to the best sights, restaurants and hidden corners of the Slovenian capital.",
    content: `## Ljubljana — small but enchanting

Ljubljana is one of Europe's smallest capitals — barely 300,000 residents. But what it lacks in size it makes up in charm. A medieval castle on the hill, the Dragon Bridge, the green banks of the Ljubljanica and a lively food scene. 48 hours is enough for a full taste.

## Day 1: History and culture

### Morning (9:00–13:00)
Start on **Prešeren Square** — the main square with the Dragon Bridge and Plečnik's church. Walk the Triple Bridge into **Plečnik's Open-Air Market** — a covered market with local food.

At 10:00 take the **funicular up to Ljubljana Castle** (€10 return). At the top visit the museum, the lookout tower and the virtual fortress. Lunch in the castle restaurant with a view over the city.

### Afternoon (14:00–18:00)
Stroll the **Old Square** — the town's oldest street, lined with Baroque houses. Visit the **City Museum** and the **Museum of Contemporary History**. Unwind by the Ljubljanica with a coffee in one of the river cafés.

### Evening (19:00–)
Dinner at **Restavracija As** — Michelin-recommended Slovenian cooking. After dinner wander **Metelkova** — the alternative quarter with street art and colour.

## Day 2: Nature and local life

### Morning (9:00–12:00)
Breakfast at **Kavarna Zvezda** (traditional Slovenian pastries). Walk through **Tivoli Park** — Ljubljana's largest park, with ponds and exhibitions in Tivoli Mansion.

At 11:00 visit the **Botanical Garden** — the oldest in Slovenia (1810). Entry is free.

### Afternoon (13:00–18:00)
Lunch at **Gostilna As** or **Čolnarna** — local cooking. In the afternoon see the **Museum of Modern Art** (Moderna galerija) on Cankarjevo nabrežje.

Take a short bus ride to **Šiška** — the bohemian quarter along Trubarjeva cesta, full of boutiques, cafés and street festivals.

### Evening (19:00–)
A farewell dinner at **Restavracija JB** — the peak of Slovenian gastronomy. After dinner, a concert at **Križanke** (summer festival) or a glass of wine in one of the Old Square wine bars.

## The best restaurants

- **Restavracija As** (€€€) — author's Slovenian cuisine
- **Restavracija JB** (€€€) — Janez Bratovž, a Michelin recommendation
- **Sestica** (€€) — traditional Slovenian cooking
- **Čolnarna** (€€) — a bar on the Ljubljanica
- **Klobasarna** (€) — Carniolan sausage for a quick lunch

## Hidden gems for two days

- **The Prešeren Monument** at sunset
- **Plečnik's House** — the architect's home museum
- **Krakovo** — the emblematic quarter of wooden houses
- **Šance** — the remains of the medieval ramparts by the Castle

## Tips

- **The Ljubljana Card** (€15) — free public transport and discounts
- **Free guided tours** with local guides daily at 11:00
- **Weather**: Ljubljana is among the rainier cities in Slovenia — always carry a rain jacket
- **Public transport**: city buses run every 10–15 minutes, a ticket €1.30

## Local tips

- **Weekend**: on Saturday morning visit the Open Kitchen food market (March–October)
- **Festivals**: the Ljubljana Summer Festival (July–August), Trnfest (August)
- **Coffee**: best at Kavarna Zvezda or Čolnarna
- **Bread**: from the Pekarna Pečar bakery

Ljubljana is a city you discover slowly. 48 hours is enough for a taste — but you will want more.`,
    image: "/content/ljubljana-v-48-urah.jpg",
    category: "kultura",
    author: "Maja Dolenc",
    date: "2026-09-05",
    readTime: 8,
    relatedDestination: "ljubljana",
  },
  {
    slug: "prekmurska-gibanica-zgodovina-in-recept",
    title: "Prekmurska Gibanica: History, Legend and the True Recipe",
    excerpt:
      "Prekmurska gibanica is the queen of Slovenian desserts. Discover its history, the wedding legend and the authentic traditional recipe to make at home.",
    content: `## The queen of Slovenian desserts

Prekmurska gibanica is Slovenia's most famous dessert. A layered cake of curd cheese, poppy seeds, walnuts and apples, each layer separated by stretched dough. Protected with the Traditional Reputation mark since 2010. Only one gibanica is authentic — the one from Prekmurje.

## History and legend

The first written mention of prekmurska gibanica dates to 1828, when Jožef Košič recorded it in his work on Prekmurje. Legend has it that the gibanica was a wedding dish — the bride had to bake one for the groom before the wedding. If it was good, the marriage was blessed.

Another legend says the gibanica was reserved for the most honoured guests — each layer standing for one of the four seasons: curd cheese (spring), poppy seeds (summer), walnuts (autumn), apples (winter).

## Ingredients

### For the dough:
- 500 g plain flour
- 200 ml warm water
- 100 g butter (melted)
- 1 egg
- A pinch of salt

### For the layers:
- **Curd cheese**: 500 g curd cheese, 2 eggs, 100 g sugar, 1 vanilla sugar
- **Poppy seed**: 200 g ground poppy seeds, 100 g sugar, 200 ml milk
- **Walnut**: 200 g ground walnuts, 100 g sugar, 100 ml milk
- **Apple**: 500 g apples (grated), 50 g sugar, 1 tablespoon of cinnamon

### For brushing:
- 200 g butter (melted, for brushing)

## Method

### 1. The dough (30 min)
Knead all the ingredients into a smooth, elastic dough. Divide into 8 equal pieces. Cover with a cloth and rest for 30 minutes.

### 2. Stretching the dough
Stretch each piece on a damp cloth as thin as you can — thin enough to see through. This is the key to a true gibanica.

### 3. Layering the tin
1. Butter the base of the tin (30×20 cm)
2. Lay the first sheet of dough on the base, brush with butter
3. Second sheet — spread with the curd cheese layer
4. Third sheet — spread with poppy seeds
5. Fourth sheet — spread with walnuts
6. Fifth sheet — spread with apples
7. Sixth sheet — spread with curd cheese again
8. Seventh sheet — spread with poppy seeds again
9. Eighth sheet — the top, brushed with butter

### 4. Baking (60 min)
Bake at 180 °C for about 60 minutes, until the top is golden. If it browns too fast, cover with foil.

### 5. Cooling
Leave it to cool for 2 hours. Cut into 12 pieces.

## Where to try the real thing

- **Slaščičarna Murska** (Murska Sobota) — the best known
- **Lendavska slaščičarna** (Lendava) — a true Prekmurje gibanica
- **Kmečko gospodarstvo Novak** (Ptuj) — the farmhouse version
- **Slaščičarna Zvezda** (Ljubljana) — the Ljubljana take

## Facts and figures

- The weight of one gibanica: ~2 kg
- Calories per piece: ~450 kcal
- Price in a pastry shop: €2.50–3.50 per piece
- Price of a whole tray: €20–30

## Baking tips

- **The dough**: it must be elastic enough to stretch thin. If it tears, add a little water.
- **Curd cheese**: use full-fat curd for a creamy texture.
- **The oven**: preheat for 15 minutes for an even bake.
- **Storage**: up to 5 days in the fridge, up to 3 months in the freezer.

Prekmurska gibanica is not just a dessert — it is Slovenian culinary heritage in every bite.`,
    image: "/content/prekmurska-gibanica-zgodovina-in-recept.jpg",
    category: "kulinarika",
    author: "Petra Kovač",
    date: "2026-06-15",
    readTime: 7,
    relatedDestination: "murska-sobota",
  },
  {
    slug: "vinogradi-stajerske-turizem",
    title: "The Vineyards of Štajerska: A Guide to Wine Tourism",
    excerpt:
      "Štajerska is one of Slovenia's most important wine regions. Discover the best cellars, tastings and places to stay among the vines.",
    content: `## Štajerska — Slovenia's Tuscany

The Štajerska wine region is one of the loveliest wine districts in Central Europe. Rolling vineyards above the Drava, traditional cellars and modern architectural gems. Viticulture here dates to Roman times, and today's winemakers blend tradition with modern technique.

## The best-known cellars

### 1. The Old Vine House (Maribor)
The cellar beside the oldest grapevine in the world (400+ years). Tastings of modra frankinja and other Štajerska varieties. Guided tours with a sommelier.

### 2. Ptujska klet Pullus (Ptuj)
One of the oldest wine cellars in Slovenia (1239). Known for its yellow muscat and laški rizling. Cellar tour with a tasting of 5 wines.

### 3. Vinogradništvo Spodnja Polaneč (Haloze)
A family cellar in the Haloze hills. Specialising in native varieties. A view over the Drava and Boč from the top of the vineyard.

### 4. Verus (Ormož)
A modern cellar with an innovative approach. Known for Sauvignon and Traminer. Contemporary architecture among the vines.

### 5. Vina Kvitsiani (Ljutomer)
A family cellar in Prlekija. Traditional varieties grown organically. Tastings with prleška gibanica.

## Native Štajerska varieties

### Modra frankinja
The best-known Štajerska red. Fresh, with a raspberry aroma. Serve at 14–16 °C.

### Rumeni muškat
A sweet white with an intense floral aroma. An aperitif or a dessert wine.

### Renski rizling
A classic white with a mineral nose. Serve with fish or poultry.

### Traminec
An aromatic white with a rose scent. The traditional Slovenian wedding wine.

### Žlahtnina
A native Štajerska white. Fresh, gentle, with a fruity aroma.

## Wine tours

### One-day Maribor tour
- Morning visit to the Old Vine (Maribor)
- Tasting at the Old Vine House cellar
- Lunch at a restaurant by the Drava
- Afternoon tour of Maribor
- Price: €60–80 per person

### Two-day Haloze tour
- Day 1: Maribor + the Old Vine, overnight among the vineyards
- Day 2: Haloze (Vinogradništvo Polaneč), Ptujska klet Pullus, Ptuj
- Price: €180–220 per person

### Three-day Štajerska tour
- Day 1: Maribor + the Vinska vigred festival (March)
- Day 2: Haloze + Jeruzalem
- Day 3: Ptuj + Ormož + Ljutomer
- Price: €350–450 per person

## The best stays among the vines

- **Hotel Brot** (Maribor) — central, a modern 4*
- **Vinogradniška hiša Špičak** (Haloze) — family accommodation
- **Bed & Breakfast Verus** (Ormož) — a modern B&B in the vineyards
- **Vinska klet Pullus Apartment** (Ptuj) — an apartment above the cellar

## The best time to visit

- **March**: Vinska vigred (Maribor) — the biggest wine festival
- **May**: the vineyards in flower, at their most beautiful
- **September–October**: the harvest, festivals, tastings
- **November**: martinovanje (St Martin's Day, 11 November) — the christening of the young wine

## Tips

- **Tastings**: book at least 2 days ahead, especially in summer
- **Driving**: public transport in Štajerska is thin — a rental car is recommended
- **Local festivals**: every weekend in September and October there is a harvest somewhere
- **Views**: the finest panorama is from the top of Mariborsko Pohorje

## What to take home

- **Modra frankinja** (Maribor) — the best-known Štajerska wine
- **Rumeni muškat** (Haloze) — sweet, for special occasions
- **Žlahtnina** (Jeruzalem) — a native variety, rare elsewhere
- **Pumpkin-seed oil** (Prekmurje) — the perfect partner to Štajerska wines

The Štajerska wine district is not just a wine destination — it is a culinary and natural experience you will remember for a long time.`,
    image: "/content/vinogradi-stajerske-turizem.jpg",
    category: "kulinarika",
    author: "Petra Kovač",
    date: "2026-08-18",
    readTime: 8,
    relatedDestination: "ptuj",
  },
  {
    slug: "triglavski-narodni-park-vodic",
    title: "Triglav National Park: A Guide to Slovenia's Only National Park",
    excerpt:
      "Triglav National Park is the only national park in Slovenia. 840 km² of Alpine nature with peaks, valleys, lakes and waterfalls. Discover its finest corners.",
    content: `## Slovenia's only national park

Triglav National Park (TNP) is Slovenia's only national park, founded in 1981. It covers 840 km² in the north-west of the country — nearly the whole extent of the Julian Alps. It is named after Triglav (2864 m), Slovenia's highest peak, which crowns the national coat of arms.

## Three protection zones

TNP is divided into three zones with different protection regimes:

- **Zone 1 (strict reserve)**: 4% of the area, no human impact
- **Zone 2 (first protection)**: 33% of the area, limited activities
- **Zone 3 (cultivated landscape)**: 63% of the area, farmland and settlements

## The most beautiful valleys

### The Trenta Valley
The best-known valley in TNP, home to the source of the Soča. Hikes to the Alpine pastures, the winding road up to Vršič.

### The Vrata Valley
The valley below Triglav's north face. The trailhead for the ascent via the Triglavska koča hut.

### The Krma Valley
A peaceful valley with Alpine pastures. Reachable by car, the trailhead for Triglav via Kredarica.

### The Tamar Valley
A closed valley on the Austrian border. Skiing in winter, hiking in summer.

## The best-known lakes

### Lake Bohinj
Slovenia's largest natural lake, within TNP. 4 km long, up to 45 m deep. The Vogel cable car, Savica waterfall, fishing.

### Lake Bled
Lake Bled is not inside TNP, but it lies at the park's edge. The famous island with its church.

### The Krn lakes
High mountain lakes in the Julian Alps. Krnsko jezero (1383 m) is the largest high-altitude lake in Slovenia.

## Hikes in TNP

### The ascent of Triglav (2864 m)
Slovenia's most famous hike. Via the Triglavska koča hut (2 days), or in one day for the experienced. The Aljaž Tower on the summit.

### Savica Waterfall
A short walk from Bohinj. A 78 m fall, the inspiration for Prešeren's "The Baptism at the Savica".

### Komna (1520 m)
An Alpine pasture above Bohinj with a view of the Julian Alps. 2 hours' walking from Koča na Voglu.

### Krn (2244 m)
A summit hike with a view over the Soča valley. 4 hours from Lom. A front line during the First World War.

### Mangart (2679 m)
Slovenia's third-highest peak. Reached via the Mangart saddle, a demanding hike.

## Natural sights

### The Soča gorges
Natural pools carved into the limestone along the Soča. Several sites: Kobarid, Bovec, Srpenica.

### Tolmin Gorge
Slovenia's deepest gorge (60 m down). The confluence of the Soča and the Tolminka.

### Vintgar Gorge
A 1.6 km gorge along the Radovna river. Wooden walkways beside crystal-clear water.

### Boka Waterfall
Slovenia's highest waterfall (106 m). Reached from the village of Žaga near Bovec.

## Wildlife in TNP

- **The chamois** — the most common large animal in the Julian Alps
- **The ibex** — the rarest, a deliberately reinforced population
- **The grey wolf** — the rarest beast, a protected species
- **The brown bear** — present but rarely seen in TNP
- **The golden eagle** — the largest bird in the Alps

## Where to sleep

### Mountain huts
- **Triglavska koča na Doliču** (2151 m) — the Triglav trailhead
- **Koča na Voglu** (1535 m) — above Bohinj
- **Dom v Tamarju** (1100 m) — in the Tamar valley
- **Koča pri Izviru Soče** (760 m) — Trenta

### Hotels and apartments
- **Hotel Jezero** (Lake Bohinj) — a 4* on the lakeside
- **Hotel Dolec** (Kobarid) — a boutique hotel
- **Apartmaji Bovec** — family apartments in Bovec

## Tips for your visit

- **The best time**: June to September, when the huts are open and the weather stable
- **Gear**: hiking boots, a rain jacket, warm layers (it is cold in the mountains even in summer)
- **Weather**: always check the forecast before a hike
- **Entry fees**: there is no general entry fee to TNP, but some attractions (Vintgar, Savica) charge
- **Parking**: most car parks are paid (€3–5/day)
- **Public transport**: in summer, buses run to the hiking trailheads

## Protecting the park

- Do not pick the flowers (they are protected)
- Do not pollute the water (not even with soap)
- Do not stray off the marked paths
- Do not approach the wildlife
- Carry your rubbish out

Triglav National Park is Slovenia's natural treasure. Respect it, so it stays beautiful for the generations to come.`,
    image: "/content/triglavski-narodni-park-vodic.jpg",
    category: "narava",
    author: "Blaž Zupan",
    date: "2026-08-08",
    readTime: 9,
    relatedDestination: "triglav",
  },
];

/** EN različica getPostBySlug (isti pogodbeni niz slugov kot SL). */
export function getPostBySlugEn(slug: string): BlogPost | undefined {
  return BLOG_POSTS_EN.find((p) => p.slug === slug);
}

/** EN različica getPostsByCategory (isti vrstni red filtrov kot SL). */
export function getPostsByCategoryEn(
  category: BlogCategory | "all"
): BlogPost[] {
  if (category === "all") return BLOG_POSTS_EN;
  return BLOG_POSTS_EN.filter((p) => p.category === category);
}
