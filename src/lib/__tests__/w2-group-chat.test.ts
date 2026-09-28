import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import {
  AI_ADVISOR_NAME,
  isAiMention,
  stripAiMention,
  isReservedAuthorName,
  buildAiPayload,
  parseAiPayload,
} from "@/lib/trip-chat";
import { migrateTripChatColumnsWith } from "@/lib/trip-chat-migration";
import type { ChatPlace } from "@/lib/geo-intent";
import type { StoCitation } from "@/lib/rag/types";

/**
 * W2 (Issue #15, 1.131.0): SKUPINSKI KLEPET Z @AI na /pot/[shareId].
 *
 * Mindtripov vzorec "@AI v skupinskem klepetu", po našem kanonu:
 *  (a) AI vrstico izstavi SAMO strežnik (isAI=true prek
 *      /api/trip-comments/ai-reply — isti deterministični pogon kot
 *      /api/chat);
 *  (b) AI samo PREDLAGA — predlogi krajev imajo gumb "Dodaj v pot"
 *      (isti čisti algoritem kot klepet "+", CAS PATCH deljene poti);
 *  (c) ZERO FEATURE LOSS: obstoječi komentarji postanejo zgodovina klepeta
 *      (ista tabela TripComment; vrstice brez isAI se obnašajo kot prej);
 *  (d) živost: polling 6 s (deluje povsod) + chat:new socket pospešitev
 *      (kozmetična — mini-service 3003; mrtv → polling prevzame).
 *
 * Testne plasti:
 *  1. ČISTE funkcije trip-chat.ts (omemba/rezervirana imena/priloga)
 *  2. Startup migracija (sqlite mock klient — idempotentnost)
 *  3. SOURCE CONTRACT pogodbe čez API rute, komponente, mini-service, shemo
 */

// __tests/ → src/lib/__tests/; koren projekta je TRI ravni višje
const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) =>
  readFileSync(new URL(p, ROOT), "utf-8") as string;

// ---------------------------------------------------------------------------
// Fixture: veljaven ChatPlace (OSM gostilna — isti kanon kot geo odgovori)
// ---------------------------------------------------------------------------
const place = (id: string, name: string): ChatPlace => ({
  id,
  name,
  lat: 46.05,
  lng: 14.5,
  category: "food",
  provenance: "osm",
});

const t1Place = (id: string, name: string): ChatPlace => ({
  id,
  name,
  lat: 46.36,
  lng: 14.09,
  category: "destination",
  provenance: "t1",
});

const sourcePlace: ChatPlace = {
  id: "t2-12",
  name: "Uradni članek STO",
  lat: 46.05,
  lng: 14.5,
  category: "source",
  provenance: "t2",
};

const citation = (title: string): StoCitation => ({
  title,
  url: `https://slovenia.info/${encodeURIComponent(title)}`,
  section: "Aktivne počitnice",
  lang: "sl",
  destinationSlug: "bled",
  destinationName: "Bled",
});

// ===========================================================================
// 1. ČISTE funkcije — isAiMention / stripAiMention
// ===========================================================================
describe("W2: @AI omemba (isAiMention / stripAiMention)", () => {
  test("prepozna @AI na začetku, v sredini in neodvisno od velikih črk", () => {
    expect(isAiMention("@AI kje lahko večerjamo v Bledu?")).toBe(true);
    expect(isAiMention("@ai kje lahko večerjamo?")).toBe(true);
    expect(isAiMention("Zanima me @AI mnenje o jeseni")).toBe(true);
    expect(isAiMention("@Ai kaj meniš?")).toBe(true);
  });

  test("prepozna slovensko/angleško različico žetona (@svetovalec/@advisor)", () => {
    expect(isAiMention("@svetovalec, kje spati?")).toBe(true);
    expect(isAiMention("@advisor what to do?")).toBe(true);
  });

  test("NE prepozna @AI znotraj druge besede (email/mention past)", () => {
    expect(isAiMention("pošlji na janez@aim.com prosim")).toBe(false);
    expect(isAiMention("kje spati v bledu")).toBe(false);
    expect(isAiMention("ai brez @ ni omemba")).toBe(false);
    expect(isAiMention("")).toBe(false);
  });

  test("stripAiMention odstrani žeton (vmesne/podvojene presledke pobrise)", () => {
    expect(stripAiMention("@AI kje lahko večerjamo v Bledu?")).toBe(
      "kje lahko večerjamo v Bledu?"
    );
    expect(stripAiMention("Zanima me @AI  mnenje o  jeseni")).toBe(
      "Zanima me mnenje o jeseni"
    );
    expect(stripAiMention("  @ai   ")).toBe("");
  });

  test("stripAiMention odstrani VEČ žetonov hkrati", () => {
    expect(stripAiMention("@AI kje večerjati in @AI kje spati?")).toBe(
      "kje večerjati in kje spati?"
    );
  });
});

