#!/usr/bin/env bash
# ============================================================================
# render-env-set.sh — nastavi env spremenljivko na Render web service
# ----------------------------------------------------------------------------
# ZAHTEVA (uporabnikovo, skripta ne more pridobiti):
#   RENDER_API_KEY    — https://dashboard.render.com/u/settings#api-keys
#   RENDER_SERVICE_ID — Render UI: Service → Settings → Service ID
#                       (ali --service-id / --service-name IME)
#
# UPORABA:
#   RENDER_API_KEY=rnd_xxx RENDER_SERVICE_ID=srv-xxx ./render-env-set.sh GEMINI_API_KEY
#   RENDER_API_KEY=rnd_xxx ./render-env-set.sh --service-name my-app GEMINI_API_KEY
#   RENDER_API_KEY=rnd_xxx ./render-env-set.sh DATABASE_URL="postgres://…"
#
# VARNOSTNI MODEL (KLJUČNO!): Render PUT na /env-vars NADOMESTI CELOZNO
# zbirko → skripta NAJPREJ prebere obstoječe, ZLII novo/posodobljeno in
# šele nato pošlje celoto (prihranjene tuje spremenljivke ostanejo).
# Privzeto sync=false (brez restarta deploya); --sync = takoj sync deploy.
#
# IZHOD: 0 = uspeh · 1 = napaka
# ============================================================================
source "$(dirname "$0")/lib.sh"

require_cmd curl
require_cmd jq

SYNC="false"
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --token) RENDER_API_KEY="$2"; shift 2 ;;
    --service-id) RENDER_SERVICE_ID="$2"; shift 2 ;;
    --service-name) RENDER_SERVICE_NAME="$2"; shift 2 ;;
    --sync) SYNC="true"; shift ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
[ ${#ARGS[@]} -ge 1 ] || die "Uporaba: $0 [--token x] [--service-id srv-x | --service-name ime] [--sync] IME[=VREDNOST] …"

[ -n "${RENDER_API_KEY:-}" ] || die "Manjka RENDER_API_KEY (Render → Account Settings → API Keys)."
load_env

AUTH="Authorization: Bearer ${RENDER_API_KEY}"

# ── Pridobi service id iz imena (če podano) ───────────────────────────────
if [ -z "${RENDER_SERVICE_ID:-}" ] && [ -n "${RENDER_SERVICE_NAME:-}" ]; then
  step "Resolvam service id iz imena '${RENDER_SERVICE_NAME}'"
  RENDER_SERVICE_ID="$(curl -sS -m 30 -H "$AUTH" "https://api.render.com/api/v1/services?type=web_service" \
    | jq -r --arg n "$RENDER_SERVICE_NAME" '(.serviceDetails // .)[].id? // empty' 2>/dev/null \
    | head -1 || true)"
  # fallback: filter po imenu v seznamu
  if [ -z "$RENDER_SERVICE_ID" ]; then
    RENDER_SERVICE_ID="$(curl -sS -m 30 -H "$AUTH" "https://api.render.com/api/v1/services?type=web_service" \
      | jq -r --arg n "$RENDER_SERVICE_NAME" '.[] | select(.name == $n) | .id' | head -1 || true)"
  fi
fi
[ -n "${RENDER_SERVICE_ID:-}" ] || die "Manjka RENDER_SERVICE_ID (Render Service → Settings) ali --service-name IME."

banner "Render env set — service ${RENDER_SERVICE_ID} (sync=${SYNC})"

# ── 1. Preberi obstoječe env (ZAŠČITA pred brisanjem) ────────────────────
step "1/3 Berem obstoječe env spremenljivke (merge zaščita)"
EXISTING="$(curl -sS -m 30 -H "$AUTH" "https://api.render.com/api/v1/services/${RENDER_SERVICE_ID}/env-vars")"
if ! printf '%s' "$EXISTING" | jq -e 'type == "array"' >/dev/null 2>&1; then
  err "Napaka pri branju env: $(printf '%s' "$EXISTING" | head -c 200)"
  exit 1
fi
EXISTING_COUNT="$(printf '%s' "$EXISTING" | jq 'length')"
info "Obstaja ${EXISTING_COUNT} spremenljivk — vse bodo ohranjene."

# Pripravi merge bazo (Render vrača [{key, value}] — value je lahko null za sync=false prikaz)
MERGE_JSON="$(printf '%s' "$EXISTING" | jq '[.[] | {key: .key, value: (.value // "")}]')"

# ── 2. Zlij nove vrednosti ────────────────────────────────────────────────
step "2/3 Zlivanje novih vrednosti"
for PAIR in "${ARGS[@]}"; do
  NAME="${PAIR%%=*}"
  if [[ "$PAIR" == *=* ]]; then
    VALUE="${PAIR#*=}"
  else
    VALUE="$(eval "printf '%s' \"\${${NAME}:-}\"" || true)"
    [ -n "$VALUE" ] || VALUE="$(env_get "$NAME" || true)"
  fi
  [ -n "$VALUE" ] || die "Vrednost za ${NAME} ni na voljo (arg/env/.env)."
  MERGE_JSON="$(printf '%s' "$MERGE_JSON" | jq --arg k "$NAME" --arg v "$VALUE" \
    'map(select(.key != $k)) + [{key: $k, value: $v}]')"
  ok "${NAME} = $(mask_secret "$VALUE") (pripravljeno za PUT)"
done

# ── 3. PUT celotne (varovane) zbirke ──────────────────────────────────────
step "3/3 PUT /env-vars?sync=${SYNC}"
RES="$(curl -sS -m 30 -X PUT -H "$AUTH" -H "Content-Type: application/json" \
  -d "$(printf '%s' "$MERGE_JSON" | jq .)" \
  "https://api.render.com/api/v1/services/${RENDER_SERVICE_ID}/env-vars?sync=${SYNC}")"

if printf '%s' "$RES" | jq -e 'type == "array"' >/dev/null 2>&1; then
  ok "Render env posodobljen ($(printf '%s' "$RES" | jq 'length') spremenljivk, vključno z novimi)."
else
  err "Render API: $(printf '%s' "$RES" | jq -r '.message // .' | head -c 200)"
  exit 1
fi

if [ "$SYNC" = "false" ]; then
  info "sync=false: deploy se NI restartal — uporabi --sync ali ročni restart v Render UI."
else
  info "sync=true: deploy se je začel restartati — preveri Render dashboard."
fi
exit 0
