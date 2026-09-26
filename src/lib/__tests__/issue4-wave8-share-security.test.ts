import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, createHmac } from "node:crypto";

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  adminSessionFrom,
  adminSessionSetCookie,
  issueAdminSessionToken,
  verifyAdminSessionToken,
} from "@/lib/security";

// ============================================================================
// ISSUE #4 VAL 8 (§23 + §24) — SHARE LINKS + PRIVACY · SECURITY + ABUSE
// ============================================================================
//
// Zahteva Issue #4 besedno:
//   §23 "Preveri /pot/[shareId]: revocation, expiration, edit token,
//        viewer/owner, indexing, robots, sensitive booking data in PII."
//   §24 "Preveri User, Owner, Admin, Moderator, shareId, editToken,
//        localStorage IDs, booking state, payout state, Stripe, webhook,
//        owner in admin endpoints. Preveri rate limiting za AI, TTS,
//        comments, votes, likes, polls, diary, public trip, owner APIs,
//        auth, password reset in verification. Če je rate limit
//        process-local, dokumentiraj production omejitev in določi
//        shared rešitev. …"
//
// OBLJUBE, ki jih ta suita kodira (revizija 20-a/20-b audita):
//
//   §A IMPORTDATA LEAK (P1): GET/POST /api/journey/bookings NE vrača
//      surovega importData (contact/e-pošta/telefon/notes/guestName iz
//      uvoženih potrditev — prej javno komurkoli s shareId). Prikazni
//      povzetek gradi agregator (bookingSummaryOf).
//   §B ROBOTS (P1): public/robots.txt je ODSTRANJEN (konflikt z route
//      handlerjem = dev 500; v produkciji je statična datoteka tiho
//      PREGLASILA dinamični handler → brez Sitemap direktive in brez
//      Disallow /admin,/owner,/api/). Edini vir resnice = route handler.
//   §C CLAIM TAKEOVER (P2): prevzem anonimne poti zahteva editToken
//      (prej zadostoval JAVEN shareId — prejemnik povezave bi si po
//      prijavi prevzel pot kot so-lastnika).
//   §D INVITE TTL (P2): PENDING vabila potečejo po 7 dneh (410 Gone).
//   §E ADMIN SESSION (P2): skupno admin geslo NE živi več v localStorage
//      ("admin_token") — httpOnly HMAC piškotek (60 min) izda verify,
//      sprejmejo vsi admin endpointi (piškotek ALI glava — nazaj
//      kompatibilno), odjava počisti piškotek.
//   §F RATE LIMITI (P3): weather (edini javni zunanji-proksi brez meje),
//      owner API-ji (14 datotek, skupni bucket "owner-api"), user/trips,
//      provider-roi, stripe checkout/portal.
//   §G KONSISTENCA (P3): timing-safe primerjava editTokenHash;
//      X-Robots-Tag noindex na /pot/*; obstoj ZASEBNE poti ni oracle
//      (404 namesto 403 na skupnostnih rutah).
//   §H D5 RESNICA: limiter je fiksno-oknenski, per-instanca; produkcija
//      = 1 Render instanca → meje držijo; shared rešitev (Upstash REST)
//      je DOLOČENA v dokumentaciji (2 env spremenljivki + async načrt).
// ============================================================================

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// ---------------------------------------------------------------------------
// §A — IMPORTDATA LEAK (P1): surovi podatki uvoženih rezervacij NE gredo
// v javne odgovore. Dva iztočna kanala zaprta: GET (način A + B) in POST
// (idempotent/transitioned vračata obstoječo vrstico).
// ---------------------------------------------------------------------------
describe("ISSUE #4 VAL 8 §A: journey/bookings NE razkriva surovega importData", () => {
  const bookingsRoute = source("src/app/api/journey/bookings/route.ts");
  const code = stripComments(bookingsRoute);

  test("SELECT_FIELDS (vs odgovor GET/POST/PATCH) ne vsebuje importData", () => {
    // odstranitev `importData: true` iz skupnega selecta zapre VSE kanale
    // hkrati (GET shareId, GET products, POST idempotent/transitioned,
    // PATCH — patch kanal je žetonoma zaklenjen, a enak select za vse).
    expect(code).not.toContain("importData: true");
  });

  test("POZITIVNI dokaz popravka: komentar VAL 8 obstaja v datoteki", () => {
    expect(bookingsRoute).toContain("ISSUE #4 §23 (VAL 8, P1)");
  });

  test("klienti odgovora NE berejo importData (trip-reservations/timeline/journey-trip)", () => {
    for (const rel of [
      "src/components/trip-reservations.tsx",
      "src/components/trip-timeline.tsx",
      "src/components/journey-trip.tsx",
    ]) {
      expect(source(rel)).not.toMatch(/\bimportData\b/);
    }
  });

  test("agregator še vedno gradi prikazni povzetek (brez contact/notes) — navzkrižje ni mogoče", () => {
    const agg = source("src/app/api/trip/[shareId]/route.ts");
    expect(agg).toContain("bookingSummaryOf");
    // povzetek izlušči SAMO 6 prikaznih polj — contact/notes ostajata strežniška
    const summaryBody = agg.slice(
      agg.indexOf("function bookingSummaryOf"),
      agg.indexOf("export async function GET")
    );
    expect(summaryBody).not.toContain('s("contact")');
    expect(summaryBody).not.toContain('s("notes")');
    expect(summaryBody).toContain('s("guestName")');
    expect(summaryBody).toContain('s("reservationNumber")');
  });
});

