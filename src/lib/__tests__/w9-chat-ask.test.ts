import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import slMessages from "@/i18n/messages/sl.json";
import enMessages from "@/i18n/messages/en.json";
import itMessages from "@/i18n/messages/it.json";
import deMessages from "@/i18n/messages/de.json";
import {
  CHAT_ASK_EVENT,
  CHAT_ASK_MAX,
  openChatWithQuestion,
} from "@/lib/chat-ask";

/**
 * W9 (Issue #15, 1.130.0): KONTEKSTUALNI DEEP-LINK VSEBINA → KLEPET.
 *
 * Verifikacijska merila iz issue #15:
 *  (1) /destinacija/* ponuja CTA, ki odpre klepet s pred-izpolnjenim
 *      vprašanjem v jeziku strani → SOURCE CONTRACT: vseh 5 destinacijskih
 *      pod-poti izrisuje ChatAskCta + Chatbot (prej 0 od 5).
 *  (2) vprašanje je vidno + UREDITLJIVO pred pošiljanjem → SOURCE
 *      CONTRACT: Chatbotov poslušalec NE kliče sendMessage (nikoli se ne
 *      pošlje samodejno); pas izpisuje vprašanje (aria-label + truncate).
 *  (3) klepet brez pre-filla bit-identičen → SOURCE CONTRACT: prop je
 *      neobvezen (initialQuestion?: string) + prazen fallback; obstoječe
 *      površine (<Chatbot /> brez propa) se NE spreminjajo (grep).
 *  (4) task71 pariteta razširjena na chatAsk ključe (12 × 4 jeziki).
 *
 * Vprašanja so živo preverjena proti /api/chat (vsi 4 jeziki vračajo
 * domenski odgovor s STO viri — ne iskreni odklon): "Kje spati v Bledu
 * z družino?" (isAccommodation: "spat"), "Dove dormire a Bled con la
 * famiglia?" ("dormire"), "Wo übernachten in Bled mit der Familie?"
 * ("übernacht"→norm), "What can I do in Piran?" (isActivity: "what to do").
 */

// __tests/ → src/lib/__tests/; koren projekta je TRI ravni višje
const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) =>
  readFileSync(new URL(p, ROOT), "utf-8") as string;

const DEST_PAGES = [
  "src/app/destinacija/[slug]/page.tsx",
  "src/app/destinacija/[slug]/things-to-do/page.tsx",
  "src/app/destinacija/[slug]/best-time-to-visit/[season]/page.tsx",
  "src/app/destinacija/[slug]/guide/[type]/page.tsx",
  "src/app/destinacija/[slug]/itinerary/[duration]/page.tsx",
];

const CHATBOT_SRC = read("src/components/chatbot.tsx");
const CTA_SRC = read("src/components/chat-ask-cta.tsx");

describe("W9: pogodba chat-ask.ts (dogodaj + odpre/kot ne pošlje)", () => {
  test("konstanti: ime dogodaja sledi konvenciji chat:* + meja 500 (ista kot vnosno polje)", () => {
    expect(CHAT_ASK_EVENT).toBe("chat:ask");
    expect(CHAT_ASK_MAX).toBe(500);
  });

  test("openChatWithQuestion je varen brez window (SSR) in ob praznem vprašanju", () => {
    // bun:test teče brez DOM — window ni definiran → tiho ignorira
    expect(() => openChatWithQuestion("Kje spati v Bledu?")).not.toThrow();
    expect(() => openChatWithQuestion("")).not.toThrow();
    expect(() => openChatWithQuestion("   ")).not.toThrow();
  });

  test("SOURCE CONTRACT: Chatbot posluša CHAT_ASK_EVENT in NE pošlje samodejno", () => {
    // poslušalec je prijavljen (odpre klepet ob kliku CTA)
    expect(CHATBOT_SRC).toContain(
      'window.addEventListener(CHAT_ASK_EVENT, onAsk)'
    );
    // VAROVALO W9: odpiranje s pred-fillom NIKOLI ne pokliče sendMessage —
    // uporabnik vprašanje uredi/izbriše in SAM pritisne Pošlji
    const listenerBody = CHATBOT_SRC.slice(
      CHATBOT_SRC.indexOf("const onAsk = (e: Event) => {"),
      CHATBOT_SRC.indexOf("window.addEventListener(CHAT_ASK_EVENT, onAsk)")
    );
    expect(listenerBody).not.toContain("sendMessage");
    expect(listenerBody).toContain("setOpen(true)");
    expect(listenerBody).toContain("setInput(q.trim().slice(0, CHAT_ASK_MAX)");
  });

  test("SOURCE CONTRACT: initialQuestion prop je NEOBAVEZEN (regresija 12+ površin)", () => {
    // podpis dovoljuje klic brez propa — vsi obstoječi <Chatbot /> ostanejo
    // bit-identični (ZERO FEATURE LOSS)
    expect(CHATBOT_SRC).toMatch(
      /export function Chatbot\(\{ initialQuestion \}: \{ initialQuestion\?: string \}\)/
    );
    // prazen/neznan prop → prazen vnos (fallback ?? "")
    expect(CHATBOT_SRC).toContain(
      'initialQuestion?.trim().slice(0, CHAT_ASK_MAX) ?? ""'
    );
  });

  test("SOURCE CONTRACT: CTA pas izpisuje vprašanje (vidno pred pošiljanjem) + odpre klepet", () => {
    // pas izpiše vprašanje (transparentnost) in kliče openChatWithQuestion
    expect(CTA_SRC).toContain("openChatWithQuestion(q)");
    expect(CTA_SRC).toMatch(/\{q\}/); // vprašanje se izriše v pasu/aria-label
    // telemetrija akvizicijskega lijaka (chat_ask_cta_clicked)
    expect(CTA_SRC).toContain('"chat_ask_cta_clicked"');
  });
});

