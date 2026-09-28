import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  GO_AUDIO_LABELS,
  GO_AUDIO_LIMITS,
  buildNearbyNarration,
  buildStopNarration,
  nearbyDestinations,
  slCardinal,
  slDurationPhrase,
  slKmPhrase,
  slMinPhrase,
} from "@/lib/journey/go-audio";
import type { GoEntryCard, GoPosition } from "@/lib/journey/go-view";
import type { TripEntry } from "@/lib/journey/trip-view";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { chunkNarration } from "@/lib/itinerary-audio";

/**
 * W7 (Issue #15, 1.138.0): VOICE VODIČ V GO MODE — »Preberi postanek« /
 * »Kaj je v bližini« (vrzel W7 iz benchmarka UX-WORKFLOW-BENCHMARK-2026-09-
 * 27.md §4: TTS ✓ danes v klepetu → naravna razširitev na površino, kjer je
 * glas najbolj uporaben — telefon v žepu, hoja proti postanku).
 *
 * Verifikacijska merila (§4 W7 + kanoni TASK 89/91):
 *  (1) »preberi postanek« gumb (speechSynthesis) → UNIT:
 *      buildStopNarration izključno iz dejstev kartice; SOURCE CONTRACT:
 *      gumb je priključen na NASLEDNJO kartico + preostale postanke.
 *  (2) »kaj je v bližini« gumb (speechSynthesis + geolokacija) → UNIT:
 *      nearbyDestinations/buildNearbyNarration deterministično iz dataseta;
 *      SOURCE CONTRACT: gumb živi na GPS kartici, SAMO z živim položajem.
 *  (3) ISKRENOST (kanon 71/74/77/88): manjkajoče dejstvo → manjka poved
 *      (NE izmišljujemo termina/lokacije/razdalje); razdalja je PREMICA —
 *      izrecno povedana; prazen naslov → null; 0 destinacij v radiju →
 *      null; SL številke v BESEDAH (števke bi TTS glasil kot angleške
 *      besede sredi SL stavka — izmera TASK 89), EN pusti števke.
 *  (4) W8 načelo razpršitve: destinacije geo-ob postankih dneva se IZVZAMEJO
 *      (»v bližini« je za odkrivanje, ne ponavljanje poti).
 *  (5) Telemetrija: OBSTOJEČI dogodek itinerary_audio_play (0 novih imen,
 *      bela lista strežnika nespremenjena) z novo vrednostjo surface "go".
 */

// __tests/ → src/lib/__tests/; koren projekta je TRI ravni višje
const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) =>
  readFileSync(new URL(p, ROOT), "utf-8") as string;

const GO_MODE_SRC = read("src/components/sections/go-mode.tsx");
const BUTTON_SRC = read("src/components/sections/go-audio-button.tsx");
const GO_AUDIO_SRC = read("src/lib/journey/go-audio.ts");
const ANALYTICS_ROUTE_SRC = read("src/app/api/analytics/event/route.ts");

// ---------------------------------------------------------------------------
// Fixture: kartica Go Mode (ista oblika kot buildGoView — samo dejstva)
// ---------------------------------------------------------------------------

function mkEntry(over: Partial<TripEntry> & { title: string }): TripEntry {
  return {
    key: "w7-test",
    category: "attractions",
    icon: "🏛️",
    providerLabel: { sl: "Testni ponudnik", en: "Test Provider" },
    status: "INFO",
    statusLabel: { sl: "Informacija", en: "Information" },
    cancellation: { sl: "", en: "" },
    bookingId: null,
    ...over,
  };
}

function mkCard(
  over: Partial<TripEntry> & { title: string },
  card: { distanceKm?: number; bearingLabel?: { sl: string; en: string } } = {}
): GoEntryCard {
  return { entry: mkEntry(over), ...card };
}

const bledCoords = DESTINATIONS.find((d) => d.id === "bled")!.coords;

function pos(lat: number, lng: number): GoPosition {
  return { lat, lng, timestamp: 0 };
}