// ---------------------------------------------------------------------------
// §B — ROBOTS.TXT (P1): en vir resnice (route handler), brez konflikta.
// ---------------------------------------------------------------------------
describe("ISSUE #4 VAL 8 §B: robots.txt — route handler je edini vir", () => {
  test("public/robots.txt NE obstaja več (konflikt public/page = dev 500 + produkcijski override)", () => {
    expect(existsSync(join(process.cwd(), "public/robots.txt"))).toBe(false);
  });

  test("route handler zapira /admin, /owner, /api/ in objavi Sitemap", () => {
    const route = source("src/app/robots.txt/route.ts");
    expect(route).toContain('"/admin", "/owner", "/api/"');
    expect(route).toContain("Disallow: ${p}");
    expect(route).toContain("Sitemap: ${base}/sitemap.xml");
    // edge mora vedno preverjati izvor (zastareli CDN vnos incident)
    expect(route).toContain("max-age=0, must-revalidate");
  });

  test("sitemap NE vsebuje deljenih poti (/pot/) — indeksiranje zaprto z obeh strani", () => {
    const sitemap = source("src/lib/sitemap-urls.ts");
    expect(sitemap).not.toMatch(/\/pot\//);
  });

  test("/pot stran ima meta robots index:false (neodvisna plast od glave)", () => {
    const page = source("src/app/pot/[shareId]/page.tsx");
    expect(page).toContain("index: false");
  });
});

// ---------------------------------------------------------------------------
// §C — CLAIM TAKEOVER (P2): prevzem zahteva dokaz lastništva.
// ---------------------------------------------------------------------------
describe("ISSUE #4 VAL 8 §C: claim zahteva editToken (dokaz lastništva)", () => {
  const claim = source("src/app/api/user/trips/claim/route.ts");

  test("strežnik preverja editTokenHash + timingSafeEqual", () => {
    expect(claim).toContain("editTokens");
    expect(claim).toContain("timingSafeEqual(tokenHash, trip.editTokenHash)");
    // pote brez žetona (stare, pre-F7) NE morejo biti prevzete — fail-closed
    expect(claim).toContain("if (!trip.editTokenHash) continue;");
  });

  test("žetoni sprejeti SAMO za zahtevane shareId-je (ne poljuben niz)", () => {
    expect(claim).toContain("shareIds.includes(sid)");
  });

  test("klient (prijava) pošlje žetone iz localStorage", () => {
    // TASK 8 / D8-E (issue #8 §52): /prijava je razcepljena na server ovoj
    // (page.tsx — Navigation+Footer lupina) + klientni pogled
    // (prijava-view.tsx), ker je Footer async server komponenta. Logika
    // prijave/prevzema (claimSavedTrips) je nespremenjena — prebrana iz
    // klientnega pogleda.
    const page = source("src/app/prijava/prijava-view.tsx");
    expect(page).toContain("getEditToken(sid)");
    expect(page).toContain("body: JSON.stringify({ shareIds, editTokens })");
  });
});

// ---------------------------------------------------------------------------
// §D — INVITE TTL (P2): vabila potečejo po 7 dneh.
// ---------------------------------------------------------------------------
describe("ISSUE #4 VAL 8 §D: PENDING vabila potečejo (7 dni)", () => {
  const accept = source("src/app/api/trip/collaborators/accept/route.ts");

  test("TTL konstanta = 7 dni", () => {
    expect(accept).toContain("INVITE_TTL_MS = 7 * 24 * HOUR_MS");
  });

  test("poteklo PENDING vabilo → 410 Gone (iskreno sporočilo)", () => {
    expect(accept).toContain("status: 410");
    expect(accept).toContain("veljavna so 7 dni");
  });

  test("createdAt je v selectu (časovni žig brez shemske spremembe)", () => {
    expect(accept).toContain("createdAt: true");
  });
});

// ---------------------------------------------------------------------------
// §E — ADMIN SESSION (P2): geslo izven brskalnika. Čisti kripto testi
// (security.ts je listni čist modul) + viri (page/rute).
// ---------------------------------------------------------------------------
describe("ISSUE #4 VAL 8 §E: admin session — čisti primitivi (security.ts)", () => {
  const SAVED = process.env.ADMIN_PASSWORD;
  const TEST_PASSWORD = "val8-test-admin-password";

  beforeAll(() => {
    process.env.ADMIN_PASSWORD = TEST_PASSWORD;
  });
  afterAll(() => {
    if (SAVED === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = SAVED;
  });

  test("issueAdminSessionToken: oblika <expHex>.<hmac64> + TTL 60 min", () => {
    const token = issueAdminSessionToken();
    expect(token).not.toBeNull();
    expect(token!).toMatch(/^[0-9a-f]{1,12}\.[0-9a-f]{64}$/);
    const expHex = token!.split(".")[0];
    const expMs = Number.parseInt(expHex, 16) * 1000;
    // izdaja ~now + TTL (dovoli 2 s skewedca testnega časa)
    expect(Math.abs(expMs - (Date.now() + ADMIN_SESSION_TTL_MS))).toBeLessThan(2000);
  });

  test("verifyAdminSessionToken: izdani žeton velja, sipan ne, potekel ne", () => {
    const token = issueAdminSessionToken()!;
    expect(verifyAdminSessionToken(token)).toBe(true);
    // sipan HMAC
    const tampered = token.split(".")[0] + "." + "0".repeat(64);
    expect(verifyAdminSessionToken(tampered)).toBe(false);
    // potekel (exp v preteklosti, pravilen podpis — izračun lokalno)
    const key = createHash("sha256")
      .update(`dsa-admin-session:${TEST_PASSWORD}`)
      .digest();
    const pastExp = Math.floor((Date.now() - 1000) / 1000).toString(16);
    const pastHmac = createHmac("sha256", key).update(pastExp).digest("hex");
    expect(verifyAdminSessionToken(`${pastExp}.${pastHmac}`)).toBe(false);
  });

  test("fail-closed: brez ADMIN_PASSWORD ni izdaje ne verifikacije", () => {
    const saved = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    try {
      expect(issueAdminSessionToken()).toBeNull();
      expect(verifyAdminSessionToken("1234." + "a".repeat(64))).toBe(false);
    } finally {
      process.env.ADMIN_PASSWORD = saved;
    }
  });

  test("adminSessionFrom: Request s piškotkom velja, brez ne", () => {
    const token = issueAdminSessionToken()!;
    const withCookie = new Request("https://example.com/api/admin/analytics", {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}; other=x` },
    });
    expect(adminSessionFrom(withCookie)).toBe(true);
    const without = new Request("https://example.com/api/admin/analytics");
    expect(adminSessionFrom(without)).toBe(false);
    // napačen piškotek (ime se ujema, vrednost ne)
    const bogus = new Request("https://example.com/", {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=deadbeef.deadbeef` },
    });
    expect(adminSessionFrom(bogus)).toBe(false);
  });

  test("Set-Cookie: HttpOnly + SameSite=Lax + Max-Age; Secure samo po izbiri", () => {
    const token = issueAdminSessionToken()!;
    const insecure = adminSessionSetCookie(token, { secure: false });
    expect(insecure).toContain(`${ADMIN_SESSION_COOKIE}=`);
    expect(insecure).toContain("HttpOnly");
    expect(insecure).toContain("SameSite=Lax");
    expect(insecure).toContain(`Max-Age=${Math.floor(ADMIN_SESSION_TTL_MS / 1000)}`);
    expect(insecure).not.toContain("Secure");
    const secure = adminSessionSetCookie(token, { secure: true });
    expect(secure).toContain("Secure");
  });
});

