// ============================================================================
// ISSUE #4 §16 — OFFLINE TESTI (VAL 4, 1.96.0)
// ============================================================================
// Naročnikova zahteva: "To je treba dokazati z realnim testom … Loči
// offline data, offline map tiles, offline navigation, online-only weather
// in online-only booking. Ne uporabljaj splošne oznake offline."
//
// Tok testov (REALNI browser E2E z agent-browser set offline poteka na
// produkciji — dokazi v ux-verify-issue4-val4/; tukaj unit/source-contract
// plasti):
//   1. offline.html Go Mode V2 zapisi (AI itinererji prej ZAVRNJENI);
//   2. offline.html MATRIKA ZMOŽNOSTI (5 ločenih vrstic — nikoli splošno);
//   3. Go Mode DNEVNA NAVIGACIJA (buildGoView dayOverride — čista funkcija);
//   4. SW vsebinski bump (offline.html posodobljen → SW se mora spremeniti);
//   5. go-persist V2 oblika (isti vir kot offline.html bere).
// ============================================================================

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { buildGoView } from "@/lib/journey/go-view";
import type { MyTripView, MyTripDay, TripEntry } from "@/lib/journey/trip-view";

const OFFLINE_HTML = readFileSync(
  new URL("../../../public/offline.html", import.meta.url),
  "utf8"
);
const SW_JS = readFileSync(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8"
);

/** Izlušči vsebino inline <script> (offline.html ima natanko enega). */
function extractScript(html: string): string {
  const m = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("offline.html: manjka <script> blok");
  return m[1];
}

const SCRIPT = extractScript(OFFLINE_HTML);

interface StubElement {
  textContent: string;
  innerHTML: string;
  hidden: boolean;
  listeners: Record<string, () => void>;
  setAttribute: () => void;
  addEventListener: (type: string, fn: () => void) => void;
}

function makeElements(html: string): Map<string, StubElement> {
  const els = new Map<string, StubElement>();
  for (const m of html.matchAll(/<[a-zA-Z][^>]*\bid="([^"]+)"[^>]*>/g)) {
    els.set(m[1], {
      textContent: "",
      innerHTML: "",
      hidden: /\bhidden\b/.test(m[0]),
      listeners: {},
      setAttribute() {},
      addEventListener(type: string, fn: () => void) {
        this.listeners[type] = fn;
      },
    });
  }
  return els;
}

async function runOfflineScript(
  opts: {
    cookie?: string;
    localStorage?: Record<string, string>;
    cachesMatch?: (url: string) => Promise<unknown>;
  },
  fn: (ctx: {
    els: Map<string, StubElement>;
    cachesCalls: string[];
    flush: () => Promise<void>;
  }) => Promise<void> | void
): Promise<void> {
  const els = makeElements(OFFLINE_HTML);
  const lsStore = new Map(Object.entries(opts.localStorage ?? {}));
  const cachesCalls: string[] = [];

  const documentStub = {
    cookie: opts.cookie ?? "",
    title: "",
    documentElement: { setAttribute() {} },
    getElementById: (id: string) => els.get(id) ?? null,
  };
  const windowStub = {
    localStorage: {
      getItem: (k: string) => (lsStore.has(k) ? lsStore.get(k)! : null),
      setItem: (k: string, v: string) => {
        lsStore.set(k, v);
      },
      removeItem: (k: string) => {
        lsStore.delete(k);
      },
    },
    fetch: () => Promise.resolve({ ok: false }),
    caches: opts.cachesMatch
      ? {
          match: (url: string) => {
            cachesCalls.push(url);
            return opts.cachesMatch!(url);
          },
        }
      : undefined,
    location: { reload() {} },
  };

  const g = globalThis as unknown as Record<string, unknown>;
  const prevDoc = g.document;
  const prevWin = g.window;
  g.document = documentStub;
  g.window = windowStub;
  try {
    new Function(SCRIPT)();
    await fn({
      els,
      cachesCalls,
      flush: () => new Promise((r) => setTimeout(r, 0)),
    });
  } finally {
    if (prevDoc === undefined) delete g.document;
    else g.document = prevDoc;
    if (prevWin === undefined) delete g.window;
    else g.window = prevWin;
  }
}

