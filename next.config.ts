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
  {
    key: "Content-Security-Policy",
    value: [
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
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
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
  outputFileTracingIncludes: {
    "/**": ["./db/**"],
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
    ];
  },
};

export default withNextIntl(nextConfig);