// ===========================================================================
// 1b. ČISTE funkcije — rezervirana imena (značka AI je strežniška)
// ===========================================================================
describe("W2: rezervirana imena (isReservedAuthorName)", () => {
  test("AI svetovalec v vseh velikih črkah/diakritiki je rezerviran", () => {
    expect(isReservedAuthorName("AI svetovalec")).toBe(true);
    expect(isReservedAuthorName("AI SVETOVALEC")).toBe(true);
    expect(isReservedAuthorName("ai svetovalec")).toBe(true);
    expect(isReservedAuthorName("  Ai Svetovalec  ")).toBe(true);
    expect(isReservedAuthorName("AI")).toBe(true);
    expect(isReservedAuthorName("ai svetovalka")).toBe(true);
    expect(isReservedAuthorName("AI advisor")).toBe(true);
  });

  test("običajna človeška imena NISO rezervirana (tudi podobna)", () => {
    expect(isReservedAuthorName("Ana")).toBe(false);
    expect(isReservedAuthorName("Aiva")).toBe(false); // ne enači s "ai"
    expect(isReservedAuthorName("Maja")).toBe(false);
    expect(isReservedAuthorName("Aian")).toBe(false);
    expect(isReservedAuthorName("")).toBe(false);
  });
});

// ===========================================================================
// 1c. ČISTE funkcije — JSON priloga (buildAiPayload / parseAiPayload)
// ===========================================================================
describe("W2: JSON priloga AI odgovora (build/parse)", () => {
  test("buildAiPayload serializira veljavne kraje + vire; prazno → null", () => {
    const raw = buildAiPayload(
      [place("osm-1", "Gostilna pri Lipi"), t1Place("t1-bled", "Bled")],
      [citation("Kulinarika na Bledu")]
    );
    expect(raw).not.toBeNull();
    const parsed = parseAiPayload(raw);
    expect(parsed.places.map((p) => p.name)).toEqual([
      "Gostilna pri Lipi",
      "Bled",
    ]);
    expect(parsed.sources.map((s) => s.title)).toEqual([
      "Kulinarika na Bledu",
    ]);
  });

  test("buildAiPayload ohrani T2 vir (veljavna vrstica — gumba ni, značka pa je)", () => {
    const raw = buildAiPayload(
      [place("osm-1", "Gostilna"), sourcePlace],
      []
    );
    expect(raw).not.toBeNull();
    const parsed = parseAiPayload(raw);
    // T2 je VELJAVEN ChatPlace (isValidChatPlace ga sprejme — vrstica
    // zgodovine klepeta); UI mu gumba "Dodaj v pot" ne ponudi (1.44 kanon).
    expect(parsed.places).toHaveLength(2);
    expect(parsed.places[1]?.provenance).toBe("t2");
  });

  test("buildAiPayload KAPIRA na 8 krajev / 5 virov (ista meja kot /api/chat)", () => {
    const many = Array.from({ length: 12 }, (_, i) => place(`osm-${i}`, `Kraj ${i}`));
    const manyCites = Array.from({ length: 9 }, (_, i) => citation(`Vir ${i}`));
    const parsed = parseAiPayload(buildAiPayload(many, manyCites));
    expect(parsed.places).toHaveLength(8);
    expect(parsed.sources).toHaveLength(5);
  });

  test("prazni vhodi → null (vrstica takrat ne rabi priloge)", () => {
    expect(buildAiPayload([], [])).toBeNull();
  });

  test("parseAiPayload defenzivno: null/garbage/preveliko/napačna oblika → prazna", () => {
    expect(parseAiPayload(null)).toEqual({ places: [], sources: [] });
    expect(parseAiPayload(undefined)).toEqual({ places: [], sources: [] });
    expect(parseAiPayload("")).toEqual({ places: [], sources: [] });
    expect(parseAiPayload("ne json")).toEqual({ places: [], sources: [] });
    expect(parseAiPayload("[1,2,3]")).toEqual({ places: [], sources: [] });
    expect(parseAiPayload('"niz"')).toEqual({ places: [], sources: [] });
    // 21 kB prevelik vhod → prazna (meja 20 kB)
    expect(parseAiPayload("x".repeat(21_000))).toEqual({
      places: [],
      sources: [],
    });
    // kraji/viri z napačno obliko se odfiltrirajo (ne sesujejo celote)
    const bad = JSON.stringify({
      places: [{ id: 1, name: "brez lat" }, place("osm-ok", "OK")],
      sources: [{ title: "brez url" }, citation("OK vir")],
    });
    const parsed = parseAiPayload(bad);
    expect(parsed.places.map((p) => p.name)).toEqual(["OK"]);
    expect(parsed.sources.map((s) => s.title)).toEqual(["OK vir"]);
  });
});

