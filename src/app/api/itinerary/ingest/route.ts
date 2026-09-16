import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { matchDestinationsInText } from "@/lib/url-ingest";

// ============================================================================
// POST /api/itinerary/ingest — "Začni s povezavo" (F5.4)
// ============================================================================
//
// MindTrip-ov "Start Anywhere" po slovensko: uporabnik prilepi povezavo do
// YouTube/TikTok videa, bloga ali članka o Sloveniji → strežnik pridobi
// stran, izlušči besedilo in DETERMINISTIČNO prepozna naše destinacije
// ( glej src/lib/url-ingest.ts). Odgovor vsebuje zadetke + predlog vnosa
// za načrtovalnik ( dnevi/interesi/zaželene destinacije) — generiranje
// pustimo obstoječemu /api/itinerary ( en vir resnice).
//
// Varnost:
//  - samo http(s) javni naslovi ( SSRG zaščita: blokirani zasebni/imenski
//    doseg, link-local, .local, .internal)
//  - timeout 8 s, največ 1 MB odgovora
//  - rate limit 10 klicev/min na IP ( odprta javna pot)
//  - odgovor nikoli ne vrača pridobljenega besedila ( samo zadetke)
// ============================================================================

const MAX_BYTES = 1024 * 1024; // 1 MB
const FETCH_TIMEOUT_MS = 8000;
const MAX_TEXT_CHARS = 400000; // ~100 k besed je čez vsak relevanten vir

/** Zasebni/imenski doseg — SSRF zaščita na ravni imena ( DNS rebinding je
 *  izven obsega: odgovor se ne vrača uporabniku, vpliv je omejen).
 *  HARDENING (revizija 1.33.0, 16-b P2): pokrita še IPv6-mapped IPv4
 *  oblika — `new URL("http://[::ffff:127.0.0.1]/").hostname` vrne
 *  "[::ffff:7f00:1]", ki prej ni ujel nobenega bloka (loopback dostop!).
 *  Zdaj vsak hostname z ":" (vsak IPv6 literál) preverimo po HEX delih,
 *  ne po decimalnih oktetih. */
function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".home") ||
    h === "metadata.google.internal"
  ) {
    return true;
  }
  // IPv4 dosegi
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
    if (a === 127 || a === 0 || a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  // IPv6 (vse oblike z ":" — vključno z [::ffff:127.0.0.1] mapped v4 in
  // link-local/unique-local predpokami). HEX različica oktetov vdelana v
  // IPv6 besedilo (npr. 7f00:1 = 127.0.0.1) se tako ujame prav tako.
  if (h.includes(":")) {
    if (
      h === "::" ||
      h === "::1" ||
      h === "[::1]" ||
      h.includes(":ffff:") || // mapped IPv4 — vedno zasebni doseg iz našega vidika
      h.includes("fe80") ||
      h.startsWith("fc") ||
      h.startsWith("fd") ||
      h.startsWith("[fc") ||
      h.startsWith("[fd") ||
      h.startsWith("[fe8")
    ) {
      return true;
    }
    // Vdelan IPv4 konec (npr. "::ffff:127.0.0.1" v redki text obliki)
    const tail = h.match(/:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\]?$/);
    if (tail) {
      const a = parseInt(tail[1], 10);
      const b = parseInt(tail[2], 10);
      if (a === 127 || a === 0 || a === 10) return true;
      if (a === 192 && b === 168) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 169 && b === 254) return true;
    }
    // Preostali IPv6 literali ne moremo zanesljivo razvrstiti brez DNS
    // resolucije — konzervativno blokiramo vse, kar ni eksplicitno javni
    // vzorec (produktni promet je izključno IPv4/hostname URLs).
    return true;
  }
  return false;
}

