#!/usr/bin/env bash
# ============================================================================
# github-workflow-run.sh — sproži workflow in POČAKAJ rezultat (live test)
# ----------------------------------------------------------------------------
# NAMEN: živi dokaz, da AI ključi delujejo iz podprte regije (GitHub
# runner = US Azure), brez ročnega klikanja po GitHub UI.
#
# UPORABA:
#   ./github-workflow-run.sh                       # ai-smoke.yml @ main + čakanje
#   ./github-workflow-run.sh ime-workflowa.yml     # drug workflow
#   ./github-workflow-run.sh ai-smoke.yml --no-wait  # samo sproži
#
# IZHOD: 0 = uspeh (conclusion=success) · 1 = failure · 2 = timeout (6 min)
# ============================================================================
source "$(dirname "$0")/lib.sh"

require_cmd curl
require_cmd jq
require_github

WORKFLOW="${1:-ai-smoke.yml}"
REF="${GITHUB_RUN_REF:-main}"
NO_WAIT=0
[ "${2:-}" = "--no-wait" ] || [ "${1:-}" = "--no-wait" ] && NO_WAIT=1

banner "Workflow run — ${WORKFLOW} @ ${REF}"

# ── 1. Dispatch ───────────────────────────────────────────────────────────
step "1/3 Dispatch (workflow_dispatch)"
DISPATCH_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RES="$(gh_api POST "/repos/${GITHUB_REPO_SLUG}/actions/workflows/${WORKFLOW}/dispatches" "{\"ref\":\"${REF}\"}")"
# 204 = sprejet (prazno telo); 422 = workflow nima workflow_dispatch trigger
if [ -z "$RES" ]; then
  ok "Dispatch sprejet (204) ob ${DISPATCH_TS}."
else
  MSG="$(printf '%s' "$RES" | jq -r '.message // empty')"
  if printf '%s' "$MSG" | grep -qi "workflow does not have"; then
    die "Workflow ${WORKFLOW} nima workflow_dispatch trigger-ja."
  fi
  die "Dispatch zavrnjen: ${MSG:0:200}"
fi

if [ "$NO_WAIT" = "1" ]; then
  info "--no-wait: ne čakam. Rezultat preveri v GitHub UI (Actions)."
  exit 0
fi

# ── 2. Počekaj, da se run prikaže (dispatch → run ima 1–3 s zamuda) ──────
step "2/3 Čakam nov run (po ${DISPATCH_TS})"
RUN_ID=""
for i in $(seq 1 18); do  # 18 × 5 s = 90 s
  RUN_ID="$(gh_api GET "/repos/${GITHUB_REPO_SLUG}/actions/workflows/${WORKFLOW}/runs?per_page=5" \
    | jq -r --arg ts "${DISPATCH_TS}" '.workflow_runs[] | select(.created_at >= $ts) | .id' | head -1)"
  [ -n "$RUN_ID" ] && break
  sleep 5
done
[ -n "$RUN_ID" ] || die "Run se ni prikazal v 90 s — preveri GitHub Actions UI."
info "Run #$(gh_api GET "/repos/${GITHUB_REPO_SLUG}/actions/runs/${RUN_ID}" | jq -r '.run_number') (id: ${RUN_ID})"

# ── 3. Polling do zaključka (timeout 6 min) ──────────────────────────────
step "3/3 Čakam zaključek (poll vsakih 10 s, timeout 6 min)"
STATUS="queued"
for i in $(seq 1 36); do
  RUN_JSON="$(gh_api GET "/repos/${GITHUB_REPO_SLUG}/actions/runs/${RUN_ID}")"
  STATUS="$(printf '%s' "$RUN_JSON" | jq -r '.status')"
  CONCLUSION="$(printf '%s' "$RUN_JSON" | jq -r '.conclusion // "null"')"
  if [ "$STATUS" = "completed" ]; then break; fi
  sleep 10
done

if [ "$STATUS" != "completed" ]; then
  err "Timeout — run se po 6 min še ni zaključil (status: ${STATUS})."
  info "Nadaljuj ročno: https://github.com/${GITHUB_REPO_SLUG}/actions/runs/${RUN_ID}"
  exit 2
fi

# ── Koraki posameznih jobov ───────────────────────────────────────────────
step "Koraki (jobs)"
gh_api GET "/repos/${GITHUB_REPO_SLUG}/actions/runs/${RUN_ID}/jobs" \
  | jq -r '.jobs[] | "  [\(.name)] \(.conclusion // .status)\n" + ([.steps[] | "    · \(.name): \(.conclusion // .status)"] | join("\n"))' || true

step "REZULTAT: ${CONCLUSION}"
if [ "$CONCLUSION" = "success" ]; then
  ok "Workflow ${WORKFLOW} je ZELEN. ✅"
  exit 0
else
  err "Workflow je RDEČ (${CONCLUSION}). Logi: https://github.com/${GITHUB_REPO_SLUG}/actions/runs/${RUN_ID}"
  exit 1
fi
