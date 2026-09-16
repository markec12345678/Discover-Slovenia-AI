#!/usr/bin/env bash
# ============================================================================
# functional-smoke.sh — CI-FUNC + PROD-MONITOR (1.31.0)
# ----------------------------------------------------------------------------
# NAMEN: prvi PRAVI funkcionalni dim aplikacije. Do 1.30.0 je CI dokazoval
# samo "build uspe" + "unit testi gredo" — aplikacija se NIKOLI ni zagnala.
# Ta skripta obliva ŽIVO aplikacijo: SSR strani, javne API-je, sitemap
# (SEO površina), 404 obnašanje in (v CI načinu) fallback pot načrtovalnika.
#
# DVA NAČINA UPORABE:
#   1. CI (vsak push/PR):  bash scripts/ops/functional-smoke.sh http://127.0.0.1:3000
#      CI nima AI ključev → POST /api/itinerary sproži DETERMINISTIČNO
#      fallback pot (ista produkcijska pot ob odpovedi AI) — brez omrežne
#      odvisnosti od AI ponudnikov, ~5 s.
#   2. PRODUKCIJA (read-only):  bash scripts/ops/functional-smoke.sh \
#          https://i-feel-slovenia.vercel.app --get-only --ready-timeout 120
#      --get-only preskoči POST (ne porablja rate limit kvote uporabnikov).
#
# ZAGON PROTI KATEREMU KOLI ŽIVEEMU STREŽNIKU (dev/prod):
#   functional-smoke.sh [BASE_URL] [--ready-timeout S] [--get-only]
#                       [--min-sitemap-urls N]
#     BASE_URL           privzeto http://localhost:3000
#     --ready-timeout S  koliko sekund čakati na pripravljenost (privzeto 90;
#                        za Render free hladni zagon priporočeno 240+)
#     --get-only         brez POST /api/itinerary (produkcija)
#     --min-sitemap-urls N  prag regresije SEO površine (privzeto 650;
#                        lokalno/produkcija ~733 URL — padec pod prag = alarm)
#
# IZHOD: 0 = vsa preverjanja zelena · 1 = vsaj eno rdeče (z razlogom)
# Odvisnosti: curl, jq (oba na GH Actions runnerjih in v razvojnem sandboxu)
# ============================================================================
source "$(dirname "$0")/lib.sh"

BASE_URL="http://localhost:3000"
READY_TIMEOUT=90
GET_ONLY=0
MIN_SITEMAP_URLS=650

usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//; s/^=*$//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --get-only) GET_ONLY=1 ;;
    --ready-timeout) READY_TIMEOUT="${2:?--ready-timeout zahteva število}"; shift ;;
    --min-sitemap-urls) MIN_SITEMAP_URLS="${2:?--min-sitemap-urls zahteva število}"; shift ;;
    -h|--help) usage ;;
    -*) die "Neznana zastavica: $1 (glej --help)" ;;
    *) BASE_URL="$1" ;;
  esac
  shift
done

require_cmd curl
require_cmd jq

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
VERSION_NOTE=""

ok_check()  { PASS=$((PASS + 1)); ok "$1"; }
bad_check() { FAIL=$((FAIL + 1)); err "$1"; }

# GET -> izpiše HTTP kodo, telo v datoteko (000 = strežnik nedosegljiv)
fetch() { # $1=pot, $2=izhodna datoteka
  local code
  code=$(curl -sS -m 60 -o "$2" -w "%{http_code}" "${BASE_URL}$1" 2>/dev/null) || code=000
  echo "$code"
}

# ── 0/11: pripravljenost strežnika ────────────────────────────────────────
step "0/11 — Pripravljenost (${BASE_URL}, do ${READY_TIMEOUT} s)"
deadline=$(( $(date +%s) + READY_TIMEOUT ))
ready=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  code=$(curl -sS -m 10 -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" 2>/dev/null) || code=000
  # 200 = zdrav · 503 = strežnik ŽIV, a degraded (zajame ga preverjanje 7)
  case "$code" in 200|503) ready=1; break ;; esac
  sleep 3
done
if [ "$ready" = "1" ]; then
  ok_check "strežnik odgovarja (health → ${code})"
