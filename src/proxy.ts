import { NextResponse, type NextRequest } from "next/server";

import { isEnRoute, routing, type Locale } from "./i18n/routing";

/**
 * Header, ki ga next-intl uporablja za prenos locale-a iz middleware-a
 * v `getRequestConfig` (glej `RequestLocale.js` v next-intl dist).
 * FIKSNO ime (next-intl kontrakt) — zato ga ob vstopu STRIPAMO (glej 0b):
 * zunanji klient bi z njim sicer vsilil locale mimo EN whitelisti.
 */
const HEADER_LOCALE = "x-next-intl-locale";

/**
 * INTERNI marker za varovalko proti standalone zanki (korak 0). Naključno
 * ime (19e-3, revizija 1.36.0): prej je bila zanka-varovalka vezana na
 * HEADER_LOCALE, ki ga lahko pošlje ZUNANJI klient — s tem je preskočil
 * EN whitelist guard + vsilil locale (mešane jezike). Ugibljivo ime +
 * strip ob vstopu = marker ostane čisto interni (proxy → rewrite round-trip).
 */
const HEADER_INTERNAL_PASS = "x-dsa-proxy-qk7f42";

/**
 * Cookie za persistenco locale-a med requesti.
 */
const COOKIE_LOCALE = "NEXT_LOCALE";

/**
 * Legacy locale prefixi — prej javno dostopni (delno prevedene strani),
 * umaknjeni s P4-8 dokler prevodi niso celoviti (roadmap C5).
 * Stari URL-ji se trajno (308) preusmerijo na slovensko pot.
 *
 * FW4.3-2: "en" je ODSTRANJEN s tega seznama — angleščina je zdaj javna
 * (jedro lijaka, glej EN whitelist v src/i18n/routing.ts). /de in /it
 * ostajata legacy (308) do celovitih prevodov.
 */
const LEGACY_LOCALE_PREFIXES = ["/de", "/it"] as const;

/**
 * Proxy (prej "middleware" — Next.js 16 konvencija) — custom i18n
 * middleware (nadomestek za `createMiddleware` iz next-intl).
 *
 * Standardni `createMiddleware` interno rewrites-a URL na `/{locale}/...`,
 * kar zahteva `[locale]` segment v App Router-ju. Ker te aplikacije NE
 * želimo restructurirati v `[locale]` segment, uporabimo custom middleware
 * ki:
 *
 * 1. Zazna locale iz URL prefix-a (`/en`, `/de`, `/it`) ali defaulta na "sl".
 * 2. Nastavi `x-next-intl-locale` header — `getRequestConfig` ga prebere
 *    in vrne prave prevode za `getTranslations` / `useTranslations`.
 * 3. Rewrita URL tako da odstrani locale prefix (`/en` → `/`), da App
 *    Router servera `src/app/page.tsx` brez `[locale]` segmenta.
 * 4. Nastavi `NEXT_LOCALE` cookie za persistenco.
 * 5. Če uporabnik obišče `/sl` (default s prefix-om), redirect na `/`
 *    (ker `localePrefix: "as-needed"` ne prikazuje prefix-a za default).
 *
 * Admin, owner, API in static file route-i so izključeni iz middleware-a
 * preko `config.matcher` spodaj.
 *
 * Datoteka je preimenovana iz `middleware.ts` → `proxy.ts` (Next.js 16
 * konvencija; stara je deprecated in sproža build opozorilo).
 */
