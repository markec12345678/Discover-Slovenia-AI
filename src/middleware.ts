import { NextResponse, type NextRequest } from "next/server";

import { routing, type Locale } from "./i18n/routing";

/**
 * Header, ki ga next-intl uporablja za prenos locale-a iz middleware-a
 * v `getRequestConfig` (glej `RequestLocale.js` v next-intl dist).
 */
const HEADER_LOCALE = "x-next-intl-locale";

/**
 * Cookie za persistenco locale-a med requesti.
 */
const COOKIE_LOCALE = "NEXT_LOCALE";

/**
 * Custom i18n middleware (nadomestek za `createMiddleware` iz next-intl).
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
 */
export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Če uporabnik obišče `/sl` (default locale s prefix-om), redirect
  //    na `/` (brez prefix-a, ker `as-needed` ne prikazuje default prefix-a).
  if (pathname === "/sl" || pathname.startsWith("/sl/")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = pathname.slice("/sl".length) || "/";
    return NextResponse.redirect(redirectUrl);
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

  // 3. Nastavi `x-next-intl-locale` header za next-intl `getRequestConfig`
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(HEADER_LOCALE, locale);

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