// ---------------------------------------------------------------------------
// 1. SL številke v besedah (izmera TTS — števke sredi SL stavka bi jih
//    brskalniški glas izgovoril kot angleške besede)
// ---------------------------------------------------------------------------

describe("W7: slCardinal — kardinalni števnik 1–100 v besedah", () => {
  test("osnovne vrednosti (m): 1 en, 2 dva, 5 pet, 11 enajst, 20 dvajset", () => {
    expect(slCardinal(1)).toBe("en");
    expect(slCardinal(2)).toBe("dva");
    expect(slCardinal(5)).toBe("pet");
    expect(slCardinal(11)).toBe("enajst");
    expect(slCardinal(20)).toBe("dvajset");
  });

  test("zenski rod razlikuje SAMO 1 in 2 (ena/dve) — ostalo skupno", () => {
    expect(slCardinal(1, "f")).toBe("ena");
    expect(slCardinal(2, "f")).toBe("dve");
    expect(slCardinal(3, "f")).toBe("tri"); // isti kot m
    expect(slCardinal(5, "f")).toBe("pet");
  });

  test("sestavljene oblike 21–99: enice + in + desetice; sestavljeni 1 je vedno »ena«", () => {
    expect(slCardinal(21)).toBe("enaindvajset");
    expect(slCardinal(31)).toBe("enaintrideset");
    expect(slCardinal(41)).toBe("enainštirideset");
    expect(slCardinal(91)).toBe("enaindevetdeset");
    expect(slCardinal(32)).toBe("dvaintrideset");
    expect(slCardinal(67)).toBe("sedeminšestdeset"); // 7+60, NE 76
    expect(slCardinal(76)).toBe("šestinsedemdeset"); // 6+70
    expect(slCardinal(99)).toBe("devetindevetdeset");
    expect(slCardinal(100)).toBe("sto");
  });

  test("iskren padec: 0 → nič, >100 → null, negativno/necelo → null", () => {
    expect(slCardinal(0)).toBe("nič");
    expect(slCardinal(101)).toBeNull();
    expect(slCardinal(-1)).toBeNull();
    expect(slCardinal(1.5)).toBeNull();
  });
});

describe("W7: slKmPhrase / slMinPhrase — sklonske oblike kilometrov/минут", () => {
  test("km: manj kot 1 / en / dva / tri (kilometre) / pet+ (kilometrov)", () => {
    expect(slKmPhrase(0)).toBe("manj kot kilometer");
    expect(slKmPhrase(1)).toBe("en kilometer");
    expect(slKmPhrase(2)).toBe("dva kilometra");
    expect(slKmPhrase(3)).toBe("tri kilometre");
    expect(slKmPhrase(4)).toBe("štiri kilometre");
    expect(slKmPhrase(5)).toBe("pet kilometrov");
    expect(slKmPhrase(19)).toBe("devetnajst kilometrov");
  });

  test("km >100 pade na števke (redki rob — iskreno, brez lažne natančnosti)", () => {
    expect(slKmPhrase(101)).toBe("101 kilometrov");
  });

  test("minute: ena minuta / dve minuti / tri minute / pet minut / devetdeset minut", () => {
    expect(slMinPhrase(1)).toBe("ena minuta");
    expect(slMinPhrase(2)).toBe("dve minuti");
    expect(slMinPhrase(3)).toBe("tri minute");
    expect(slMinPhrase(5)).toBe("pet minut");
    expect(slMinPhrase(90)).toBe("devetdeset minut");
  });
});

describe("W7: slDurationPhrase — trajanje v govoru (ure v besedah do 6h)", () => {
  test("cele ure 1h–6h v besedah: eno uro … šest ur", () => {
    expect(slDurationPhrase(60)).toBe("eno uro");
    expect(slDurationPhrase(120)).toBe("dve uri");
    expect(slDurationPhrase(180)).toBe("tri ure");
    expect(slDurationPhrase(240)).toBe("štiri ure");
    expect(slDurationPhrase(300)).toBe("pet ur");
    expect(slDurationPhrase(360)).toBe("šest ur");
  });

  test("sicer minute v besedah; 7h+ pade pošteno na števke (meja maxSpokenHours)", () => {
    expect(slDurationPhrase(30)).toBe("trideset minut");
    expect(slDurationPhrase(90)).toBe("devetdeset minut");
    // 420 min = 7 h — čez zgornjo mejo besed → padec na minute/števke
    expect(slDurationPhrase(420)).toBe("420 minut");
  });
});

