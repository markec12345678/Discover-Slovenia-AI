#!/usr/bin/env bash
# ============================================================================
# browser-offline-e2e.sh — D6-C (Issue #6 faza 4): PRAVI brskalniški offline E2E
# ----------------------------------------------------------------------------
# VRZEL (Issue #6): offline/PWA dokaz je bil harness-raven (pwa-test.ts v
# mock SW scope). Ta skripta izvede PRavi cikel z brskalniško OMREŽNO
# EMULACIJO (agent-browser `set offline on`) — SW, caches in navigacije so
# čisto brskalniški, brez mockanja znotraj testa.
#
# ZAKAJ PRODUKCIJSKI STREŽNIK: dev SW se registrira z ?dev=1, ki IZKLOPI
# predpomnjenje (DEV_MODE v sw.js:55) — offline dokaz zahteva standalone
# build (ista pot kot CI/Docker/Render).
#
# CIKLUS (Issue #6 faza 4 zahteve):
#   1. zagon standalone strežnika + pripravljenost
#   2. online: odpri /pot/{shareId} (deljen načrt)
#   3. SW prevzame kontrolo (reload) + predpomnilniki se napolnijo
#   4. set offline on (brskalniška emulacija, strežnik ŠE VEDNO teče —
#      dokaz, da odgovor pride IZ predpomnilnika, ne iz strežnika)
#   5. reload → načrt se izriše IZ SW predpomnilnika
#   6. set offline off → reload → povratek (brez poškodb stanja)
#
# UPORABA (lokalno — CI ga poganja prek browser-e2e.yml workflow_dispatch):
#   bash scripts/ops/browser-offline-e2e.sh [SHARE_ID]
#   SHARE_ID: obstoječa javna pot (privzeto: ustvari se e2e-<ts> testna pot)
#
# POGOJI: bun run build (standalone), agent-browser (npm i -g agent-browser
# && agent-browser install), .env s podatkovno bazo.
#
# IZHOD: 0 = cikel dokazan · 1 = kateri koli korak rdeč
# ============================================================================
source "$(dirname "$0")/lib.sh"

BASE_URL="http://localhost:3000"
SHARE_ID="${1:-}"
PASS=0
FAIL=0

ok_check()  { PASS=$((PASS + 1)); ok "$1"; }
bad_check() { FAIL=$((FAIL + 1)); err "$1"; }

require_cmd curl
require_cmd jq
command -v agent-browser >/dev/null 2>&1 || die "agent-browser ni nameščen (npm i -g agent-browser && agent-browser install)"

# ── 0. build + strežnik ────────────────────────────────────────────────────
step "0/6 — Standalone strežnik"
if [ ! -f .next/standalone/server.js ]; then
  info "ni standalone izhoda → bun run build (~2 min)"
  if ! bun run build; then
    die "build neuspešen — offline E2E potrebuje produkcijski izhod"
  fi
fi
set -a; source .env; set +a
NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 \
  NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-ci-smoke-nextauth-secret-0123456789}" \
  NEXTAUTH_URL="http://localhost:3000" \
  bun .next/standalone/server.js > /tmp/browser-e2e-server.log 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

deadline=$(( $(date +%s) + 90 )); ready=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  code=$(curl -sS -m 5 -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" 2>/dev/null) || code=000
  case "$code" in 200|503) ready=1; break ;; esac
  sleep 2
done
[ "$ready" = "1" ] && ok_check "strežnik pripravljen (health ${code})" || { bad_check "strežnik ni vstal"; die "prekinjam"; }

# ── 1. testna pot (če ni podana) ───────────────────────────────────────────
step "1/6 — Testna deljena pot"
if [ -z "$SHARE_ID" ]; then
  PLAN=$(curl -sS -m 120 -X POST "${BASE_URL}/api/itinerary" \
    -H "Content-Type: application/json" -H "x-forwarded-for: 10.99.88.77" \
    -d '{"engine":"deterministic","budget":800,"days":2,"interests":["narava"],"season":"summer","groupSize":2,"language":"sl"}')
  SAVE=$(printf '%s' "$PLAN" | jq -n --argjson p "$(printf '%s' "$PLAN" 2>/dev/null || echo '{}')" \
    '{itinerary: $p, name: "browser-offline-e2e"}' 2>/dev/null)
  SAVE=$(printf '{"itinerary": %s, "name": "browser-offline-e2e"}' "$PLAN")
  RESP=$(curl -sS -m 60 -X POST "${BASE_URL}/api/itinerary/save" \
    -H "Content-Type: application/json" -H "x-forwarded-for: 10.99.88.77" \
    -d "$SAVE")
  SHARE_ID=$(printf '%s' "$RESP" | jq -r '.shareId // empty')
