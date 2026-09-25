#!/usr/bin/env bash
# ============================================================================
# lighthouse-gates.sh — TASK 30 (Tier 1 #4): Lighthouse + Core Web Vitals vrata
# ----------------------------------------------------------------------------
# VRZEL (benchmark Task 28): svetovni produkti (GYG, Wanderlog) imajo perf/UX
# budnost v CI; mi smo imeli 0 perf vrat. Ta skripta doda ISKRENA vrata:
# Lighthouse (mobile, simulate throttling) nad PRODUKCIJSKIM standalone
# buildom + Core Web Vitals pragovi (LCP/CLS/TBT).
#
# ZAKAJ STANDALONE (ne dev): dev SW (?dev=1) izklopi predpomnjenje in dev
# bundli niso minificirani → TBT ~13 000 ms je artefakt dev moda (izmerjeno
# 1.107.0). Vrata merijo ISTO pot kot CI/Docker/Render.
#
# ZAKAJ SIMULATE (Lantern, ne devtools): simulacija je determinističnejša na
# šumnem CI hardwareju (model 4x CPU throttle) — vrata, ki padajo naključno,
# niso vrata.
#
# PRAGI (iskreni, mobile — REGRESIJSKA vrata, ne čudoviti):
#   performance ≥ 0.50 · accessibility ≥ 0.90 · best-practices ≥ 0.90
#   seo ≥ 0.90 · LCP ≤ 5000 ms · CLS ≤ 0.10 · TBT ≤ 2500 ms
# UTEMELJITEV (baseline 1.107.0, standalone, mobile simulate, 5 strani):
#   perf 0.55–0.82 (min / domov 0.55) → prag 0.50 s šumno varnostjo ±0.05
#   LCP 2.6–4.8 s (max / domov 4.78 s) → prag 5000 ms (Google „poor“ > 4 s;
#     vrata preprečujejo razpad V „poor“, doseg „good“ 2.5 s je Tier 2 naloga)
#   TBT 277–2147 ms (izmerjen šum med zagoni istega stroja: 1360→2147,
#     +57 %) → prag 2500 ms: ščiti pred razpadom (pomotoma dodana sync
#     knjižnica skoči 5000+), ne pretending natančnost; Google „good“
#     < 200 ms je Tier 2 naloga (bundle razrez/dynamic import)
#   a11y/bp/seo so DOM-stabilni (ne-časovni) → smelo 0.90 (vsi ≥ 0.90 danes)
#   CLS 0–0.003 → Google „good“ meja 0.10 brez kompromisa
# NAMEN: preprečiti REGRESIJO (Wanderlog/GYG disciplina), ne prikriti
# izboljševalnega dolga — baseline + svetovne meje so dokumentirane v
# docs/E2E-GATES.md.
#
# UPORABA:
#   bash scripts/ops/lighthouse-gates.sh                    # build+zagon+meritve
#   START_SERVER=0 BASE_URL=http://localhost:3000 bash …    # že tekoč strežnik
#   PAGES="/,/o-strani" bash …                              # lasten nabor strani
#
# POGOJI: bun, .env (ali fallback CI vrednosti), chromium (samodejno
# iskanje: CHROME_BIN override → ms-playwright → system), npx (lighthouse@13).
#
# IZHOD: 0 = vrata zelena · 1 = kateri koli prag presežen · die pri
# infrastrukturni napaki (strežnik/kroma/lighthouse manjkajo — to NI
# „rdeča meritev“, ampak „ni meritve“, iskrena razlika)
# ============================================================================
source "$(dirname "$0")/lib.sh"

# ── Konfiguracija (env override) ───────────────────────────────────────────
BASE_URL="${BASE_URL:-http://localhost:3000}"
START_SERVER="${START_SERVER:-1}"
PORT="${PORT:-3000}"
PAGES="${PAGES:-/,/destinacije,/destinacija/bled,/na-poti,/zemljevid}"
LH_OUT_DIR="${LH_OUT_DIR:-/tmp/lighthouse-gates}"
LH_BIN="${LH_BIN:-npx --yes lighthouse@13}"
CHROME_BIN="${CHROME_BIN:-}"