/** HTML → besedilo ( skripti/stili/noscript ven, značke ven, entitete dekodirane). */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#269;|&ccaron;/gi, "č")
    .replace(/&#353;|&scaron;/gi, "š")
    .replace(/&#382;|&zcaron;/gi, "ž")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = parseInt(code, 10);
      return n > 0 && n < 65536 ? String.fromCharCode(n) : " ";
    })
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** <title> iz HTML ( YouTube naslov nosi glavno vsebino). */
function extractPageTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i);
  if (!m) return null;
  return m[1]
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: Request) {
  // Odprta javna pot ( brez prijave) → dosleden rate limit
  const limited = rateLimit(request, {
    limit: 10,
    windowMs: 60000,
    key: "itinerary-ingest",
  });
  if (limited) return limited;

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON." }, { status: 400 });
  }

  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!rawUrl || rawUrl.length > 2048) {
    return NextResponse.json(
      { error: "Manjka ali predolga povezava." },
      { status: 400 }
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return NextResponse.json(
      { error: "Neveljavna povezava." },
      { status: 400 }
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json(
      { error: "Podprta sta samo http in https." },
      { status: 400 }
    );
  }
  if (isBlockedHostname(url.hostname)) {
    return NextResponse.json(
      { error: "Zasebni naslovi niso podprti." },
      { status: 400 }
    );
  }

  // Pridobi stran ( timeout + omejitev velikosti)
  // SSRF-FIX (revizija 1.33.0, 16-b P2): redirect: "manual" + ponovna
  // validacija GNI vsakega skoka — prej je "follow" spravil preverjen
  // javni URL čez 30x preusmeritev na npr. http://169.254.169.254/.
  // (3 hops največ — več je nadstandard za legitime vire.)
  let html = "";
  try {
    let currentUrl = url;
    let res: Response | null = null;
    for (let hop = 0; hop < 3; hop++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      res = await fetch(currentUrl.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          // Iskren identifiket bot-a ( vljudnost do virov) + kompatibilnost
          "User-Agent":
            "Mozilla/5.0 (compatible; DiscoverSloveniaAI/1.0; +https://i-feel-slovenia.vercel.app)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "sl,en",
        },
      });
      clearTimeout(timer);
      // Preusmeritev? Validiraj cilj GNI in sledi mu ročno
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) break;
        const nextUrl = new URL(loc, currentUrl); // relativne lokacije razreši
        if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") break;
        if (isBlockedHostname(nextUrl.hostname)) {
          return NextResponse.json(
            { error: "Zasebni naslovi niso podprti." },
            { status: 400 }
          );
        }
        currentUrl = nextUrl;
        continue;
      }
      break; // 2xx/4xx/5xx — obdelaj spodaj
    }
    if (!res) {
      return NextResponse.json({ error: "Vir ni dosegljiv." }, { status: 502 });
    }
    if (!res.ok) {
      // ORACLE-FIX (1.33.0): brez odpiranja HTTP status kode internih
      // storitev (prehodno dosegljiv vs nedosegljiv = port skener) —
      // splošno sporočilo, koda ostane samo v server logu.
      console.warn(`[ingest] upstream odgovoril ${res.status} za ${currentUrl.hostname}`);
      return NextResponse.json(
        { error: "Vir ni dosegljiv. Preveri povezavo ali poskusi drug vir." },
        { status: 502 }
      );
    }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) {
      return NextResponse.json(
        { error: "Vir je prazen." },
        { status: 502 }
      );
    }
    if (buffer.byteLength > MAX_BYTES) {
      // Preberi samo prvih MAX_BYTES ( dovolj za naslov + glavno vsebino)
      html = new TextDecoder("utf-8", { fatal: false }).decode(
        buffer.slice(0, MAX_BYTES)
      );
    } else {
      html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    }
  } catch (err) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("abort"));
    return NextResponse.json(
      {
        error: isTimeout
          ? "Vir se ni odzval v 8 sekundah."
          : "Vira ni bilo mogoče prebrati ( omrežje ali poškodovana stran).",
      },
      { status: 502 }
    );
  }

  const pageTitle = extractPageTitle(html);
  const text = htmlToText(html).slice(0, MAX_TEXT_CHARS);
  if (text.length < 40) {
    // YouTube brez JS vrne sorazmerno malo besedila, a naslov + meta opis
    // običajno zadoščata; pod 40 znakov res ni kaj za prepoznati.
    return NextResponse.json(
      {
        error:
          "Na strani nisem našel berljivega besedila ( verjetno zahteva prijavo ali JS).",
      },
      { status: 422 }
    );
  }

  const result = matchDestinationsInText(text, pageTitle);
  if (result.matches.length === 0) {
    // Poštena zavrnitev: NIČ izmišljevanja "podobnih" lokacij
    return NextResponse.json(
      {
        error:
          "Na tej povezavi nisem prepoznal nobene slovenske destinacije iz našega podatkovnega niza.",
        pageTitle: result.pageTitle,
        textChars: result.textChars,
      },
      { status: 422 }
    );
  }

  return NextResponse.json(
    {
      pageTitle: result.pageTitle,
      textChars: result.textChars,
      matches: result.matches,
      suggestion: result.suggestion,
    },
    { status: 200 }
  );
}