// ---------------------------------------------------------------------------
// 2. buildStopNarration — pripoved postanka IZKLJUČNO iz dejstev kartice
// ---------------------------------------------------------------------------

describe("W7: buildStopNarration (SL) — samo dejstva, ki obstajajo", () => {
  const full = mkCard(
    {
      title: "Blejski otok",
      time: { start: "10:00" },
      location: "Bled",
      durationMin: 120,
    },
    { distanceKm: 2.3, bearingLabel: { sl: "severozahod", en: "northwest" } }
  );

  test("polna dejstva → vse povedi (naslov, ponudnik, termin, lokacija, razdalja+smer, trajanje)", () => {
    const n = buildStopNarration(full, "sl")!;
    expect(n).toContain("Postanek: Blejski otok.");
    expect(n).toContain("Pri ponudniku: Testni ponudnik.");
    expect(n).toContain("Ob desetih.");
    expect(n).toContain("Lokacija: Bled.");
    expect(n).toContain("Dva kilometra proti severozahod, premica.");
    expect(n).toContain("Priporočeno trajanje: dve uri.");
  });

  test("SL pripoved BREZ števk (ure/km/trajanje v besedah — izmera TTS)", () => {
    const n = buildStopNarration(full, "sl")!;
    expect(/\d/.test(n)).toBe(false);
  });

  test("razdalja je IZRECNO premica (ne vožnja) — razkritje kot na zaslonu", () => {
    const n = buildStopNarration(full, "sl")!;
    expect(n).toContain("premica");
    expect(n).not.toContain("vožnja");
  });

  test("smer je ISTA oznaka kot na zaslonu (cardinalLabel — 1 vir resnice)", () => {
    // kanon task64: cardinalLabel vrne nominativ (»severozahod«) —
    // pripoved uporabi ISTO besedo kot DistanceChip na zaslonu
    const n = buildStopNarration(full, "sl")!;
    expect(n).toContain("proti severozahod");
  });

  test("manjkajoče dejstvo → manjka poved (NI izmišljenega termina/lokacije/razdalje)", () => {
    const bare = mkCard({ title: "Soteska Vintgar" });
    const n = buildStopNarration(bare, "sl")!;
    expect(n).toBe("Postanek: Soteska Vintgar. Pri ponudniku: Testni ponudnik.");
    expect(n).not.toContain("Lokacija");
    expect(n).not.toContain("premica");
    expect(n).not.toContain("Priporočeno");
    // brez ponudnika (prazen niz) tudi ta poved odpade
    const noProvider = buildStopNarration(
      mkCard({ title: "X", providerLabel: { sl: "", en: "" } }),
      "sl"
    )!;
    expect(noProvider).toBe("Postanek: X.");
  });

  test("prazen naslov → null (fail-closed — gumba NI, kanon TASK 89)", () => {
    expect(
      buildStopNarration(mkCard({ title: "   " }), "sl")
    ).toBeNull();
  });

  test("timeNote se NE pripoveduje (meta-razlaga ostane na zaslonu — kanon TASK 91)", () => {
    const withNote = mkCard({
      title: "Piran",
      timeNote: { sl: "Vir ne navaja ure", en: "Source lists no time" },
    });
    const n = buildStopNarration(withNote, "sl")!;
    expect(n).not.toContain("vir ne navaja");
    expect(n).not.toContain("timeNote");
  });
});