else
  bad_check "strežnik NI pripravljen v ${READY_TIMEOUT} s (zadnja koda: ${code})"
  die "Prekinjam — brez strežnika ostala preverjanja nimajo pomena"
fi

# ── 1/11: domača stran (SL) ───────────────────────────────────────────────
step "1/11 — GET / (domača stran, SSR)"
code=$(fetch "/" "$TMP/home.html")
if [ "$code" = "200" ] && grep -q "Discover Slovenia" "$TMP/home.html"; then
  ok_check "200 + vsebinski marker"
else
  bad_check "GET / → ${code} (pričakovano 200 + marker \"Discover Slovenia\")"
fi

# ── 2/11 + 3/11: načrtovalnik SL/EN ───────────────────────────────────────
step "2/11 — GET /nacrtuj (načrtovalnik SL)"
code=$(fetch "/nacrtuj" "$TMP/nacrtuj.html")
[ "$code" = "200" ] && ok_check "200" || bad_check "GET /nacrtuj → ${code} (pričakovano 200)"

step "3/11 — GET /en/nacrtuj (načrtovalnik EN)"
code=$(fetch "/en/nacrtuj" "$TMP/en-nacrtuj.html")
[ "$code" = "200" ] && ok_check "200" || bad_check "GET /en/nacrtuj → ${code} (pričakovano 200)"

# ── 4/11: EN domača stran ────────────────────────────────────────────────
step "4/11 — GET /en (angleška domača stran)"
code=$(fetch "/en" "$TMP/en.html")
[ "$code" = "200" ] && ok_check "200" || bad_check "GET /en → ${code} (pričakovano 200)"

# ── 5/11: robots.txt ──────────────────────────────────────────────────────
step "5/11 — GET /robots.txt"
code=$(fetch "/robots.txt" "$TMP/robots.txt")
[ "$code" = "200" ] && ok_check "200" || bad_check "GET /robots.txt → ${code} (pričakovano 200)"

# ── 6/11: sitemap + vzorčne globoke strani (SEO površina) ─────────────────
step "6/11 — GET /sitemap.xml (SEO površina, prag ≥ ${MIN_SITEMAP_URLS} URL)"
code=$(fetch "/sitemap.xml" "$TMP/sitemap.xml")
if [ "$code" = "200" ] && grep -q "<urlset" "$TMP/sitemap.xml"; then
  urls=$(grep -c "<loc>" "$TMP/sitemap.xml" || true)
  if [ "${urls:-0}" -ge "$MIN_SITEMAP_URLS" ]; then
    ok_check "200, ${urls} URL-jev (≥ ${MIN_SITEMAP_URLS})"
    # Vzorčenje 3 globokih strani (prva/srednja/zadnja) — realne vsebine,
    # ne samo lupina sitemapa. Poti so RELATIVNE (sitemap generira URL-je
    # z gostiteljem zahteve → deluje na localhost in produkciji enako).
    grep -o "<loc>[^<]*</loc>" "$TMP/sitemap.xml" | sed 's/<[^>]*>//g' | sed 's|^\s*https\?://[^/]*||' > "$TMP/sitemap-paths.txt" || true
    total_lines=$(wc -l < "$TMP/sitemap-paths.txt" | tr -d ' ')
    for idx in 1 $(( total_lines / 2 )) ${total_lines}; do
      [ "$idx" -ge 1 ] && [ "$idx" -le "$total_lines" ] || continue
      p=$(sed -n "${idx}p" "$TMP/sitemap-paths.txt")
      [ -n "$p" ] || continue
      scode=$(fetch "$p" "$TMP/sample.html")
      [ "$scode" = "200" ] && ok_check "vzorec [${idx}/${total_lines}] ${p} → 200" \
                              || bad_check "vzorec ${p} → ${scode} (pričakovano 200)"
    done
  else
    bad_check "sitemap ima ${urls:-0} URL-jev — pod pragom ${MIN_SITEMAP_URLS} (regresija SEO površine?)"
  fi
else
  bad_check "GET /sitemap.xml → ${code} (pričakovano 200 + <urlset>)"
fi

