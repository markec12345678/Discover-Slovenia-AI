#!/usr/bin/env bash
# ============================================================================
# ci-e2e.sh — CI-E2E (M10, Issue #5 / T5-D): API-ravni zlati tok BREZ AI
# ----------------------------------------------------------------------------
# VRZEL (matrika M10): CI je poganjal 0 e2e skript — functional-smoke.sh
# preverja SSR/SEO/health/fallback, a NE zlate poti življenjskega cikla poti.
#
# Ta skripta izvede POLN jedrni tok na živem strežniku, brez brskalnika
# (CI nima Playwrighta; API dim je izvedljiv v obstoječi infrastrukturi —
# standalone strežnik + Postgres service že tečeta v build jobu):
#
#   1. POST /api/itinerary {engine:"deterministic"} → veljaven načrt (0 AI)
#   2. POST /api/itinerary/save → shareId + editToken (anonimna shranitev)
#   3. GET  /api/itinerary/shared/{shareId} → ista vsebina nazaj (branje)
#   4. GET  /api/itinerary/shared/{shareId}/pdf → %PDF + attachment (M8)
#   5. PATCH /api/itinerary/shared/{shareId} (editToken, CAS) → revizija (§13)
#   6. PATCH z ZASTARELO baseVersion → 409 konflikt (iskrena sočasnost)
#   7. POST /api/journey/bookings/parse {text} → deterministic text-parser (M1, ISSUE #9 ZERO-AI)
#   8. POST /api/journey/bookings/parse {smeti} → 422 z nasvetom (error pot)
#
# VARNOST: skripta PIŠE v DB (save/patch) → dovoljeni so SAMO lokalni cilji
# (localhost/127.0.0.1). Produkcija se preverja z functional-smoke.sh
# --get-only; tukajšnji tok bi porabil rate-limit kvoto in pisal tujim
# uporabnikom v seznam poti.
#
# UPORABA (CI build job — strežnik že teče):
#   bash scripts/ops/ci-e2e.sh http://127.0.0.1:3000
#
# IZHOD: 0 = vse zelena · 1 = vsaj eno rdeče (z razlogom)
# Odvisnosti: curl, jq (oba na GH Actions runnerjih)
# ============================================================================
source "$(dirname "$0")/lib.sh"

BASE_URL="http://127.0.0.1:3000"
READY_TIMEOUT=60

while [ $# -gt 0 ]; do
  case "$1" in
    --ready-timeout) READY_TIMEOUT="${2:?--ready-timeout zahteva število}"; shift ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//; s/^=*$//'; exit 0 ;;
    -*) die "Neznana zastavica: $1 (glej --help)" ;;
    *) BASE_URL="$1" ;;
  esac
  shift
done

# ── VARNOSTNO VRATA: samo lokalni cilji (pišemo v DB!) ─────────────────────
case "$BASE_URL" in
  http://localhost*|http://127.0.0.1*) : ;;
  *) die "ZAVRNJENO: ci-e2e.sh piše v podatkovno bazo — dovoljeni samo localhost/127.0.0.1 cilji (dobili: ${BASE_URL}). Za produkcijo uporabi functional-smoke.sh --get-only." ;;
esac

require_cmd curl
require_cmd jq

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0

ok_check()  { PASS=$((PASS + 1)); ok "$1"; }
bad_check() { FAIL=$((FAIL + 1)); err "$1"; }

# Enolični IP na zagon (rate-limit okna so per-IP; CI se lahko poganja večkrat)
RUN_IP="10.77.$((RANDOM % 250 + 1)).$((RANDOM % 250 + 1))"
RUN_TAG="$(date +%s)"

# POST/PATCH helper: izpiše HTTP kodo, telo v datoteko.
send() { # $1=metoda, $2=pot, $3=JSON, $4=izhodna datoteka, $5..=glave
  local method="$1" path="$2" data="$3" out="$4"; shift 4
  local code
  code=$(curl -sS -m 120 -o "$out" -w "%{http_code}" -X "$method" \
    "${BASE_URL}${path}" \
    -H "Content-Type: application/json" \
    -H "x-forwarded-for: ${RUN_IP}" \
    "$@" \
    -d "$data" 2>/dev/null) || code=000
  echo "$code"
}