describe("W9: vstopne točke na vseh 5 destinacijskih pod-poteh (38×5 strani)", () => {
  test("vsaka stran izrisuje ChatAskCta (CTA) in Chatbot (klepet — do W9 ga /destinacija/* ni imel)", () => {
    for (const page of DEST_PAGES) {
      const src = read(page);
      expect(src, `${page}: ChatAskCta`).toContain("<ChatAskCta");
      expect(src, `${page}: Chatbot`).toMatch(/<Chatbot initialQuestion=/);
    }
  });

  test("vprašanja se gradijo IZKLJUČNO iz chatAsk slovarja v jeziku strani (getTranslations)", () => {
    for (const page of DEST_PAGES) {
      const src = read(page);
      expect(src, `${page}: chatAsk slovar`).toContain(
        'getTranslations("chatAsk")'
      );
    }
  });

  test("things-to-do prazno stanje: pas SAMO na ne-SL (SL ima žive DB sekcije ponudnikov)", () => {
    const src = read("src/app/destinacija/[slug]/things-to-do/page.tsx");
    expect(src).toContain("{!isSl && (");
    // DB sekcije ostanejo pogojene z isSl (P4-8 se NE spreminja)
    expect(src).toContain("{isSl && seoExperiences.length > 0 && (");
  });

  test("guide persona: vprašanje izbrano po tipu vodnika (4 osebe × 38 destinacij)", () => {
    const src = read("src/app/destinacija/[slug]/guide/[type]/page.tsx");
    expect(src).toContain('"romanticni-pobeg": "qStayRomantic"');
    expect(src).toContain('druzinski: "qStayFamily"');
    expect(src).toContain('budget: "qStayBudget"');
    expect(src).toContain('vikend: "qStayWeekend"');
  });

  test("REGRESIJA: obstoječe površine klepeta ostanejo <Chatbot /> brez pre-filla", () => {
    // 12+ obstoječih površin NE sme dobiti initialQuestion (bit-identično
    // obnašanje brez dogodka — merilo W9 (3)); vzore: domov, načrtuj,
    // destinacije, zemljevid, tržnica, potovanje
    const surfaces = [
      "src/app/page.tsx",
      "src/app/nacrtuj/page.tsx",
      "src/app/destinacije/page.tsx",
      "src/app/zemljevid/page.tsx",
    ];
    for (const s of surfaces) {
      const src = read(s);
      expect(src, `${s}: ohrani čist <Chatbot />`).toMatch(/<Chatbot \/>/);
      expect(src, `${s}: brez initialQuestion`).not.toContain(
        "initialQuestion="
      );
    }
  });
});

describe("W9: chatAsk slovar — 12 ključev × 4 jeziki (merilo 4: pariteta)", () => {
  const NS_KEYS = [
    "askAbout",
    "askStay",
    "askBestTime",
    "askThingsToDo",
    "qHero",
    "qStayRomantic",
    "qStayFamily",
    "qStayBudget",
    "qStayWeekend",
    "qBestTime",
    "qThingsToDo",
    "qItinerary",
  ] as const;

  const dicts = {
    sl: (slMessages as unknown as Record<string, Record<string, string>>)
      .chatAsk,
    en: (enMessages as unknown as Record<string, Record<string, string>>)
      .chatAsk,
    it: (itMessages as unknown as Record<string, Record<string, string>>)
      .chatAsk,
    de: (deMessages as unknown as Record<string, Record<string, string>>)
      .chatAsk,
  };

  test("vseh 12 ključev obstaja v vseh 4 jezikih (task71 pariteta razširjena)", () => {
    for (const lang of ["sl", "en", "it", "de"] as const) {
      expect(Object.keys(dicts[lang]).sort()).toEqual([...NS_KEYS].sort());
    }
  });

  test("vprašanja vsebujejo ključne besede, ki jih domenski motor POZNA (ne odklon)", () => {
    // živo preverjeno: vsak jezik sproži domenski odgovor (accommodation/
    // activity intent) — ne iskreni odklon
    expect(dicts.sl.qStayFamily).toContain("Kje spati");
    expect(dicts.sl.qBestTime).toContain("Kdaj");
    expect(dicts.sl.qThingsToDo).toContain("počnem");
    expect(dicts.en.qStayFamily).toContain("Where to stay");
    expect(dicts.en.qThingsToDo).toContain("What can I do");
    expect(dicts.it.qStayFamily).toContain("Dove dormire");
    expect(dicts.it.qItinerary).toContain("non devo perdermi");
    expect(dicts.de.qStayFamily).toContain("Wo übernachten");
    expect(dicts.de.qBestTime).toContain("beste Reisezeit");
  });

  test("oznake CTA so pravi prevodi (ne kopije SL) + placeholder {name} skladen", () => {
    for (const key of ["askAbout", "qHero", "qBestTime", "qItinerary"] as const) {
      expect(dicts.en[key]).not.toBe(dicts.sl[key]);
      expect(dicts.it[key]).not.toBe(dicts.sl[key]);
      expect(dicts.de[key]).not.toBe(dicts.sl[key]);
    }
    for (const lang of ["sl", "en", "it", "de"] as const) {
      expect(dicts[lang].askAbout).toContain("{name}");
      expect(dicts[lang].qHero).toContain("{name}");
    }
  });
});
