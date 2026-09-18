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
# --sync — po uspešni nastavitvi sproži NOVI PRODUKCIJSKI deploy iz
#   production branch-a (gitSource → POST /v13/deployments). 1.36.3
#   ugotovitev (enaka kot za Render v 1.36.2): env sprememba NE sproži
#   deploya samodejno — brez --sync se vrednost uporabi šele ob
#   naslednjem (push) deployu.
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
SYNC="false"
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --token) VERCEL_TOKEN="$2"; shift 2 ;;
    --project) VERCEL_PROJECT_NAME="$2"; shift 2 ;;
    --target) TARGETS="$2"; shift 2 ;;
    --sync) SYNC="true"; shift ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
[ ${#ARGS[@]} -ge 1 ] || die "Uporaba: $0 [--token x] [--project ime] [--target production] [--sync] IME[=VREDNOST] …"

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
banner "Vercel env set — project ${VERCEL_PROJECT_ID} → target(s): ${TARGETS} (sync=${SYNC})"

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

# ── --sync: sproži producijski deploy (1.36.3: env sprememba NE sproži
#    ničesar — pravi trigger je POST /v13/deployments z gitSource iz
#    povezanega repozitorija; gradi iz production branch-a z novim env) ──
if [ "$SYNC" = "true" ]; then
  step "--sync: pridobivam gitSource (povezani repo + production branch)"
  PROJ="$(curl -sS -m 30 -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}${TEAM_PARAM}")"
  REPO_ID="$(printf '%s' "$PROJ" | jq -r '.link.repoId // empty')"
  REPO_TYPE="$(printf '%s' "$PROJ" | jq -r '.link.type // empty')"
  BRANCH="$(printf '%s' "$PROJ" | jq -r '.link.productionBranch // "main"')"
  PROJ_NAME="$(printf '%s' "$PROJ" | jq -r '.name // empty')"
  if [ -z "$REPO_ID" ] || [ -z "$PROJ_NAME" ]; then
    err "Projekt ni povezan z Git repozitorijem (link.repoId manjka) — --sync ne more sprožiti deploya."
    err "Env JE shranjen — sproži redeploy ročno (Vercel UI → Deployments → Redeploy)."
    exit 1
  fi
  step "--sync: sprožam novi producijski deploy (${REPO_TYPE} → branch '${BRANCH}')"
  DEPLOY_RES="$(curl -sS -m 30 -X POST -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${PROJ_NAME}\",\"target\":\"production\",\"gitSource\":{\"type\":\"${REPO_TYPE}\",\"repoId\":${REPO_ID},\"ref\":\"${BRANCH}\"}}" \
    "https://api.vercel.com/v13/deployments${TEAM_PARAM}")"
  DEPLOY_ID="$(printf '%s' "$DEPLOY_RES" | jq -r '.id // empty' 2>/dev/null)"
  DEPLOY_URL="$(printf '%s' "$DEPLOY_RES" | jq -r '.url // empty' 2>/dev/null)"
  if [ -n "$DEPLOY_ID" ]; then
    ok "Deploy sprožen: ${DEPLOY_ID} (${DEPLOY_URL}) — ~2–4 min do READY (spremljaj Vercel dashboard)."
  else
    err "Deploy NI bil sprožen: $(printf '%s' "$DEPLOY_RES" | jq -r '.error.message // .message // "neznana napaka"' | head -c 200)"
    err "Env JE shranjen — sproži redeploy ročno (Vercel UI → Deployments → Redeploy)."
    exit 1
  fi
else
  info "Brez --sync: env se uporabi šele ob NASLEDNJEM deployu (push ali Redeploy v UI)."
fi
exit 0