# ── 0/8: pripravljenost strežnika ─────────────────────────────────────────
step "0/9 — Pripravljenost (${BASE_URL}, do ${READY_TIMEOUT} s)"
deadline=$(( $(date +%s) + READY_TIMEOUT ))
ready=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  code=$(curl -sS -m 10 -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" 2>/dev/null) || code=000
  case "$code" in 200|503) ready=1; break ;; esac
  sleep 3
done
if [ "$ready" = "1" ]; then
  ok_check "strežnik odgovarja (health → ${code})"
else
  bad_check "strežnik NI pripravljen v ${READY_TIMEOUT} s (zadnja koda: ${code})"
  die "Prekinjam — brez strežnika ostala preverjanja nimajo pomena"
fi

# ── 1/8: načrt (deterministični motor — 0 AI žetonov) ─────────────────────
step "1/9 — POST /api/itinerary (engine: deterministic — zlata pot #1)"
code=$(send POST "/api/itinerary" \
  '{"engine":"deterministic","budget":1200,"days":2,"interests":["narava","gastro"],"season":"summer","groupSize":2,"language":"sl"}' \
  "$TMP/plan.json")
idays=$(jq -r '.days | length' "$TMP/plan.json" 2>/dev/null || echo 0)
iloc0=$(jq -r '.days[0].locations | length' "$TMP/plan.json" 2>/dev/null || echo 0)
isrc=$(jq -r '.source // empty' "$TMP/plan.json" 2>/dev/null || true)
if [ "$code" = "200" ] && [ "${idays:-0}" -ge 1 ] && [ "${iloc0:-0}" -ge 1 ] && [ -n "$isrc" ]; then
  ok_check "200 — ${idays} dni, ${iloc0} postankov dan 1 (source: ${isrc})"
else
  bad_check "POST /api/itinerary → ${code}, dni: ${idays:-0}, postankov dan1: ${iloc0:-0}, source: ${isrc:-/}"
  die "Brez veljavnega načrta nadaljnji koraki (save/patch/pdf) nimajo pomena"
fi

# ── 2/8: shranitev (anonimna — shareId + editToken) ───────────────────────
step "2/9 — POST /api/itinerary/save (anonimna shranitev)"
# Celoten odgovor načrtovalnika je Itinerary-oblika (days[].locations[]);
# save vrata (sanitizeItinerary) očistijo morebitne dodatne ključe.
jq -n --argjson plan "$(cat "$TMP/plan.json")" \
  '{itinerary: $plan, name: ("CI-E2E '"${RUN_TAG}"'")}' > "$TMP/save-body.json"
code=$(send POST "/api/itinerary/save" "$(cat "$TMP/save-body.json")" "$TMP/save.json")
sshare=$(jq -r '.shareId // empty' "$TMP/save.json" 2>/dev/null || true)
stoken=$(jq -r '.editToken // empty' "$TMP/save.json" 2>/dev/null || true)
ssuccess=$(jq -r '.success // empty' "$TMP/save.json" 2>/dev/null || true)
if [ "$code" = "200" ] && [ "$ssuccess" = "true" ] && [ -n "$sshare" ] && [ -n "$stoken" ]; then
  ok_check "200 — shareId: ${sshare} (+ tajni editToken)"
else
  bad_check "POST /api/itinerary/save → ${code}, success: ${ssuccess:-/}, shareId: ${sshare:-/}"
  die "Brez shareId/editToken nadaljnji koraki nimajo pomena"
fi

# ── 3/8: javni ogled deljene poti ─────────────────────────────────────────
step "3/9 — GET /api/itinerary/shared/{shareId} (branje shranjene poti)"
code=$(curl -sS -m 60 -o "$TMP/shared.json" -w "%{http_code}" \
  -H "x-forwarded-for: ${RUN_IP}" \
  "${BASE_URL}/api/itinerary/shared/${sshare}" 2>/dev/null) || code=000
gsuccess=$(jq -r '.success // empty' "$TMP/shared.json" 2>/dev/null || true)
gdays=$(jq -r '.itinerary.days | length' "$TMP/shared.json" 2>/dev/null || echo 0)
if [ "$code" = "200" ] && [ "$gsuccess" = "true" ] && [ "${gdays:-0}" = "${idays:-X}" ]; then
  ok_check "200 — ista vsebina nazaj (${gdays} dni ≡ načrt)"
