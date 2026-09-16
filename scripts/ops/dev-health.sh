#!/usr/bin/env bash
# ============================================================================
# dev-health.sh — zdravje lokalnega razvojnega strežnika (localhost:3000)
# ----------------------------------------------------------------------------
# Preveri ključne rute + AI health (veriga providerjev) in izpiše
# razlago po providerjih. Hitri način (--quick) preveri samo /.
#
# UPORABA:
#   ./dev-health.sh           # vse rute
#   ./dev-health.sh --quick   # samo /
# IZHOD: 0 = vse žive · 1 = katera koli kritična odpoved
# ============================================================================
source "$(dirname "$0")/lib.sh"

require_cmd curl
BASE="${DEV_BASE_URL:-http://localhost:3000}"
QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

banner "Dev health — ${BASE}"

check_url() {
  local path="$1" label="$2" expect="${3:-200}"
  local code
  code="$(curl -sS -o /dev/null -m 15 -w "%{http_code}" "${BASE}${path}" 2>/dev/null || echo "000")"
  if [ "$code" = "$expect" ]; then
    ok "${label} — HTTP ${code}"
    return 0
  else
    err "${label} — HTTP ${code} (pričakovano ${expect})"
    return 1
  fi
}

RC=0
check_url "/" "Domača stran (/)" || RC=1
[ "$QUICK" = "1" ] && { exit $RC; }

check_url "/en" "EN nacrtuj (/en)" || RC=1
check_url "/en/nacrtuj" "EN planner" || RC=1
check_url "/api/ai-health" "AI health" || RC=1

# AI health — razlaga providerjev
# Opomba (revizija #8): /api/ai-health zahteva CRON_SECRET/admin — na DEV
# strežniku (NODE_ENV=development) verifyCronAuth dovoli klic brez secreta;
# če ga imaš nastavljenega, se pripne samodejno (npr. za produkcijo podoben
# zagon).
step "AI veriga (GET /api/ai-health)"
if [ -n "${CRON_SECRET:-}" ]; then
  HEALTH="$(curl -sS -m 60 -H "Authorization: Bearer ${CRON_SECRET}" "${BASE}/api/ai-health" 2>/dev/null || echo '{}')"
else
  HEALTH="$(curl -sS -m 60 "${BASE}/api/ai-health" 2>/dev/null || echo '{}')"
fi
if [ -n "$HEALTH" ] && printf '%s' "$HEALTH" | jq -e '.providers' >/dev/null 2>&1; then
  ACTIVE="$(printf '%s' "$HEALTH" | jq -r '.provider // "none"')"
  STATUS="$(printf '%s' "$HEALTH" | jq -r '.status // "?"')"
  info "Aktivni provider: ${ACTIVE} (status: ${STATUS})"
  printf '%s' "$HEALTH" | jq -r '.providers | to_entries[] | "  · \(.key): \(.value.configured | select(. != null) // false) | ok=\(.value.ok) model=\(.value.model) \(.value.latencyMs // "" | select(. != "")) \(.value.error // "" | select(. != ""))"' 2>/dev/null \
    || printf '%s' "$HEALTH" | jq -c '.providers'
  if [ "$ACTIVE" = "none" ]; then
    warn "NO provider živ — generacija pade na determinističen fallback."
  fi
else
  warn "AI health ni odgovoril z JSON (morda rate-limit 12/10 min — počakaj; v produkciji tudi 401 brez CRON_SECRET)."
fi

exit $RC