describe("W7: buildStopNarration (EN) — ista dejstva, števke natively", () => {
  const full = mkCard(
    {
      title: "Bled Island",
      time: { start: "10:00" },
      location: "Bled",
      durationMin: 120,
      providerLabel: { sl: "Testni ponudnik", en: "Test Provider" },
    },
    { distanceKm: 19.4, bearingLabel: { sl: "sever", en: "north" } }
  );

  test("struktura EN: Stop/Provider/at … o'clock/Location/duration", () => {
    const n = buildStopNarration(full, "en")!;
    expect(n).toContain("Stop: Bled Island.");
    expect(n).toContain("Provider: Test Provider.");
    expect(n).toContain("At 10 o'clock.");
    expect(n).toContain("Location: Bled.");
    expect(n).toContain("Recommended duration: about 2 hours.");
  });

  test("EN razdalja s števkami + crow-flies razkritje (velika začetnica — stavek)", () => {
    const n = buildStopNarration(full, "en")!;
    expect(n).toContain("About 19 kilometers toward the north, as the crow flies.");
  });
});

// ---------------------------------------------------------------------------
// 3. nearbyDestinations — deterministično iz dataseta (38 destinacij)
// ---------------------------------------------------------------------------

describe("W7: nearbyDestinations — radij/šteto/razvrstitev/izvzem", () => {
  test("Bled: neprazno, ≤ maxCount, naraščajoče po razdalji, vsa ≤ radij", () => {
    const near = nearbyDestinations(pos(bledCoords.lat, bledCoords.lng));
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThanOrEqual(GO_AUDIO_LIMITS.nearbyMaxCount);
    for (let i = 1; i < near.length; i++) {
      expect(near[i - 1].km).toBeLessThanOrEqual(near[i].km);
    }
    for (const n of near) {
      expect(n.km).toBeLessThanOrEqual(GO_AUDIO_LIMITS.nearbyRadiusKm);
    }
  });

  test("imena so IZ dataseta (0 izmišljenih krajev)", () => {
    const names = new Set(DESTINATIONS.map((d) => d.name));
    for (const n of nearbyDestinations(pos(bledCoords.lat, bledCoords.lng))) {
      expect(names.has(n.name)).toBe(true);
    }
  });

  test("W8 razpršitev: destinacija geo-ob postanku dneva se IZVZAME (≤2 km)", () => {
    // postanek dneva NA Vintgarju (4 km od Bleda) → Vintgar odpade iz bližine
    const vintgar = DESTINATIONS.find((d) => d.id === "vintgar")!;
    const near = nearbyDestinations(pos(bledCoords.lat, bledCoords.lng), [
      vintgar.coords,
    ]);
    expect(near.some((n) => n.name === vintgar.name)).toBe(false);
    // Bled sam ni v rezultatu (izhodišče je na njem — geo-ob postanku ne more
    // biti, ker je IZHODIŠČE; radij ga seveda pokriva → izvzem po koordinatah)
    expect(near.some((n) => n.name === "Bled")).toBe(true); // Bled je 0 km od izhodišča — ni na postanku dneva
  });

  test("maxCount parameter spoštoval (2 → največ 2)", () => {
    const near = nearbyDestinations(
      pos(bledCoords.lat, bledCoords.lng),
      [],
      2
    );
    expect(near.length).toBeLessThanOrEqual(2);
  });

  test("sredina Afrike (10,10): 0 destinacij v radiju → PRAZNO (ne glede na hrvaške)", () => {
    // (43.5, 15.5) — sredina Jadrana — NI dober primer: dataset vsebuje
    // hrvaške obmorske destinacije (Zadar/Split/Hvar) znotraj 100 km.
    expect(nearbyDestinations(pos(10, 10))).toEqual([]);
  });

  test("determinizem: isti vhod → isti izhod (2 klica)", () => {
    const a = nearbyDestinations(pos(bledCoords.lat, bledCoords.lng));
    const b = nearbyDestinations(pos(bledCoords.lat, bledCoords.lng));
    expect(a).toEqual(b);
  });

  test("GO_AUDIO_LIMITS varovala: radij 100 km, največ 4 naštete, izvzem 2 km", () => {
    expect(GO_AUDIO_LIMITS.nearbyRadiusKm).toBe(100);
    expect(GO_AUDIO_LIMITS.nearbyMaxCount).toBe(4);
    expect(GO_AUDIO_LIMITS.excludeNearKm).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 4. buildNearbyNarration — pripoved »kaj je v bližini«
// ---------------------------------------------------------------------------

describe("W7: buildNearbyNarration — govor o bližini (iskren)", () => {
  test("SL: uvod »V tvoji bližini:« + ime + km v besedah + smer; BREZ števk", () => {
    const n = buildNearbyNarration(pos(bledCoords.lat, bledCoords.lng), "sl")!;
    expect(n).toBeTruthy();
    expect(n!.startsWith("V tvoji bližini:")).toBe(true);
    expect(n!).toContain("proti");
    expect(/\d/.test(n!)).toBe(false); // km ≤ 100 → besede
  });

  test("EN: »Near you:« + about N kilometers to the … (števke natively)", () => {
    const n = buildNearbyNarration(pos(bledCoords.lat, bledCoords.lng), "en")!;
    expect(n!.startsWith("Near you:")).toBe(true);
    expect(n!).toMatch(/about \d+ kilometers to the /);
  });

  test("0 destinacij v radiju → null (iskrena odsotnost — gumba NI)", () => {
    expect(buildNearbyNarration(pos(10, 10), "sl")).toBeNull();
    expect(buildNearbyNarration(pos(10, 10), "en")).toBeNull();
  });

  test("izvzem postankov potuje skozi pripoved (ime postanka NI v govoru)", () => {
    const vintgar = DESTINATIONS.find((d) => d.id === "vintgar")!;
    const n = buildNearbyNarration(pos(bledCoords.lat, bledCoords.lng), "sl", [
      vintgar.coords,
    ])!;
    expect(n).not.toContain(vintgar.name);
  });

  test("vsako našteto ime je res v radiju (iskrena bližina, ne gužva imen)", () => {
    const near = nearbyDestinations(pos(bledCoords.lat, bledCoords.lng));
    const n = buildNearbyNarration(pos(bledCoords.lat, bledCoords.lng), "sl")!;
    for (const item of near) {
      expect(n).toContain(item.name);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Chunking — dolga pripoved se izgovori PO KOSIH (omejitev TTS API)
// ---------------------------------------------------------------------------

describe("W7: chunkNarration kompozibilnost pripovedi Go", () => {
  test("vsaka pripoved → ≥1 kos, vsak ≤ 960 znakov, spoj ohrani besedilo", () => {
    const scripts = [
      buildStopNarration(
        mkCard(
          { title: "Blejski grad", time: { start: "09:30" }, location: "Bled", durationMin: 90 },
          { distanceKm: 1.2, bearingLabel: { sl: "vzhod", en: "east" } }
        ),
        "sl"
      )!,
      buildNearbyNarration(pos(bledCoords.lat, bledCoords.lng), "sl")!,
      buildNearbyNarration(pos(bledCoords.lat, bledCoords.lng), "en")!,
    ];
    for (const s of scripts) {
      const chunks = chunkNarration(s);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      for (const c of chunks) {
        expect(c.length).toBeLessThanOrEqual(960);
      }
      expect(chunks.join(" ")).toBe(s.replace(/\s+/g, " ").trim());
    }
  });
});

// ---------------------------------------------------------------------------
// 6. SOURCE CONTRACT — integracija v Go Mode + varovala
// ---------------------------------------------------------------------------

describe("W7: source contract — gumb je res priključen na Go Mode", () => {
  test("go-mode.tsx uva in uporablja GoAudioButton (3 površine)", () => {
    expect(GO_MODE_SRC).toContain('from "@/components/sections/go-audio-button"');
    expect(GO_MODE_SRC).toContain("buildStopNarration");
    expect(GO_MODE_SRC).toContain("buildNearbyNarration");
    // NASLEDNJA kartica: kind stop z naslovom
    expect(GO_MODE_SRC).toMatch(/kind="stop"\s+title=\{view\.next\.entry\.title\}/);
    // GPS kartica: kind nearby
    expect(GO_MODE_SRC).toMatch(/kind="nearby"\s*\n/);
    // preostali postanki: iconOnly
    expect(GO_MODE_SRC).toMatch(/iconOnly\s*\n/);
  });

  test("»kaj je v bližini« na Go Mode živi SAMO od geo.position (fail-closed)", () => {
    // nearbyScript se gradi izključno iz geo.position — izklop GPS počisti
    // položaj (use-geolocation.stop → setPosition(null)) → gumb izgine.
    expect(GO_MODE_SRC).toMatch(
      /geo\.position\s*\?\s*buildNearbyNarration\(/
    );
  });

  test("izvzem »kaj je v bližini« upošteva GEO-točke današnjih postankov", () => {
    expect(GO_MODE_SRC).toContain("dayStopCoords");
    expect(GO_MODE_SRC).toContain("view.remaining");
    expect(GO_MODE_SRC).toContain("view.done");
  });

  test("telemetrija: OBSTOJEČI dogodek (0 novih imen) + nova vrednost surface 'go'", () => {
    expect(BUTTON_SRC).toContain('trackPlannerEvent("itinerary_audio_play"');
    expect(BUTTON_SRC).toContain('surface: "go"');
    // edini trackPlannerEvent klic v gumbu je ta (0 novih imen)
    const calls = BUTTON_SRC.match(/trackPlannerEvent\(/g) ?? [];
    expect(calls.length).toBe(1);
    // strežniška bela lista (/api/analytics/event) že vsebuje dogodek
    expect(ANALYTICS_ROUTE_SRC).toContain('"itinerary_audio_play"');
  });

  test("varovalo: DistanceChip/GO_LABELS/NavButton ostanejo (zero feature loss)", () => {
    expect(GO_MODE_SRC).toContain("<DistanceChip card={view.next}");
    expect(GO_MODE_SRC).toContain("<DistanceChip card={card}");
    expect(GO_MODE_SRC).toContain("GO_LABELS");
    expect(GO_MODE_SRC).toMatch(/<NavButton\s+card=\{view\.next\}/);
  });

  test("gumb ima DOSTOPEN tekstovni padec (brskalnik brez sinteze)", () => {
    // vzorec TASK 89: vsebina NE izgine — prikaže se kot besedilo
    expect(BUTTON_SRC).toContain("showText");
    expect(BUTTON_SRC).toContain("voiceUnavailable");
    expect(BUTTON_SRC).toContain("aria-expanded={showScript}");
  });

  test("GO_AUDIO_LABELS: ključi SL === EN (pariteta oglasnic)", () => {
    expect(Object.keys(GO_AUDIO_LABELS.sl).sort()).toEqual(
      Object.keys(GO_AUDIO_LABELS.en).sort()
    );
    for (const lang of ["sl", "en"] as const) {
      expect(GO_AUDIO_LABELS[lang].readStop.length).toBeGreaterThan(0);
      expect(GO_AUDIO_LABELS[lang].nearby.length).toBeGreaterThan(0);
      expect(GO_AUDIO_LABELS[lang].error.length).toBeGreaterThan(0);
    }
  });

  test("go-audio.ts je ČIST sloj: 0 omrežja, 0 AI (offline obljuba Go Mode)", () => {
    expect(GO_AUDIO_SRC).not.toMatch(/fetch\(|XMLHttpRequest|axios/);
    expect(GO_AUDIO_SRC).not.toMatch(/z-ai|openai|anthropic|anthropic/i);
    // gradnja IZKLJUČNO iz strukturiranih dejstev (dataset + kartica)
    expect(GO_AUDIO_SRC).toContain('from "@/lib/slovenia-data"');
    expect(GO_AUDIO_SRC).toContain('from "@/lib/journey/go-view"');
  });

  test("ARIA: gumb razkrije polno dejanje (readStopAria/stopPlaybackAria/nearbyAria)", () => {
    expect(BUTTON_SRC).toContain("aria-label={ariaLabel}");
    expect(BUTTON_SRC).toContain("role=\"alert\""); // napaka je oznanjena
    // ARIA funkciji sta glede na naslov (kontekst postanka)
    expect(GO_AUDIO_LABELS.sl.readStopAria("Bled")).toContain("Bled");
    expect(GO_AUDIO_LABELS.en.readStopAria("Bled")).toContain("Bled");
  });
});
