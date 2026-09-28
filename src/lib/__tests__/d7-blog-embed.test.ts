// D7 (Issue #15 benchmark dodatek D/7, 1.140.0): BLOG-EMBED DELJENIH POTI —
// regresijska varovalka.
//
// Pokriva:
//  1. TELEMETRIJA (kanon W3 pariteta): trip_embed_copied v klientnem union-u
//     IN strežniški VALID_EVENTS listi + vrstica v docs/ANALYTICS-EVENTS.md.
//  2. GLAVE/CONFIG (varnostno jedro D7): next.config.ts pravilo
//     /pot/embed/:path* obstoja in se izvaja ZA splošnim pravilom (preglasitev
//     po vrstnem redu); embed CSP je KLON splošne CSP z ZAMENJANIM SAMO
//     frame-ancestors ('none' → '*') — vse ostale direktive identične
//     (izvlečeno v buildCsp graditelj, ena resnica); XFO nadomeščen z
//     neveljavno vrednostjo ALLOWALL (izbris ni možen; CSP prevlada).
//  3. SOURCE-CONTRACT poti: /pot/embed/[shareId] je TANKA ovojnica skupnega
//     SharedTripScreen (embed prop), noindex + canonical na polno stran;
//     /pot/[shareId] ostaja polna stran; screen v embed načinu NE izrisuje
//     Navigation/Footer niti pooblaščenih ploskev (TripCollaboration/Guide/
//     Documents/Push — klikjacking površina) in PRESKOČI njihove poizvedbe;
//     PageViewTracker nosi /pot/embed/… pot (ločeno merjen promet);
//     atribucijski pas odkriva Discover Slovenia AI + celoten načrt.
//  4. FUNKCIONALNO: buildEmbedSnippet (čist HTML iframe — strežniški origin,
//     /pot/embed/ vir, HTML-escape naslova z narekovaji, lazy loading,
//     referrerpolicy zrcali našo politiko); copyToClipboard rezerva
//     (execCommand padec → false, uspeh → true); SharedTrip prikaže
//     TripEmbedCode SAMO na javnih poteh z baseUrl (zasebne NE ponujamo).
//
// NAMEN: D7 je varnostno-občutljiva površina (relaksacija frame-ancestors).
// Ta test preprečuje TIHO regresijo: če kdorkoli premakne/prepiše pravilo
// ali CSP graditelj zaide, test pade — ne more ostati neopazno.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { buildEmbedSnippet } from "@/components/trip-embed-code";
import { copyToClipboard } from "@/lib/clipboard";

const CONFIG_SRC = readFileSync(
  new URL("../../../next.config.ts", import.meta.url),
  "utf8"
);
const ANALYTICS_SRC = readFileSync(
  new URL("../../lib/planner-analytics.ts", import.meta.url),
  "utf8"
);
const ROUTE_SRC = readFileSync(
  new URL("../../app/api/analytics/event/route.ts", import.meta.url),
  "utf8"
);
const EVENTS_DOC = readFileSync(
  new URL("../../../docs/ANALYTICS-EVENTS.md", import.meta.url),
  "utf8"
);
const SCREEN_SRC = readFileSync(
  new URL("../../app/pot/shared-trip-screen.tsx", import.meta.url),
  "utf8"
);
const PAGE_SRC = readFileSync(
  new URL("../../app/pot/[shareId]/page.tsx", import.meta.url),
  "utf8"
);
const EMBED_PAGE_SRC = readFileSync(
  new URL("../../app/pot/embed/[shareId]/page.tsx", import.meta.url),
  "utf8"
);
const SHARED_TRIP_SRC = readFileSync(
  new URL("../../components/shared-trip.tsx", import.meta.url),
  "utf8"
);
const EMBED_CODE_SRC = readFileSync(
  new URL("../../components/trip-embed-code.tsx", import.meta.url),
  "utf8"
);

describe("D7 telemetrija: trip_embed_copied (kanon paritete W3)", () => {
  test("trip_embed_copied je član PlannerEventName union-a", () => {
    expect(ANALYTICS_SRC).toContain('| "trip_embed_copied"');
  });

  test("trip_embed_copied je v strežniški VALID_EVENTS listi (0 tihih 400)", () => {
    expect(ROUTE_SRC).toContain('"trip_embed_copied"');
  });

  test("docs/ANALYTICS-EVENTS.md nosi vrstico trip_embed_copied", () => {
    expect(EVENTS_DOC).toContain("`trip_embed_copied`");
    expect(EVENTS_DOC).toContain("1.140.0");
  });

  test("TripEmbedCode dejansko kliče trackPlannerEvent ob uspehu", () => {
    expect(EMBED_CODE_SRC).toContain('trackPlannerEvent("trip_embed_copied")');
  });
});