else
  bad_check "GET shared → ${code}, success: ${gsuccess:-/}, dni: ${gdays:-0} (pričakovano ${idays})"
fi

# ── 4/8: PDF izvoz (M8) ───────────────────────────────────────────────────
step "4/9 — GET /api/itinerary/shared/{shareId}/pdf (PDF izvoz, M8)"
code=$(curl -sS -m 90 -o "$TMP/trip.pdf" -D "$TMP/pdf-headers.txt" -w "%{http_code}" \
  -H "x-forwarded-for: ${RUN_IP}" \
  "${BASE_URL}/api/itinerary/shared/${sshare}/pdf" 2>/dev/null) || code=000
pdfmagic=""
[ -s "$TMP/trip.pdf" ] && pdfmagic=$(head -c 4 "$TMP/trip.pdf" 2>/dev/null || true)
pdfctype=$(grep -i "^content-type:" "$TMP/pdf-headers.txt" 2>/dev/null | head -1 | tr -d '\r' || true)
pdfdisp=$(grep -i "^content-disposition:" "$TMP/pdf-headers.txt" 2>/dev/null | head -1 | tr -d '\r' || true)
if [ "$code" = "200" ] && [ "$pdfmagic" = "%PDF" ] && echo "$pdfctype" | grep -q "application/pdf" && echo "$pdfdisp" | grep -qi "attachment"; then
  ok_check "200 — %PDF glava, application/pdf, attachment"
else
  bad_check "GET pdf → ${code}, magija: '${pdfmagic}', tip: ${pdfctype:-/}, disposition: ${pdfdisp:-/}"
fi

# ── 5/8: PATCH z editToken (revizija, CAS) ────────────────────────────────
step "5/9 — PATCH shared (editToken + baseVersion 0 → revizija)"
code=$(send PATCH "/api/itinerary/shared/${sshare}" \
  '{"baseVersion":0,"name":"CI-E2E preimenovana"}' \
  "$TMP/patch.json" \
  -H "x-dsa-edit-token: ${stoken}")
pcv=$(jq -r '.contentVersion // empty' "$TMP/patch.json" 2>/dev/null || true)
psuccess=$(jq -r '.success // empty' "$TMP/patch.json" 2>/dev/null || true)
if [ "$code" = "200" ] && [ "$psuccess" = "true" ] && [ "${pcv:-0}" -ge 1 ]; then
  ok_check "200 — contentVersion: ${pcv} (revizija stare vsebine zapisana)"
else
  bad_check "PATCH → ${code}, success: ${psuccess:-/}, contentVersion: ${pcv:-/}"
fi

# ── 6/8: PATCH z ZASTARELO baseVersion → 409 (iskrena sočasnost) ──────────
step "6/9 — PATCH z zastarelo baseVersion (pričakovan 409 konflikt)"
code=$(send PATCH "/api/itinerary/shared/${sshare}" \
  '{"baseVersion":0,"name":"CI-E2E konflikt"}' \
  "$TMP/patch2.json" \
  -H "x-dsa-edit-token: ${stoken}")
ccur=$(jq -r '.currentVersion // empty' "$TMP/patch2.json" 2>/dev/null || true)
if [ "$code" = "409" ] && [ -n "$ccur" ]; then
  ok_check "409 — konflikt odkrit, strežnikova verzija: ${ccur} (brez tihega prepisa)"
else
  bad_check "PATCH (stale) → ${code} (pričakovano 409 + currentVersion), dobil: ${ccur:-/}"
fi

# ── 7/8: rezervacijski parser — deterministična rezerva (M1) ──────────────
step "7/9 — POST /api/journey/bookings/parse {text} (deterministična rezerva, M1)"
PARSE_TEXT='Booking.com — Potrditev rezervacije

Vaša številka rezervacije: 408.921.371.224
Prihod: petek, 14. avgusta 2026 (od 14:00) do nedelje, 16. avgusta 2026 (do 10:00)
Hotel Slon — Slovenska cesta 1, 1000 Ljubljana
Skupaj z DDV: EUR 58,00'
code=$(jq -n --arg t "$PARSE_TEXT" '{text: $t}' | \
  curl -sS -m 60 -o "$TMP/parse.json" -w "%{http_code}" -X POST \
    "${BASE_URL}/api/journey/bookings/parse" \
    -H "Content-Type: application/json" \
    -H "x-forwarded-for: ${RUN_IP}" \
    -d @- 2>/dev/null) || code=000