# Pragi (iskreni — glej glavo; env override za eksperimente)
LH_MIN_PERF="${LH_MIN_PERF:-0.50}"
LH_MIN_A11Y="${LH_MIN_A11Y:-0.90}"
LH_MIN_BP="${LH_MIN_BP:-0.90}"
LH_MIN_SEO="${LH_MIN_SEO:-0.90}"
LH_MAX_LCP_MS="${LH_MAX_LCP_MS:-5000}"
LH_MAX_CLS="${LH_MAX_CLS:-0.10}"
LH_MAX_TBT_MS="${LH_MAX_TBT_MS:-2500}"

PASS=0
FAIL=0

ok_check()  { PASS=$((PASS + 1)); ok "$1"; }
bad_check() { FAIL=$((FAIL + 1)); err "$1"; }

# ── Varnostna vrata: SAMO lokalni cilji (vrata poganjajo obremenitev) ──────
case "$BASE_URL" in
  http://localhost:*|http://127.0.0.1:*) ;;
  *) die "VAROVALKA: BASE_URL '${BASE_URL}' ni lokalen — vrata tečejo samo proti localhost" ;;
esac

require_cmd curl
require_cmd jq

# ── Kroma: CHROME_BIN → ms-playwright (najnovejša) → system ────────────────
if [ -z "$CHROME_BIN" ]; then
  CHROME_BIN="$(ls -1 "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome 2>/dev/null | sort -V | tail -1 || true)"
fi
if [ -z "$CHROME_BIN" ]; then
  for c in /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome; do
    [ -x "$c" ] && CHROME_BIN="$c" && break
  done
fi
[ -n "$CHROME_BIN" ] && [ -x "$CHROME_BIN" ] \
  || die "chromium ni najden (namesti agent-browser: agent-browser install, ali podaj CHROME_BIN)"
info "chromium: ${CHROME_BIN}"

mkdir -p "$LH_OUT_DIR"

# ── Strežnik ────────────────────────────────────────────────────────────────
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [ "$START_SERVER" = "1" ]; then
  step "0 — Standalone strežnik (port ${PORT})"
  if [ ! -f .next/standalone/server.js ]; then
    info "ni standalone izhoda → bun run build"
    if ! bun run build; then
      die "build neuspešen — lighthouse vrata potrebujejo produkcijski izhod"
    fi
  fi
  set -a; source .env; set +a
  NODE_ENV=production PORT="$PORT" HOSTNAME=0.0.0.0 \
    NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-ci-smoke-nextauth-secret-0123456789}" \
    NEXTAUTH_URL="http://localhost:${PORT}" \
    bun .next/standalone/server.js > "${LH_OUT_DIR}/server.log" 2>&1 &
  SERVER_PID=$!

  deadline=$(( $(date +%s) + 90 )); ready=0
  while [ "$(date +%s)" -lt "$deadline" ]; do
    code=$(curl -sS -m 5 -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" 2>/dev/null) || code=000
    case "$code" in 200|503) ready=1; break ;; esac
    sleep 2
  done
  [ "$ready" = "1" ] && ok_check "strežnik pripravljen (health ${code})" || die "strežnik ni vstal (glej ${LH_OUT_DIR}/server.log)"
else
  step "0 — Obstoječi strežnik (${BASE_URL})"
  code=$(curl -sS -m 10 -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" 2>/dev/null) || code=000
  case "$code" in 200|503) ok_check "strežnik odgovarja (health ${code})" ;; *) die "START_SERVER=0 a strežnik na ${BASE_URL} ne odgovarja (${code})" ;; esac
fi

