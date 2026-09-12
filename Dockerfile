# =============================================================================
# Discover-Slovenia-AI — produkcijska Docker slika (Next.js standalone + SQLite)
# =============================================================================
#
# Build:  docker build -t discoverslovenia .
# Zagon:  docker compose up -d          (glej docker-compose.yml)
#
# ZAKAJ standalone in ne serverless (Vercel):
#   Aplikacija uporablja SQLite (datotečna baza). Serverless lambde nimajo
#   trajnega datotečnega sistema, zato je VPS/Docker + SQLite naravna
#   produkcijska arhitektura za ta projekt. Celotna odločitvena analiza
#   (vključno z alternativo Vercel + hosted Postgres): docs/DEPLOYMENT.md
#
# E2E dokazano (Faza 4d): standalone strežnik streže vse poti (200/404),
#   vključno z dinamičnimi stranmi iz baze in i18n (`/en`).

# ── 1. Odvisnosti (layer cache) ─────────────────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
# postinstall (prisma generate) pripravi Prisma klienta
RUN bun install --frozen-lockfile

# ── 2. Build ────────────────────────────────────────────────────────────────
FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# Začetna (prazna) baza s celotno shemo — uporabljena kot semeforo
# ob prvem zagonu (Docker jo sam skopira v prazen named volume).
RUN mkdir -p db && DATABASE_URL=file:/app/db/custom.db bunx prisma db push --skip-generate

# METADATABASE (MONET-10): absolutni OG/canonical/JSON-LD URL-ji se spečejo
# ob buildu. Privzeto DEJANSKA produkcjska domena (Render), ne mrtva
# discoverslovenia.ai. Ko uporabnik priključi lastno domeno, v Render
# dashboard nastavi NEXT_PUBLIC_BASE_URL=https://<domena> — Render jo kot
# service env spusti v build in ARG jo prevzame (Render podaja env
# spremenljivke Dockerfile ARG-om z istim imenom).
# Dinamične poti (robots.txt/sitemap.xml/llms.txt/rss.xml) temu ne sledijo —
# te berejo gostitelja ZAHTEVE (src/lib/host.ts) in so pravilne na vsakem hostu.
ARG NEXT_PUBLIC_BASE_URL=https://i-feel-slovenia.onrender.com
ENV NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}

# Produkcjski build — NE potrebuje DATABASE_URL (dinamične strani imajo
# try/catch fallback; prisma generate zaganja sama build skripta).
# build skripta tudi skopira public/ + .next/static + manifeste v standalone.
RUN bun run build

# ── 3. Runtime (standalone) ─────────────────────────────────────────────────
FROM oven/bun:1 AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# curl za HEALTHCHECK (ustvari se v lastni plasti — cache friendly)
RUN apt-get update -qq && apt-get install -y -qq curl && rm -rf /var/lib/apt/lists/*

# Standalone strežnik: server.js + traced node_modules (+ Prisma engine)
# + .next/static + public/ (skopirano z build skripto).
# POTEDBA: .env NI vključen — spremenljivke se podajo ob zagonu (compose).
COPY --from=build /app/.next/standalone ./

# Začetna baza s shemo (prazna) — Docker jo ob PRVEM zagonu skopira
# v prazen named volume; kasneje volumen "podeduje" obstoječe podatke.
COPY --from=build /app/db/custom.db /app/db/custom.db

EXPOSE 3000

# Enostaven healthcheck na statični poti (brez DB odvisnosti)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/robots.txt || exit 1

CMD ["bun", "server.js"]