describe("ISSUE #4 VAL 8 §E: admin session — površine (page + rute + klicalci)", () => {
  test("admin/page.tsx NE shranjuje gesla v localStorage (admin_token odstranjen)", () => {
    const page = source("src/app/admin/page.tsx");
    // CODE (brez komentarjev — zgodovinski komentar sme omenjati preteklost)
    const code = stripComments(page);
    expect(code).not.toContain('"admin_token"');
    expect(code).not.toMatch(/localStorage\.setItem/);
    // prijava prek verify (piškotek), odjava prek logout (počisti server)
    expect(code).toContain('fetch("/api/admin/verify"');
    expect(code).toContain('fetch("/api/admin/logout"');
  });

  test("verify ruta: POST izda Set-Cookie; GET preverja sejo brez telesa", () => {
    const verify = source("src/app/api/admin/verify/route.ts");
    expect(verify).toContain("issueAdminSessionToken()");
    expect(verify).toContain("adminSessionSetCookie");
    expect(verify).toContain("export async function GET");
    expect(verify).toContain("requestIsSecure");
  });

  test("logout ruta obstaja in čisti piškotek (Max-Age=0)", () => {
    const logout = source("src/app/api/admin/logout/route.ts");
    expect(logout).toContain("Max-Age=0");
    // piškotek po imenu prek uvožene konstante (en vir resnice)
    expect(logout).toContain("ADMIN_SESSION_COOKIE");
    expect(logout).toContain("HttpOnly");
  });

  test("checkAdmin sprejme Request (piškotek prvi, glava fallback) — requireAdmin posreduje request", () => {
    const guards = source("src/lib/auth-guards.ts");
    expect(guards).toContain("adminSessionFrom(input)");
    expect(guards).toContain('input.headers.get("x-admin-password")');
    expect(guards).toContain("checkAdmin(request))");
  });

  test("admin rute uporabljajo checkAdmin(request) — vzorec (newsletter + listings verify)", () => {
    expect(source("src/app/api/newsletter/subscribe/route.ts")).toContain(
      "checkAdmin(request))"
    );
    expect(source("src/app/api/admin/listings/[id]/verify/route.ts")).toContain(
      "checkAdmin(request))"
    );
    // starega vzorca (header niz) v API rutah NI več
    // (Issue #9: /api/ai-insights → /api/insights — pot posodobljena)
    const stale = [
      "src/app/api/track-funnel/route.ts",
      "src/app/api/pois/describe/route.ts",
      "src/app/api/insights/route.ts",
      "src/app/api/admin/analytics/route.ts",
      "src/app/api/admin/approve/[id]/route.ts",
      "src/app/api/admin/push/send/route.ts",
      "src/app/api/admin/ai-usage/route.ts",
      "src/app/api/admin/leads-dashboard/route.ts",
      "src/app/api/admin/reject/[id]/route.ts",
      "src/app/api/admin/indexing/route.ts",
      "src/app/api/admin/affiliate-stats/route.ts",
    ];
    for (const rel of stale) {
      expect(source(rel)).not.toContain(
        'checkAdmin(request.headers.get("x-admin-password"))'
      );
    }
  });
});

