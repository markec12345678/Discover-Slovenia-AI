#!/usr/bin/env bash
# ============================================================================
# openrouter-verify.sh — ŽIVI test OPENROUTER_API_KEY iz trenutnega stroja
# ----------------------------------------------------------------------------
# NAMEN: dokaz, da ključ deluje, PRED deployom. Preveri:
#   1. /api/v1/key        — veljavnost ključa + free tier + poraba
#   2. chat completion    — primarni model (nex-agi/nex-n2.5-pro:free)
#   3. notranji fallback  — rezervni model (nex-n2.5-mini:free)
#   4. JSON mode          — response_format json_object (generacijska pot)
#
# UPORABA:
#   ./openrouter-verify.sh              # vsi 4 testi
#   ./openrouter-verify.sh --quick      # samo key info + primarni chat
#   OPENROUTER_API_KEY=sk-or-… ./openrouter-verify.sh   # ključ iz env
#
# IZHODNE KODE: 0 = vse deluje · 1 = ključ/model ne deluje
# NAMIG: OpenRouter NI geo-blokiran (razlika od Gemini API) — ta test
#        deluje tudi iz razvojnega sandboxa (Hong Kong egress).
# ============================================================================
source "$(dirname "$0")/lib.sh"

QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

load_env
OR_KEY="${OPENROUTER_API_KEY:-$(env_get OPENROUTER_API_KEY || true)}"

[ -n "$OR_KEY" ] && [ "$OR_KEY" != "YOUR_OPENROUTER_API_KEY" ] \
  || die "OPENROUTER_API_KEY ni nastavljen (.env ali env)."

banner "OpenRouter verify — $(mask_secret "$OR_KEY")"

# ── 1. Key info ───────────────────────────────────────────────────────────
step "1/4 Key info (GET /api/v1/key)"
http_json GET "${OPENROUTER_API}/key" "" "Authorization: Bearer ${OR_KEY}"
if [ "$HTTP_CODE" = "200" ]; then
  ok "Ključ je veljaven ($(jq -r '"free tier: " + (.data.is_free_tier|tostring) + ", poraba: $" + (.data.usage|tostring)' /tmp/ops-last-response.json))"
else
  err "HTTP ${HTTP_CODE} — ključ NI veljaven:"
  jq -r '.error.message // .' /tmp/ops-last-response.json | head -3
  exit 1
fi
[ "$QUICK" = "1" ] && { info "--quick: preskočeni testi 2–4."; exit 0; }

# ── 2. Primarni model ─────────────────────────────────────────────────────
step "2/4 Chat — primarni model ${OR_PRIMARY_MODEL}"
http_json POST "${OPENROUTER_API}/chat/completions" \
  "{\"model\":\"${OR_PRIMARY_MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"Odgovori samo z besedilom: SLOVENIJA-OK\"}],\"max_tokens\":512,\"temperature\":0}" \
  "Authorization: Bearer ${OR_KEY}"
if [ "$HTTP_CODE" = "200" ] && [ -n "$(jq -r '.choices[0].message.content // empty' /tmp/ops-last-response.json)" ]; then
  ok "Vsebina: $(jq -r '.choices[0].message.content' /tmp/ops-last-response.json | head -c 60)"
  info "Usage: $(jq -c '.usage.total_tokens // empty' /tmp/ops-last-response.json) žetonov"
else
  err "HTTP ${HTTP_CODE}: $(jq -r '.error.message // "prazna vsebina"' /tmp/ops-last-response.json | head -c 120)"
  exit 1
fi

# ── 3. Notranji fallback model ────────────────────────────────────────────
step "3/4 Chat — fallback model ${OR_FALLBACK_MODEL}"
http_json POST "${OPENROUTER_API}/chat/completions" \
  "{\"model\":\"${OR_FALLBACK_MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"Odgovori samo z besedilom: SLOVENIJA-OK\"}],\"max_tokens\":512,\"temperature\":0}" \
  "Authorization: Bearer ${OR_KEY}"
if [ "$HTTP_CODE" = "200" ] && [ -n "$(jq -r '.choices[0].message.content // empty' /tmp/ops-last-response.json)" ]; then
  ok "Fallback model deluje."
else
  warn "Fallback ni odgovoril (HTTP ${HTTP_CODE}) — veriga gre takrat na Gemini."
fi

# ── 4. JSON mode (generacijska pot) ───────────────────────────────────────
step "4/4 JSON mode — response_format json_object"
http_json POST "${OPENROUTER_API}/chat/completions" \
  "{\"model\":\"${OR_PRIMARY_MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"Vrni točno ta JSON in nič drugega: {\\\"kraj\\\":\\\"Bled\\\",\\\"zerro\\\":\\\"jezero\\\"}\"}],\"max_tokens\":512,\"response_format\":{\"type\":\"json_object\"}}" \
  "Authorization: Bearer ${OR_KEY}"
CONTENT="$(jq -r '.choices[0].message.content // empty' /tmp/ops-last-response.json)"
if [ "$HTTP_CODE" = "200" ] && printf '%s' "$CONTENT" | jq -e . >/dev/null 2>&1; then
  ok "JSON mode deluje: $(printf '%s' "$CONTENT" | jq -c . | head -c 80)"
else
  err "JSON mode ni uspel (HTTP ${HTTP_CODE}): $(printf '%s' "$CONTENT" | head -c 120)"
  exit 1
fi

step "REZULTAT"
ok "OpenRouter: KLJUČ IN MODELI DELUJEJO iz tega stroja. ✅"
exit 0