pmethod=$(jq -r '.method // empty' "$TMP/parse.json" 2>/dev/null || true)
pvia=$(jq -r '.via // empty' "$TMP/parse.json" 2>/dev/null || true)
pnum=$(jq -r '.fields.reservationNumber // empty' "$TMP/parse.json" 2>/dev/null || true)
pprov=$(jq -r '.fields.providerName // empty' "$TMP/parse.json" 2>/dev/null || true)
# ISSUE #9 (ZERO-AI): BESEDILNA pot je VEDNO deterministična — method:
# "deterministic", via: "text-parser" (0 AI žetonov, NEODVISNO od ključev;
# opcijska vizija je samo na zavihku Slika). Rezervo brez omrežja pinirajo
# unit testi (issue5-t5d-reservation-fallback.test.ts, offline fetch).
if [ "$code" = "200" ] && [ "$pmethod" = "deterministic" ] && [ "$pvia" = "text-parser" ] && [ -n "$pnum" ] && [ -n "$pprov" ]; then
  ok_check "200 — method: ${pmethod}, via: ${pvia:-/} (${pprov}, št. ${pnum})"
else
  bad_check "POST parse → ${code}, method: ${pmethod:-/}, via: ${pvia:-/}, št.: ${pnum:-/}, ponudnik: ${pprov:-/}"
fi

# ── 8/8: parser na smeteh → 422 z nasvetom (error pot brez slepe ulice) ───
step "8/9 — POST parse {smeti} (pričakovan 422 z nasvetom)"
code=$(printf '{"text":"Fajn dan vsem!"}' | \
  curl -sS -m 60 -o "$TMP/parse2.json" -w "%{http_code}" -X POST \
    "${BASE_URL}/api/journey/bookings/parse" \
    -H "Content-Type: application/json" \
    -H "x-forwarded-for: ${RUN_IP}" \
    -d @- 2>/dev/null) || code=000
gerr=$(jq -r '.error // empty' "$TMP/parse2.json" 2>/dev/null || true)
if [ "$code" = "422" ] && echo "$gerr" | grep -qi "ročno"; then
  ok_check "422 — iskrena zavrnitev z nasvetom za ročni vnos"
elif [ "$code" = "422" ]; then
  bad_check "422, a sporočilo brez nasveta: ${gerr:-/}"
else
  bad_check "POST parse (smeti) → ${code} (pričakovano 422), error: ${gerr:-/}"
fi


# ── 9/9: live-sync verzija poti (TASK 28, Tier 1 #1) — PATCH iz koraka 5
# je povečal contentVersion 0 → 1; lahkotna verzija mora vrniti 1 (signal
# za banner "posodobljeno drugje" na /pot in v plannerju) ─────────────────
step "9/9 — GET /api/trip/{shareId}/version (live-sync verzija, TASK 28)"
code=$(curl -sS -m 10 -o "$TMP/version.json" -w "%{http_code}" \
  "${BASE_URL}/api/trip/${sshare}/version" \
  -H "x-forwarded-for: ${RUN_IP}" 2>/dev/null) || code=000
vok=$(jq -r '.success // empty' "$TMP/version.json" 2>/dev/null || true)
vver=$(jq -r '.contentVersion // empty' "$TMP/version.json" 2>/dev/null || true)
if [ "$code" = "200" ] && [ "$vok" = "true" ] && [ "$vver" = "1" ]; then
  ok_check "200 — contentVersion ${vver} (PATCH iz koraka 5 viden v lahkotnem odgovoru)"
else
  bad_check "GET version → ${code}, success: ${vok:-/}, contentVersion: ${vver:-/} (pričakovano 1)"
fi

# ── povzetek ──────────────────────────────────────────────────────────────
step "Povzetek"
line
echo "  cilj:      ${BASE_URL}"
echo "  tok:       načrt → save → ogled → PDF → revizija → 409 → parse → 422 → verzija"
echo "  rezultat:  ${PASS} ok / ${FAIL} neuspešnih"
line
if [ "$FAIL" -gt 0 ]; then
  die "CI-E2E NEUSPEŠEN — ${FAIL} preverjanj rdečih (glej zgoraj za razloge)"
fi
ok "CI-E2E: jedrni življenjski cikel poti deluje BREZ AI žetonov"