# ── 7/11: /api/health (startup migracije — srce FAIL-MODE vidnosti) ──────
step "7/11 — GET /api/health (startup koraki)"
code=$(fetch "/api/health" "$TMP/health.json")
hstatus=$(jq -r '.status // empty' "$TMP/health.json" 2>/dev/null || true)
hversion=$(jq -r '.version // empty' "$TMP/health.json" 2>/dev/null || true)
VERSION_NOTE="${hversion:-?}"
if [ "$code" = "200" ] && [ "$hstatus" = "ok" ]; then
  ok_check "status ok (v${hversion:-?})"
elif [ "$code" = "200" ] && [ "$hstatus" = "no-data" ]; then
  warn "health: no-data — instrumentacija na tej instanci ni stekla (redko, npr. predictivni zagon); štejem kot ok"
  PASS=$((PASS + 1))
elif [ "$code" = "503" ]; then
  bad_check "health DEGRADED (503) — spodleteli/neznani startup koraki:"
  jq -r '.startup[] | select(.status == "failed" or .status == "unknown") | "        · \(.name): \(.status) — \(.detail // "brez detajla")"' "$TMP/health.json" 2>/dev/null || true
else
  bad_check "GET /api/health → ${code}, status: ${hstatus:-/} (pričakovano 200 + ok)"
fi

# ── 8/11: /api/listings (živa DB povezljivost) ────────────────────────────
step "8/11 — GET /api/listings (DB povezljivost)"
code=$(fetch "/api/listings" "$TMP/listings.json")
ltotal=$(jq -r '.total // empty' "$TMP/listings.json" 2>/dev/null || true)
if [ "$code" = "200" ] && jq -e '(.listings | type) == "array"' "$TMP/listings.json" >/dev/null 2>&1; then
  ok_check "200, listings[] (${ltotal:-?} skupno)"
else
  bad_check "GET /api/listings → ${code} (pričakovano 200 + JSON z listings[])"
fi

# ── 9/11: 404 obnašanje ───────────────────────────────────────────────────
step "9/11 — GET /ci-smoke-neobstojeca-stran (pričakovano 404)"
code=$(fetch "/ci-smoke-neobstojeca-stran" "$TMP/notfound.html")
[ "$code" = "404" ] && ok_check "404" || bad_check "→ ${code} (pričakovano 404 — mehke 200 so SEO težava)"

# ── 10/11: POST /api/itinerary (fallback pot — samo CI/lokalno) ──────────
step "10/11 — POST /api/itinerary (deterministična fallback pot)"
if [ "$GET_ONLY" = "1" ]; then
  info "preskočen (--get-only — produkcija: ne porabim rate limit kvote uporabnikov)"
else
  code=$(curl -sS -m 120 -o "$TMP/itinerary.json" -w "%{http_code}" -X POST \
    "${BASE_URL}/api/itinerary" \
    -H "Content-Type: application/json" \
    -d '{"budget":"medium","days":2,"interests":["narava"],"season":"poletje","groupSize":2}' \
    2>/dev/null) || code=000
  idays=$(jq -r '.days | length' "$TMP/itinerary.json" 2>/dev/null || echo 0)
  iloc0=$(jq -r '.days[0].locations | length' "$TMP/itinerary.json" 2>/dev/null || echo 0)
  isrc=$(jq -r '.source // empty' "$TMP/itinerary.json" 2>/dev/null || true)
  if [ "$code" = "200" ] && [ "${idays:-0}" -ge 1 ] && [ "${iloc0:-0}" -ge 1 ] && [ -n "$isrc" ]; then
    ok_check "200 — ${idays} dneva, ${iloc0} postankov v 1. dnevu (source: ${isrc})"
  else
    bad_check "POST /api/itinerary → ${code}, dni: ${idays:-0}, postankov dan1: ${iloc0:-0}, source: ${isrc:-/}"
  fi
fi

# ── 11/11: povzetek ───────────────────────────────────────────────────────
step "11/11 — Povzetek"
line
echo "  cilj:      ${BASE_URL}"
echo "  verzija:   ${VERSION_NOTE}"
echo "  rezultat:  ${PASS} ok / ${FAIL} neuspešnih"
line
if [ "$FAIL" -gt 0 ]; then
  die "FUNCTIONAL SMOKE NEUSPEŠEN — ${FAIL} preverjanj rdečih (glej zgoraj za razloge)"
fi
ok "FUNCTIONAL SMOKE: vsa preverjanja zelena"
