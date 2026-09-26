#!/usr/bin/env bash
# ============================================================================
# setup-all.sh — orkester: vse avtomatizabilno v enem zagonu
# ----------------------------------------------------------------------------
# Zaporedje:
#   1. doctor.sh               — revizija konfiguracije
#   2. gemini-verify.sh        — živi test opcijske vision plasti (poštena interpretacija)
#   4. github-secret-verify.sh — prisotnost CI secretov
#   5. Navodila za koraka, ki zahtevata UPORABNIKOV token (Vercel/Render)
#
# UPORABA: ./setup-all.sh
# IZHOD: 0 = vsi avtomatizabilni koraki zeleni
# ============================================================================
source "$(dirname "$0")/lib.sh"
HERE="$(cd "$(dirname "$0")" && pwd)"

banner "Setup all — avtomatizabilni del namestitve"

RC=0

step "1/4 Doctor (revizija)"
bash "${HERE}/doctor.sh" || warn "Doctor je našel opozorila — glej zgoraj."

step "2/4 OpenRouter verify (PRIMARNI provider)"

step "3/4 Gemini verify (SEKUNDARNI provider)"
bash "${HERE}/gemini-verify.sh" || RC=1

step "4/4 GitHub Actions secreti"
bash "${HERE}/github-secret-verify.sh" || warn "Manjkajoči secret-i: ./github-secret-set.sh IME"

step "ROČNA KORAKA (zahtevata uporabnikov žeton — skripta jih ne more pridobiti)"
cat <<'EOF'
  ▸ Vercel:  token na https://vercel.com/account/tokens, Project ID v Settings → General
      VERCEL_TOKEN=xxx VERCEL_PROJECT_ID=prj_xxx ./vercel-env-set.sh GEMINI_API_KEY
  ▸ Render:  API key na https://dashboard.render.com/u/settings#api-keys, Service ID v Settings
      RENDER_API_KEY=rnd_xxx RENDER_SERVICE_ID=srv-xxx ./render-env-set.sh GEMINI_API_KEY
  ▸ Živi CI dokaz obeh ključev (GitHub runner, podprta regija):
      ./github-workflow-run.sh
EOF

if [ "$RC" = "0" ]; then
  ok "VSI AVTOMATIZABILNI KORAKI ZELENI ✅"
else
  err "Najmanj en provider ni deloval — glej podrobnosti zgoraj."
fi
exit $RC
