#!/usr/bin/env bash
# ============================================================================
# vercel-env-set.sh — nastavi env spremenljivko na Vercel projektu
# ----------------------------------------------------------------------------
# ZAHTEVA (uporabnikovo, skripta ne more pridobiti):
#   VERCEL_TOKEN      — https://vercel.com/account/tokens (Create Token)
#   VERCEL_PROJECT_ID — Vercel UI: Project → Settings → General → Project ID
#                       (ali podamo ime prek --project IME)
#
# UPORABA:
#   VERCEL_TOKEN=xxx VERCEL_PROJECT_ID=prj_xxx ./vercel-env-set.sh GEMINI_API_KEY
#   VERCEL_TOKEN=xxx ./vercel-env-set.sh --project discoverslovenia GEMINI_API_KEY
#   VERCEL_TOKEN=xxx ./vercel-env-set.sh DATABASE_URL="postgres://…"
#
# Privzeto POSTAVI na: production + preview + development (vse tri).
# Omeji z: --target production
#
# VARNOST: vrednost potuje SAMO prek HTTPS API klica (type: encrypted);
# v izpisu se maskira. Idempotentno: obstoječo enakoimensko spremenljivko
# najprej izbrišemo (Vercel ENV API je create-only brez upsert).
# IZHOD: 0 = uspeh · 1 = napaka
# ============================================================================
source "$(dirname "$0")/lib.sh"

require_cmd curl
require_cmd jq

TARGETS="production preview development"
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --token) VERCEL_TOKEN="$2"; shift 2 ;;
    --project) VERCEL_PROJECT_NAME="$2"; shift 2 ;;
    --target) TARGETS="$2"; shift 2 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
[ ${#ARGS[@]} -ge 1 ] || die "Uporaba: $0 [--token x] [--project ime] [--target production] IME[=VREDNOST] …"

load_env
[ -n "${VERCEL_TOKEN:-}" ] || die "Manjka VERCEL_TOKEN (https://vercel.com/account/tokens — ali v .env)."

TEAM_PARAM=""
if [ -n "${VERCEL_TEAM_ID:-}" ]; then TEAM_PARAM="?teamId=${VERCEL_TEAM_ID}"; fi

# ── Pridobi project id ────────────────────────────────────────────────────
if [ -z "${VERCEL_PROJECT_ID:-}" ] && [ -n "${VERCEL_PROJECT_NAME:-}" ]; then
  step "Resolvam project id iz imena '${VERCEL_PROJECT_NAME}'"
  VERCEL_PROJECT_ID="$(curl -sS -m 30 -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_NAME}${TEAM_PARAM}" | jq -r '.id // empty')"
fi
[ -n "${VERCEL_PROJECT_ID:-}" ] || die "Manjka VERCEL_PROJECT_ID (Vercel Settings → General) ali --project IME."

# Pretvori TARGETS v JSON array
TARGETS_JSON="$(printf '%s' "$TARGETS" | jq -R -s 'split(" ") | map(select(length>0))')"
banner "Vercel env set — project ${VERCEL_PROJECT_ID} → target(s): ${TARGETS}"

for PAIR in "${ARGS[@]}"; do
  NAME="${PAIR%%=*}"
  if [[ "$PAIR" == *=* ]]; then
    VALUE="${PAIR#*=}"
  else
    VALUE="$(eval "printf '%s' \"\${${NAME}:-}\"" || true)"
    [ -n "$VALUE" ] || VALUE="$(env_get "$NAME" || true)"
  fi
  [ -n "$VALUE" ] || die "Vrednost za ${NAME} ni na voljo (arg/env/.env)."

  step "Nastavljam ${NAME} = $(mask_secret "$VALUE")"

  # 1. Izbriši obstoječo (idempotenten upsert)
  EXISTING="$(curl -sS -m 30 -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env${TEAM_PARAM}")"
  EXISTING_IDS="$(printf '%s' "$EXISTING" | jq -r --arg n "$NAME" '.envs[]? | select(.key == $n) | .id')"
  for EID in $EXISTING_IDS; do
    info "Brišem obstoječo ${NAME} (id: ${EID}) — upsert."
    curl -sS -m 30 -X DELETE -H "Authorization: Bearer ${VERCEL_TOKEN}" \
      "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env/${EID}${TEAM_PARAM}" >/dev/null
  done

  # 2. POST novo (encrypted, na vse tri environmente)
  RES="$(curl -sS -m 30 -X POST -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"${NAME}\",\"value\":$(printf '%s' "$VALUE" | jq -Rs .),\"target\":${TARGETS_JSON},\"type\":\"encrypted\"}" \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env${TEAM_PARAM}")"

  if printf '%s' "$RES" | jq -e '.id? // .created?.id? // empty' >/dev/null 2>&1; then
    ok "${NAME} nastavljen na Vercel (${TARGETS})."
  else
    err "Vercel API: $(printf '%s' "$RES" | jq -r '.error.message // .message // "neznana napaka"' | head -c 200)"
    exit 1
  fi
done

info "OPOMBA: za produkcijo se env uporabi ob NASLEDNJEM deployu (Redeploy v UI)."
exit 0