// ---------------------------------------------------------------------------
// §F — RATE LIMITI (P3): prej nepokrite session-gated pote + weather.
// ---------------------------------------------------------------------------
describe("ISSUE #4 VAL 8 §F: dopolnjeni rate limiti", () => {
  test("weather (edini javni zunanji-proksi): 60/min", () => {
    const weather = source("src/app/api/weather/route.ts");
    expect(weather).toContain("rateLimit(request");
    expect(weather).toContain('key: "weather"');
  });

  const OWNER_FILES = [
    "src/app/api/owner/analytics/route.ts",
    "src/app/api/owner/bookings/route.ts",
    "src/app/api/owner/commissions/route.ts",
    "src/app/api/owner/commissions/checkout/route.ts",
    "src/app/api/owner/commissions/invoice-pdf/route.ts",
    "src/app/api/owner/experiences/route.ts",
    "src/app/api/owner/experiences/[id]/route.ts",
    "src/app/api/owner/listings/route.ts",
    "src/app/api/owner/listings/[id]/route.ts",
    "src/app/api/owner/listings/submit/route.ts",
    "src/app/api/owner/products/route.ts",
    "src/app/api/owner/products/[id]/route.ts",
    "src/app/api/owner/sponsorship/route.ts",
    "src/app/api/owner/subscription/route.ts",
  ];

  test("VSI owner API handlerji imajo skupni bucket owner-api (120/min)", () => {
    for (const rel of OWNER_FILES) {
      const src = source(rel);
      expect(src).toContain('key: "owner-api"');
      expect(src).toContain("rateLimit(request");
    }
  });

  test("user/trips, provider-roi, stripe checkout/portal pokriti", () => {
    expect(source("src/app/api/user/trips/route.ts")).toContain('key: "user-trips"');
    expect(source("src/app/api/analytics/provider-roi/route.ts")).toContain(
      'key: "analytics-provider-roi"'
    );
    expect(source("src/app/api/stripe/checkout/route.ts")).toContain(
      'key: "stripe-checkout"'
    );
    expect(source("src/app/api/stripe/portal/route.ts")).toContain(
      'key: "stripe-portal"'
    );
  });
});