// ---------------------------------------------------------------------------
// FIXTURE: V2 zapis (MyTripView — isti ključi kot go-persist V2 piše)
// ---------------------------------------------------------------------------

function v2Entry(key: string, title: string, time?: string): TripEntry {
  return {
    key,
    category: "attractions",
    icon: "🎭",
    title,
    providerLabel: { sl: "Vir", en: "Source" },
    ...(time ? { time: { start: time } } : {}),
    status: "INFO",
    statusLabel: { sl: "Info", en: "Info" },
    cancellation: { sl: "-", en: "-" },
    bookingId: null,
  };
}

function v2Record(days: MyTripDay[], shareId?: string): string {
  const view: MyTripView = {
    title: { sl: "MOJA POT — Bled in Bohinj", en: "MY TRIP — Bled and Bohinj" },
    days,
    externalCards: [],
    confirmation: { confirmedCount: 0, note: { sl: "-", en: "-" } },
    generatedAt: "2026-09-25T08:00:00.000Z",
  };
  return JSON.stringify({
    version: 2,
    kind: "itinerary",
    savedAt: "2026-09-25T08:30:00.000Z",
    view,
    ...(shareId ? { shareId } : {}),
  });
}

// ---------------------------------------------------------------------------
// 1) offline.html: Go Mode V2 zapisi
// ---------------------------------------------------------------------------

describe("§16 offline.html — Go Mode V2 (AI itinererji)", () => {
  test("V2 zapis se IZRIŠE (prej zavrnjen — version !== 1)", async () => {
    await runOfflineScript(
      {
        localStorage: {
          "dai:go-trip": v2Record([
            {
              dateLabel: { sl: "Dan 1 · sobota", en: "Day 1 · Saturday" },
              date: "2026-09-26",
              entries: [
                v2Entry("e1", "Blejski grad", "09:00"),
                v2Entry("e2", "Porenje na otok"),
              ],
            },
            {
              dateLabel: { sl: "Dan 2 · nedelja", en: "Day 2 · Sunday" },
              date: "2026-09-27",
              entries: [v2Entry("e3", "Savica slap", "10:30")],
            },
          ]),
        },
      },
      async ({ els }) => {
        const goPlan = els.get("go-plan")!;
        expect(goPlan.innerHTML).toContain("MOJA POT — Bled in Bohinj");
        expect(goPlan.innerHTML).toContain("Blejski grad");
        // SAMO realni časi se izpišejo (09:00), izumljeni NE obstajajo
        expect(goPlan.innerHTML).toContain("09:00");
        expect(goPlan.innerHTML).toContain("Porenje na otok");
        expect(goPlan.innerHTML).toContain("Savica slap");
        expect(goPlan.innerHTML).toContain("2×");
        expect(goPlan.innerHTML).toContain("3 postankov");
        expect(els.get("go-section")!.hidden).toBe(false);
      }
    );
  });

  test("V2 z shareId ima tudi povezavo na shranjeno pot", async () => {
    await runOfflineScript(
      {
        localStorage: {
          "dai:go-trip": v2Record(
            [
              {
                dateLabel: { sl: "Dan 1", en: "Day 1" },
                entries: [v2Entry("e1", "Bled")],
              },
            ],
            "abc123def4"
          ),
        },
      },
      async ({ els }) => {
        const html = els.get("go-plan")!.innerHTML;
        expect(html).toContain('href="/pot/abc123def4"');
        expect(html).toContain('href="/na-poti"');
      }
    );
  });

  test("V2 z neveljavnim view.days (entries brez title) → ZAVRNJEN", async () => {
    await runOfflineScript(
      {
        localStorage: {
          "dai:go-trip": JSON.stringify({
            version: 2,
            kind: "itinerary",
            savedAt: "2026-09-25T08:30:00.000Z",
            view: { title: { sl: "x", en: "x" }, days: [{ entries: [{}] }] },
          }),
        },
      },
      async ({ els }) => {
        expect(els.get("go-section")!.hidden).toBe(true);
      }
    );
  });

  test("EN jezik: V2 dateLabel se izpiše angleško", async () => {
    await runOfflineScript(
      {
        cookie: "NEXT_LOCALE=en",
        localStorage: {
          "dai:go-trip": v2Record([
            {
              dateLabel: { sl: "Dan 1 · sobota", en: "Day 1 · Saturday" },
              entries: [v2Entry("e1", "Bled Castle")],
            },
          ]),
        },
      },
      async ({ els }) => {
        const html = els.get("go-plan")!.innerHTML;
        expect(html).toContain("MY TRIP");
        expect(html).toContain("Day 1 · Saturday");
        expect(html).not.toContain("sobota");
      }
    );
  });

  test("V1 zapisi ostanejo PODPRTI (nazaj kompatibilno)", async () => {
    await runOfflineScript(
      {
        localStorage: {
          "dai:go-trip": JSON.stringify({
            version: 1,
            savedAt: "2026-09-21T10:00:00.000Z",
            journey: {
              id: "j1",
              lang: "sl",
              origin: { label: "Ljubljana (Brnik)" },
              destination: { label: "Bled" },
              categories: {
                transfer: { products: [{ id: "t1", title: "Transfer" }] },
                accommodation: { products: [] },
                restaurants: { products: [] },
                petrol: { products: [] },
                attractions: { products: [] },
                events: { products: [] },
              },
              totals: {},
            },
            selectedIds: ["t1"],
          }),
        },
      },
      async ({ els }) => {
        const html = els.get("go-plan")!.innerHTML;
        expect(html).toContain("Ljubljana (Brnik) → Bled");
        expect(html).toContain("Transfer");
      }
    );
  });
});

