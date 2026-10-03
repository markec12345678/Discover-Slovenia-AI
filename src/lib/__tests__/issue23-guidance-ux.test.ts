// ============================================================================
// ISSUE #23 — GUIDANCE UX: source-contract testi (1.163.0)
// ============================================================================
// Zaklene integracije vodene plasti na vseh površinah (vzorec
// issue22-guardian-ux.test.ts): zero feature loss (obstoječi CTA-ji
// ostanejo), a11y pogodbe (role/aria-live/44px), iskrene popravke
// (#kviz sidro, visitCount semantika) in analitično zaklenjenost.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sl from "@/i18n/messages/sl.json";
import en from "@/i18n/messages/en.json";

const ROOT = join(import.meta.dir, "../../..");
const read = (rel: string): string =>
  readFileSync(join(ROOT, rel), "utf-8");

const PAGE = read("src/app/page.tsx");
const MY_TRIP = read("src/components/my-trip-view.tsx");
const GO_MODE = read("src/components/sections/go-mode.tsx");
const TRIP_COMPLETE = read("src/components/sections/go-mode/trip-complete.tsx");
const ADD_BTN = read("src/components/add-to-trip-button.tsx");
const PLANNER = read("src/components/sections/itinerary-planner.tsx");
const TRIP_PROFILE = read("src/components/trip-profile.tsx");
const BETA = read("src/components/beta-banner.tsx");
const MOJA = read("src/app/moja-potovanja/moja-potovanja-view.tsx");
const STRIP = read("src/components/guidance/guidance-strip.tsx");
const FIRST_RUN = read("src/components/guidance/first-run-card.tsx");
const ENGINE = read("src/lib/guidance/guide-engine.ts");
const ANALYTICS_CLIENT = read("src/lib/planner-analytics.ts");
const ANALYTICS_SERVER = read("src/app/api/analytics/event/route.ts");

// ---------------------------------------------------------------------------
// 1. DOMOV: first-run kartica + vodeni trak (montažni red)
// ---------------------------------------------------------------------------

describe("ISSUE #23 UX — domov", () => {
  test("① GuidanceFirstRunCard je montirana NAD HomeEntryRow (isti prostor kot welcome baner)", () => {
    const frIdx = PAGE.indexOf("<GuidanceFirstRunCard />");
    const entryIdx = PAGE.indexOf("<HomeEntryRow />");
    const wbIdx = PAGE.indexOf("<WelcomeBackWrapper />");
    expect(frIdx).toBeGreaterThan(-1);
    expect(wbIdx).toBeGreaterThan(-1);
    expect(frIdx).toBeGreaterThan(wbIdx); // po welcome wrapper
    expect(entryIdx).toBeGreaterThan(frIdx); // pred vstopno vrstico
  });

  test("② GuidanceStrip (home) je montiran in skriva NEW_USER (first-run kartica pokriva tisto stanje — brez dvojnika)", () => {
    expect(PAGE).toContain('<GuidanceStrip surface="home" hideStates={["NEW_USER"]} />');
  });

  test("③ first-run kartica ponudi VSEH 5 nameri vključno »Ne vem — pokaži mi« (§6/§18)", () => {
    for (const key of [
      "welcome.intentPlan",
      "welcome.intentDiscover",
      "welcome.intentFind",
      "welcome.intentHelp",
      "welcome.intentDontKnow",
    ]) {
      expect(FIRST_RUN).toContain(`t("${key}")`);
    }
    // vodena pot se vklopi SAMO pri dont_know
    expect(FIRST_RUN).toContain('intent === "dont_know"');
    expect(FIRST_RUN).toContain("setGuidedTour(true)");
  });

  test("④ first-run pomoč odpre klepet z VNAPEJ izpolnjenim vprašanjem (W9 kanon — brez samodejnega pošiljanja)", () => {
    expect(FIRST_RUN).toContain("openChatWithQuestion");
    expect(FIRST_RUN).toContain('t("welcome.helpQuestion")');
  });

  test("⑤ a11y traku: role=status + aria-live=polite + aria-current=step + h-11 gumbi", () => {
    expect(STRIP).toContain('role="status"');
    expect(STRIP).toContain('aria-live="polite"');
    expect(STRIP).toContain('aria-current={isCurrent ? "step" : undefined}');
    expect(STRIP).toMatch(/Button[^>]*className="[^"]*h-11/g);
  });

  test("⑥ trak izrisuje SPOROČILA iz jedra (messageKey) — nikoli hardcodeana (ena resnica)", () => {
    expect(STRIP).toContain("t(`msg.${guidance.messageKey}`");
    expect(STRIP).toContain("ACTION_LABEL_KEYS");
    // veriga iz jedra (chain.current), ne lastna logika
    expect(STRIP).toContain("guidance.chain");
  });

  test("⑦ zavrnitev traku je SESSION-scoped (naslednja seja se ponudi znova — §7 progresivno)", () => {
    expect(STRIP).toContain("sessionStorage.setItem(dismissKey(");
    expect(STRIP).toContain('dai:guidance-strip:');
  });
});