fi
[ -n "$SHARE_ID" ] && ok_check "shareId: ${SHARE_ID}" || { bad_check "ni shareId"; die "prekinjam"; }

# ── 2. online nalaganje + SW ───────────────────────────────────────────────
step "2/6 — Online: nalaganje + SW kontrola"
agent-browser set offline off > /dev/null 2>&1
agent-browser open "${BASE_URL}/pot/${SHARE_ID}" --timeout 90000 > /dev/null 2>&1
agent-browser wait 5000 > /dev/null 2>&1
agent-browser reload > /dev/null 2>&1
agent-browser wait 7000 > /dev/null 2>&1
TITLE=$(agent-browser get title 2>/dev/null)
SW_STATE=$(agent-browser eval "navigator.serviceWorker.controller ? 'KONTROLIRAN' : 'NI'" 2>/dev/null)
if echo "$TITLE" | grep -q "Discover Slovenia" && echo "$SW_STATE" | grep -q "KONTROLIRAN"; then
  ok_check "stran naložena + SW kontrolira (naslov: $(echo "$TITLE" | head -c 40)…)"
else
  bad_check "naslov: ${TITLE:-/} · SW: ${SW_STATE:-/}"
fi

# ── 3. OFFLINE + reload ────────────────────────────────────────────────────
step "3/6 — OFFLINE (brskalniška emulacija) + reload"
agent-browser set offline on > /dev/null 2>&1
agent-browser wait 800 > /dev/null 2>&1
agent-browser reload > /dev/null 2>&1
agent-browser wait 8000 > /dev/null 2>&1
OFF_TITLE=$(agent-browser get title 2>/dev/null)
OFF_URL=$(agent-browser get url 2>/dev/null)

# ── 4. vsebina iz predpomnilnika ───────────────────────────────────────────
step "4/6 — Vsebina načrta BREZ omrežja"
SNAP=$(agent-browser snapshot -c 2>/dev/null)
if echo "$OFF_TITLE" | grep -q "Discover Slovenia" && echo "$OFF_URL" | grep -q "/pot/${SHARE_ID}"; then
  ok_check "offline reload: naslov + URL ostajata (SW prevzel navigacijo)"
else
  bad_check "offline naslov: ${OFF_TITLE:-/} · URL: ${OFF_URL:-/}"
fi
if echo "$SNAP" | grep -qE "Dan 1|Načrt po dnevih|načrt"; then
  ok_check "offline VSEBINA: načrt izrišen iz predpomnilnika (Dan 1 / Načrt po dnevih)"
else
  bad_check "offline vsebina NI izrisana (grep Dan 1/Načrt po dnevih)"
fi

# ── 5. povratek ────────────────────────────────────────────────────────────
step "5/6 — Povratek online"
agent-browser set offline off > /dev/null 2>&1
agent-browser wait 800 > /dev/null 2>&1
agent-browser reload > /dev/null 2>&1
agent-browser wait 8000 > /dev/null 2>&1
ON_TITLE=$(agent-browser get title 2>/dev/null)
if echo "$ON_TITLE" | grep -q "Discover Slovenia"; then
  ok_check "povratek: stran deluje po ponovni povezavi"
else
  bad_check "povratek naslov: ${ON_TITLE:-/}"
fi

# ── 6. integriteta podatkov ────────────────────────────────────────────────
step "6/6 — Integriteta (API živ, brez poškodb)"
API_STATE=$(agent-browser eval "fetch('/api/itinerary/shared/${SHARE_ID}').then(r => r.json()).then(d => 'views:' + d.views + ' dni:' + d.itinerary.days.length).catch(e => 'NAPAKA:' + e.message)" 2>/dev/null)
if echo "$API_STATE" | grep -qE "views:[0-9]+ dni:[0-9]+"; then
  ok_check "API dostopen, pot nedotaknjena (${API_STATE})"
else
  bad_check "API stanje: ${API_STATE:-/}"
fi

agent-browser close > /dev/null 2>&1
step "Povzetek"
line
echo "  rezultat:  ${PASS} ok / ${FAIL} neuspešnih"
line
[ "$FAIL" -gt 0 ] && die "BROWSER OFFLINE E2E NEUSPEŠEN — ${FAIL} rdečih"
ok "BROWSER OFFLINE E2E: shranjen načrt deluje brez omrežja (SW, ne mock)"