# ── Meritve po straneh ─────────────────────────────────────────────────────
IFS=',' read -ra PAGE_LIST <<< "$PAGES"
idx=0
for page in "${PAGE_LIST[@]}"; do
  idx=$((idx + 1))
  slug="$(printf '%s' "$page" | tr '/' '_' | sed 's/^_*//; s/_*$//')"
  [ -z "$slug" ] && slug="root"
  json="${LH_OUT_DIR}/${idx}-${slug}.json"
  step "${idx}/${#PAGE_LIST[@]} — ${page}"

  # Ogrevanje (2×): RSC/JIT cacheji, da meritve niso „prvi hladen start“
  curl -sS -m 60 -o /dev/null "${BASE_URL}${page}" || true
  curl -sS -m 60 -o /dev/null "${BASE_URL}${page}" || true

  if ! CHROME_PATH="$CHROME_BIN" $LH_BIN "${BASE_URL}${page}" \
      --output=json --output-path="$json" \
      --only-categories=performance,accessibility,best-practices,seo \
      --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage" \
      --quiet --max-wait-for-load=60000 2> "${LH_OUT_DIR}/${idx}-${slug}.stderr"; then
    bad_check "lighthouse ni tekel za ${page} (glej ${idx}-${slug}.stderr)"
    continue
  fi

  # Izlušči mere
  perf=$(jq -r '.categories.performance.score // "null"' "$json")
  a11y=$(jq -r '.categories.accessibility.score // "null"' "$json")
  bp=$(jq -r '.categories["best-practices"].score // "null"' "$json")
  seo=$(jq -r '.categories.seo.score // "null"' "$json")
  lcp=$(jq -r '.audits["largest-contentful-paint"].numericValue // "null"' "$json")
  cls=$(jq -r '.audits["cumulative-layout-shift"].numericValue // "null"' "$json")
  tbt=$(jq -r '.audits["total-blocking-time"].numericValue // "null"' "$json")

  lcp_s=$(jq -r '.audits["largest-contentful-paint"].displayValue // "?"' "$json")
  info "mere: perf=${perf} a11y=${a11y} bp=${bp} seo=${seo} · LCP=${lcp_s} CLS=${cls} TBT=${tbt} ms"

  # ── Vrata (float-safe primerjava prek awk) ──
  gate() { # $1=vrednost $2=operator $3=prag $4=ime
    [ "$1" = "null" ] && { bad_check "${4}: mere NI (${1}) — vrata ne morejo biti zelena"; return; }
    if awk -v v="$1" -v p="$3" -v op="$2" 'BEGIN { exit !( op=="ge" ? (v+0 >= p+0) : (v+0 <= p+0) ) }'; then
      ok_check "${4}: ${1} ${2} ${3} ✓"
    else
      bad_check "${4}: ${1} — prag ${2} ${3} PRESEŽEN"
    fi
  }

  gate "$perf" "ge" "$LH_MIN_PERF" "performance"
  gate "$a11y" "ge" "$LH_MIN_A11Y" "accessibility"
  gate "$bp"   "ge" "$LH_MIN_BP"   "best-practices"
  gate "$seo"  "ge" "$LH_MIN_SEO"  "seo"
  gate "$lcp"  "le" "$LH_MAX_LCP_MS" "LCP (ms)"
  gate "$cls"  "le" "$LH_MAX_CLS"    "CLS"
  gate "$tbt"  "le" "$LH_MAX_TBT_MS" "TBT (ms)"
done

# ── Povzetek ────────────────────────────────────────────────────────────────
step "Povzetek"
line
echo "  strani:    ${#PAGE_LIST[@]}"
echo "  rezultat:  ${PASS} ok / ${FAIL} neuspešnih"
echo "  mere:      ${LH_OUT_DIR}/"
line
[ "$FAIL" -gt 0 ] && die "LIGHTHOUSE VRATA RDEČA — ${FAIL} pragov preseženih (glej ${LH_OUT_DIR}/)"
ok "LIGHTHOUSE VRATA ZELENA: perf/a11y/bp/seo + CWV (LCP/CLS/TBT) znotraj pragov"