// ===========================================================================
// 2. Startup migracija — idempotentnost na sqlite mock klientu
// ===========================================================================
describe("W2: startup migracija TripComment (idempotentna, additive-only)", () => {
  function makeSqliteMock(hasColumns: boolean) {
    const executed: string[] = [];
    const client = {
      $queryRawUnsafe: async (sql: string): Promise<unknown[]> => {
        if (sql.startsWith("PRAGMA table_info(SavedItinerary)")) {
          return [{ name: "id" }]; // sqlite narečje
        }
        if (sql.startsWith("PRAGMA table_info(TripComment)")) {
          return hasColumns
            ? [
                { name: "id" },
                { name: "shareId" },
                { name: "authorName" },
                { name: "text" },
                { name: "isAI" },
                { name: "payload" },
                { name: "createdAt" },
              ]
            : [{ name: "id" }, { name: "shareId" }, { name: "text" }];
        }
        return [];
      },
      $executeRawUnsafe: async (sql: string) => {
        executed.push(sql);
        return 1;
      },
    };
    return { client, executed };
  }

  test("prvi zagon doda OB stolpca (isAI + payload)", async () => {
    const { client, executed } = makeSqliteMock(false);
    // "as never": strukturalni mock (isti vzorec kot task8-f2a my-trip testi)
    const r = await migrateTripChatColumnsWith(client as never);
    expect(r.dialect).toBe("sqlite");
    expect(r.columnsAdded).toEqual(["isAI", "payload"]);
    expect(executed).toHaveLength(2);
    expect(executed[0]).toContain('"isAI"');
    expect(executed[1]).toContain('"payload"');
    // additive-only: samo ALTER ADD, nikoli DROP/ALTER obstoječega
    expect(executed.every((s) => s.startsWith("ALTER TABLE"))).toBe(true);
    expect(executed.join(" ")).not.toContain("DROP");
  });

  test("drugi zagon NE stori ničesar (idempotentnost)", async () => {
    const { client, executed } = makeSqliteMock(true);
    const r = await migrateTripChatColumnsWith(client as never);
    expect(r.dialect).toBe("sqlite");
    expect(r.columnsAdded).toEqual([]);
    expect(executed).toHaveLength(0);
  });
});

