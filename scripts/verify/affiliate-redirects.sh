#!/usr/bin/env bash
# =============================================================================
# affiliate-redirects.sh — E2E affiliate redirect + security suite (FAZA 11+13)
#
# Raba:
#   BASE_URL=http://localhost:3000 bash scripts/verify/affiliate-redirects.sh
#   BASE_URL=https://i-feel-slovenia.onrender.com bash scripts/verify/affiliate-redirects.sh
#
# Preverja DEJANSKE Location headerje (ne "link se odpre"):
#   - vsak partner: status 302 + pravi host + pravi parametri
#   - fail-closed: brez fake ID-jev (aid=1234567 / slovenia-demo)
#   - whitelist destinacij: neznan dest → "Slovenija"
#   - security: open redirect / SSRF / XSS / traversal / encoded payload
#     / partner override — VSI blokirani
#
# Varno: GET-only, brez pisanja v DB (tracking zapis je stranski učinek
# običajnega redirecta — enako kot realen obiskovalec).
# =============================================================================
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✅ PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ❌ FAIL: $1"; }
hdr()  { echo; echo "== $1 =="; }

loc()   { curl -s -o /dev/null -w '%{redirect_url}' --max-time 30 "$1"; }
code()  { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$1"; }

echo "Affiliate redirect suite — $BASE_URL ($(date -u '+%Y-%m-%d %H:%M UTC'))"

# -----------------------------------------------------------------------------
hdr "1) Partner redirecti — status + host + parametri (FAZA 13)"

declare -A HOSTS=(
  [hotels]="www.booking.com"
  [cars]="www.discovercars.com"
  [activities]="www.getyourguide.com"
  [flights]="www.skyscanner.net"
)
declare -A DESTS=( [hotels]="Ljubljana" [cars]="Ljubljana" [activities]="Bled" [flights]="Ljubljana" )
declare -A PARAMS=( [hotels]="ss" [cars]="pickuplocation" [activities]="q" [flights]="path" )

for P in hotels cars activities flights; do
  DEST="${DESTS[$P]}"
  C="$(code "$BASE_URL/go/$P?dest=$(printf '%s' "$DEST" | sed 's/ /%20/g')")"
  L="$(loc "$BASE_URL/go/$P?dest=$(printf '%s' "$DEST" | sed 's/ /%20/g')")"
  [[ "$C" == "302" ]] && ok "$P: HTTP 302" || bad "$P: HTTP $C (pričakovano 302)"
  if [[ -n "$L" ]]; then
    HOST_L="$(printf '%s' "$L" | sed -E 's|https?://([^/?]+).*|\1|')"
    [[ "$HOST_L" == "${HOSTS[$P]}" ]] && ok "$P: host ${HOSTS[$P]}" || bad "$P: host $HOST_L"
    if [[ "$P" == "flights" ]]; then
      [[ "$L" == *"/transport/flights-to/lju/"* ]] && ok "$P: deep link /transport/flights-to/lju/ (whitelist + IATA)" || bad "$P: ni pravega deep linka: $L"
    else
      [[ "$L" == *"${PARAMS[$P]}=${DEST// /%20}"* || "$L" == *"${PARAMS[$P]}=${DEST// /+}"* ]] \
        && ok "$P: destinacija '$DEST' preide v parameter ${PARAMS[$P]}" \
        || bad "$P: destinacija ni v Location: $L"
    fi
  else
    bad "$P: manjka Location header"
  fi
done

C="$(code "$BASE_URL/go/insurance?days=7")"
L="$(loc "$BASE_URL/go/insurance?days=7")"
[[ "$C" == "302" ]] && ok "insurance: HTTP 302" || bad "insurance: HTTP $C"
[[ "$L" == https://www.worldnomads.com/* || "$L" == https://www.dpbolvw.net/* || "$L" == https://www.anrdoezrs.net/* || "$L" == https://www.jdoqocy.com/* || "$L" == https://www.tkqlhce.com/* || "$L" == https://www.kqzyfj.com/* ]] \
  && ok "insurance: dovoljen host (worldnomads ali CJ domene)" \
  || bad "insurance: nedovoljen host: $L"

# -----------------------------------------------------------------------------
hdr "2) Fail-closed — brez fake affiliate ID-jev (FAZA 17)"

for PAT in "1234567" "slovenia-demo"; do
  FOUND=0
  for P in hotels cars activities flights insurance; do
    L="$(loc "$BASE_URL/go/$P?dest=Ljubljana&days=7")"
    [[ "$L" == *"$PAT"* ]] && FOUND=1
  done
  [[ "$FOUND" == "0" ]] && ok "noben redirect ne vsebuje fake ID '$PAT'" || bad "fake ID '$PAT' se še vedno pojavlja!"
done

# -----------------------------------------------------------------------------
hdr "3) Whitelist destinacij (FAZA 5)"

L="$(loc "$BASE_URL/go/hotels?dest=MadeUpCity123")"
[[ "$L" == *"ss=Slovenija"* ]] && ok "neznan dest → ss=Slovenija" || bad "neznan dest ne pade na fallback: $L"

L="$(loc "$BASE_URL/go/cars?dest=bled")"
[[ "$L" == *"pickuplocation=Bled"* ]] && ok "slug 'bled' → kanonično 'Bled'" || bad "slug resolucija ne deluje: $L"

# -----------------------------------------------------------------------------
hdr "4) Manjkajoč dest → 400 (ne fallback tiho)"

for P in hotels cars activities flights; do
  C="$(code "$BASE_URL/go/$P")"
  [[ "$C" == "400" ]] && ok "$P brez dest → 400" || bad "$P brez dest → $C (pričakovano 400)"
done

# -----------------------------------------------------------------------------
hdr "5) SECURITY — open redirect / SSRF / XSS / traversal / override (FAZA 11)"

# 5a. open redirect: url/target parametri se IGNORIRAJO (redirect gre na partnerja)
for PARAM in url target redirect next goto; do
  L="$(loc "$BASE_URL/go/hotels?dest=Ljubljana&$PARAM=https://evil.com/x")"
  [[ "$L" == https://www.booking.com/* ]] && ok "open redirect blokiran (?$PARAM= ignoriran)" || bad "?$PARAM= preusmeril na: $L"
done

# 5b. dest kot zunanji URL → nikoli v Location
for PAYLOAD in "https://evil.com" "https%3A%2F%2Fevil.com" "http://localhost:3000" "//evil.com" "javascript:alert(1)" "<script>alert(1)</script>" "../../../etc/passwd" "%2e%2e%2f%2e%2e%2f"; do
  L="$(loc "$BASE_URL/go/hotels?dest=$(printf '%s' "$PAYLOAD" | sed 's/&/%26/g')")"
  if [[ "$L" != *evil.com* && "$L" != *localhost* && "$L" != *passwd* && "$L" != *script* && "$L" != *javascript* ]]; then
    ok "dest='$PAYLOAD' → payload izključen (fallback Slovenija)"
  else
    bad "dest='$PAYLOAD' PUŠČA payload v Location: $L"
  fi
done

# 5c. skyscanner path traversal (dest gre v path!)
L="$(loc "$BASE_URL/go/flights?dest=..%2F..%2Fevil")"
[[ "$L" == *"/transport/flights-to/lju/"* && "$L" != *".."* ]] && ok "flights traversal → whitelist fallback lju" || bad "flights traversal: $L"

# 5d. partner override → neznan provider = 404 (allowlist)
for P in "evil" "hotels%00" "ADMIN"; do
  C="$(code "$BASE_URL/go/$P?dest=Ljubljana")"
  [[ "$C" == "404" ]] && ok "neznan provider '$P' → 404" || bad "neznan provider '$P' → $C"
done

# 5e. encoded provider path
C="$(code "$BASE_URL/go/hotels%2F..%2Fadmin?dest=Ljubljana")"
[[ "$C" == "404" ]] && ok "encoded path provider → 404" || bad "encoded path provider → $C"

# 5f. days validacija (insurance)
C="$(code "$BASE_URL/go/insurance?days=99")"
[[ "$C" == "400" ]] && ok "insurance days=99 → 400" || bad "insurance days=99 → $C"
C="$(code "$BASE_URL/go/insurance?days=abc")"
[[ "$C" == "400" ]] && ok "insurance days=abc → 400" || bad "insurance days=abc → $C"

# 5g. dest predolg → 400
LONG="$(printf 'a%.0s' $(seq 1 150))"
C="$(code "$BASE_URL/go/hotels?dest=$LONG")"
[[ "$C" == "400" ]] && ok "dest 150 znakov → 400" || bad "predolg dest → $C"

# -----------------------------------------------------------------------------
hdr "6) PII — URL ne nosi osebnih podatkov"
L="$(loc "$BASE_URL/go/hotels?dest=Ljubljana&email=test%40example.com&user_id=123")"
if [[ "$L" != *"email="* && "$L" != *"user_id="* && "$L" != *"@"* ]]; then
  ok "PII parametri se ne prenesejo v partner URL"
else
  bad "PII preide v Location: $L"
fi

# -----------------------------------------------------------------------------
echo
echo "=================================================="
echo "REZULTAT: $PASS pass / $FAIL fail"
[[ "$FAIL" == "0" ]] && echo "AFFILIATE REDIRECT SUITE: ZELENA ✅" || echo "AFFILIATE REDIRECT SUITE: RDEČA ❌"
exit $FAIL