// ---------------------------------------------------------------------------
// 2. HUB (/moja-potovanja): verižni napredek brez novih CTA
// ---------------------------------------------------------------------------

describe("ISSUE #23 UX — hub", () => {
  test("⑧ GuidanceChainProgress je v glavi razdelka Moja pot (informacijsko — brez CTA podvajanja)", () => {
    expect(MY_TRIP).toContain('id="moja-pot"');
    const cpIdx = MY_TRIP.indexOf("<GuidanceChainProgress />");
    expect(cpIdx).toBeGreaterThan(-1);
    // ZERO FEATURE LOSS: obstoječi CTA-ji ostanejo
    expect(MY_TRIP).toContain("s.continue"); // Nadaljuj načrtovanje
    expect(MY_TRIP).toContain('href="/na-poti"'); // NA POTI trak (#16)
  });

  test("⑨ kartice potovanj: iskrena oznaka NA POTI za aktivno pot (veza z dai:go-trip v2)", () => {
    expect(MOJA).toContain("L.onTrip[lang]");
    expect(MOJA).toContain("loadGoTrip()");
    expect(MOJA).toContain("activeGoShareId === trip.shareId");
  });
});

// ---------------------------------------------------------------------------
// 3. GO MODE: terminalno stanje COMPLETED (največja vrzel verige)
// ---------------------------------------------------------------------------

describe("ISSUE #23 UX — Go Mode", () => {
  test("⑩ TripComplete je integriran v go-mode.tsx (import + pogoji: 0 preostalih, 0 kasnejših dni, 1+ obdelanih)", () => {
    expect(GO_MODE).toContain('from "@/components/sections/go-mode/trip-complete"');
    expect(GO_MODE).toContain("view.remaining.length === 0");
    expect(GO_MODE).toContain("view.laterDays.every((d) => d.count === 0)");
    expect(GO_MODE).toContain("view.done.length + view.skipped.length > 0");
  });

  test("⑪ ZERO FEATURE LOSS: iskreno noEntryLeft sporočilo OSTANE za dan z nadaljnjimi dnevi", () => {
    expect(GO_MODE).toContain("GO_LABELS.noEntryLeft");
  });

  test("⑫ TripComplete: povzetek celega potovanja (dnevi + opravljeni/preskočeni iz VSEH dni) + deljena povezava v2", () => {
    // seštevek VSEH dni se izračuna v go-mode.tsx (klicalnik ima done/skipped
    // zemljevidov) in se poda komponenti kot props
    expect(GO_MODE).toContain("trip?.days.length ?? 1");
    expect(GO_MODE).toContain("d.entries.filter((e) => done[e.key])");
    expect(GO_MODE).toContain("d.entries.filter((e) => skipped[e.key])");
    expect(GO_MODE).toContain("record?.version === 2 && record.shareId ? `/pot/${record.shareId}` : null");
    // komponenta izrisuje posredovane skupne števce
    expect(TRIP_COMPLETE).toContain("days, doneTotal, skippedTotal");
  });

  test("⑬ TripComplete a11y + L-canon (sl/en — iskrena meja /na-poti) + analitika", () => {
    expect(TRIP_COMPLETE).toContain('role="status"');
    // Sklop 8 (1.170.0): 6-jezični GoLang (prej "sl" | "en").
    expect(TRIP_COMPLETE).toContain('lang: GoLang;');
    expect(TRIP_COMPLETE).toContain('state: "COMPLETED"');
    expect(TRIP_COMPLETE).toMatch(/h-11/);
  });
});

// ---------------------------------------------------------------------------
// 4. VERIGA DISCOVER → ADD → PLAN: naslednji korak po vsakem dejanju
// ---------------------------------------------------------------------------