// ===========================================================================
// 3. SOURCE CONTRACT — pogodbe čez plasti
// ===========================================================================
describe("W2: SOURCE CONTRACT — shema + migracije", () => {
  test("prisma/schema.prisma: TripComment ima isAI + payload (aditivno)", () => {
    const schema = read("prisma/schema.prisma");
    const block = schema.slice(
      schema.indexOf("model TripComment {"),
      schema.indexOf("}", schema.indexOf("model TripComment {") + 10)
    );
    expect(block).toContain("isAI");
    expect(block).toContain("payload");
  });

  test("zgodovinska SQL migracija obstaja in je additive-only", () => {
    const p = "prisma/migrations/20260928120000_trip_chat_ai/migration.sql";
    expect(existsSync(new URL(p, ROOT))).toBe(true);
    const sql = read(p);
    expect(sql).toContain('ADD COLUMN "isAI"');
    expect(sql).toContain('ADD COLUMN "payload"');
    expect(sql).not.toContain("DROP");
  });

  test("instrumentation registrira startup korak schema:trip-chat-ai", () => {
    const src = read("src/instrumentation.ts");
    expect(src).toContain('"./lib/trip-chat-migration"');
    expect(src).toContain('name: "schema:trip-chat-ai"');
    // fail-open: napaka migracije ne podre strežnika
    expect(src).toContain("Shema migracija (klepet @AI) ni uspela");
  });
});

describe("W2: SOURCE CONTRACT — chat-engine (isti pogon za oba vstopa)", () => {
  test("src/lib/chat-engine.ts obstaja (izvlečeno iz /api/chat — en vir resnice)", () => {
    expect(existsSync(new URL("src/lib/chat-engine.ts", ROOT))).toBe(true);
  });

  test("/api/chat uporablja answerChatQuestion (ZERO FEATURE LOSS refactor)", () => {
    const src = read("src/app/api/chat/route.ts");
    expect(src).toContain('from "@/lib/chat-engine"');
    expect(src).toContain("answerChatQuestion(lastUserMessage, lang)");
    // stara pogodba ostaja: source "database", nikoli "ai"
    expect(src).toContain('source: "database"');
  });
});

describe("W2: SOURCE CONTRACT — API ruti klepeta", () => {
  test("GET /api/trip-comments podpira ?since= (inkrementalni polling, ASC)", () => {
    const src = read("src/app/api/trip-comments/route.ts");
    expect(src).toContain('searchParams.get("since")');
    expect(src).toContain('createdAt: useSince ? "asc" : "desc"');
    // isAI + payload sta v selectu (aditivno za prikaz AI vrstic)
    expect(src).toContain("isAI: true");
    expect(src).toContain("payload: true");
  });

  test("POST /api/trip-comments zavrne rezervirano ime (značka je strežniška)", () => {
    const src = read("src/app/api/trip-comments/route.ts");
    expect(src).toContain("isReservedAuthorName(authorName)");
  });

  test("/api/trip-comments/ai-reply: isti pogon + strežniško izstavljena vrstica", () => {
    const src = read("src/app/api/trip-comments/ai-reply/route.ts");
    expect(src).toContain('from "@/lib/chat-engine"');
    expect(src).toContain("answerChatQuestion(question, \"sl\")");
    expect(src).toContain("isAI: true");
    expect(src).toContain(`authorName: AI_ADVISOR_NAME`);
    expect(src).toContain("buildAiPayload(answer.places, answer.sources)");
    // vlogo za zasebne pote preverja (isti kanon kot komentarji)
    expect(src).toContain('communityTripGate(shareId, "comment")');
    // stripAiMention: žeton @AI se odstrani pred vprašanjem
    expect(src).toContain("stripAiMention(b.question)");
  });

  test("AI_ADVISOR_NAME je slovenski prikaz (SL-only površina /pot)", () => {
    expect(AI_ADVISOR_NAME).toBe("AI svetovalec");
  });
});

