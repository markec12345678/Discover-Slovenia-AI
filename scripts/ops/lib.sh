#!/usr/bin/env bash
# ============================================================================
# lib.sh — skupni helperji za scripts/ops/ suite (1.14.0)
# ----------------------------------------------------------------------------
# Source-aš ga:  source "$(dirname "$0")/lib.sh"
# Nikoli se NE požene neposredno. Vse skripte suite-a pričakujejo, da so
# zaganjane IZ scripts/ops/ (ali z absolutno potjo) — REPO_ROOT se izračuna
# samodejno iz lokacije lib.sh.
# ============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
GITHUB_API="https://api.github.com"
GITHUB_OWNER="markec12345678"
GITHUB_REPO="Discover-Slovenia-AI"
GITHUB_REPO_SLUG="${GITHUB_OWNER}/${GITHUB_REPO}"
GEMINI_API_BASE="https://generativelanguage.googleapis.com/v1beta/openai"

# ─── Barve / izpis ────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_GREEN="\033[0;32m"; C_YELLOW="\033[1;33m"; C_RED="\033[0;31m"
  C_BOLD="\033[1m"; C_DIM="\033[2m"; C_CYAN="\033[0;36m"; C_RESET="\033[0m"
else
  C_GREEN=""; C_YELLOW=""; C_RED=""; C_BOLD=""; C_DIM=""; C_CYAN=""; C_RESET=""
fi

info()    { printf "${C_CYAN}ℹ${C_RESET}  %s\n" "$*"; }
ok()      { printf "${C_GREEN}✅${C_RESET} %s\n" "$*"; }
warn()    { printf "${C_YELLOW}⚠️ ${C_RESET} %s\n" "$*"; }
err()     { printf "${C_RED}❌${C_RESET} %s\n" "$*" >&2; }
die()     { err "$@"; exit 1; }
step()    { printf "\n${C_BOLD}═══ %s ═══${C_RESET}\n" "$*"; }
line()    { printf "${C_DIM}%s${C_RESET}\n" "────────────────────────────────────────────"; }

# ─── Orodja ───────────────────────────────────────────────────────────────
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Manjka orodje '$1' — namesti ga ali uporabi drugo skripto."
}

require_python_nacl() {
  python3 -c "import nacl" 2>/dev/null || die "Manjka PyNaCl (GitHub sealed box šifriranje): python3 -m pip install pynacl"
}

# ─── Tajnosti ─────────────────────────────────────────────────────────────
# Prikaže prve 4 + zadnje 4 znake, sredino prikrije (ključi so dolgi).
mask_secret() {
  local s="$1"
  local len=${#s}
  if [ "$len" -le 12 ]; then
    printf "****(%d znakov)" "$len"
  else
    printf "%s…%s (%d znakov)" "${s:0:4}" "${s: -4}" "$len"
  fi
}

# ─── .env nalagalnik ──────────────────────────────────────────────────────
# Naloži .env BREZ izpisa vrednosti; ne pade, če datoteke ni (opozori).
load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  else
    warn ".env ne obstaja (${ENV_FILE}) — uporabljam samo trenutni env."
  fi
}

# Prebere ENO vrednost iz .env, ne da bi source-al celotno datoteko
# (varno tudi za vrednosti z & in posebnimi znaki).
env_get() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 1
  # enako vrstico = ključ, vzemi prvo, odstrani morebitne narekovaje
  grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true
}

# ─── GitHub ───────────────────────────────────────────────────────────────
# Token: 1) env GITHUB_TOKEN, 2) iz git remote URL-ja (x-access-token:...@).
github_token() {
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    printf '%s' "$GITHUB_TOKEN"
    return 0
  fi
  local url
  url="$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)"
  if [[ "$url" =~ x-access-token:([^@]+)@ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

gh_api() {
  local method="$1" path="$2" data="${3:-}"
  local token
  token="$(github_token)" || die "GitHub token ni na voljo (env GITHUB_TOKEN ali git remote)."
  local args=(-sS -X "$method" -H "Authorization: Bearer ${token}" -H "Accept: application/vnd.github+json")
  [ -n "$data" ] && args+=(-H "Content-Type: application/json" -d "$data")
  curl "${args[@]}" "${GITHUB_API}${path}"
}

require_github() {
  require_cmd curl
  require_cmd jq
  github_token >/dev/null || die "GitHub token ni na voljo (env GITHUB_TOKEN ali git remote)."
  local code
  code="$(gh_api GET "/repos/${GITHUB_REPO_SLUG}" | jq -r '.full_name // empty' )"
  [ -n "$code" ] || die "Repo ${GITHUB_REPO_SLUG} ni dosegljiv s tem žetonom."
}

# ─── HTTP helperji ────────────────────────────────────────────────────────
# GET/POST z JSON telesom; koda konca v globalni spremenljivki HTTP_CODE.
# (izpisne vrstice pustijo klicalcu — tu NE printamo, da se ne meša z ok()/err())
http_json() {
  local method="$1" url="$2" data="${3:-}" auth_header="${4:-}"
  local args=(-sS -m 90 -o /tmp/ops-last-response.json -w "%{http_code}")
  [ -n "$auth_header" ] && args+=(-H "$auth_header")
  args+=(-H "Content-Type: application/json")
  [ -n "$data" ] && args+=(-d "$data")
  HTTP_CODE="$(curl "${args[@]}" "$url" || echo "000")"
}

# ─── Skupne konstante testov ──────────────────────────────────────────────
# nex-n2.5 :free NISTA thinking modela → 512 tal NI potrebnih, a jih
# držimo za enakomernost (prepreči lažno prazne odgovore pri menjavi modela).
OR_PRIMARY_MODEL="${OR_PRIMARY_MODEL:-nex-agi/nex-n2.5-pro:free}"
OR_FALLBACK_MODEL="${OR_FALLBACK_MODEL:-nex-agi/nex-n2.5-mini:free}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.6-flash}"

banner() {
  printf "${C_BOLD}%s${C_RESET}\n" "╔══════════════════════════════════════════════════════════╗"
  printf "${C_BOLD}%s${C_RESET}\n" "║  $*"
  printf "${C_BOLD}%s${C_RESET}\n" "╚══════════════════════════════════════════════════════════╝"
}