// ---------------------------------------------------------------------------
// 2) offline.html: MATRIKA ZMOŽNOSTI (iskrena ločitev — nikoli splošno)
// ---------------------------------------------------------------------------

describe("§16 offline.html — matrika zmožnosti brez signala", () => {
  test("5 LOČENIH vrstic: podatki/ploščice/navigacija/vreme/rezervacije", async () => {
    await runOfflineScript({}, async ({ els }) => {
      const html = els.get("cap-list")!.innerHTML;
      expect(html).toContain("Podatki načrtov");
      expect(html).toContain("Zemljevid (ploščice)");
      expect(html).toContain("Navigacija do postanka");
      expect(html).toContain("Vreme");
      expect(html).toContain("Rezervacije");
      // iskrene oznake: deluje / delno / zunaj / samo povezava
      expect(html).toContain("deluje");
      expect(html).toContain("delno");
      expect(html).toContain("samo povezava");
    });
  });

  test("EN: matrika dvojezična", async () => {
    await runOfflineScript({ cookie: "NEXT_LOCALE=en" }, async ({ els }) => {
      const html = els.get("cap-list")!.innerHTML;
      expect(html).toContain("What works offline".slice(0, 5) === "What "
        ? "Plan data"
        : "Plan data");
      expect(html).toContain("online only");
    });
  });

  test("vreme/rezervacije sta IZRECNO online-only (NE dela offline)", async () => {
    await runOfflineScript({}, async ({ els }) => {
      const html = els.get("cap-list")!.innerHTML;
      // vrstica vremena vsebuje "samo povezava" in NE "deluje"
      expect(html).toContain("Vreme");
      expect(html).not.toMatch(/Vreme[^<]*deluje/);
    });
  });
});

// ---------------------------------------------------------------------------
// 3) Go Mode DNEVNA NAVIGACIJA (buildGoView dayOverride — čista funkcija)
// ---------------------------------------------------------------------------

const NOW = new Date("2026-09-26T12:00:00.000Z"); // sobota = Dan 1

function trip3days(): MyTripView {
  const day = (n: number, date: string, titles: string[]): MyTripDay => ({
    dateLabel: { sl: `Dan ${n}`, en: `Day ${n}` },
    date,
    entries: titles.map((t, i) => v2Entry(`d${n}-e${i}`, t)),
  });
  return {
    title: { sl: "MOJA POT — Test", en: "MY TRIP — Test" },
    days: [
      day(1, "2026-09-26", ["Bled", "Vintgar"]),
      day(2, "2026-09-27", ["Bohinj"]),
      day(3, "2026-09-28", ["Savica"]),
    ],
    externalCards: [],
    confirmation: { confirmedCount: 0, note: { sl: "-", en: "-" } },
    generatedAt: "2026-09-25T08:00:00.000Z",
  };
}