// ---------------------------------------------------------------------------
// §G — KONSISTENCA (P3): timing-safe, X-Robots-Tag, oracle zaprtje.
// ---------------------------------------------------------------------------
describe("ISSUE #4 VAL 8 §G: konsistenca §23", () => {
  test("editTokenHash primerjava je timing-safe (trip-permissions + trip-guide)", () => {
    for (const rel of [
      "src/lib/trip-permissions.ts",
      "src/app/api/trip-guide/route.ts",
    ]) {
      const src = source(rel);
      expect(src).toContain("timingSafeEqual(tokenHash, saved.editTokenHash)");
      expect(src).not.toContain("tokenHash === saved.editTokenHash");
    }
  });

  test("X-Robots-Tag noindex na /pot/* (next.config.ts headers)", () => {
    const config = source("next.config.ts");
    expect(config).toContain('source: "/pot/:path*"');
    expect(config).toContain('"X-Robots-Tag"');
    expect(config).toContain('"noindex, follow"');
  });

  test("obstoj ZASEBNE poti ni oracle: communityTripGate → 404 (ne 403 zasebno)", () => {
    const perms = source("src/lib/trip-permissions.ts");
    expect(perms).toContain("oracle");
    const gateBody = perms.slice(perms.indexOf("export async function communityTripGate"));
    expect(gateBody).not.toContain("Ta potovanje je zasebno");
  });
});

// ---------------------------------------------------------------------------
// §H — D5 RESNICA: fiksno okno, per-instanca, določena shared rešitev.
// ---------------------------------------------------------------------------
describe("ISSUE #4 VAL 8 §H: D5 — produkcjska resnica in določena rešitev", () => {
  const rl = source("src/lib/rate-limit.ts");

  test("komentar NE trdi več 'sliding window' (implementacija je fiksno okno)", () => {
    expect(rl).not.toMatch(/sliding-window/);
    expect(rl).toContain("FIKSNO-OKENSKI");
  });

  test("produkcjska omejitev dokumentirana (per-instanca, 1 Render) + Upstash recept", () => {
    expect(rl).toContain("NA INSTANCO");
    expect(rl).toContain("1 Render web service");
    expect(rl).toContain("UPSTASH_REDIS_REST_URL");
    expect(rl).toContain("UPSTASH_REDIS_REST_TOKEN");
    // fail-open dokumentiran (razpoložljivost pred strogostjo)
    expect(rl).toContain("fail-open");
  });
});
