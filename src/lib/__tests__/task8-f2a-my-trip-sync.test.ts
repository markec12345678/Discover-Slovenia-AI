// ============================================================================
// TASK 8 / F2-A (Issue #8 Faza 2) — STREŽNIŠKA REFLEKSIJA ZBIRKE "MOJA POT"
// ============================================================================
// Spremembe, ki jih ta datoteka varuje:
//   1. Prisma model UserTripItem (schema + startup migracija
//      src/lib/user-trip-items-migration.ts + registracija v
//      instrumentation.ts + prisma/migrations/20260928100000 lineage SQL);
//   2. /api/my-trip (GET seznam / POST union-merge + FIFO kapa 200 /
//      DELETE eksplicitno odstranjevanje) — ISTI sanitizacijski kanon kot
//      my-trip.ts (whitelist vrst, dolžine, SAMO notranji href), samo B2C
//      seje (401/403), rate limit;
//   3. Klientni sync modul src/lib/my-trip-sync.ts — syncMyTripToServer
//      (push union + pull merge; prazna lokalna = SAMO GET; fail-open),
//      startMyTripDiffSync (diff proti senci, debounce, retry cele razlike
//      ob neuspehu);
//   4. MyTripAccountSync (nevidni gonilev v Navigation) + prijava sync
//      (oba tokova: prijava + registracija) + pull na /moja-potovanja.
//
// Struktura (konvencija task28-review-verified):
//   · UNIT migracije z vbrizganim klientom (sqlite/postgres detekcija);
//   · UNIT klientnega sync modula (localStorage + window mock po vzorcu
//     task8-my-trip-core; globalni fetch override po vzorcu viator-hardening
//     — NE mock.module, samo global substitucija);
//   · SOURCE-CONTRACT rute/sync/wiring/sheme/instrumentation.
// ============================================================================

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  addMyTripItem,
  getMyTripItems,
  removeMyTripItem,
  clearMyTripItems,
  MY_TRIP_STORAGE_KEY,
} from "../my-trip";
import { migrateUserTripItemsTableWith } from "../user-trip-items-migration";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const routeSrc = read("src/app/api/my-trip/route.ts");
const syncSrc = read("src/lib/my-trip-sync.ts");
const accountSyncSrc = read("src/components/my-trip-account-sync.tsx");
const navigationSrc = read("src/components/sections/navigation.tsx");
const prijavaSrc = read("src/app/prijava/prijava-view.tsx");
const mojaPotovanjaSrc = read("src/app/moja-potovanja/moja-potovanja-view.tsx");
const migrationSrc = read("src/lib/user-trip-items-migration.ts");
const instrumentationSrc = read("src/instrumentation.ts");
const schemaSrc = read("prisma/schema.prisma");
const migrationSqlPath = join(
  ROOT,
  "prisma/migrations/20260928100000_user_trip_items/migration.sql"
);

// ---------------------------------------------------------------------------
// localStorage + window mock (vzorec task8-my-trip-core)
// ---------------------------------------------------------------------------
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
  };
}

const storage = makeStorage();
const session = makeStorage();
const win = new EventTarget() as EventTarget & {
  localStorage: typeof storage;
  sessionStorage: typeof session;
};
win.localStorage = storage;
win.sessionStorage = session;

// fetch override evidanca (vzorec viator-hardening — global substitucija)
interface FetchCall {
  url: string;
  method: string;
  body?: string;
}
let fetchCalls: FetchCall[] = [];
let fetchResponder: ((call: FetchCall) => Response | null) | null = null;

const g = globalThis as Record<string, unknown>;
let hadWindow = false;
let prevWindow: unknown;
let hadFetch = false;
let prevFetch: unknown;

