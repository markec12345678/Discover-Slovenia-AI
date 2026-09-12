// ADRIA-EN — angleški prevod jadranskih vodnikov 3–4 (iz part1.ts vrstice 380–755).

import type { AdriaGuide } from "../adria-guides/types";

export const ADRIA_GUIDES_EN_3_4: AdriaGuide[] = [
  // 3. A fast week: Bled → Ljubljana → Postojna Cave → Plitvice → Zadar → Split.
  {
    slug: "bled-plitvice-split",
    title: "Bled, Plitvice and Split: a fast week from the Alps to the Adriatic",
    metaTitle: "Bled to Split in 7 days: Plitvice, Zadar, Ljubljana",
    description:
      "Seven days one-way from Bled to Split: Ljubljana, Postojna Cave, Plitvice and Zadar en route — an order that never doubles back, with ticket prices.",
    excerpt:
      "A week that starts at Lake Bled and ends on the Riva in Split — seven days, one direction, no backtracking.",
    route: "Bled → Ljubljana → Postojnska jama → Plitvice → Zadar → Split",
    countries: ["SI", "HR"],
    days: 7,
    km: 900,
    heroImage: "/adria/bled-plitvice-split.jpg",
    heroAlt:
      "Wooden footpaths above the turquoise lakes of Plitvice with waterfalls, and visitors walking them in the morning light",
    author: "Tanja Novak",
    date: "2026-07-28",
    readTime: 9,
    stops: [
      {
        name: "Bled",
        country: "SI",
        nights: 0,
        highlight:
          "The first morning by the lake: a walk around Lake Bled, the castle view from the cliff and pletna boats on the water, then a fifty-minute drive to Ljubljana.",
      },
      {
        name: "Ljubljana",
        country: "SI",
        nights: 1,
        highlight:
          "An evening in the old town on the Ljubljanica, morning coffee at the market and the funicular up to the castle, before the road turns towards the karst underground.",
      },
      {
        name: "Postojnska jama",
        country: "SI",
        nights: 0,
        highlight:
          "An hour and a half underground by little train and on foot among the stalactites; the cave holds between 8 and 10 °C all year, so keep a jacket to hand.",
      },
      {
        name: "Plitvice",
        country: "HR",
        nights: 1,
        highlight:
          "A night beside the park and a morning at opening: cascades of lakes, waterfalls and wooden footpaths — the entrance fee runs from €25 to €40 depending on the season.",
      },
      {
        name: "Zadar",
        country: "HR",
        nights: 2,
        highlight:
          "The Sea Organ on the quay, played by the waves, and a sunset Alfred Hitchcock called the most beautiful in the world — in the evening, not at midday.",
      },
      {
        name: "Split",
        country: "HR",
        nights: 2,
        highlight:
          "Diocletian's Palace as the city's core, the Riva for morning coffee and Marjan for views over the islands; from here it is a good 460 kilometres of motorway home.",
      },
    ],
    sections: [
      {
        heading: "An order that never doubles back",
        body: [
          "This week has one rule worth obeying: it runs in a single direction and never covers the same kilometre twice. The sequence — Bled, Ljubljana, the cave, Plitvice, Zadar, Split — is arranged so that every leg comes in under three hours: fifty minutes from Bled to Ljubljana, a good fifty kilometres from Ljubljana to Postojna, roughly two and a half hours from the cave to Plitvice, and less still from Plitvice to Zadar. The only real drive is saved for the end, and that is the point of it.",
          "Finishing in Split is deliberate. The south is the warmest stretch of the route, so every day added there pays more than a day added in the north; and from Split two exits lead out — the motorway, which returns you to Ljubljana in a single day and a good 460 kilometres, or the airport, with which foreign visitors close the loop without driving back. Slovenes mostly choose the first and sleep the last night at home; both are legitimate, but the decision is made when booking, not in the car park.",
        ],
      },
      {
        heading: "The first 48 hours: lake, city, underground",
        body: [
          "The first morning belongs to Bled: the walk around the lake takes about an hour and a half on the rising and falling footpath, the view of the castle from the cliff comes free along the way, and the pletna boats run for as long as the season lasts. After lunch you drive to Ljubljana, fifty minutes down the motorway, where the evening follows a familiar order: the Triple Bridge, the square, the funicular up to the castle, dinner beside the Ljubljanica. The next morning adds the market and a coffee, then the steering wheel turns south-west.",
          "Postojna Cave is the first stop anyone misjudges: in reality it is an hour and a half of linked chambers, into which the little train merely delivers you, and the tour is guided and runs to time slots — in a cave that holds between 8 and 10 °C all year round, a jacket is not a marketing extra. A kilometre further on stands Predjama, a castle wedged into the rock face; if the day still holds two spare hours, spend them there. By evening you arrive at Plitvice, some 220 kilometres away, and sleep beside the park.",
        ],
      },
      {
        heading: "Plitvice: the hour decides everything",
        body: [
          "Plitvice is the most delicate part of the route because it is the most famous — and because its beauty suffers not only from the weather but from the hour. The entrance fee runs from €25 to €40 depending on the season; in summer you buy it online and for the earliest time slot, because the daily quotas sell out. The park opens to a fixed timetable and at weekends the footpaths fill up before nine. A night beside the park is therefore not a luxury but part of the same tactic.",
          "The visit takes four to six hours depending on the route chosen; the longer loop around the lower lakes is less crowded and more beautiful, while the shorter one fits into a morning. In the afternoon you drive from the park to Zadar, some 110 kilometres by motorway or a good hour, arriving in time for a swim and a first dinner on the coast. That splits the longest inland leg of the trip into two manageable days, and no day is left as nothing but driving.",
        ],
      },
      {
        heading: "Zadar: the organ, the quay and the sunset",
        body: [
          "Zadar is a city that sells itself on three things, and all three are free: the old town on the peninsula, which has kept its Roman grid of streets; the Sea Organ on the western quay; and the sunset that Alfred Hitchcock, not quite accurately, called the most beautiful in the world. The organ is a flight of steps with pipes beneath, into which the waves push air — the sound is more ambience than concert, yet every evening the sunset plays out in front of a full house.",
          "Two nights in Zadar means a morning for Kalelarga and the market, an afternoon for swimming at the nearby pebble beaches, and one evening handed over entirely to the quay. If the group fancies an excursion, boat trips to the Kornati islands leave from here — but this week does not budget for them; they are left to those who took an extra week for the Adriatic. Here Zadar is chiefly a rest between two longer days, and it performs that role superbly.",
        ],
      },
      {
        heading: "Split: a finish with the sea on the doorstep",
        body: [
          "The last two nights are reserved for Split, because this week has the right ending: a city in which anything can happen on the final day — the palace, the Riva, Marjan, a trip to Hvar, or simply sleeping until departure. Diocletian's Palace is a living city core, where you pay not for walking through it but only for individual parts: the cellars and the bell tower. The final evening on the Riva is traditionally the longest evening of the trip.",
          "For Slovenes the road here decides between two options: the drive home in one stretch, a good 460 kilometres of motorway or four and a half hours with breaks, or a split return with a night on the way if the last evening hangs on too long. Foreign visitors have the airport half an hour from the centre and a flight that confirms the good sense of the order. In both cases the same rule holds: next time, start the way you finished — in the south.",
        ],
      },
    ],
    practical: [
      {
        title: "Plitvice: ticket and time slot",
        text: "Between €25 and €40 depending on the season; in July and August buy the ticket online for the earliest slot, as the quotas run out. Enter at the park's opening time — at weekends the footpaths fill before nine. The visit takes four to six hours, so plan a whole morning for it.",
      },
      {
        title: "Postojna Cave",
        text: "Guided tours run to a timetable; book your slot in advance, as mornings in season sell out. The cave holds 8 to 10 °C all year — a jacket even in summer. The full tour with the train and the walk lasts an hour and a half; Predjama is a kilometre away and pairs nicely with the afternoon.",
      },
      {
        title: "Legs and departures",
        text: "Every leg except the last is under three hours; driving days start early so that afternoons stay free. The only long drive is the return from Split — a good 460 kilometres. If that feels too much, split it with a night in Zadar or on the Kvarner.",
      },
      {
        title: "HAC tolls",
        text: "There is no Croatian vignette: you pay tolls by section at HAC toll booths, by card or in cash. Croatian motorways are few on this route — the main sections are Zagreb–Plitvice and the return from Split. The Slovenian e-vignette covers only the home stretch; the weekly one costs around €16.",
      },
      {
        title: "Zadar: the quay without a car",
        text: "The old town is closed to cars: leave yours at a paid car park on the edge and do everything on foot. The Sea Organ and the Greeting to the Sun are on the western quay, a ten-minute walk from any part of the old town. In the evening the sunset is the hour around which everything turns.",
      },
      {
        title: "Split: where to leave the car",
        text: "The palace and the signed city centre are closed to cars; park in the paid zones around the harbour or at Bačvice and walk into the core. A better solution is accommodation with a parking space on the western side of the city. Ferries to the islands leave from the harbour — in season, book ahead if you are taking a car on deck.",
      },
    ],
    faqs: [
      {
        question: "Why does the week end in Split and not in Zadar?",
        answer:
          "Because Split is the best-connected end of this direction: the motorway runs from here straight to Ljubljana, a good 460 kilometres, and foreign visitors are left with the airport. Zadar as the finish would mean a shorter trip, but also less sea at the end. The order is built so that the legs grow shorter towards the close.",
      },
      {
        question: "How much time should I allow for Plitvice?",
        answer:
          "Four to six hours depending on the route; the longer loop around the lower lakes is less crowded. Entering at opening time is the precondition for calm, at weekends especially. The ticket includes the boat ride across the largest lake — take it, as it is part of the experience.",
      },
      {
        question: "When should I listen to the Sea Organ?",
        answer:
          "At sunset, when the quay fills up and the waves rise. The sound depends on the waves and the wind, so no two evenings are the same. The Sea Organ and the Greeting to the Sun are free and accessible all day — they are simply less audible at midday.",
      },
      {
        question: "Can this itinerary be done in five days?",
        answer:
          "It can, at a cost: you cut Bled down to a morning, Ljubljana to an evening, or leave out Zadar. Always keep the order — cuts come out of the stops, never the sequence, or you end up driving back on yourself. Five days covers Bled, the cave, Plitvice and Split.",
      },
      {
        question: "How do I get home from Split?",
        answer:
          "By motorway in a single day: a good 460 kilometres, around four and a half hours with breaks. Set off either early in the morning or after lunch, to avoid the afternoon peak. If you are not in a hurry, split the return with a night in Zadar or on the Kvarner.",
      },
      {
        question: "Is Postojna Cave worth the stop if we have already seen it?",
        answer:
          "It depends how long ago it was. The tours do repeat themselves, and cutting it is allowed: drive straight on to Plitvice and save a good two hours. Skip it and you lose the only karst stretch of the journey — that is the entire cost.",
      },
    ],
    relatedSlugs: [
      "slovenija-hrvaska-10-dni",
      "ljubljana-dubrovnik-road-trip",
      "hrvaska-obala-prakticni-vodnik",
    ],
    relatedSloveniaIds: ["bled", "vintgar", "ljubljana", "postojna"],
  },

  // 4. A weekend trip to Istria: Friday–Sunday, coast + hill towns + Pula.
  {
    slug: "istria-vikend-iz-slovenije",
    title: "A weekend in Istria from Slovenia: Piran, the hill towns, Rovinj and Pula",
    metaTitle: "Weekend in Istria from Slovenia: Motovun, Rovinj, Pula",
    description:
      "Friday to Sunday: Piran and the coast first, truffle hills in the middle, Rovinj and Pula to finish. Around 420 kilometres in one weekend.",
    excerpt:
      "Istria is the nearest foreign landscape that behaves as if it were yours: salt, hill towns, truffles and a red roof behind every bend — three days and 420 kilometres.",
    route: "Ljubljana → Piran → Umag → Novigrad → Grožnjan → Motovun → Oprtalj → Rovinj → Pula",
    countries: ["SI", "HR"],
    days: 3,
    km: 420,
    heroImage: "/adria/istria-vikend-iz-slovenije.jpg",
    heroAlt:
      "Motovun on its hill above the Mirna valley, with medieval town walls, vineyards and cypress trees under late-summer light",
    author: "Marko Kovač",
    date: "2026-07-31",
    readTime: 8,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 0,
        highlight:
          "Friday's escape down the motorway towards the coast: a good 130 kilometres to Piran, and the best departure hour is the one that delivers you to the sea before the morning rush.",
      },
      {
        name: "Piran",
        country: "SI",
        nights: 0,
        highlight:
          "Salt and sun as an opener: a walk around Piran's point, Tartini Square and the view from the town walls, before the road crosses the Dragonja into Croatian Istria.",
      },
      {
        name: "Novigrad",
        country: "HR",
        nights: 1,
        highlight:
          "The first night in northern Istria: Novigrad with its konoba taverns along the shore, an afternoon on the beach and a fish dinner; Umag is within easy reach by early evening.",
      },
      {
        name: "Grožnjan",
        country: "HR",
        nights: 0,
        highlight:
          "The artists' village on a hill: galleries in stone houses, studios and a view across the valley that a piano drifting from one of the houses makes last longer still.",
      },
      {
        name: "Motovun",
        country: "HR",
        nights: 0,
        highlight:
          "Istria's most famous hill town: the walls around the old town, views over the Mirna valley and the forests around it, from which come the truffles for your Sunday lunch.",
      },
      {
        name: "Oprtalj",
        country: "HR",
        nights: 0,
        highlight:
          "The quietest of the hill towns: frescoes on the fronts of stone houses, an empty main street and a view that seems to have been made for the weekend.",
      },
      {
        name: "Rovinj",
        country: "HR",
        nights: 1,
        highlight:
          "The centrepiece of the weekend: the old town on the headland, Grisia street, the Church of St Euphemia with its bell tower for the panorama, and a Saturday evening that lasts until midnight.",
      },
      {
        name: "Pula",
        country: "HR",
        nights: 0,
        highlight:
          "The last bend before home: the Roman arena in the city centre, a visit of a good hour and a half, then some 140 kilometres to Ljubljana.",
      },
    ],
    sections: [
      {
        heading: "The logic of three days",
        body: [
          "A weekend in Istria works only if each day points in its own direction. Friday runs straight to the coast: Ljubljana, Piran and across the Dragonja to Umag and Novigrad, where the first night and the still-warm part of the day are waiting. Saturday climbs into the hills — Grožnjan, Motovun, Oprtalj — and drops down in the evening into Rovinj, which deserves the trip's one true night out. Sunday is built from a morning in Rovinj and Pula's arena, which stands some 35 kilometres to the south, and then the road turns for home.",
          "This arrangement is not arbitrary. The coast on Friday afternoon works because the sea is the best way of erasing the working week from your body; the hills on Saturday morning because they are pleasant before the heat and because you arrive while the markets and konobas are still breathing; Rovinj in the evening because its old town was made for the night. Sunday is logistics: Pula lies on the way home with only a small detour, and the arena is a sight you take in between the luggage and lunch by the roadside.",
        ],
      },
      {
        heading: "Friday: Piran, the border and the northern coast",
        body: [
          "From Ljubljana the Slovenian coast is a good hour and a half away; if the day happens to be a Friday in July, add another half hour of patience for the traffic. Piran is a stop this route insists on: a town on a point that grew out of the salt pans, with streets a car has no business searching for. Park outside the old town and walk to Tartini Square; the view of the gulf from the town walls waits above the steps.",
          "The Sečovlje–Dragonja crossing is passed like a local road — Croatia has been in the Schengen area since 1 January 2023, there are no checks, but the crossing is narrow, so summer Fridays and Sundays still drive through with a delay caused not by the police but by the traffic itself. Umag is the first Croatian place on the way: an old core on a point, a marina and a waterfront for a stroll, not for a whole day's stay. Novigrad, ten kilometres to the south, is the station where Friday actually lands — konobas along the shore, a beach and a fish dinner.",
        ],
      },
      {
        heading: "Saturday: hill towns, truffles and malvazija",
        body: [
          "Saturday morning leaves the coast and climbs inland, where Istria changes colour: red earth, vineyards, cypresses and hill towns that look as if they had been piled up on purpose. Grožnjan comes first — an artists' village with galleries in stone houses, which honestly lives off its reputation. Motovun is second and principal: the walls above the Mirna valley, in which Croatia's best-known delicacy hides beneath the oaks.",
          "Truffles are the economy of this valley: in autumn and winter dogs with trained noses pull them out of the forest, while in summer the konobas cook with the oils and preserves sold in the shops of Livade, in the middle of the valley below Motovun. Order fuži — the local hand-rolled pasta — with truffles and a glass of malvazija, the white variety that developed precisely for this terrain, and lunch is done. Oprtalj, the last hill town, is the quietest: frescoes on the house fronts, an empty street and a view that seems to have been made for it.",
        ],
        list: [
          {
            title: "Grožnjan",
            text: "The artists' village with galleries and studios; visit in the morning, when the doors are open and the shade still long.",
          },
          {
            title: "Motovun",
            text: "The walls above the Mirna valley; park below the town and climb the steps in a good ten minutes.",
          },
          {
            title: "Livade",
            text: "The heart of the truffle valley below Motovun; buy oils, pâtés and preserves to carry the weekend on at home.",
          },
          {
            title: "Oprtalj",
            text: "The quietest hill town, with frescoes on its house fronts; a half-hour stop you never regret.",
          },
        ],
      },
      {
        heading: "Rovinj: Saturday night and Sunday morning",
        body: [
          "From the hills Rovinj is a good hour away; arriving after five in the afternoon is intentional, because that is when the town softens. The old core clings to the headland like a nest: Grisia street with its studios, the fishermen's waterfront with its house colours, and the Church of St Euphemia, whose bell tower is the only reason you climb into the old town counting steps. Dinner is in a konoba on the shore, and a Saturday night in Rovinj does not, as a matter of principle, end at midnight.",
          "Sunday morning belongs to the empty town: before eight the streets hold only fishermen and bakers, the bell tower opens in the morning, and the view from the ring around the church reaches across the coast all the way to the gulf. That hour is the reason the second night is spent here and not in Pula: the weekend wakes up in the town that is at its most beautiful in the morning, then sets off home with a stop everyone knows.",
        ],
      },
      {
        heading: "Sunday: Pula and the leg home",
        body: [
          "Pula lies some 35 kilometres from Rovinj, and its amphitheatre is the largest monument you will meet on this weekend: a first-century arena in which spectators once sat for gladiators, and today in summer for concerts. The visit takes a good hour and a half with the surroundings, and the city core is a short walk away. The entrance fee is not negligible, but the arena belongs to those things whose value is not up for negotiation.",
          "Home is a good two hours away — some 140 kilometres through Buje, Plovanija and Koper. You cannot abolish Sunday return traffic, but you can step around it: if you leave Pula before eleven, you are on the Slovenian side before the coastal road turns into a column of cars. The weekend thus closes at roughly 420 kilometres, three days and one small debt to be settled next time — in Istria there is always some unfinished street left over.",
        ],
      },
    ],
    practical: [
      {
        title: "The border on the Dragonja",
        text: "There are no checks: Croatia has been in the Schengen area since 1 January 2023. But the crossing at Sečovlje is narrow, and on summer Fridays and Sundays the traffic holds itself up — a half-hour delay is not rare. Do the cross-border leg early in the morning, not at eleven.",
      },
      {
        title: "Sleeping in two bases",
        text: "The Friday night in northern Istria — Umag, Novigrad — is cheaper than the Saturday one in Rovinj, so change base the way this plan dictates. For July and August, book two to three months in advance. Outside the peak, a room can still be found in the same week.",
      },
      {
        title: "Truffles: when and where",
        text: "Fresh truffles come with autumn and winter; in summer the konobas prepare their dishes from oils and preserves. In Livade, below Motovun, shopping is the homely plan: oil and pâté survive the journey home and still smell of the weekend. Buy white truffles only in season, by the gram and from trusted dealers.",
      },
      {
        title: "Tolls and the vignette",
        text: "In Istria you drive on state roads, where there are no tolls; there is practically no motorway on this route. The Slovenian e-vignette covers the home part — the weekly one costs around €16 — and a Croatian vignette is not needed, because one does not exist. Fuel is comparable on both sides.",
      },
      {
        title: "Parking in the towns",
        text: "In Piran park outside the old town and go in on foot; in Motovun at the car park below the town, with the climb done on the steps. In Rovinj choose a paid zone on the edge of the old town, and in Pula the car parks by the arena. Leave nothing on show in the car.",
      },
      {
        title: "When to go to Istria",
        text: "May, June, September and October are the finest months for the hills; July and August for the sea, but with crowds that are no joke in Rovinj. The end of September is the golden period: a warm sea, the start of truffle season and lower prices. For a first visit, take a warm month.",
      },
    ],
    faqs: [
      {
        question: "How many kilometres is this weekend?",
        answer:
          "Around 420: a good 130 from Ljubljana to Piran, another good 30 on Friday as far as Novigrad, some 100 on Saturday over the hills to Rovinj, and Sunday with Pula takes the remainder. The whole thing is done in three days without a single long drive.",
      },
      {
        question: "How long does crossing the border on the Dragonja take?",
        answer:
          "A few minutes, and there are no checks — Croatia is in the Schengen area. At the height of the season, though, the traffic stops at the crossing of its own accord: the queue is a consequence of the narrow road, not of the police. Hence early in the morning or late in the evening, not at five in the afternoon.",
      },
      {
        question: "When is truffle season?",
        answer:
          "Autumn and winter: the white truffle peaks from October to December, and in summer there are no fresh ones. Oils, pâtés and dishes made from preserved truffles are on offer all year, and they are better than they sound. Come back in September or October for the fresh ones.",
      },
      {
        question: "Is the climb up to Motovun worth it?",
        answer:
          "Yes — the car park is below the town, the climb up the steps takes a good ten minutes, and at the top there are walls with a view over the Mirna valley. In scorching heat, do the climbing in the morning. The inside of the town is smaller than you expect, but that is precisely why it works.",
      },
      {
        question: "What is there to do with children?",
        answer:
          "The northern coast is made for children: the beaches in Novigrad and Umag are shallow and well kept. In the hills the climbs are short, but pushchairs do not work — carry younger children in a sling. Pula's arena makes an impression on everyone, and in Rovinj children are at their best on the quay with an ice cream.",
      },
      {
        question: "Where should we eat?",
        answer:
          "In konobas, not restaurants: the northern coast for fish, the hills for fuži with truffles and local pršut ham, Rovinj for all of it together with malvazija. A reservation for Saturday dinner in Rovinj is wisdom, not pedantry. For ice cream, the rule of the shortest queue applies.",
      },
    ],
    relatedSlugs: [
      "slovenija-hrvaska-10-dni",
      "hrvaska-obala-prakticni-vodnik",
      "hrvaski-otoki-iz-slovenije",
    ],
    relatedSloveniaIds: ["piran", "portoroz", "ljubljana"],
  },
];