export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 0. VAROVALKA proti standalone zanki (Next.js 16):
  //    V standalone produkciji Next rewrite interno forwarda prek HTTP
  //    nazaj na isti strežnik; ta notranji klic PONOVNO vstopi v proxy
  //    (proxy bi spet rewrite → spet forward → neskončna zanka; E2E
  //    izmerjeno 4763 samo-zahtev na en request → timeout strani).
  //    Ker prvi prehod nastavi interni marker header (HEADER_INTERNAL_PASS),
  //    ki preživi round-trip, ga uporabimo kot marker: notranji ponovni vstop
  //    takoj spustimo naprej. (V dev/Vercel okoljih se header ob prvem vstopu
  //    še ni nastavil, varovalka torej nikoli ne sproži — obnašanje
  //    nespremenjeno.)
  //    19e-3 (1.36.0): prej je bil marker x-next-intl-locale — UGASLJIVO ime,
  //    ki ga lahko pošlje zunanji klient (preskoči guard). Zdaj naključno ime.
  if (request.headers.get(HEADER_INTERNAL_PASS)) {
    return NextResponse.next();
  }

  // 0b. 19e-3 (revizija 1.36.0, P3): STRIP zunanje poslanih internih headerjev.
  //     Zunanji vnos ne sme niti označiti request kot "že viden" (zanka-
  //     varovalka zgoraj) niti vsiliti locale next-intl-u mimo EN whitelisti
  //     in /sl redirectov. Korak 3 gradi na očiščenih headerjih; naslednji
  //     rewrite s tem nosi SAMO strežniško nastavljen locale.
  const externalHeaders = new Headers(request.headers);
  externalHeaders.delete(HEADER_LOCALE);
  externalHeaders.delete(HEADER_INTERNAL_PASS);

  // 1. Če uporabnik obišče `/sl` (default locale s prefix-om), redirect
  //    na `/` (brez prefix-a, ker `as-needed` ne prikazuje default prefix-a).
  if (pathname === "/sl" || pathname.startsWith("/sl/")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = pathname.slice("/sl".length) || "/";
    return NextResponse.redirect(redirectUrl);
  }

  // 1b. LEGACY locale prefixi (/en, /de, /it) → trajna (308) preusmeritev
  //     na slovensko pot. P4-8: te strani so bile delno prevedene (nav in
  //     noga v tujem jeziku, vsebina hardcoded slovenščina) — mešanje
  //     jezikov. Javno je zdaj samo sl; hreflang alternati so umaknjeni,
  //     kazalniki/povezave na /de… pa pripeljejo na pravo (slovensko)
  //     vsebino in ne na 404.
  if (LEGACY_LOCALE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const prefix = LEGACY_LOCALE_PREFIXES.find(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    )!;
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = pathname.slice(prefix.length) || "/";
    return NextResponse.redirect(redirectUrl, 308);
  }

  // 2. Zaznaj locale iz URL prefix-a
  let locale: Locale = routing.defaultLocale;
  let pathWithoutLocale = pathname;

  for (const l of routing.locales) {
    if (l === routing.defaultLocale) continue;
    const prefix = `/${l}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      locale = l;
      pathWithoutLocale = pathname.slice(prefix.length) || "/";
      break;
    }
  }

  // 2b. FW4.3-2 EN WHITELISTA GUARD: angleščina živi SAMO na whitelisti
  //     (jedro lijaka — glej isEnRoute v src/i18n/routing.ts). Zahteve
  //     /en/<pot-ki-nima-EN> (npr. /en/vodici, /en/admin, /en/blog) se
  //     trajno (308) preusmerijo na slovensko pot: nikoli mešanja jezikov
  //     (P4-8), nikoli 404, iskalniki sledijo na kanonično slovensko
  //     različico.
  if (locale === "en" && !isEnRoute(pathWithoutLocale)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = pathWithoutLocale;
    return NextResponse.redirect(redirectUrl, 308);
  }

  // 3. Nastavi `x-next-intl-locale` header za next-intl `getRequestConfig`
  //    (+ interni marker za zanka-varovalko iz koraka 0)
  const requestHeaders = new Headers(externalHeaders);
  requestHeaders.set(HEADER_LOCALE, locale);
  requestHeaders.set(HEADER_INTERNAL_PASS, "1");

  // 4. Rewrita URL (odstrani locale prefix) in posreduje header
  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = pathWithoutLocale;

  const response = NextResponse.rewrite(rewriteUrl, {
    request: { headers: requestHeaders },
  });

  // 5. Persistiraj locale v cookie
  response.cookies.set(COOKIE_LOCALE, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 leto
  });

  return response;
}

/**
 * Matcher — izključi API, admin, owner, Next.js interno in static files.
 */
export const config = {
  matcher: ["/((?!api|admin|owner|_next|_vercel|.*\\..*).*)"],
};
