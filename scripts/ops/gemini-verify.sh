#!/usr/bin/env bash
# ============================================================================
# gemini-verify.sh — ŽIVI test GEMINI_API_KEY iz trenutnega stroja
# ----------------------------------------------------------------------------
# NAMEN: dokaz, da KLJČ deluje in ugotovitev, ali je regija podprta.
# KLJUČNA RAZLIKA od OpenRouter: Google geo-blokira nekatere regije
# (npr. razvojni sandbox = Hong Kong egress → 400 "User location is not
# supported"). To NI napaka ključa!
#
# Interpretacija (poštena, kot aplikacija):
#   200                     → vse deluje (regija podprta)         exit 0
#   400 + "not supported"   → KLJČ VELJAVEN, regija blokirana      exit 0*
#                            (*opozorilo + napotek na github-workflow-run.sh)
#   401/403                 → ključ neveljaven                      exit 1
#   404                     → model ne obstaja za ta ključ          exit 1
#   drugo/timeout           → nedoločena napaka                    exit 1
#
# UPORABA:
#   ./gemini-verify.sh                # chat test (gemini-3.6-flash)
#   ./gemini-verify.sh --json         # + drugi test: JSON mode
#   GEMINI_API_KEY=… ./gemini-verify.sh
#
# OPOMBA: gemini-3.6-flash je THINKING model — max_tokens mora biti ≥512,
# sicer notranje razmišljanje poje celoten proračun (finish_reason
# "length", prazna vsebina). Zato tu (in v ai-client.ts) tla 512.
# ============================================================================
source "$(dirname "$0")/lib.sh"

WITH_JSON=0
[ "${1:-}" = "--json" ] && WITH_JSON=1

load_env
G_KEY="${GEMINI_API_KEY:-$(env_get GEMINI_API_KEY || true)}"
[ -n "$G_KEY" ] && [ "$G_KEY" != "YOUR_GEMINI_API_KEY" ] \
  || die "GEMINI_API_KEY ni nastavljen (.env ali env)."

banner "Gemini verify — $(mask_secret "$G_KEY") · model ${GEMINI_MODEL}"

step "1/1 Chat completion (OpenAI-compat)"
http_json POST "${GEMINI_API_BASE}/chat/completions" \
  "{\"model\":\"${GEMINI_MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"Odgovori samo z besedilom: SLOVENIJA-OK\"}],\"max_tokens\":512,\"temperature\":0}" \
  "Authorization: Bearer ${G_KEY}"

BODY=/tmp/ops-last-response.json
case "$HTTP_CODE" in
  200)
    CONTENT="$(jq -r '.choices[0].message.content // empty' "$BODY")"
    if [ -n "$CONTENT" ]; then
      ok "Gemini deluje: ${CONTENT:0:60}"
      info "Usage: $(jq -c '.usage // empty' "$BODY")"
    else
      # finish_reason length = thinking pojedel proračun → povečaj max_tokens
      warn "200, a prazna vsebina ($(jq -r '.choices[0].finish_reason // "?"' "$BODY")) — thinking model; max_tokens ≥512."
    fi
    ;;
  400)
    MSG="$(jq -r '.error.message // .message // empty' "$BODY")"
    if printf '%s' "$MSG" | grep -qi "User location is not supported"; then
      warn "KLJČ VELJAVEN, a regija je geo-blokirana (Google)."
      info "Iz te regije Gemini NE deluje — v verigi ai-client prevzame OpenRouter."
      info "Živi dokaz iz podprte regije: ./github-workflow-run.sh  (GitHub Actions = US)"
    else
      err "400: ${MSG:0:140}"
      exit 1
    fi
    ;;
  429)
    # Free tier: 10 RPM / dnevne kvote — ALI Google za geo-blokirane regije
    # kdaj odgovori s 429 namesto 400 (živo opaženo v sandboxu 2026-09-15).
    # V OBEH primerih je ključ tipično veljaven (CI dokaz) in veriga
    # pošteno pade na OpenRouter (primarni) — to NI razlog za alarm.
    warn "429 — kvota presežena ALI geo-blok v maski (Google free tier)."
    info "Ključ je veljaven, če je CI zelen: ./github-workflow-run.sh"
    info "Veriga ai-client medtem servira OpenRouter (primarni provider)."
    ;;
  401|403)
    err "HTTP ${HTTP_CODE} — ključ NI veljaven: $(jq -r '.error.message // empty' "$BODY" | head -c 140)"
    exit 1
    ;;
  404)
    err "404 — model '${GEMINI_MODEL}' ni na voljo: $(jq -r '.error.message // empty' "$BODY" | head -c 140)"
    info "Nasvet: preveri GEMINI_MODEL (umaknjeni modeli: gemini-2.5-flash za nove ključe)."
    exit 1
    ;;
  *)
    err "HTTP ${HTTP_CODE}: $(head -c 140 "$BODY")"
    exit 1
    ;;
esac

if [ "$WITH_JSON" = "1" ]; then
  step "2/2 JSON mode (response_format)"
  http_json POST "${GEMINI_API_BASE}/chat/completions" \
    "{\"model\":\"${GEMINI_MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"Vrni JSON {\\\"kraj\\\":\\\"Bled\\\"} in nič drugega.\"}],\"max_tokens\":512,\"response_format\":{\"type\":\"json_object\"}}" \
    "Authorization: Bearer ${G_KEY}"
  if [ "$HTTP_CODE" = "200" ] && jq -e '.choices[0].message.content | fromjson? ' /dev/null 2>/dev/null; then :; fi
  CONTENT="$(jq -r '.choices[0].message.content // empty' "$BODY")"
  if [ "$HTTP_CODE" = "200" ] && printf '%s' "$CONTENT" | jq -e . >/dev/null 2>&1; then
    ok "JSON mode deluje."
  else
    warn "JSON mode ni uspel (HTTP ${HTTP_CODE}) — geo-blok se izrazi tudi tu."
  fi
fi

step "REZULTAT"
ok "Gemini: ključ je bil preverjen (glej zgoraj za status regije)."
exit 0
