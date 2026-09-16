#!/usr/bin/env bash
# ============================================================================
# deploy-check.sh — produkcijski smoke test (Vercel/Render URL)
# ----------------------------------------------------------------------------
# NAMEN: po deployu v enem zagonu dokaže, da je proizvodnja živa IN da
# AI veriga tam deluje (Vercel/Render tečeta v podprtih regijah — Gemini
# tam NI geo-blokiran, razliko od razvojnega sandboxa).
#
# UPORABA:
#   ./deploy-check.sh https://discover-slovenia.vercel.app
#   ./deploy-check.sh https://my-app.onrender.com
# IZHOD: 0 = živa · 1 = odpoved
# ============================================================================
source "$(dirname "$0")/lib.sh"

require_cmd curl
require_cmd jq

URL="${1:-}"
[ -n "$URL" ] || die "Uporaba: $0 PRODUKCIJSKI_URL   (npr. https://discover-slovenia.vercel.app)"
# odstrani morešenji zaključni /
URL="${URL%/}"

banner "Deploy check — ${URL}"

RC=0

for path in "/" "/en" "/en/nacrtuj"; do
  code="$(curl -sS -o /dev/null -m 20 -w "%{http_code}" -L "${URL}${path}" 2>/dev/null || echo "000")"
  if [ "$code" = "200" ]; then ok "${path} — 200"; else err "${path} — ${code}"; RC=1; fi
done

step "AI veriga v produkciji"
# /api/ai-health od 1.34.0 (revizija #8) zahteva CRON_SECRET (Bearer) ali
# admin geslo — javni health je lahko "prebujal" mrtvega providerja (reset
# circuit breakerja). Secret: SAMO eksplicitna env (iz .env se NE bere).
AI_AUTH=()
if [ -n "${CRON_SECRET:-}" ]; then
  AI_AUTH=(-H "Authorization: Bearer ${CRON_SECRET}")
elif [ -n "${ADMIN_PASSWORD:-}" ]; then
  AI_AUTH=(-H "x-admin-password: ${ADMIN_PASSWORD}")
fi
if [ ${#AI_AUTH[@]} -gt 0 ]; then
  HEALTH="$(curl -sS -m 60 "${AI_AUTH[@]}" "${URL}/api/ai-health" 2>/dev/null || echo '{}')"
else
  HEALTH="{}"
  warn "CRON_SECRET/ADMIN_PASSWORD nista podana — AI health preskočen (vrne 401 brez njiju)."
fi
if printf '%s' "$HEALTH" | jq -e '.providers' >/dev/null 2>&1; then
  ACTIVE="$(printf '%s' "$HEALTH" | jq -r '.provider // "none"')"
  info "Aktivni provider: ${ACTIVE}"
  printf '%s' "$HEALTH" | jq -r '.providers | to_entries[] | select(.value.configured == true) | "  · \(.key): ok=\(.value.ok)  model=\(.value.model)  \(.value.latencyMs // "" | select(. != ""))"' 2>/dev/null
  if [ "$ACTIVE" = "none" ]; then
    err "Produkcija NIMA živega AI providerja — preveri env spremenljivke na platformi!"
    RC=1
  else
    ok "AI veriga živi (${ACTIVE})."
  fi
else
  warn "AI health ni vrnil JSON (rate limit 12/10 min ali star deploy)."
fi

[ "$RC" = "0" ] && ok "PRODUKCIJA JE ŽIVA ✅" || err "Preveri deploy loge platforme."
exit $RC