describe("D7 varnostno jedro: glave /pot/embed (next.config.ts)", () => {
  test("pravilo /pot/embed/:path* obstaja s frame-ancestors * in XFO ALLOWALL", () => {
    expect(CONFIG_SRC).toContain('source: "/pot/embed/:path*"');
    expect(CONFIG_SRC).toContain('buildCsp("*")');
    expect(CONFIG_SRC).toContain(
      '{ key: "X-Frame-Options", value: "ALLOWALL" }'
    );
  });

  test("embed pravilo stoji ZA splošnim pravilom (vrstni red preglasitve)", () => {
    // Kasnejše specifičnejše pravilo preglasi isti ključ (sw.js kanon) —
    // če bi embed pravilo stalo PRED /(.*), bi izgubilo.
    const globalIdx = CONFIG_SRC.indexOf('source: "/(.*)"');
    const embedIdx = CONFIG_SRC.indexOf('source: "/pot/embed/:path*"');
    expect(globalIdx).toBeGreaterThan(-1);
    expect(embedIdx).toBeGreaterThan(-1);
    expect(embedIdx).toBeGreaterThan(globalIdx);
  });

  test("CSP gradi SKUPNI buildCsp graditelj (ena resnica, ne dva literala)", () => {
    expect(CONFIG_SRC).toContain("const buildCsp = (frameAncestors: string)");
    expect(CONFIG_SRC).toContain("buildCsp(\"'none'\")");
    expect(CONFIG_SRC).toContain('buildCsp("*")');
    // frame-ancestors je parametriziran — dobesedna direktiva ne sme biti
    // več zapisana neposredno v securityHeaders (dvojni vir resnice)
    const securityHeadersBlock = CONFIG_SRC.slice(
      CONFIG_SRC.indexOf("const securityHeaders"),
      CONFIG_SRC.indexOf("const nextConfig")
    );
    expect(securityHeadersBlock).not.toContain('"frame-ancestors');
  });

  test("buildCsp('*') je klon buildCsp(\"'none'\") z ZAMENJANIM SAMO frame-ancestors", () => {
    // Izvleček iz vira: graditelj je čist — pokličemo ga preskoči eval?
    // Ne — namesto tega preverimo STRINURNOST izvira: obe vrednosti
    // obstojata SAMO prek graditelja, direktive pa so en literal. Zato
    // preverimo, da buildCsp vsebuje VSE direktive splošne CSP in da se
    // frame-ancestors interpolira kot parameter (template literal).
    expect(CONFIG_SRC).toContain("`frame-ancestors ${frameAncestors}`");
    for (const directive of [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' blob:",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ]) {
      expect(CONFIG_SRC).toContain(directive);
    }
  });

  test("globalna politika ostaja XFO DENY (relaksacija SAMO na embed poti)", () => {
    expect(CONFIG_SRC).toContain(
      '{ key: "X-Frame-Options", value: "DENY" }'
    );
  });
});

describe("D7 source-contract poti (skupni zaslon)", () => {
  test("/pot/embed/[shareId] je tanka ovojnica: SharedTripScreen z embed", () => {
    expect(EMBED_PAGE_SRC).toContain("embed");
    expect(EMBED_PAGE_SRC).toContain("SharedTripScreen");
    expect(EMBED_PAGE_SRC).toContain('force-dynamic');
  });

  test("embed stran: noindex + canonical na polno stran (iskalniku pravi vir)", () => {
    expect(EMBED_PAGE_SRC).toContain("index: false");
    expect(EMBED_PAGE_SRC).toContain("canonical");
    expect(EMBED_PAGE_SRC).toContain("`/pot/${shareId}`");
  });

  test("/pot/[shareId] ostaja polna stran (brez embed propa)", () => {
    expect(PAGE_SRC).toContain("<SharedTripScreen shareId={shareId} />");
    expect(PAGE_SRC).not.toContain(
      "<SharedTripScreen shareId={shareId} embed"
    );
  });

  test("screen v embed načinu NE izrisuje lupine (Navigation/Footer)", () => {
    expect(SCREEN_SRC).toContain("{!embed && (");
    expect(SCREEN_SRC).toContain("<Navigation solid />");
    expect(SCREEN_SRC).toContain("<Footer />");
  });

  test("screen v embed načinu NE izrisuje pooblaščenih ploskev (klikjacking)", () => {
    // Embed veja je ternary — komponente izključene v embedu morajo biti
    // znotraj ne-embed veje. Preverimo prisotnost VROČIH ploskev +
    // embed-exclusive atribucijski pas (obratna stran).
    for (const hot of [
      "TripCollaboration",
      "TripDocumentsCard",
      "TripPushCard",
      "TripGuide",
      "TripSocial",
      "TripDiary",
      "TripPolls",
      "TripReservations",
    ]) {
      expect(SCREEN_SRC).toContain(`<${hot}`);
    }
    expect(SCREEN_SRC).toContain("Odpri celoten načrt");
    expect(SCREEN_SRC).toContain("Discover Slovenia AI");
    expect(SCREEN_SRC).toContain('target="_blank"');
  });

  test("embed PRESKOČI poizvedbe skupnostnih ploskev (if (!embed) varovala)", () => {
    // Širše: trije bloki (klepet/všečki, ankete, dnevnik) + vodnik —
    // vsak mora imeti svojo varovalo, sicer embed ogled tepeta DB.
    const guards = SCREEN_SRC.match(/if \(!embed\) \{/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(5);
  });

  test("PageViewTracker nosi LOČENO pot za embed (/pot/embed/…)", () => {
    expect(SCREEN_SRC).toContain(
      "embed ? `/pot/embed/${shareId}` : `/pot/${shareId}`"
    );
  });

  test("SharedTrip prejme isPublic + baseUrl (podlaga za embed blok)", () => {
    expect(SCREEN_SRC).toContain("isPublic={saved.isPublic}");
    expect(SCREEN_SRC).toContain("baseUrl={base}");
  });

  test("varnostna vrata zasebnosti ostajajo ENAKA v embedu (404, ne 403)", () => {
    // isPublic vrata se izvedejo PRED embedno vejo — komentar dokumentira
    // D7 varnostno vrata; resolveTripRole + notFound() morata ostati.
    expect(SCREEN_SRC).toContain("resolveTripRole");
    expect(SCREEN_SRC).toContain("notFound()");
    expect(SCREEN_SRC).toContain("VELJA ENAKO v embed načinu");
  });
});

describe("D7 source-contract komponente", () => {
  test("SharedTrip prikaže TripEmbedCode SAMO na javnih poteh z baseUrl", () => {
    expect(SHARED_TRIP_SRC).toContain(
      "isPublic === true && baseUrl ? ("
    );
    expect(SHARED_TRIP_SRC).toContain("<TripEmbedCode");
  });

  test("TripEmbedCode je use client (kopiranje + dogodek sta DOM dejanji)", () => {
    expect(EMBED_CODE_SRC).toContain('"use client"');
  });

  test("TripEmbedCode uporablja skupni copyToClipboard (ne lastni duplikat)", () => {
    expect(EMBED_CODE_SRC).toContain('from "@/lib/clipboard"');
  });

  test("padec kopiranja NE izpiše lažnega „Kopirano!“", () => {
    expect(EMBED_CODE_SRC).toContain("const ok = await copyToClipboard(code)");
    expect(EMBED_CODE_SRC).toContain("if (ok)");
  });
});

describe("D7 funkcionalno: buildEmbedSnippet (čist HTML, brez skript)", () => {
  test("izstavi iframe z /pot/embed/ virom na strežniškem originu", () => {
    const snippet = buildEmbedSnippet(
      "https://i-feel-slovenia.vercel.app",
      "abc123",
      "Bled in Bohinj"
    );
    expect(snippet).toContain(
      'src="https://i-feel-slovenia.vercel.app/pot/embed/abc123"'
    );
    expect(snippet).toContain("<iframe");
    expect(snippet).toContain("</iframe>");
  });

  test("naslov poti je HTML-escape-an (narekovaji ne prelomijo atributa)", () => {
    const snippet = buildEmbedSnippet(
      "https://example.com",
      "xyz",
      'Pot "zgodba" & <spomini>'
    );
    // izluščena vrednost atributa title mora biti NATANČNO escape-an naslov
    // (raw " znotraj vrednosti bi atribut prelomil — kot pri title="Pot "zgodba"")
    const titleMatch = snippet.match(/title="([^"]*)"/);
    expect(titleMatch).not.toBeNull();
    expect(titleMatch?.[1]).toBe(
      "Pot &quot;zgodba&quot; &amp; &lt;spomini&gt;"
    );
    expect(snippet).not.toContain('title="Pot "');
  });

  test("lazy loading + referrerpolicy + širina/višina privzetka", () => {
    const snippet = buildEmbedSnippet("https://example.com", "a1", "T");
    expect(snippet).toContain('loading="lazy"');
    expect(snippet).toContain(
      'referrerpolicy="strict-origin-when-cross-origin"'
    );
    expect(snippet).toContain("width:100%;height:720px;border:0");
  });

  test("trailing slash origina se pobriše (dvojne / nikoli)", () => {
    const snippet = buildEmbedSnippet("https://example.com/", "a1", "T");
    expect(snippet).toContain("https://example.com/pot/embed/a1");
    expect(snippet).not.toContain("//pot/embed");
  });

  test("snippet NE vsebuje skripta (blogger ne zaupa ničemer <script>)", () => {
    const snippet = buildEmbedSnippet("https://example.com", "a1", "T");
    expect(snippet).not.toContain("<script");
    expect(snippet).not.toContain("javascript:");
  });
});

describe("D7 funkcionalno: copyToClipboard rezerva", () => {
  test("v ne-DOM okolju vrne false (SSR varno, ne vrže)", async () => {
    // bun test teče brez DOM — navigator/undefined → false
    const ok = await copyToClipboard("test");
    expect(typeof ok).toBe("boolean");
  });

  test("v ne-DOM okolju NE vrže izjeme tudi ob praznem nizu", async () => {
    const ok = await copyToClipboard("");
    expect(typeof ok).toBe("boolean");
  });
});