describe("W2: SOURCE CONTRACT — UI (TripSocial → skupinski klepet)", () => {
  const SOCIAL = read("src/components/trip-social.tsx");

  test("klepet: useTripChat živost + isAiMention veje v oddaji", () => {
    expect(SOCIAL).toContain("useTripChat(shareId, initialComments)");
    expect(SOCIAL).toContain("isAiMention(body)");
    expect(SOCIAL).toContain("askAi(body)");
    expect(SOCIAL).toContain("emitChatSignal(comment.id)");
  });

  test("@AI žeton vstavi v vnosno polje (gumb tipka, ne skrivnost)", () => {
    expect(SOCIAL).toContain("insertAiMention");
    expect(SOCIAL).toContain('aria-label="Vstavi omembo @AI svetovalca v sporočilo"');
  });

  test("AI mehurček: značka + predlogi krajev + viri (parseAiPayload)", () => {
    expect(SOCIAL).toContain("parseAiPayload(c.payload)");
    expect(SOCIAL).toContain("deterministično · iz podatkov platforme");
    expect(SOCIAL).toContain("Uradni viri");
  });

  test("\"Dodaj v pot\": isti kanon kot klepet \"+\" (čisti algoritem + CAS)", () => {
    expect(SOCIAL).toContain("addChatPlaceToItinerary(it, place, { locale: \"sl\" })");
    expect(SOCIAL).toContain("updateItinerary(shareId, result.itinerary, version)");
    expect(SOCIAL).toContain("Dodaj v pot");
    // ogled se NE šteje (?warm=1 — isti kanon kot offline ogrevanje)
    expect(SOCIAL).toContain("?warm=1");
  });

  test("telemetrija: chat_group_ai_asked + chat_group_place_added", () => {
    expect(SOCIAL).toContain('trackPlannerEvent("chat_group_ai_asked"');
    expect(SOCIAL).toContain('trackPlannerEvent("chat_group_place_added"');
    // dogodka sta registrirana v union tipu
    const analytics = read("src/lib/planner-analytics.ts");
    expect(analytics).toContain('"chat_group_ai_asked"');
    expect(analytics).toContain('"chat_group_place_added"');
  });

  test("všečki ostajajo (ZERO FEATURE LOSS — Heart toggle nespremenjen)", () => {
    expect(SOCIAL).toContain('"/api/trip-likes"');
    expect(SOCIAL).toContain("toggleLike");
  });

  test("/pot RSC posreduje isAI + payload v začetnih vrsticah", () => {
    const page = read("src/app/pot/[shareId]/page.tsx");
    expect(page).toContain("isAI: true");
    expect(page).toContain("payload: true");
  });
});

describe("W2: SOURCE CONTRACT — živost (polling + socket pospešitev)", () => {
  test("use-trip-chat: 6 s polling + 2 s prekrivanje + vidni zavihek", () => {
    const src = read("src/hooks/use-trip-chat.ts");
    expect(src).toContain("POLL_INTERVAL_MS = 6_000");
    expect(src).toContain("SINCE_OVERLAP_MS = 2_000");
    expect(src).toContain("document.hidden");
    expect(src).toContain("visibilitychange");
    expect(src).toContain("&since=");
  });

  test("use-trip-chat: chat:new → takojšen dotik (socket je pospešitev, ne pogoj)", () => {
    const src = read("src/hooks/use-trip-chat.ts");
    expect(src).toContain('s.on("chat:new", onNew)');
    // fail-silent: napaka fetcha NE sesuje hook-a
    expect(src).toContain("// fail-silent");
  });

  test("trip-presence service: chat:signal → chat:new broadcast (brez vsebine)", () => {
    const src = read("mini-services/trip-presence/index.ts");
    expect(src).toContain('"chat:signal"');
    expect(src).toContain('"chat:new"');
    // soba je resnica strežnika — signal tujemu shareId se zavrne
    expect(src).toContain("payload.shareId !== shareId");
  });

  test("DELJEN socket singleton (iskren števec prisotnih — 1 povezava/brskalnik)", () => {
    const lib = read("src/lib/trip-presence-socket.ts");
    expect(lib).toContain("acquireTripSocket");
    expect(lib).toContain("releaseTripSocket");
    expect(lib).toContain("XTransformPort");
    // use-trip-presence je prevezan na singleton (refactor varovalo)
    const presence = read("src/hooks/use-trip-presence.ts");
    expect(presence).toContain("acquireTripSocket()");
    expect(presence).toContain("releaseTripSocket()");
    // nikoli removeAllListeners KLIČ v hook cleanup-u (socket je deljen!)
    // (beseda v komentarju dokumentacije je dovoljena — preverjamo klic)
    expect(presence).not.toContain("removeAllListeners()");
  });
});