describe("§16 Go Mode — dnevna navigacija (buildGoView)", () => {
  test("brez opts: samodejna izbira (danes = Dan 1) — nazaj kompatibilno", () => {
    const view = buildGoView(trip3days(), NOW, null, {});
    expect(view.activeDayLabel.sl).toContain("Dan 1");
    expect(view.dayManuallySelected).toBe(false);
    expect(view.daySwitcher).toHaveLength(3);
    expect(view.daySwitcher[0].isToday).toBe(true);
    expect(view.daySwitcher[1].isToday).toBe(false);
  });

  test("dayOverride=1: izbran Dan 2 (ročno) + iskrena opomba", () => {
    const view = buildGoView(trip3days(), NOW, null, {}, { dayOverride: 1 });
    expect(view.activeDayLabel.sl).toContain("Dan 2");
    expect(view.dayManuallySelected).toBe(true);
    expect(view.activeDayNote?.sl).toContain("ročno");
    // laterDays sledijo IZBRANEMU dnevu (Dan 3, ne Dan 2/3)
    expect(view.laterDays).toHaveLength(1);
    // postanki dneva 2
    expect(view.next?.entry.title).toBe("Bohinj");
    expect(view.remaining).toHaveLength(0);
  });

  test("dayOverride izven obsega → samodejna izbira (fail-safe)", () => {
    const view = buildGoView(trip3days(), NOW, null, {}, { dayOverride: 99 });
    expect(view.dayManuallySelected).toBe(false);
    expect(view.activeDayLabel.sl).toContain("Dan 1");
  });

  test("enodnevni načrt: switcher PRAZEN (brez šuma)", () => {
    const one = trip3days();
    one.days = [one.days[0]];
    const view = buildGoView(one, NOW, null, {});
    expect(view.daySwitcher).toHaveLength(0);
  });

  test("opravljeni postanki so PO DNEVIH ločeni (ključi vnosa)", () => {
    // e1 dneva 1 opravljen; preklop na dan 2 → done PRAZEN (drugi ključi)
    const done = { "d1-e0": "2026-09-26T09:00:00.000Z" };
    const v1 = buildGoView(trip3days(), NOW, null, done);
    expect(v1.done).toHaveLength(1);
    const v2 = buildGoView(trip3days(), NOW, null, done, { dayOverride: 1 });
    expect(v2.done).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4) SW vsebinski bump + 5) vir-contract
// ---------------------------------------------------------------------------

describe("§16 SW bump + source-contract", () => {
  test("sw.js vsebuje VSEBINSKI BUMP (sw3 — offline.html posodobljen)", () => {
    expect(SW_JS).toContain("sw3");
    expect(SW_JS).toContain("1.96.0");
    expect(SW_JS).toContain("offline.html");
  });

  test("offline.html skripta vsebuje V2 vejo (version === 2)", () => {
    expect(SCRIPT).toContain("rec.version === 2");
    expect(SCRIPT).toContain('rec.kind !== "itinerary"');
  });

  test("go-mode.tsx ima preklopnik dneva (UI plast)", () => {
    const goMode = readFileSync(
      new URL("../../../src/components/sections/go-mode.tsx", import.meta.url),
      "utf8"
    );
    expect(goMode).toContain("dayOverride");
    expect(goMode).toContain("DNEVNA NAVIGACIJA");
    expect(goMode).toContain("dayNav");
    // matrika zmožnosti v nogi (iskrena ločitev)
    expect(goMode).toContain("offlineMatrix");
  });

  test("go-view.ts: daySwitcher + dayManuallySelected v pogledu", () => {
    const goView = readFileSync(
      new URL("../../../src/lib/journey/go-view.ts", import.meta.url),
      "utf8"
    );
    expect(goView).toContain("daySwitcher");
    expect(goView).toContain("dayManuallySelected");
    expect(goView).toContain("dayOverride");
  });
});
