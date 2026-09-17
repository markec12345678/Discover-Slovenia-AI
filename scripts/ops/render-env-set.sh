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
# API (1.36.2): Render je ukinil staro pot /api/v1/* (404) — skripta zdaj
# uporablja /v1/* z novo obliko odgovorov: services listing =
# [{cursor, service:{…}}], env-vars = [{cursor, envVar:{key,value}}]
# (vrednosti so vidne tudi brez sync=true; PUT telo ostane [{key,value}]).
#
# IZHOD: 0 = uspeh · 1 = napaka
# ============================================================================
source "$(dirname "$0")/lib.sh"

require_cmd curl
require_cmd jq

RENDER_API="https://api.render.com/v1"

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
  RENDER_SERVICE_ID="$(curl -sS -m 30 -H "$AUTH" -H "Accept: application/json" "${RENDER_API}/services?type=web_service&limit=100" \
    | jq -r --arg n "$RENDER_SERVICE_NAME" '[.[].service | select(.name == $n) | .id][0] // empty' 2>/dev/null \
    | head -1 || true)"
fi
[ -n "${RENDER_SERVICE_ID:-}" ] || die "Manjka RENDER_SERVICE_ID (Render Service → Settings) ali --service-name IME."

banner "Render env set — service ${RENDER_SERVICE_ID} (sync=${SYNC})"

# ── 1. Preberi obstoječe env (ZAŠČITA pred brisanjem) ────────────────────
step "1/3 Berem obstoječe env spremenljivke (merge zaščita)"
EXISTING="$(curl -sS -m 30 -H "$AUTH" -H "Accept: application/json" "${RENDER_API}/services/${RENDER_SERVICE_ID}/env-vars?limit=100")"
if ! printf '%s' "$EXISTING" | jq -e 'type == "array" and (length == 0 or (.[0] | has("envVar")))' >/dev/null 2>&1; then
  err "Napaka pri branju env: $(printf '%s' "$EXISTING" | head -c 200)"
  exit 1
fi
EXISTING_COUNT="$(printf '%s' "$EXISTING" | jq 'length')"
info "Obstaja ${EXISTING_COUNT} spremenljivk — vse bodo ohranjene."

# Pripravi merge bazo — /v1 oblika: [{cursor, envVar:{key, value}}]
MERGE_JSON="$(printf '%s' "$EXISTING" | jq '[.[] | .envVar | {key: .key, value: (.value // "")}]')"

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
step "3/3 PUT /env-vars (brez sync — deploy sprožimo ločeno v koraku 4/4)"
RES="$(curl -sS -m 30 -X PUT -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
  -d "$(printf '%s' "$MERGE_JSON" | jq .)" \
  "${RENDER_API}/services/${RENDER_SERVICE_ID}/env-vars")"

if printf '%s' "$RES" | jq -e 'type == "array"' >/dev/null 2>&1; then
  ok "Render env posodobljen ($(printf '%s' "$RES" | jq 'length') spremenljivk, vključno z novimi)."
else
  err "Render API: $(printf '%s' "$RES" | jq -r '.message // .' | head -c 200)"
  exit 1
fi

if [ "$SYNC" = "false" ]; then
  info "sync=false: deploy se NI restartal — uporabi --sync ali ročni restart v Render UI."
  info "            (Nove env vrednosti veljajo šele po naslednjem deployu/restartu!)"
  exit 0
fi

# ── 4. --sync: sproži deploy (1.36.2 ugotovitev: PUT ?sync=true NE požene
#    ničesar — Render API posodobi env brez redeploya. Pravi trigger je
#    POST /deploys, ki zgradi iz branch-a z aktualnim env.)
step "4/4 --sync: sprožam nov deploy (POST /deploys)"
DEPLOY_RES="$(curl -sS -m 30 -X POST -H "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{}' "${RENDER_API}/services/${RENDER_SERVICE_ID}/deploys")"
DEPLOY_ID="$(printf '%s' "$DEPLOY_RES" | jq -r '.id // empty' 2>/dev/null)"
if [ -n "$DEPLOY_ID" ]; then
  ok "Deploy sprožen: ${DEPLOY_ID} — spremljaj Render dashboard (~2–4 min na free planu)."
else
  err "Deploy NI bil sprožen: $(printf '%s' "$DEPLOY_RES" | jq -r '.message // .' | head -c 200)"
  err "Env JE shranjen — sproži deploy ročno v Render UI (Manual Deploy → Deploy latest commit)."
  exit 1
fi
exit 0