describe("ISSUE #23 UX — veriga korakov", () => {
  test("⑭ add-to-trip toast: »Odpri pot« ostane PRVI, »Načrtuj potovanje« je novi naslednji korak (§13)", () => {
    const openIdx = ADD_BTN.indexOf("s.openTrip}");
    const planIdx = ADD_BTN.indexOf("s.planTrip}");
    expect(openIdx).toBeGreaterThan(-1);
    expect(planIdx).toBeGreaterThan(openIdx);
    expect(ADD_BTN).toContain("planTrip:");
  });

  test("⑮ add-to-trak je 6-jezičen (planTrip v vseh 6 L slovarjih)", () => {
    for (const loc of ["sl:", "en:", "it:", "de:", "fr:", "es:"]) {
      expect(ADD_BTN).toContain(`  ${loc} {`);
    }
    expect((ADD_BTN.match(/planTrip: "/g) ?? []).length).toBe(6);
  });

  test("⑯ planner po SHRANI: toast ponudi Zaženi Na poti (handleStartGoMode) + opis omenja Moja potovanja (§14)", () => {
    expect(PLANNER).toContain("handleStartGoMode();");
    expect(PLANNER).toContain('t("goModeButton")');
    expect(PLANNER).toContain("ToastAction");
    // savedToastDesc ×6 omenja naslednji korak
    expect(sl.planner.savedToastDesc).toContain("Moja potovanja");
    expect(en.planner.savedToastDesc).toContain("My travels");
  });
});

// ---------------------------------------------------------------------------
// 5. RETURNING USER: stanje-veden welcome baner + popravki
// ---------------------------------------------------------------------------

describe("ISSUE #23 UX — returning user", () => {
  test("⑰ WelcomeBackBanner izpelje stanje iz jedra (useGuidance) — nadaljevanje NI hardcodeano", () => {
    expect(TRIP_PROFILE).toContain('useGuidance("home")');
    expect(TRIP_PROFILE).toContain('t("continueTrip")');
    expect(TRIP_PROFILE).toContain('t("nextStop"');
    expect(TRIP_PROFILE).toContain('t("ctaGo")');
    expect(TRIP_PROFILE).toContain('t("ctaPlan")');
  });

  test("⑱ ZERO FEATURE LOSS: obstoječi povzetek profila (knowsLabel/quizCta) ostaja", () => {
    expect(TRIP_PROFILE).toContain('t("knowsLabel")');
    expect(TRIP_PROFILE).toContain('t.rich("quizCta"');
    expect(TRIP_PROFILE).toContain('t("visitedCount"');
  });

  test("⑲ POPRAVEK #kviz: povezava vodi na /nacrtuj#kviz (ne več mrtvo sidro #kviz na domov)", () => {
    expect(TRIP_PROFILE).toContain('href="/nacrtuj#kviz"');
    expect(TRIP_PROFILE).not.toContain('href="#kviz"');
  });

  test("⑳ POPRAVEK visitCount: dodajanje destinacije/onboarding NE štejeta obiskov (seje šteje samo wrapper)", () => {
    expect(TRIP_PROFILE).not.toContain("visitCount: base.visitCount + 1");
  });

  test("㉑ mrtev TripProfileOnboarding je ODSTRANJEN (nikoli montiran, SL-only — nič izgubljene funkcije)", () => {
    expect(TRIP_PROFILE).not.toContain("TripProfileOnboarding");
  });
});

// ---------------------------------------------------------------------------
// 6. KONFLIKTI CTA (§33) + analitika
// ---------------------------------------------------------------------------

describe("ISSUE #23 UX — konflikti in meritve", () => {
  test("㉒ BetaBanner: zavrnitev je TRAJNA (localStorage) — manj šuma na dnu mobilnega pogleda", () => {
    expect(BETA).toContain('BETA_DISMISSED_KEY = "dsa-beta-dismissed"');
    expect(BETA).toContain("localStorage.setItem(BETA_DISMISSED_KEY");
  });

  test("㉓ 8 vodnih dogodkov je v klientnem union-u IN strežniški whitelisti (3-datotečna zaklenjenost)", () => {
    const events = [
      "guidance_shown",
      "guidance_action_clicked",
      "guidance_dismissed",
      "guidance_completed",
      "first_run_started",
      "first_run_completed",
      "intent_selected",
      "next_step_completed",
    ];
    for (const e of events) {
      expect(ANALYTICS_CLIENT).toContain(`"${e}"`);
      expect(ANALYTICS_SERVER).toContain(`"${e}"`);
    }
  });

  test("㉔ jedro NE vsebuje imen stanj, ki bi se lahko prikazala uporabniku (izris je vedno v komponenti)", () => {
    // Engine izvozi SAMO strukturo — sporočila so ključi (ns guidance.msg.*)
    expect(ENGINE).toContain("messageKey");
    expect(ENGINE).not.toContain("Dobrodošel"); // brez SL besedila v jedru
  });

  test("㉕ i18n ns `guidance`: vsa sporočila jedra (14 messageKey) + 12 akcij + 5 korakov verige obstajajo v SL in EN", () => {
    const msgKeys = [
      "newUser", "discovering", "building", "ready", "bookingPending",
      "started", "startedNextDay", "navigating", "arrived", "freeTime",
      "needsAttention", "blocked", "recovery", "completed", "unknown",
    ];
    const actionKeys = [
      "discover", "plan", "openTrips", "book", "startTrip", "goMode",
      "navigate", "completeStop", "freeTime", "recovery", "newTrip", "askDiscover",
    ];
    for (const k of msgKeys) {
      expect(sl.guidance.msg[k], `sl.msg.${k}`).toBeTruthy();
      expect(en.guidance.msg[k], `en.msg.${k}`).toBeTruthy();
    }
    for (const k of actionKeys) {
      expect(sl.guidance.actions[k], `sl.actions.${k}`).toBeTruthy();
      expect(en.guidance.actions[k], `en.actions.${k}`).toBeTruthy();
    }
    for (const k of ["discover", "plan", "book", "go", "finish"]) {
      expect(sl.guidance.chain[k]).toBeTruthy();
      expect(en.guidance.chain[k]).toBeTruthy();
    }
  });
});
