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
[[ "$L" == https://www.worldnomads.com/* || "$L" == https://www.dpbolvw.net/* || "$L" == https://www.anrdoezrs.net/* || "$L" == https://www.jdoqocy.com/* || "$L" == https://www.tkqlhce.com/* || "$L" == https://www.kqzyfj.com/* || "$L" == https://safetywing.com/* || "$L" == https://www.safetywing.com/* ]] \
  && ok "insurance: dovoljen host (worldnomads / CJ / safetywing)" \
  || bad "insurance: nedovoljen host: $L"

# 1b) NOVI providerji (monetizacijska razširitev): eSIM / transferji /
#     transport / vstopnice — fail-closed čiste partnerske strani
C="$(code "$BASE_URL/go/esim")"
L="$(loc "$BASE_URL/go/esim")"
[[ "$C" == "302" && "$L" == https://www.airalo.com/* ]] \
  && ok "esim: 302 → čista Airalo stran (brez dest parametra)" \
  || bad "esim: HTTP $C / $L"

C="$(code "$BASE_URL/go/transfers?dest=Bled")"
L="$(loc "$BASE_URL/go/transfers?dest=Bled")"
[[ "$C" == "302" && "$L" == https://kiwitaxi.com/en/slovenia/bled* ]] \
  && ok "transfers: 302 → Kiwitaxi waypoint deep-link (uradni format)" \
  || bad "transfers: HTTP $C / $L"

C="$(code "$BASE_URL/go/transfers?from=Piran&dest=Bled")"
L="$(loc "$BASE_URL/go/transfers?from=Piran&dest=Bled")"
[[ "$C" == "302" && "$L" == *"/en/search?from=Piran&to=Bled"* ]] \
  && ok "transfers: from→to iskalni deep-link (uradni format)" \
  || bad "transfers from/to: HTTP $C / $L"

C="$(code "$BASE_URL/go/transport?dest=Ljubljana")"
L="$(loc "$BASE_URL/go/transport?dest=Ljubljana")"
[[ "$C" == "302" && ("$L" == https://www.omio.com/* || "$L" == https://tp.media/* || "$L" == https://*.travelpayouts.com/*) ]] \
  && ok "transport: 302 → Omio (ali TP povezava)" \
  || bad "transport: HTTP $C / $L"

C="$(code "$BASE_URL/go/tickets?dest=Bled")"
L="$(loc "$BASE_URL/go/tickets?dest=Bled")"
[[ "$C" == "302" && ("$L" == https://www.tiqets.com/* || "$L" == https://www.awin1.com/* || "$L" == https://tp.media/*) ]] \
  && ok "tickets: 302 → Tiqets (ali Awin/TP povezava)" \
  || bad "tickets: HTTP $C / $L"

# -----------------------------------------------------------------------------
hdr "2) Fail-closed — brez fake affiliate ID-jev (FAZA 17)"

for PAT in "1234567" "slovenia-demo"; do
  FOUND=0
  for P in hotels cars activities flights insurance esim transfers transport tickets; do
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

# 5a-pre) transfers: malign from → ignoriran (whitelist), malign dest → fallback
L="$(loc "$BASE_URL/go/transfers?from=https://evil.com&dest=Bled")"
[[ "$L" == *"/en/slovenia/bled"* && "$L" != *evil* ]] \
  && ok "transfers malign from → ignoriran (waypoint fallback)" \
  || bad "transfers malign from pušča payload: $L"
L="$(loc "$BASE_URL/go/transfers?dest=<script>alert(1)</script>")"
[[ "$L" == *"/en/slovenia"* && "$L" != *script* ]] \
  && ok "transfers malign dest → državna stran (whitelist)" \
  || bad "transfers malign dest: $L"

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
for P in "evil" "ADMIN"; do
  C="$(code "$BASE_URL/go/$P?dest=Ljubljana")"
  [[ "$C" == "404" ]] && ok "neznan provider '$P' → 404" || bad "neznan provider '$P' → $C"
done
# %00 (null byte): strežniški edge/proxy ga ZAVRNE (400) preden sploh pride
# do aplikacije — zavrnitev na kateri koli plasti je pravilen izid (404 ali 400)
C="$(code "$BASE_URL/go/hotels%00")"
[[ "$C" == "404" || "$C" == "400" ]] && ok "null byte provider → zavrnjen (404/400)" || bad "null byte provider → $C"

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
L="$(loc "$BASE_URL/go/transfers?from=Ljubljana&dest=Bled&email=test%40example.com")"
if [[ "$L" != *"email="* && "$L" != *"@"* ]]; then
  ok "PII parametri se ne prenesejo v transfers URL"
else
  bad "PII preide v transfers Location: $L"
fi

# -----------------------------------------------------------------------------
echo
echo "=================================================="
echo "REZULTAT: $PASS pass / $FAIL fail"
[[ "$FAIL" == "0" ]] && echo "AFFILIATE REDIRECT SUITE: ZELENA ✅" || echo "AFFILIATE REDIRECT SUITE: RDEČA ❌"
exit $FAIL
