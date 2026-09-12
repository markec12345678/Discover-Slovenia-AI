// ADRIA-EN — angleški prevod jadranskih vodnikov 1–2 (iz part1.ts vrstice 1–390).

import type { AdriaGuide } from "../adria-guides/types";

export const ADRIA_GUIDES_EN_1_2: AdriaGuide[] = [
  // 1. The crown road trip Ljubljana → Dubrovnik in eight days.
  {
    slug: "ljubljana-dubrovnik-road-trip",
    title: "Ljubljana to Dubrovnik road trip: the definitive Adriatic route in eight days",
    metaTitle: "Ljubljana to Dubrovnik road trip: Plitvice, Split, Ston",
    description:
      "Eight days and 1,500 kilometres from Ljubljana to Dubrovnik: Plitvice at opening time, Diocletian's Palace, the Pelješac Bridge and oysters in Ston.",
    excerpt:
      "The longest Adriatic route you can still do comfortably in a single holiday: Plitvice, Split, Dubrovnik and Ston, around 1,500 kilometres in all.",
    route: "Ljubljana → Plitvice → Split → Dubrovnik → Ston → Ljubljana",
    countries: ["SI", "HR"],
    days: 8,
    km: 1500,
    heroImage: "/adria/ljubljana-dubrovnik-road-trip.jpg",
    heroAlt:
      "View from Dubrovnik's city walls over the old town's red roofs towards the islet of Lokrum and the wide blue of the Adriatic",
    author: "Tanja Novak",
    date: "2026-07-21",
    readTime: 11,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 0,
        highlight:
          "Starting point and the last night at home: from Ljubljana it is a good 250 kilometres by motorway past Zagreb to Plitvice, and the first stage begins before dawn.",
      },
      {
        name: "Plitvice",
        country: "HR",
        nights: 1,
        highlight:
          "A night on the edge of the park and entry at opening time: the upper and lower lakes, waterfalls and wooden boardwalks that the crowds have not yet claimed at that hour.",
      },
      {
        name: "Split",
        country: "HR",
        nights: 2,
        highlight:
          "Diocletian's Palace, where people still live their daily lives, coffee on the Riva and the climb up Marjan for views of the islands — two days is just right.",
      },
      {
        name: "Dubrovnik",
        country: "HR",
        nights: 3,
        highlight:
          "Three nights for a city that lives up to its reputation: the City Walls in the early morning, the islet of Lokrum by boat, and evenings beneath the walls instead of afternoon crowds.",
      },
      {
        name: "Ston",
        country: "HR",
        nights: 1,
        highlight:
          "Walls above the town, salt pans and oysters from Mali Ston on the trip's last night; the final day is one long motorway stage home.",
      },
    ],
    sections: [
      {
        heading: "Eight days on the longest route from Ljubljana",
        body: [
          "Of all the trips you can make from Ljubljana to the Adriatic, this is the longest that still fits comfortably within a single holiday. Split is roughly 460 kilometres away, Dubrovnik around 690, and with the return leg and the detour via Plitvice the odometer settles at about 1,500. Eight days is the lower limit at which this loop remains a holiday rather than a series of driving stages: any attempt shorter than that sacrifices one of the stops, while every extra day hands back those few hours you would otherwise spend watching the sea from the car.",
          "The rhythm is deliberate. Day one runs down the motorway past Zagreb to Plitvice, a good 250 kilometres; day two threads through the park and continues to Split in the afternoon, after which the driving calms down. Split gets two nights, Dubrovnik three, because it is the most expensive of the stops and deserves more than a single raid; Ston at the base of the Pelješac peninsula adds one last genuine Adriatic evening. The final day is long — Ston to Ljubljana is some 620 kilometres — which is why it starts at dawn.",
        ],
      },
      {
        heading: "Plitvice: tickets, timings and crowds",
        body: [
          "Entry costs between roughly €25 and €40 depending on the season: in winter the park is at its cheapest and quietest, while in July and August it is at its dearest and fullest. Buy peak-season tickets online, because daily quotas can sell out, and go for the earliest available slot. Opening hours shift with the season — at the height of summer the park opens around seven — which is precisely why a night near the park is not an indulgence but a tactic: in the morning you are at the gate before the first tour bus.",
          "You cannot abolish the crowds, but you can sidestep them. At weekends the boardwalks fill from late morning onwards, with the largest numbers between ten and two. The plan is as old as the park itself: complete the first part of your visit before nine, then take the longer route around the lower lakes, where the crush thins out. The visit takes four to six hours of walking on wooden boardwalks and demands comfortable shoes; leave the swimming costumes for later, as swimming in the lakes is not allowed.",
        ],
        list: [
          {
            title: "Tickets online",
            text: "In July and August the daily quotas sell out; buy your ticket in advance and choose the earliest available time slot.",
          },
          {
            title: "Enter at opening time",
            text: "At the height of the season the park opens around seven; by nine the first coaches are already at the gate.",
          },
          {
            title: "Weekdays over weekends",
            text: "Monday and Friday are still human days; Saturday brings the most visitors, and Sunday mornings are full of day-trippers.",
          },
          {
            title: "Choosing your route",
            text: "The longer loop around the lower lakes takes more hours but is far less crowded; the shorter route turns the visit into a single morning.",
          },
        ],
      },
      {
        heading: "Split: a palace people live in",
        body: [
          "Diocletian's Palace is not a monument you visit but a town people live in: flats, cafés and shops have grown into the Roman walls, and the Peristyle has lost its emperor and gained a crowd. The palace itself is free; you pay for the cellars and the cathedral bell tower, and both are worth the price for turning a stroll into a proper visit. For a view over the complete ring of walls and the islands, climb the bell tower — slowly, because there are plenty of steps.",
          "The Riva is the street you remember: a palm-lined seafront where the morning begins with coffee by the water. Above the city rises Marjan, a wooded hill with stone steps and viewpoints; half an hour's walk and the whole of Split lies below you. Two nights is the right measure for Split: one day for the palace, the Riva and Marjan, the other for an excursion — Trogir is half an hour away, while Brač and Hvar are reached by ferry from the harbour, one that requires a reservation in season.",
        ],
      },
      {
        heading: "The Pelješac Bridge and the story of Neum",
        body: [
          "Until July 2022 the only road link between Split and Dubrovnik ran through the narrow Bosnian corridor at Neum. Over twenty kilometres you would cross the border twice — entering Bosnia and Herzegovina at Karasovići and returning to Croatia at Debeli Brijeg — and at each checkpoint you would sit in a queue that in summer could stretch to an hour or more. Experienced drivers knew how to bypass the corridor on the winding roads across the Pelješac peninsula, but most simply swallowed the border as part of the journey south.",
          "The Pelješac Bridge, opened in July 2022, closed that chapter: the crossing above Mali Ston is today an ordinary motorway stage, and from Split to Dubrovnik is around 200 kilometres without a single checkpoint. You need nothing for the drive across the bridge that you would not have anyway — tolls are settled by section as elsewhere — and after the crossing the road descends onto Pelješac, a peninsula of vineyards and oyster farms that is in itself a reason to deceive your satnav at least once.",
        ],
      },
      {
        heading: "Dubrovnik: the City Walls, Lokrum and the early morning",
        body: [
          "The City Walls are why people come to Dubrovnik, and the thing most of them get wrong. The full circuit measures a good 2,000 metres of stone path with no shade in summer, and the ticket is among the pricier on the Adriatic. There is no miracle that changes this, but there is the hour: at opening you are on the ramparts ahead of the crowds and ahead of the sun, and by eleven you are down below with a coffee as the parasols open above you. Budget a good two hours, water and a hat.",
          "Lokrum is the other half of a Dubrovnik morning: a boat from the old harbour takes ten minutes to reach an islet with a botanical garden, a salt lake and cliffs for jumping; the last return sailing leaves before evening, which is worth remembering before you settle into a café. For accommodation, bear in mind that the old town is the most expensive part of the city: in Lapad and Gruž you are a good half hour's walk away, and a night can cost a third less. In August that is not a saving but an extra night.",
        ],
      },
      {
        heading: "Ston, oysters and the long stage home",
        body: [
          "Ston, at the base of the Pelješac peninsula, is Dubrovnik's opposite: walls, but without the crowds; salt pans that run on a centuries-old order; and konoba taverns where the shellfish come from farms you can see through the window. Some five kilometres of medieval fortifications snake above the town; the climb takes about an hour and a half, and the reward is Pelješac on one side and the bay on the other. The oysters of Mali Ston are eaten on the shore itself, and oysters in a cool bag travel home with you for Sunday breakfast.",
          "The final day is around 620 kilometres from Ston to Ljubljana — long, but on the motorway without surprises, so start it at dawn and allow yourself a break every two hours. If you can stretch by a day, split the return with a night on the Kvarner riviera or in Zadar: Opatija and Crikvenica break up the northern half of the stage, while Zadar adds one last sunset by the Sea Organ. Either way the loop ends as it should — with a view of the sea that lasts until the very last motorway junction.",
        ],
      },
    ],
    practical: [
      {
        title: "Plitvice: tickets and timings",
        text: "Entry costs between €25 and €40 depending on the season; in July and August buy online, for the earliest available slot. Start your visit at the park's opening — by ten at weekends the boardwalks are already at their busiest. Swimming in the lakes is not allowed, and children's and student tickets are cheaper.",
      },
      {
        title: "HAC tolls by section",
        text: "Croatia has no vignette: tolls are paid at toll booths section by section, by card or cash, and for this loop budget around €50 to €60. The Slovenian e-vignette covers only the domestic stretch of the journey; a weekly one for a car costs around €16. For frequent crossings an ENC device pays for itself.",
      },
      {
        title: "Dubrovnik City Walls",
        text: "The circuit measures a good 2,000 metres and in summer there is no shade: at opening the path is still empty, by eleven it is full. The ticket is among the pricier on the Adriatic and the walk takes a good two hours. Bring water and a hat, and buy your ticket for the first slot of the day.",
      },
      {
        title: "Sleeping along the way",
        text: "At Plitvice, guesthouses in Rakovica, Grabovac and Korenica stand fifteen minutes from the entrances and fill up first in season. In Split, a bed west of the centre saves money without losing time; in Dubrovnik, Lapad and Gruž are cheaper than the old town. For July and August, book at least three months ahead.",
      },
      {
        title: "Border, documents and money",
        text: "Croatia is in the European Union, in the Schengen area and, since 1 January 2023, in the eurozone: there are no more border checks between Slovenia and Croatia, and an identity card suffices as a document. A currency exchange never comes into it; cards are accepted everywhere, though keep some cash for markets and small konoba taverns.",
      },
      {
        title: "Crowds and cruise ships",
        text: "Every major stop on this route has the same enemy: the afternoon. Do Plitvice and the City Walls at opening, and Dubrovnik's old town after six, when the tour groups return to their ships. In Dubrovnik the best days are those with no cruise ship in port; the arrival schedule is public — check it the day before.",
      },
      {
        title: "When to go",
        text: "June and September are the loveliest months on this route: the sea is warm, the crowds smaller, the accommodation cheaper. July and August bring the peak of everything, congestion included. May is fresh and very well suited to Plitvice, while October in the south is often still warm enough for the City Walls.",
      },
    ],
    faqs: [
      {
        question: "How much does it cost to enter Plitvice?",
        answer:
          "Between roughly €25 and €40 depending on the period: least in winter, most in July and August. Children and students get discounts, and the ticket includes the boat ride across the largest lake. For peak season buy it online, because daily quotas can sell out.",
      },
      {
        question: "Do I cross the Bosnian border on the way to Dubrovnik?",
        answer:
          "No. Until July 2022 the road ran through the Neum corridor with two checkpoints — Karasovići on entering Bosnia, Debeli Brijeg on returning to Croatia — and in summer an hour or more could pass at each. The Pelješac Bridge has closed the route inside Croatia; from Split to Dubrovnik is today around 200 kilometres without a border crossing.",
      },
      {
        question: "When is the best time to walk the City Walls?",
        answer:
          "At opening, in summer between seven and eight in the morning. The path measures a good 2,000 metres and has no shade, so the afternoon is unwise both for the heat and for the crowds. Water and a hat are essential, and the walk takes a good two hours.",
      },
      {
        question: "How much in tolls will I pay on this loop?",
        answer:
          "On Croatian motorways from Ljubljana via Plitvice and Split to Dubrovnik and back, budget roughly €50 to €60 depending on the return route. Tolls are paid by section at toll booths; there is no Croatian vignette. In Slovenia the e-vignette applies, covering only the domestic part of the journey.",
      },
      {
        question: "Is eight days enough for this loop?",
        answer:
          "Yes, but with no reserve for the excursions you will hear about along the way. The core — Plitvice, Split, Dubrovnik and Ston — is done comfortably in eight days; a ninth would go to Hvar or the Kvarner riviera. Shorter than seven days we do not recommend, because the trip turns into a drive.",
      },
      {
        question: "Where to sleep near Plitvice?",
        answer:
          "In the surroundings of Rakovica, Grabovac or Korenica, fifteen minutes from the entrances. The accommodation is mostly guesthouse-style and fills up first in season, so book early. A night near the park is a tactic: in the morning you are at the gate before the first coach.",
      },
      {
        question: "What to see on the way back from Ston?",
        answer:
          "The basic version drives home in a single day, around 620 kilometres, and starts at dawn. If you have a day more, split the return with a night on the Kvarner riviera — Opatija, Crikvenica — or in Zadar. In Zadar, by the Sea Organ, this trip gets one last sunset.",
      },
    ],
    relatedSlugs: [
      "slovenija-hrvaska-10-dni",
      "bled-plitvice-split",
      "hrvaska-obala-prakticni-vodnik",
    ],
    relatedSloveniaIds: ["ljubljana", "bled", "postojna"],
  },

  // 2. The combined holiday: Slovenia + Croatia in ten days — "both holidays in one".
  {
    slug: "slovenija-hrvaska-10-dni",
    title: "Slovenia and Croatia in ten days: two holidays in one",
    metaTitle: "Slovenia and Croatia in 10 days: Bled, Plitvice, Split",
    description:
      "Ten days, 1,350 kilometres: Bled, Ljubljana and Postojna first, then Plitvice, Zadar and Split, and Piran to finish. For locals and visitors alike.",
    excerpt:
      "A ten-day plan that folds the Alpine world, the karst underworld and the Adriatic coast into a single holiday — written for locals showing guests everything, and for visitors who want both.",
    route: "Ljubljana → Bled → Postojna → Plitvice → Zadar → Split → Piran",
    countries: ["SI", "HR"],
    days: 10,
    km: 1350,
    heroImage: "/adria/slovenija-hrvaska-10-dni.jpg",
    heroAlt:
      "Lake Bled with its island and castle above the water, the Julian Alps in the background under morning light",
    author: "Marko Kovač",
    date: "2026-07-24",
    readTime: 12,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 0,
        highlight:
          "Arrival day and the first stroll: the old town along the Ljubljanica, Prešeren Square and an evening by the river, before the road bends towards Lake Bled the next morning.",
      },
      {
        name: "Bled",
        country: "SI",
        nights: 2,
        highlight:
          "Two nights for the lake with its islet, the castle on the cliff, Vintgar Gorge and an excursion to Bohinj — the Alpine part of the holiday, where morning fog counts as an attraction.",
      },
      {
        name: "Postojna",
        country: "SI",
        nights: 0,
        highlight:
          "A one-day stop on the way south: the caverns of Postojna Cave by miniature train, the exhibition of cave-dwelling creatures and Predjama with its castle set into the cliff face, then the wheel turns towards Plitvice.",
      },
      {
        name: "Plitvice",
        country: "HR",
        nights: 1,
        highlight:
          "A night by the park and entry at opening: sixteen lakes in cascades, waterfalls between them and wooden boardwalks along which the walking stretches to half a day.",
      },
      {
        name: "Zadar",
        country: "HR",
        nights: 2,
        highlight:
          "The Sea Organ on the quay, a sunset that plays in a league of its own in Zadar, and an old town grown out of Roman streets — two nights is just right for the rhythm of the coast.",
      },
      {
        name: "Split",
        country: "HR",
        nights: 3,
        highlight:
          "Three nights for the largest city on this route: Diocletian's Palace, the Riva, Marjan and excursions to Hvar, Brač or Trogir — the choice depends on the wind.",
      },
      {
        name: "Piran",
        country: "SI",
        nights: 1,
        highlight:
          "The last night on the Slovenian coast: Piran's old town on the headland, a fish dinner and the Sečovlje salt pans, and only an hour and a half from home.",
      },
    ],
    sections: [
      {
        heading: "The idea: two holidays in one",
        body: [
          "For Slovenes this plan answers the question that returns every summer: guests are here for a week and want to see everything, from Bled to the sea. Instead of showing them only the domestic half, you take them across the border and hand them both worlds in a single holiday — the Alps, the karst underworld, waterfalls and the coast, some 1,350 kilometres in all, divided so that no day is purely driving. Your guests see Slovenia the way you see it yourselves: a country with the sea within the reach of one holiday.",
          "For visitors the same route fits just as well, because it is anchored on Ljubljana: you land at Brnik, hire a car and in ten days drive the best combination this corner of Europe offers. The cross-border element is no complication here — since 1 January 2023 Croatia has been with us in the Schengen area and in the euro, so there is neither a currency exchange nor a checkpoint, only the sea that Slovenia itself lacks. Ten days is the right length: shorter would squeeze Split, longer would lose its shape.",
        ],
      },
      {
        heading: "The first days: Ljubljana, Bled, Bohinj",
        body: [
          "The first evening belongs to Ljubljana, because every such journey begins and ends there: a walk along the Ljubljanica across the Triple Bridge, the square at dusk and the funicular up to the castle if the day still holds. The next morning the road goes to Bled, a good 55 kilometres or under an hour's drive, where the trip first stops in earnest. Two nights by the lake mean a morning of mist over the water, a walk around the lake and a pletna boat out to the island; the second day disappears into Vintgar or Bohinj, depending on who decides in the car.",
          "The Alpine part comes first for a reason. In July the mornings in Gorenjska are fresh — a pleasant contrast to what follows later — and nobody would return to the mountains at the end of the trip. Bled is also the gentlest possible start for guests: everyone knows it from photographs, and the first walk along the lake wins over the entire car. On day three you drive from Bled through Ljubljana and south, across the border for the first time — a border you will not even notice.",
        ],
      },
      {
        heading: "Underground en route: Postojna and Predjama",
        body: [
          "From Bled you drive to Postojna Cave through Ljubljana, around 105 kilometres in all, so with a morning detour for coffee it is under two hours. The cave runs on timed entries: the little train carries you to the caverns, through which you walk for another hour and a half, and inside it is between eight and ten degrees all year, so a jacket comes along even when it is thirty outside. Buy your timed ticket in advance — the best morning slots sell out in season.",
          "A kilometre further on stands Predjama, a castle wedged into a cliff face above a cave through which knights once reached their water. The visit is short and made for the afternoon, after which the road turns seriously south: from here it is some 220 kilometres to Plitvice — via Rijeka along the coast or via Zagreb on the motorway, depending on whether lorries or hairpins annoy you more. The night is spent at the edge of the park, because an early-morning entry is not a recommendation but a condition.",
        ],
      },
      {
        heading: "Plitvice: the crossing into another country",
        body: [
          "The night at Plitvice is part of the tactic. Entry costs between €25 and €40 depending on the period, and at weekends the boardwalks fill before the morning is out, so you sleep fifteen minutes from the entrance and walk in at opening: sixteen lakes in cascades, waterfalls between them and wooden boardwalks along which the walking stretches to half a day — at nine you can still hear the water, by eleven only see it. For guests this is usually the day they mention most on the way home.",
          "In the afternoon you drive from the park to Zadar, some 110 kilometres by motorway or a good hour, arriving in time for a swim and a first dinner on the coast. This stage is the backbone of the plan: do it once, and after that the route only descends along the coast towards Split and back. If you run short of breath, the only shortcut permitted is the final Bled day — never the order of stops, or you will find yourselves backtracking.",
        ],
      },
      {
        heading: "The coast: Zadar and three days in Split",
        body: [
          "Zadar is an introduction to the coast that works better than it sounds. The old town on the peninsula grew out of Roman streets, and on the western quay stands the Sea Organ — steps with pipes beneath them, into which the waves push air and play their own part. Beside it is the Greeting to the Sun, a circle that pulses in the evening, next to a sunset Alfred Hitchcock called the most beautiful in the world. Two nights is just right: one day for the old town and a swim, the other for an excursion to Ugljan if the group opts for a boat rather than a car.",
          "Split is the journey's largest stop and its most urban stretch: three nights mean Diocletian's Palace, which the residents carry on their backs every day, the morning Riva, the evening Marjan hill and time for an excursion. Trogir is half an hour away, and ferries from the harbour run to Hvar and Brač — reserve one in season if you intend to take the car on deck. Choose accommodation in the western part of the city or near Bačvice, where parking does not become a daily debate.",
        ],
      },
      {
        heading: "Piran: a farewell on the Slovenian side",
        body: [
          "The final stage is the longest and the only one that demands a full day: from Split to Piran is some 490 kilometres along the coast road, and a little more by motorway via Zagreb. Set off in the morning, and with an afternoon arrival Piran gives you exactly what you need by then: the sea within arm's reach, narrow streets without cars and a fish dinner on the headland. The night in Piran is the trip's most expensive — and worth every euro.",
          "The last night in Slovenia is as practical as it is sentimental: Slovenes are home in an hour and a half the next day, while visitors drive to Brnik along the same road they arrived on. In the morning you can head for the Sečovlje salt pans, for one last look at the white fields of salt basins, and then the journey that began on the Ljubljanica ends on the same river. With that the plan comes full circle, and the group wakes up at home the next morning — which is all you want from a holiday.",
        ],
      },
    ],
    practical: [
      {
        title: "Border, documents, money",
        text: "Croatia is in the European Union and the Schengen area, and since 1 January 2023 in the eurozone too: there are no border checks, an identity card suffices, and a currency exchange never comes into it. Cards are accepted everywhere; keep cash for markets and small konoba taverns. The European Health Insurance Card is valid in both countries.",
      },
      {
        title: "HAC tolls",
        text: "A Croatian vignette does not exist: tolls are paid by section at HAC toll booths, by card or cash, and for the Croatian part of this plan budget around €40 to €50. The Slovenian e-vignette covers only the domestic stretch; a weekly one for a car costs around €16. For frequent journeys an ENC device pays off.",
      },
      {
        title: "Plitvice: ticket and time slot",
        text: "Between €25 and €40 depending on the period; in July and August buy the ticket online and choose the earliest slot. At weekends enter at the park's opening, as the boardwalks fill before the morning is out. The ticket includes the boat ride across the largest lake.",
      },
      {
        title: "Postojna Cave",
        text: "Tours are guided and run to a timetable; reserve your slot in advance, as morning times sell out in season. In the cave it is 8 to 10 degrees all year, and a jacket is compulsory even in August. Predjama is a kilometre away and pairs nicely with the cave tour for an afternoon.",
      },
      {
        title: "Reservations",
        text: "Bled, Zadar, Split and Piran fill up early for July and August; three months ahead is the safe margin. At Plitvice choose among the guesthouses in Rakovica, Grabovac and Korenica. In Split look for accommodation with a parking space, and in Piran decide between the old town and the cheaper surroundings.",
      },
      {
        title: "One car, several worlds",
        text: "The plan is built for a single car: every stage is under three hours, except the last day, which starts early. There is no miracle solution to four people's luggage — pack by day, not by person. Everyone should keep water, sunscreen and a jacket to hand, because the weather changes between stops.",
      },
      {
        title: "When to go",
        text: "June and September are optimal: the sea is warm enough, the crowds smaller, the prices lower. In July and August reservations are not a recommendation but a condition. May is glorious for the Alpine part of the trip but too cool for the coast; in October the south still holds a warm sea.",
      },
    ],
    faqs: [
      {
        question: "Do I need a passport for Croatia?",
        answer:
          "No, an identity card is enough: Croatia is in the European Union and the Schengen area. The same applies to children — each needs their own document. Take a passport only if you plan an extension into Bosnia, Montenegro or Albania.",
      },
      {
        question: "What is the border between Slovenia and Croatia like?",
        answer:
          "There are no more checks: since Croatia joined the Schengen area on 1 January 2023 you drive across the border as on a domestic road. Only traffic needs planning, as the coastal roads are slow of their own accord at the height of the season. Choose your route by driving time, not by borders.",
      },
      {
        question: "How do I pay tolls in Croatia?",
        answer:
          "By section at HAC toll booths — there is no vignette. You can pay in cash or by card, and for frequent journeys an ENC device exists. In Slovenia the same car needs an e-vignette, which covers only Slovenian roads; a weekly one costs around €16.",
      },
      {
        question: "How much does it cost to enter Plitvice?",
        answer:
          "From roughly €25 to €40 depending on the period, with discounts for children and students. In season buy the ticket online for the earliest slot, because daily quotas run out. The price includes the boat across the largest lake and the entire system of boardwalks.",
      },
      {
        question: "What if I have only seven days instead of ten?",
        answer:
          "Drop one of the coastal stops: without Zadar you reach Split a day earlier, without one Bled day the coast stretches longer. Keep the order of stops — cutting is always cheaper than rearranging. Seven days covers Bled, the cave, Plitvice and Split; Hvar stays for next time.",
      },
      {
        question: "Does this plan work with small children?",
        answer:
          "Yes, because no stage is longer than three hours and every leg has its own paddling pool, so to speak: the lake, the cave, the waterfalls and the sea. Bring children shoes with good soles, as the Plitvice boardwalks are long. The last day is the only long one; do it with breaks and an early start.",
      },
    ],
    relatedSlugs: [
      "ljubljana-dubrovnik-road-trip",
      "bled-plitvice-split",
      "hrvaska-obala-prakticni-vodnik",
      "istria-vikend-iz-slovenije",
    ],
    relatedSloveniaIds: ["bled", "ljubljana", "postojna", "piran"],
  },
];
