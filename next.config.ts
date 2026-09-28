import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { execSync } from "node:child_process";

// ─── Prisma klient pred vsakim buildom (Vercel-varna rešitev) ─────────────
// ZAKAJ TU: Vercel (Next.js preset) poganja LASTNI build ukaz (`next build`)
// in ne našega `bun run build` — postinstall hook pa ni zagotovljen pri
// vseh namestitvenih upraviteljih. `next.config.ts` se naloži OBVEZNO in
// PREV vsakim prevajanjem modulov, zato klienta prigeneriramo tu.
// (~200 ms; harmless kjer je klient že generiran — Docker build skripta
// in CI ga poganjajo tudi sami. Napaka se tiho prenese — pravi vzrok se
// pokaže kasneje z jasnejšo sporočilom.)
try {
  execSync("npx prisma generate", { stdio: "ignore" });
} catch {
  // npx manjka (npr. čisti bun okolje) ali prisma CLI ni nameščen —
  // nadaljuj; build skripta/postinstall prevzameta odgovornost.
}

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// D7 (1.140.0, Issue #15 benchmark dodatek D/7): CSP graditelj — ENA resnica
// za obe politiki. Splošna stran in embed potečka delita VSE direktive,
// razlikuje se SAMO frame-ancestors ('none' vs '*' za /pot/embed/*).
// Prej je bila CSP zapisana kot en literal znotraj securityHeaders — z D7
// jo izluščimo v skupni graditelj, da embed klon NIKOLI ne zaostane za
// glavno politiko (edini dovoljeni razlik je frame-ancestors; dokazano v
// regresijskem testu d7-blog-embed).
const buildCsp = (frameAncestors: string) =>
  [
    "default-src 'self'",
    // Next.js App Router potrebuje inline skripte za hydration
    `script-src 'self' 'unsafe-inline'${
      process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    // slike: local + data URI + vsi https (unsplash, OSM tiles, zunanje iz DB)
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // D2 (zvočni povzetek): <audio> z blob: URL ( WAV iz /api/itinerary/tts)
    // — blob je istega dokumenta ( brez omrežja), zato varen vir za media
    "media-src 'self' blob:",
    // API klici: SAMO lastni origin — zunanje API-je (Open-Meteo, AI
    // providerji) klient nikoli ne kliče direktno (server-side proxy).
    `connect-src 'self' blob:${
      process.env.NODE_ENV === "development" ? " ws: wss:" : ""
    }`,
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

const securityHeaders = [
  // Prepreči MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Prepreči clickjacking (iframe embedding)
  { key: "X-Frame-Options", value: "DENY" },
  // Omeji razkrivanje origina pri navzkrižnih zahtevah
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Onemogoči neuporabljene browser APIje
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=()",
  },
  // HSTS — vsili HTTPS za 2 leti (vključno s subdomenami)
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // CSP (revizija #9, trditev 7 — ostrenje s površino, ki jo klient DEJANSKO
  // uporablja; prej: unsafe-eval + https:/wss: wildcardji tudi v produkciji):
  //
  //   script-src 'unsafe-inline' — NAMENOMO ostane: Next.js App Router
  //     izrisuje inline hydration skripte (self.__next_f.push). Nonce-CSP bi
  //     zahteval middleware + popolnoma dinamično izrisovanje (konec statične
  //     optimizacije) — arhitekturna sprememba, ne hardening. Dokumentiran
  //     trade-off.
  //   script-src 'unsafe-eval' — SAMO dev (React Refresh/HMR). Produkcija ga
  //     ne potrebuje (noben dependency ne evaluje) → odstranjen.
  //   connect-src — vsi klientni fetchi so same-origin (/api/… proxyji za
  //     zunanje servise; audirano 2026-09, 0 zunanjih fetch/WebSocket/XHR v
  //     klientnih komponentah) → 'self' blob:; dev doda ws:/wss: za HMR.
  //   img-src https: — NAMENOMO ostane: zunanje slike iz DB (consultation
  //     partnerji, logotipi ponudnikov …) se strežejo prek surovega <img> —
  //     gostiteljev ni mogoče enumerirati. Meji sta moderacija + write-time
  //     validacija URL-jev (external-url.ts), ne CSP.
  //   frame-ancestors 'none' prepreči embedding (strožje od XFO DENY).
  //   D7 (1.140.0): vrednost zdaj gradi buildCsp() zgoraj (ena resnica za
  //   obe politiki — direktivi so nespremenjene, le zapis preurejen).
  {
    key: "Content-Security-Policy",
    value: buildCsp("'none'"),
  },
];

const nextConfig: NextConfig = {
  // TASK 76 (1.73.3): Next 16 dev blokira dev vire (/_next/hmr,
  // /__nextjs_font) iz „tujih" originov — privzeto je dovoljen SAMO
  // localhost. Sandbox prehod (Caddyfile :81 → localhost:3000, header_up
  // Host {host}) ohrani vhodni Host ⇒ predogled prek prehoda pride z
  // originom 127.0.0.1 (ali zunanjo domeno predogleda) → hidracija
  // UTIHNE (stran se izriže, React dogodki NE delujejo — BREZ konzolne
  // napake; diagnoza: self.__next_f prazen + gumb „Sestavi mojo pot"
  // ostane disabled kljub vnosu). Dovolimo 127.0.0.1 + izbirne dodatne
  // origine prek DSA_ALLOWED_DEV_ORIGINS (vejica-ločeno). SAMO dev —
  // produkcija (next build/standalone) možnosti NE upošteva.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    ...(process.env.DSA_ALLOWED_DEV_ORIGINS
      ? process.env.DSA_ALLOWED_DEV_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
      : []),
  ],
  // INFO-FIX (revizija 1.33.0, 16-e P3): x-powered-by: Next.js glava v
  // produkciji razkriva tehnologijo brez koristi — izklop.
  poweredByHeader: false,
  output: "standalone",
  // P3: vzporedni E2E agenti — vsak svoj distDir (DIST_DIR=.next-fixa next dev …),
  // da si dev strežniki ne tepetajo po skupnem .next/lock (izkušnja iz P2).
  // Ne nastavljeno → privzeto ".next" (identično obnašanje kot prej).
  ...(process.env.DIST_DIR ? { distDir: process.env.DIST_DIR } : {}),
  // Vercel demo baza (Faza 4e): db/demo-seed.db se zgradi med buildom
  // (scripts/build-demo-db.sh) in mora biti vključena v serverless bundle —
  // nft tracer je sam ne odkrije (dostop prek fs, ne prek importov).
  // Runtime: src/instrumentation.ts jo skopira v /tmp.
  // TASK 43 (1.49.1): ./data/** — kiwitaxi-routes.json baseline (2,18 MB)
  // se bere prek fs ob prvem dostopu (NE statični import — webpack OOM,
  // dokazano 18. 9. 2026); isti vzorec kot demo-seed.db zgoraj.
  outputFileTracingIncludes: {
    "/**": ["./db/**", "./data/**"],
  },
  // ignoreBuildErrors odstranjen 2026-09: `tsc --noEmit` je zdaj čist (0 napak)
  reactStrictMode: false,
  // 🔴 LOW-MEMORY BUILD (2026-09-11, Render free 512 MB): `next build --webpack`
  // tega projekta doseže ~2 GB vrhunca (tsc worker + webpack hkrati) — na
  // pomnilniško omejenih builderjih build pada (OOM, exit 134/137; lokalno
  // reproducirano). DSA_LOW_MEMORY_BUILD=1 vklopi obe ublažitvi SAMO tam,
  // kjer je nastavljena (Render); Vercel/CI/lokalni build ostanejo nespremenjeni:
  //   1. typescript.ignoreBuildErrors — vrata tipov NE izginejo: CI poganja
  //      `bunx tsc --noEmit` (ci.yml, obstala vrata) na vsakem pushu
  //   2. experimental.webpackMemoryOptimizations — Next-ov uradni low-memory
  //      webpack profil (izklopi webpack persistent cache / lažji sourcemapi)
  ...(process.env.DSA_LOW_MEMORY_BUILD === "1"
    ? {
        typescript: { ignoreBuildErrors: true },
        experimental: { webpackMemoryOptimizations: true },
      }
    : {}),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
      },
      {
        // NAMENOMA ostane (1.28.0, revizija #12): varnostna mreža, NE mrtva
        // konfiguracija. Marketplace startup migracija (slike CDN →
        // /content/) je fail-open — če bi na kateri produkciji kdaj spodletela,
        // bi vrstice v DB še vedno kazale na sfile.chatglm.cn in next/image
        // brez tega vnosa ne bi izrisal teh slik. Vercel produkcijska DB je
        // preverjena čista (0 sfile URL-jev); Render je bil ob preverbi v
        // hladnem zagonu. Odstrani šele, ko je OBE produkciji dokazano čisti.
        protocol: "https",
        hostname: "sfile.chatglm.cn",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // ─────────────────────────────────────────────────────────────────────
      // SW-SPECIFIČNA CSP (1.95.0, fix bele slike zemljevida na produkciji):
      //
      // Service worker ima LASTNO CSP, ki jo prejme z odgovorom /sw.js — in
      // ta CSP velja za fetch() klice IZ SW konteksta (ne strani!). Splošna
      // CSP zgoraj ima connect-src 'self' blob:, kar je PRAVILNO za stran
      // (klient nikoli ne kliče tujih API-jev) — a SW v fetch handlerju
      // SAM prevzame prestrete zahteve (OSM tiles, unsplash slike) in jih
      // ponovno pridobi s fetch(request) IZ SVOJEGA konteksta → njegova
      // connect-src blokira tile.openstreetmap.org → respondWith obljuba
      // ZAVRNE → ploščice NE naložijo → BELA SLIKA zemljevida (dokazano na
      // obeh produkcijah: istostranska slika OK, tuja slika/tile FAIL, v
      // devu deluje ker je SW passthrough prek ?dev=1).
      //
      // connect-src tu ZRCALI img-src politiko strani ('self' + vsi https):
      // SW sme pridobivati SAMO tisto, kar sme tudi stran (slike/tiles) —
      // omrežna površina SW-ja je strožja ali enaka strani, NIKOLI širša
      // (SW ne sme postati proxy za poljuben promet). Ostali direktivi
      // ostajajo tesni (script/worker 'self').
      // Pravilo za POSAMEZNO pot PREGLASI splošno pravilo (isti ključ,
      // specifičnejša pot kasneje v seznamu).
      // ─────────────────────────────────────────────────────────────────────
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self'",
              "worker-src 'self'",
              // PRESTRETE slike/ploščice: enaka omrežna meja kot img-src strani
              "connect-src 'self' blob: https:",
            ].join("; "),
          },
        ],
      },
      // ─────────────────────────────────────────────────────────────────────
      // ISSUE #4 §23 (VAL 8, P3): X-Robots-Tag na deljenih poteh —
      // meta robots na strani pokriva HTML izris, a odgovori /pot/* prek
      // proxyjev/ogledov brez meta (headless fetch, CDN vmesni predpomnilnik)
      // z glavo NE bodo nikoli indeksirani. Dvojna zaščita z
      // index:false v metadata (pot/page.tsx) + 0 URL-jev v sitemapu.
      // ─────────────────────────────────────────────────────────────────────
      {
        source: "/pot/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, follow" },
        ],
      },
      // ─────────────────────────────────────────────────────────────────────
      // D7 (1.140.0): BLOG-EMBED DELJENIH POTI — /pot/embed/[shareId] je pot,
      // NAMENJENA vdelavi v iframe na tujih straneh (WordPress/bloggerji;
      // Roam Aroundov „Embed on your site“ vzorec, brez zavrnjene token
      // ekonomije — benchmark dodatek D/7). Splošna politika zgoraj (XFO
      // DENY + frame-ancestors 'none') blokira VSAKO vdelavo — za to pot jo
      // nadomestimo (kasnejše specifičnejše pravilo preglasi isti ključ,
      // isti vzorec kot /sw.js):
      //
      //   - CSP: buildCsp("*") — ISTA politika kot stran, razlikuje se SAMO
      //     frame-ancestors * (dovoli vdelavo s katere koli domene: pote je
      //     javna — isPublic vrata + 404 za zasebne — in vdelava NE razširi
      //     omrežne površine: connect/img ostajata tesni).
      //   - X-Frame-Options: ALLOWALL — neveljavna vrednost po RFC 7035;
      //     moderni brskalniki neveljaven XFO ignorirajo, CSP frame-ancestors
      //     (ki v brskalnikih, ki podpirata oboje, PREVLADA) ostaja edina
      //     resnica. XFO globalnega pravila tu ne moremo „izbrisati“
      //     (headers() ne podpira odstranjevanja ključa) — nadomestitev z
      //     neveljavno vrednostjo je edini pošteni mehanizem.
      //   - Klikjacking površina: embed izris NE vsebuje pooblaščenih
      //     urejalnih ploskev (TripCollaboration/TripGuide/TripDocuments/
      //     TripPush so izključeni; next-auth piškotek je SameSite=Lax → se
      //     v tujem iframe-u NE pošlje); ostanejo samo javna dejanja
      //     (glasovanje, fork), ista kot pri direktnem obisku.
      //   - X-Robots-Tag pravilo /pot/:path* zgoraj velja TUDI tu (drug
      //     ključ, pravili se SEŠTEJETA) → embed pote nikoli ne indeksiramo
      //     ločeno; generateMetadata dodno še robots noindex + canonical.
      // ─────────────────────────────────────────────────────────────────────
      {
        source: "/pot/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: buildCsp("*") },
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
