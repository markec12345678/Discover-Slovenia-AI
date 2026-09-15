#!/usr/bin/env bash
# ============================================================================
# github-secret-set.sh — nastavi GitHub Actions secret (sealed box)
# ----------------------------------------------------------------------------
# NAMEN: profesionalno, varno nastavljanje repo skrivnosti BREZ izpisa
# vrednosti v loge. Šifriranje: libsodium sealed box (PyNaCl) z repo
# javnim ključem — natanko kot dokumentira GitHub. Vrednost NE potuje
# nikoli v git, .env* je gitignored.
#
# UPORABA:
#   ./github-secret-set.sh IME                    # vrednost iz env $IME ali .env
#   ./github-secret-set.sh IME VREDNOST           # eksplicitno (ne priporočamo v logu!)
#   ./github-secret-set.sh GEMINI_API_KEY         # npr. iz .env
#   cat vrednost | ./github-secret-set.sh IME -   # iz stdina
#
# PUT je idempotenten (upsert) — večkratni zagon je varen.
# IZHOD: 0 = uspeh · 1 = API/šifrirna napaka
# ============================================================================
source "$(dirname "$0")/lib.sh"

[ $# -ge 1 ] || die "Uporaba: $0 IME [VREDNOST|-]   (brez vrednosti bere iz env/IME ali .env)"

SECRET_NAME="$1"
[[ "$SECRET_NAME" =~ ^[A-Z_][A-Z0-9_]*$ ]] || die "Ime secret-a dovoljuje samo A-Z, 0-9, _ (je: ${SECRET_NAME})"

load_env

# Vrednost: arg → env → .env → stdin
VALUE=""
if [ "${2:-}" = "-" ]; then
  VALUE="$(cat)"
elif [ -n "${2:-}" ]; then
  VALUE="$2"
elif [ -n "$(eval "printf '%s' \"\${${SECRET_NAME}:-}\"")" ]; then
  VALUE="$(eval "printf '%s' \"\${${SECRET_NAME}:-}\"")"
else
  VALUE="$(env_get "$SECRET_NAME" || true)"
fi

[ -n "$VALUE" ] || die "Vrednost za ${SECRET_NAME} ni na voljo (arg/env/.env/stdin)."

require_cmd curl
require_cmd jq
require_cmd python3
require_python_nacl
require_github

banner "GitHub secret set — ${SECRET_NAME} = $(mask_secret "$VALUE")"

# ── 1. Pridobi repo javni ključ ───────────────────────────────────────────
step "1/3 Repo javni ključ"
PK_JSON="$(gh_api GET "/repos/${GITHUB_REPO_SLUG}/actions/secrets/public-key")"
PK_ID="$(printf '%s' "$PK_JSON" | jq -r '.key_id // empty')"
PK_VAL="$(printf '%s' "$PK_JSON" | jq -r '.key // empty')"
[ -n "$PK_ID" ] && [ -n "$PK_VAL" ] || die "Javnega ključa ni bilo mogoče pridobiti: $(printf '%s' "$PK_JSON" | head -c 200)"

# ── 2. Sealed box šifriranje (PyNaCl) ────────────────────────────────────
step "2/3 Sealed box šifriranje (libsodium)"
# GitHub dokumentirani recept: PublicKey iz base64 niza + SealedBox.
ENCRYPTED="$(REPO_KEY="$PK_VAL" SECRET_VALUE="$VALUE" python3 -c "
import base64, os
from nacl.public import PublicKey, SealedBox
pk = PublicKey(base64.b64decode(os.environ['REPO_KEY'].strip()))
sealed = SealedBox(pk).encrypt(os.environ['SECRET_VALUE'].encode())
print(base64.b64encode(sealed).decode())
")"
[ -n "$ENCRYPTED" ] || die "Šifriranje je spodletelo."

# ── 3. PUT secret ─────────────────────────────────────────────────────────
step "3/3 PUT /actions/secrets/${SECRET_NAME}"
RES="$(gh_api PUT "/repos/${GITHUB_REPO_SLUG}/actions/secrets/${SECRET_NAME}" \
  "{\"key_id\":\"${PK_ID}\",\"encrypted_value\":\"${ENCRYPTED}\"}")"
if printf '%s' "$RES" | jq -e '.id? // empty' >/dev/null 2>&1 || [ -z "$RES" ]; then
  ok "Secret ${SECRET_NAME} je shranjen (šifriran, GitHub ga sam maskira v logih)."
else
  # GitHub ob uspehu včasih vrne `{}` brez .id — avtoritativna preverba:
  if gh_api GET "/repos/${GITHUB_REPO_SLUG}/actions/secrets" \
     | jq -e --arg n "$SECRET_NAME" '.secrets[]? | select(.name == $n)' >/dev/null 2>&1; then
    ok "Secret ${SECRET_NAME} je shranjen (potrjeno s seznamom secretov)."
  else
    err "API odgovor: $(printf '%s' "$RES" | head -c 200)"
    exit 1
  fi
fi

info "Preveri: ./github-secret-verify.sh ${SECRET_NAME}"
exit 0