beforeAll(() => {
  hadWindow = "window" in g;
  prevWindow = g.window;
  hadFetch = "fetch" in g;
  prevFetch = g.fetch;
  g.window = win;
  g.localStorage = storage;
  g.sessionStorage = session;
  g.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : undefined;
    const call = { url, method, body };
    fetchCalls.push(call);
    const res =
      fetchResponder?.(call) ??
      new Response(JSON.stringify({ items: [] }), { status: 200 });
    return res as Response;
  };
});

afterAll(() => {
  if (hadWindow) g.window = prevWindow;
  else delete g.window;
  if (hadFetch) g.fetch = prevFetch;
  else delete g.fetch;
  delete g.localStorage;
  delete g.sessionStorage;
});

function resetFetch(
  responder: ((call: FetchCall) => Response | null) | null
) {
  fetchCalls = [];
  fetchResponder = responder;
}

// Dinamični uvoz PREK zaslona mock-a (vzorci obenem inicializirajo module
// po beforeAll namestitvi globalov)
async function importSyncModule() {
  return import("../my-trip-sync");
}

// ---------------------------------------------------------------------------
// 1. UNIT — startup migracija z vbrizganim klientom (vzorec task28/task87)
// ---------------------------------------------------------------------------

describe("TASK 8 / F2-A: user-trip-items-migration — unit z vbrizganim klientom", () => {
  test("sqlite: tabela manjka → CREATE + indeksa (idempotentno)", async () => {
    const executed: string[] = [];
    const client = {
      $queryRawUnsafe: async (sql: string) => {
        if (sql === "PRAGMA table_info(SavedItinerary)") return [{ cid: 0 }];
        if (sql === "PRAGMA table_info(UserTripItem)") return []; // manjka
        throw new Error("neočekivana poizvedba: " + sql);
      },
      $executeRawUnsafe: async (sql: string) => {
        executed.push(sql);
        return 1;
      },
    } as never;
    const r = await migrateUserTripItemsTableWith(client);
    expect(r.dialect).toBe("sqlite");
    expect(r.tablesCreated).toEqual(["UserTripItem"]);
    expect(executed.length).toBeGreaterThanOrEqual(3);
    expect(executed[0]).toContain('CREATE TABLE "UserTripItem"');
    expect(
      executed.some((s) =>
        s.includes('CREATE UNIQUE INDEX "UserTripItem_userId_kind_refId_key"')
      )
    ).toBe(true);
    expect(
      executed.some((s) => s.includes('CREATE INDEX "UserTripItem_userId_idx"'))
    ).toBe(true);
  });

  test("sqlite: tabela obstaja → neustvari ničesar (idempotentno)", async () => {
    const executed: string[] = [];
    const client = {
      $queryRawUnsafe: async (sql: string) => {
        if (sql === "PRAGMA table_info(SavedItinerary)") return [{ cid: 0 }];
        if (sql === "PRAGMA table_info(UserTripItem)")
          return [{ cid: 0, name: "id" }];
        throw new Error("neočekivana poizvedba: " + sql);
      },
      $executeRawUnsafe: async (sql: string) => {
        executed.push(sql);
        return 1;
      },
    } as never;
    const r = await migrateUserTripItemsTableWith(client);
    expect(r.tablesCreated).toEqual([]);
    expect(executed.length).toBe(0);
  });

  test("postgres: tabela manjka → citirani identifikatorji + FK na User", async () => {
    const executed: string[] = [];
    const client = {
      $queryRawUnsafe: async (sql: string) => {
        if (sql.startsWith("PRAGMA")) throw new Error("postgres");
        if (
          sql.includes("information_schema.tables") &&
          sql.includes("'SavedItinerary'")
        )
          return [{ table_name: "SavedItinerary" }];
        if (
          sql.includes("information_schema.tables") &&
          sql.includes("'UserTripItem'")
        )
          return []; // manjka
        throw new Error("neočekivana poizvedba: " + sql);
      },
      $executeRawUnsafe: async (sql: string) => {
        executed.push(sql);
        return 1;
      },
    } as never;
    const r = await migrateUserTripItemsTableWith(client);
    expect(r.dialect).toBe("postgres");
    expect(r.tablesCreated).toEqual(["UserTripItem"]);
    expect(
      executed.some((s) => s.includes('FOREIGN KEY ("userId") REFERENCES "User"'))
    ).toBe(true);
    expect(
      executed.some((s) => s.includes('ON DELETE CASCADE'))
    ).toBe(true);
  });

  test("neznan narečje (DB mrtev) → fail-open brez ustvarjanja", async () => {
    const client = {
      $queryRawUnsafe: async () => {
        throw new Error("DB mrtev");
      },
      $executeRawUnsafe: async () => 1,
    } as never;
    const r = await migrateUserTripItemsTableWith(client);
    expect(r.dialect).toBe("unknown");
    expect(r.tablesCreated).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. UNIT — klientni sync modul (localStorage + fetch override)
// ---------------------------------------------------------------------------

describe("TASK 8 / F2-A: my-trip-sync — syncMyTripToServer (prijavni sync)", () => {
  test("lokalna NEPRAZNA → POST union payload + merge odgovora", async () => {
    clearMyTripItems();
    addMyTripItem({
      kind: "destination",
      refId: "bled",
      title: "Bled",
      subtitle: "Gorenjska",
      href: "/destinacija/bled",
      source: "test",
    });
    resetFetch((call) => {
      if (call.method === "POST") {
        const body = JSON.parse(call.body ?? "{}");
        expect(Array.isArray(body.items)).toBe(true);
        expect(body.items.length).toBe(1);
        expect(body.items[0].kind).toBe("destination");
        expect(body.items[0].refId).toBe("bled");
        return new Response(
          JSON.stringify({
            items: [
              {
                kind: "destination",
                refId: "bled",
                title: "Bled",
                href: "/destinacija/bled",
                addedAt: new Date().toISOString(),
              },
              {
                kind: "experience",
                refId: "exp-1",
                title: "Veslanje",
                href: "/dozivetja",
                addedAt: new Date().toISOString(),
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ error: "POST pričakovan" }), {
        status: 400,
      });
    });

    const { syncMyTripToServer } = await importSyncModule();
    const r = await syncMyTripToServer();
    expect(r.synced).toBe(true);
    expect(r.pulled).toBe(1);
    // Union: Bled + novo Veslanje
    const items = getMyTripItems();
    expect(items.length).toBe(2);
    expect(
      items.some((i) => i.kind === "experience" && i.refId === "exp-1")
    ).toBe(true);
    expect(fetchCalls.some((c) => c.method === "POST")).toBe(true);
  });

  test("lokalna PRAZNA → SAMO GET (nov prenosnik — brez praznega push)", async () => {
    clearMyTripItems();
    resetFetch((call) => {
      if (call.method === "GET") {
        return new Response(
          JSON.stringify({
            items: [
              {
                kind: "event",
                refId: "ev-9",
                title: "Festival",
                href: "/dogodki",
                addedAt: new Date().toISOString(),
              },
            ],
          }),
          { status: 200 }
        );
      }
      return null;
    });

    const { syncMyTripToServer } = await importSyncModule();
    const r = await syncMyTripToServer();
    expect(r.synced).toBe(true);
    expect(r.pulled).toBe(1);
    expect(getMyTripItems().length).toBe(1);
    expect(
      fetchCalls.every((c) => c.method !== "POST")
    ).toBe(true);
  });

  test("fail-open: omrežna napaka (fetch vrže) → synced:false, lokalna NEDOTIKNJENA", async () => {
    clearMyTripItems();
    addMyTripItem({
      kind: "guide",
      refId: "vodici-test",
      title: "Vodič",
      href: "/vodici/test",
    });
    resetFetch(null);
    g.fetch = async () => {
      throw new Error("omrežje mrzlo");
    };
    try {
      const { syncMyTripToServer } = await importSyncModule();
      const r = await syncMyTripToServer();
      expect(r.synced).toBe(false);
      expect(r.pulled).toBe(0);
      // Zbirka ostaja lokalna resnica naprave
      expect(getMyTripItems().length).toBe(1);
    } finally {
      // povrni testni fetch
      g.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        const body = typeof init?.body === "string" ? init.body : undefined;
        const call = { url, method, body };
        fetchCalls.push(call);
        const res =
          fetchResponder?.(call) ??
          new Response(JSON.stringify({ items: [] }), { status: 200 });
        return res as Response;
      };
    }
  });

  test("fail-open: 401 (neavtorizirano) → synced:false, brez merge", async () => {
    clearMyTripItems();
    resetFetch(() => new Response(JSON.stringify({ error: "Niste prijavljeni" }), { status: 401 }));
    const { syncMyTripToServer } = await importSyncModule();
    const r = await syncMyTripToServer();
    expect(r.synced).toBe(false);
    expect(getMyTripItems().length).toBe(0);
  });

  test("server pošlje smet (zunanji href / napačen kind) → sanitizacija jih zavrne", async () => {
    clearMyTripItems();
    resetFetch(() =>
      new Response(
        JSON.stringify({
          items: [
            { kind: "scam", refId: "x", title: "Zunaj", href: "https://evil.com", addedAt: new Date().toISOString() },
            { kind: "listing", refId: "", title: "Brez refId", href: "/lokali", addedAt: new Date().toISOString() },
            {
              kind: "listing",
              refId: "lok-1",
              title: "Dober lokal",
              href: "/lokali",
              addedAt: new Date().toISOString(),
            },
          ],
        }),
        { status: 200 }
      )
    );
    const { syncMyTripToServer } = await importSyncModule();
    // Lokalna prazna → GET pot; smeti se zavrnejo, veljavni ostanejo
    await syncMyTripToServer();
    const items = getMyTripItems();
    expect(items.length).toBe(1);
    expect(items[0].refId).toBe("lok-1");
  });
});

describe("TASK 8 / F2-A: my-trip-sync — startMyTripDiffSync (diff med sejo)", () => {
  test("dodatek → POST samo razlike; odstranitev → DELETE", async () => {
    clearMyTripItems();
    addMyTripItem({
      kind: "destination",
      refId: "bled",
      title: "Bled",
      href: "/destinacija/bled",
    });
    resetFetch(() => new Response(JSON.stringify({ items: [] }), { status: 200 }));

    const { startMyTripDiffSync } = await importSyncModule();
    const stop = startMyTripDiffSync(10); // kratek debounce za test

    // Dodaj nov predmet → diff POST
    addMyTripItem({
      kind: "experience",
      refId: "exp-2",
      title: "Kolesarjenje",
      href: "/dozivetja",
    });
    // Odstrani obstoječega → diff DELETE
    removeMyTripItem("destination", "bled");

    await new Promise((r) => setTimeout(r, 80)); // debounce + flush
    stop();

    const posts = fetchCalls.filter((c) => c.method === "POST");
    expect(posts.length).toBe(1);
    const body = JSON.parse(posts[0].body ?? "{}");
    // SAMO dodani (exp-2) — ne celotna zbirka
    expect(body.items.length).toBe(1);
    expect(body.items[0].refId).toBe("exp-2");

    const deletes = fetchCalls.filter((c) => c.method === "DELETE");
    expect(deletes.length).toBe(1);
    const delBody = JSON.parse(deletes[0].body ?? "{}");
    expect(delBody.kind).toBe("destination");
    expect(delBody.refId).toBe("bled");
  });

  test("ni sprememb → ni klicev (tišina)", async () => {
    clearMyTripItems();
    addMyTripItem({
      kind: "event",
      refId: "ev-1",
      title: "Dogodek",
      href: "/dogodki",
    });
    resetFetch(() => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const { startMyTripDiffSync } = await importSyncModule();
    const stop = startMyTripDiffSync(10);
    await new Promise((r) => setTimeout(r, 60));
    stop();
    expect(fetchCalls.length).toBe(0);
  });

  test("stop() prekine poslušanje (brez klicev po stopu)", async () => {
    clearMyTripItems();
    resetFetch(() => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const { startMyTripDiffSync } = await importSyncModule();
    const stop = startMyTripDiffSync(10);
    stop();
    addMyTripItem({
      kind: "poi",
      refId: "poi-x",
      title: "TOI",
      href: "/zemljevid",
    });
    await new Promise((r) => setTimeout(r, 60));
    expect(fetchCalls.length).toBe(0);
    clearMyTripItems();
  });
});

// ---------------------------------------------------------------------------
// 3. SOURCE-CONTRACT — API ruta
// ---------------------------------------------------------------------------

describe("TASK 8 / F2-A: /api/my-trip — source contract", () => {
  test("GET/POST/DELETE izvoženi; isti sanitizacijski kanon kot my-trip.ts", () => {
    expect(routeSrc).toContain("export async function GET");
    expect(routeSrc).toContain("export async function POST");
    expect(routeSrc).toContain("export async function DELETE");
    // Whitelist vrst — IDENTIČNA seznamu iz my-trip.ts (10 vrst)
    for (const kind of [
      "destination",
      "poi",
      "listing",
      "event",
      "experience",
      "product",
      "guide",
      "community",
      "import",
      "ai",
    ]) {
      expect(routeSrc).toContain(`"${kind}"`);
    }
    // Notranji href kanon (startsWith "/" + zavrnitev "//")
    expect(routeSrc).toContain('href.startsWith("/")');
    expect(routeSrc).toContain('href.startsWith("//")');
    // FIFO kapa enaka localStorage
    expect(routeSrc).toContain("MAX_ITEMS = 200");
  });

  test("avtentikacija: samo B2C seje — 401 brez seje, 403 owner", () => {
    expect(routeSrc).toContain('accountType !== "user"');
    expect(routeSrc).toContain("401");
    expect(routeSrc).toContain("403");
    expect(routeSrc).toContain("getServerSession");
  });

  test("union-merge: upsert po userId_kind_refId — push NIKOLI ne briše", () => {
    expect(routeSrc).toContain("upsert");
    expect(routeSrc).toContain("userId_kind_refId");
    // Odstranjevanje SAMO prek eksplicitnega DELETE
    expect(routeSrc).toContain("deleteMany");
  });

  test("rate limit na vseh treh metodah", () => {
    expect((routeSrc.match(/rateLimit\(/g) ?? []).length).toBeGreaterThanOrEqual(
      3
    );
  });

  test("addedAt clamp: klientova ura ne more v prihodnost", () => {
    expect(routeSrc).toContain("getTime() > Date.now()");
  });
});

// ---------------------------------------------------------------------------
// 4. SOURCE-CONTRACT — wiring (Navigation + prijava + moja-potovanja)
// ---------------------------------------------------------------------------

describe("TASK 8 / F2-A: wiring — nevidni gonilev + prijava + pull", () => {
  test("MyTripAccountSync: nevidna komponenta (null) z obema odgovornostma", () => {
    expect(accountSyncSrc).toContain('"use client"');
    expect(accountSyncSrc).toContain("syncMyTripToServer");
    expect(accountSyncSrc).toContain("startMyTripDiffSync");
    expect(accountSyncSrc).toContain("return null");
    // Samo B2C seje (owner je izključen)
    expect(accountSyncSrc).toContain('accountType === "user"');
  });

  test("Navigation izrisuje MyTripAccountSync", () => {
    expect(navigationSrc).toContain(
      'import { MyTripAccountSync } from "@/components/my-trip-account-sync"'
    );
    expect(navigationSrc).toContain("<MyTripAccountSync />");
  });

  test("prijava: OBA tokova (prijava + registracija) sinhronizirata zbirko", () => {
    expect(prijavaSrc).toContain(
      'import { syncMyTripToServer } from "@/lib/my-trip-sync"'
    );
    // dva klica = LoginForm + RegisterForm
    expect((prijavaSrc.match(/await syncMyTripToServer\(\)/g) ?? []).length).toBe(
      2
    );
    // Toast ob prinesenih predmetih z drugih naprav
    expect(prijavaSrc).toContain("Moja pot je shranjena v ra\u010dun");
  });

  test("moja-potovanja: pull sync ob mountu prijavljenega uporabnika", () => {
    expect(mojaPotovanjaSrc).toContain(
      'import { syncMyTripToServer } from "@/lib/my-trip-sync"'
    );
    expect(mojaPotovanjaSrc).toContain("void syncMyTripToServer()");
  });
});

// ---------------------------------------------------------------------------
// 5. SOURCE-CONTRACT — shema + migracija + instrumentation
// ---------------------------------------------------------------------------

describe("TASK 8 / F2-A: shema + migracije — source contract", () => {
  test("schema.prisma: model UserTripItem z identiteto in relacijo", () => {
    expect(schemaSrc).toContain("model UserTripItem");
    expect(schemaSrc).toContain('@@unique([userId, kind, refId])');
    expect(schemaSrc).toContain("@@index([userId])");
    expect(schemaSrc).toContain("onDelete: Cascade");
    expect(schemaSrc).toContain("tripItems   UserTripItem[]");
  });

  test("prisma/migrations: lineage SQL obstaja z enakimi ključi (drift vrata CI)", () => {
    expect(existsSync(migrationSqlPath)).toBe(true);
    const sql = readFileSync(migrationSqlPath, "utf8");
    expect(sql).toContain('CREATE TABLE "UserTripItem"');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "UserTripItem_userId_kind_refId_key"'
    );
    expect(sql).toContain('CREATE INDEX "UserTripItem_userId_idx"');
    expect(sql).toContain(
      'FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE'
    );
    // NE sme znova ustvarjati User (baseline jo ima)
    expect(sql).not.toContain('CREATE TABLE "User"');
  });

  test("instrumentation.ts: migracija registrirana (startup korak)", () => {
    expect(instrumentationSrc).toContain(
      '"./lib/user-trip-items-migration"'
    );
    expect(instrumentationSrc).toContain("schema:user-trip-items");
  });
});

// ---------------------------------------------------------------------------
// 6. FUNKCIONALNO — Prisma model UserTripItem proti pravi (lokalni) DB
//    (kanon task28: pošten skip brez DATABASE_URL; poščiščeno v afterAll)
//    Seja NI mockana (kanon NO mock.module) → route handler ostaja
//    pokrit z source-contractom zgoraj; tu preverjamo MODEL resnico:
//    identiteta (userId, kind, refId), FIFO semantika branj in CASCADE.
// ---------------------------------------------------------------------------

describe("TASK 8 / F2-A: UserTripItem model — funkcionalno (DB-gated)", () => {
  let dbReachable = false;
  let testUserId = "";
  const testUserIds: string[] = [];

  beforeAll(async () => {
    try {
      const { db } = await import("@/lib/db");
      await db.userTripItem.count();
      dbReachable = true;
    } catch {
      dbReachable = false;
    }
  });

  afterAll(async () => {
    if (!dbReachable) return;
    try {
      const { db } = await import("@/lib/db");
      // briši uporabnike — CASCADE pobriše tudi njihove predmete
      if (testUserIds.length > 0) {
        await db.user.deleteMany({ where: { id: { in: testUserIds } } });
      }
    } catch {
      // čiščenje je best-effort
    }
  });

  async function makeTestUser(n: number): Promise<string> {
    const { db } = await import("@/lib/db");
    const email = `t8f2a-${n}-${Date.now()}@test.local`;
    const user = await db.user.create({
      data: {
        email,
        name: "T8 F2A Test",
        passwordHash: "x-not-a-real-hash",
      },
    });
    testUserIds.push(user.id);
    return user.id;
  }

  test("identiteta: unique (userId, kind, refId) — upsert osveži, ne podvoji", async () => {
    if (!dbReachable) {
      console.log("[task8-f2a] DB ni dosegljiva — preskakujem DB primer");
      return;
    }
    const { db } = await import("@/lib/db");
    testUserId = await makeTestUser(1);

    await db.userTripItem.create({
      data: {
        userId: testUserId,
        kind: "destination",
        refId: "bled",
        title: "Bled",
        href: "/destinacija/bled",
        addedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    // ISTA identiteta → upsert posodobi, ne ustvari duplikata
    await db.userTripItem.upsert({
      where: {
        userId_kind_refId: { userId: testUserId, kind: "destination", refId: "bled" },
      },
      create: {
        userId: testUserId,
        kind: "destination",
        refId: "bled",
        title: "Bled (osveženo)",
        href: "/destinacija/bled",
        addedAt: new Date("2026-02-01T00:00:00Z"),
      },
      update: {
        title: "Bled (osveženo)",
        addedAt: new Date("2026-02-01T00:00:00Z"),
      },
    });

    const rows = await db.userTripItem.findMany({
      where: { userId: testUserId },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe("Bled (osveženo)");

    // DVA uporabnika LAHKO imata ISTO kind:refId (izolacija računov)
    const otherUserId = await makeTestUser(2);
    await db.userTripItem.create({
      data: {
        userId: otherUserId,
        kind: "destination",
        refId: "bled",
        title: "Bled",
        href: "/destinacija/bled",
        addedAt: new Date(),
      },
    });
    const all = await db.userTripItem.findMany({
      where: { refId: "bled" },
    });
    expect(all.length).toBe(2);
  });

  test("vrstni red: orderBy addedAt desc — najnovejši prvi (isti red kot my-trip.ts)", async () => {
    if (!dbReachable) {
      console.log("[task8-f2a] DB ni dosegljiva — preskakujem DB primer");
      return;
    }
    const { db } = await import("@/lib/db");
    const uid = await makeTestUser(3);
    const base = Date.now();
    for (let i = 0; i < 3; i++) {
      await db.userTripItem.create({
        data: {
          userId: uid,
          kind: "experience",
          refId: `exp-${i}`,
          title: `Exp ${i}`,
          href: "/dozivetja",
          addedAt: new Date(base - i * 1000), // i=0 najnovejši
        },
      });
    }
    const rows = await db.userTripItem.findMany({
      where: { userId: uid },
      orderBy: { addedAt: "desc" },
    });
    expect(rows.map((r) => r.refId)).toEqual(["exp-0", "exp-1", "exp-2"]);
  });

  test("CASCADE: brisanje uporabnika pobriše njegove predmete", async () => {
    if (!dbReachable) {
      console.log("[task8-f2a] DB ni dosegljiva — preskakujem DB primer");
      return;
    }
    const { db } = await import("@/lib/db");
    const uid = await makeTestUser(4);
    await db.userTripItem.create({
      data: {
        userId: uid,
        kind: "guide",
        refId: "g-1",
        title: "Vodič",
        href: "/vodici/g-1",
        addedAt: new Date(),
      },
    });
    await db.user.delete({ where: { id: uid } });
    const rows = await db.userTripItem.findMany({ where: { userId: uid } });
    expect(rows.length).toBe(0);
    // počisti iz seznama (že zbrisan — best-effort)
    const idx = testUserIds.indexOf(uid);
    if (idx >= 0) testUserIds.splice(idx, 1);
  });
});
