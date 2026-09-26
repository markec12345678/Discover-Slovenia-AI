#!/usr/bin/env bash
# ============================================================================
# doctor.sh — enostrelovka konfiguracijska revizija (dashboard)
# ----------------------------------------------------------------------------
# Preveri VSE plasti AI namestitve in pove, kaj je urejeno, kaj manjka:
#   a) .env prisotnost + ključi (maskirano)
#   b) .env.example dokumentacija ključev
#   c) .env gitignored (varnost)
#   d) git stanje (clean/dirty)
#   e) GitHub token + repo + Actions secreti (read-only)
#   f) Gemini geo-blok status (mini živi klic)
#   g) dev strežnik (quick)
#   h) Prisma DB dosegljivost
#
# UPORABA: ./doctor.sh
# IZHOD: 0 = ni kritičnih lukenj · 1 = kritična napaka
# ============================================================================
source "$(dirname "$0")/lib.sh"

require_cmd curl
require_cmd jq

banner "Doctor — konfiguracijska revizija"

# ── a) .env + ključi ──────────────────────────────────────────────────────
step "a) .env in ključi"
if [ -f "$ENV_FILE" ]; then
  ok ".env obstaja."
  # ISSUE #9: AI ključi so OPCIJSKI (samo GEMINI_API_KEY za vizijo); OPENROUTER/PUTER ne obstajata več
  for key in GEMINI_API_KEY DATABASE_URL; do
    val="$(env_get "$key" || true)"
    if [ -n "$val" ] && [ "$val" != "YOUR_${key}" ]; then
      info "  · ${key}: $(mask_secret "$val")"
    else
      info "  · ${key}: (ni nastavljen)"
    fi
  done
else
  warn ".env MANJKA — glej .env.example za predlogo."
fi

# ── b) .env.example dokumentacija ────────────────────────────────────────
step "b) .env.example dokumentacija"
if [ -f "${REPO_ROOT}/.env.example" ]; then
  for key in GEMINI_API_KEY; do
    if grep -q "^#${key}=" "${REPO_ROOT}/.env.example" 2>/dev/null || grep -q "^${key}=" "${REPO_ROOT}/.env.example" 2>/dev/null; then
      ok "${key} je dokumentiran v .env.example."
    else
      warn "${key} NI dokumentiran v .env.example."
    fi
  done
fi

# ── c) gitignore varnost ─────────────────────────────────────────────────
step "c) Varnost (.env izven gita)"
if git -C "$REPO_ROOT" check-ignore -q .env 2>/dev/null; then
  ok ".env je gitignored."
else
  err ".env NI gitignored — TVEGANJE IZPUSTA KLJUČEV!"
fi
if git -C "$REPO_ROOT" ls-files --error-unmatch .env >/dev/null 2>&1; then
  err ".env je SLEDEN V GIT — takoj: git rm --cached .env"
fi

# ── d) git stanje ────────────────────────────────────────────────────────
step "d) Git stanje"
DIRTY="$(git -C "$REPO_ROOT" status --porcelain | wc -l | tr -d ' ')"
if [ "$DIRTY" = "0" ]; then ok "Delovno drevo čisto."; else warn "Delovno drevo ima ${DIRTY} sprememb (ne-zaprtih)."; fi

# ── e) GitHub secreti ────────────────────────────────────────────────────
step "e) GitHub (token + secreti)"
if github_token >/dev/null 2>&1; then
  ok "GitHub token na voljo."
  SECRETS="$(gh_api GET "/repos/${GITHUB_REPO_SLUG}/actions/secrets" 2>/dev/null || echo '{}')"
  for sname in GEMINI_API_KEY; do
    if printf '%s' "$SECRETS" | jq -e --arg n "$sname" '.secrets[]? | select(.name == $n)' >/dev/null 2>&1; then
      ok "Actions secret ${sname}: obstaja."
    else
      warn "Actions secret ${sname}: MANJKA → ./github-secret-set.sh ${sname}"
    fi
  done
else
  warn "GitHub token ni na voljo — skripta ključa ne more preveriti."
fi

# ── f) Gemini geo-blok sonda ─────────────────────────────────────────────
step "f) Gemini geo-blok sonda (1 mini klic)"
G_KEY="$(env_get GEMINI_API_KEY || true)"
if [ -n "$G_KEY" ]; then
  code="$(curl -sS -o /tmp/ops-doctor-gemini.json -m 20 -w "%{http_code}" \
    "${GEMINI_API_BASE}/chat/completions" \
    -H "Authorization: Bearer ${G_KEY}" -H "Content-Type: application/json" \
    -d '{"model":"gemini-3.6-flash","messages":[{"role":"user","content":"OK"}],"max_tokens":512}' 2>/dev/null || echo "000")"
  if [ "$code" = "200" ]; then
    ok "Gemini deluje IZ TEGA STROJA (regija podprta)."
  elif [ "$code" = "400" ] && grep -qi "not supported" /tmp/ops-doctor-gemini.json 2>/dev/null; then
    info "Gemini geo-blokiran tukaj (pričakovano v sandboxu) — primarni je OpenRouter, CI dokaz: ./github-workflow-run.sh"
  else
    warn "Gemini: HTTP ${code} — poženi ./gemini-verify.sh za podrobnosti."
  fi
else
  info "GEMINI_API_KEY ni v .env — preskočeno."
fi

# ── g) Dev strežnik ──────────────────────────────────────────────────────
step "g) Dev strežnik (localhost:3000)"
code="$(curl -sS -o /dev/null -m 10 -w "%{http_code}" "http://localhost:3000/" 2>/dev/null || echo "000")"
if [ "$code" = "200" ]; then ok "Dev strežnik teče (200)."; else info "Dev strežnik ne teče (HTTP ${code}) — poženi: bun run dev"; fi

# ── h) Prisma DB ─────────────────────────────────────────────────────────
step "h) Prisma DB"
DB_URL="$(env_get DATABASE_URL || true)"
if printf '%s' "$DB_URL" | grep -q "^file:"; then
  DB_PATH="$(printf '%s' "$DB_URL" | sed 's|^file:||')"
  # Absolutna pot se uporabi kot je; relativna se nanaša na REPO_ROOT.
  case "$DB_PATH" in /*) ;; *) DB_PATH="${REPO_ROOT}/${DB_PATH}" ;; esac
  [ -f "$DB_PATH" ] && ok "SQLite DB obstaja (${DB_PATH})." || warn "SQLite datoteka manjka (${DB_PATH}) — bun run db:push"
else
  ok "DATABASE_URL je nastavljen (postgres/neon — dosegljivost preveri app)."
fi

# ── Zaključek ────────────────────────────────────────────────────────────
step "NASLEDNJI KORAKI (kar skripta NE more narediti namesto tebe)"
cat <<'EOF'
  1. Vercel token:  https://vercel.com/account/tokens  → potem:
       VERCEL_TOKEN=xxx VERCEL_PROJECT_ID=prj_xxx ./vercel-env-set.sh GEMINI_API_KEY
  2. Render token:  https://dashboard.render.com/u/settings#api-keys → potem:
       RENDER_API_KEY=rnd_xxx RENDER_SERVICE_ID=srv-xxx ./render-env-set.sh GEMINI_API_KEY
  3. Po deployu:    ./deploy-check.sh https://tvoja-produkcija.vercel.app
EOF
exit 0
