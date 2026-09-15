#!/usr/bin/env bash
# ============================================================================
# github-secret-verify.sh — preveri, kateri Actions secret-i obstajajo
# ----------------------------------------------------------------------------
# GitHub API NIKOLI ne vrne VREDNOSTI secret-a (samo imena + časi) — to je
# varnostna lastnost. Ta skripta potrjuje PRISOTNOST.
#
# UPORABA:
#   ./github-secret-verify.sh                  # izpiše vse + preveri oba AI ključa
#   ./github-secret-verify.sh IME              # preveri točno določen secret
#
# IZHOD: 0 = obstaja · 1 = manjka · 2 = API napaka
# ============================================================================
source "$(dirname "$0")/lib.sh"

require_cmd curl
require_cmd jq
require_github

TARGET="${1:-}"
banner "GitHub Actions secrets — ${GITHUB_REPO_SLUG}"

LIST_JSON="$(gh_api GET "/repos/${GITHUB_REPO_SLUG}/actions/secrets")"
COUNT="$(printf '%s' "$LIST_JSON" | jq -r '.total_count // -1')"
if [ "$COUNT" = "-1" ]; then
  err "API napaka: $(printf '%s' "$LIST_JSON" | head -c 200)"
  exit 2
fi

step "Seznam (${COUNT})"
printf '%s' "$LIST_JSON" | jq -r '.secrets[] | "  · \(.name)  (posodobljen: \(.updated_at))"'

check_one() {
  local name="$1"
  if printf '%s' "$LIST_JSON" | jq -e --arg n "$name" '.secrets[] | select(.name == $n)' >/dev/null; then
    ok "Secret ${name} OBSTAJA."
    return 0
  else
    warn "Secret ${name} MANJKA → nastavi: ./github-secret-set.sh ${name}"
    return 1
  fi
}

step "Preverba"
RC=0
if [ -n "$TARGET" ]; then
  check_one "$TARGET" || RC=1
else
  # Privzeto: preveri oba AI ključa verige (OpenRouter primarni, Gemini sekundarni)
  check_one "OPENROUTER_API_KEY" || RC=1
  check_one "GEMINI_API_KEY" || RC=1
fi

exit $RC
