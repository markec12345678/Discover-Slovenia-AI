#!/usr/bin/env bash
# ============================================================================
# faza-e-responsive.sh — Issue #19 FAZA E: odzivnostna verifikacija (#17/#18)
# ----------------------------------------------------------------------------
# Kanonska matrika (issue #19 §16/§17/§18):
#   MOBILNE širine: 320×800, 360×800, 375×812, 390×844, 430×932
#   ZAHTEVANE ploskve: /, /destinacije, /destinacija/bled, /moja-potovanja,
#                      /nacrtuj, /zemljevid, /na-poti
#   JEZIKI (§16): dejanska whitelist stanja (src/i18n/routing.ts):
#     SL: vseh 7 ploskev · EN: vseh 7 (/en/*) · IT/DE/FR/ES: 5 ploskev
#     (/, /destinacije, /destinacija/bled, /nacrtuj, /zemljevid — W1/W12)
#   DESKTOP (§18): 1280×800 vseh 7 + 1920×1080 3 ključne
#
# MERITVE na vsaki (viewport × URL):
#   overflowX   = scrollWidth − innerWidth      (HARD GATE @ 320)
#   small       = interaktivni kontrolki < 40×40 (izključeno inline a v
#                 prozi — WCAG kanon; baseline FAZE B = 0)
#   noAlt       = slike brez alt atributa
#   btnTall     = [data-slot=button] višji od 60px (proxy za ovito CTA)
#   h1          = naslov (sanity jezika) · readyState
#   pageErrors  = agent-browser errors (neulovljene izjume)
#
# UPORABA (serije — dev strežnik živi LE znotraj enega ukaza, sandbox):
#   bash scripts/ops/faza-e-responsive.sh mobile   # SL × 5 širin
#   bash scripts/ops/faza-e-responsive.sh locales  # 6 jezikov @ 320
#   bash scripts/ops/faza-e-responsive.sh desktop  # 1280 + 1920
#   bash scripts/ops/faza-e-responsive.sh shots    # AFTER screenshoti
#
# IZHOD: /tmp/faza-e-<batch>.jsonl (po vrsticah JSON na ploskev) + povzetek.
# ============================================================================
source "$(dirname "$0")/lib.sh"

BASE_URL="http://localhost:3000"
BATCH="${1:-}"
OUT="/tmp/faza-e-${BATCH}.jsonl"
mkdir -p qh19-faza-e

require_cmd curl
require_cmd jq
command -v agent-browser >/dev/null 2>&1 || die "agent-browser ni nameščen"

SL_PATHS=("/" "/destinacije" "/destinacija/bled" "/moja-potovanja" "/nacrtuj" "/zemljevid" "/na-poti")
MOB_VPS=("320 800" "360 800" "375 812" "390 844" "430 932")

# Merilni JS (vrne JSON niz). Dvonivojski prag dotikalnih tarč:
#   tiny    < 24px  — WCAG 2.2 SC 2.5.8 (AA) Minimum — HARD GATE
#   compact 24–40px — advisory (udobje; sm/h-9/h-8 kontrolke)
# Izključeno inline-prozne povezave (WCAG: inline link v besedilu ima
# izjemo — ista metodologija kot BASELINE-VISUAL FAZE B).
MEASURE_JS='new Promise((resolve) => {
  const measure = () => (() => {
  const vw = window.innerWidth, sw = document.documentElement.scrollWidth;
  const overflowX = sw - vw;
  let noAlt = 0;
  for (const img of document.images) if (!img.hasAttribute("alt")) noAlt++;
  const tiny = []; let compact = 0;
  const inter = "a[href], button, [role=\"button\"], input, select, textarea, summary";
  for (const el of document.querySelectorAll(inter)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") continue;
    if (st.display === "inline") continue;
    const m = Math.min(r.width, r.height);
    if (m < 24) {
      tiny.push(el.tagName + ":" + Math.round(r.width) + "x" + Math.round(r.height) + ":" + (el.textContent || "").trim().slice(0, 24));
    } else if (m < 40) compact++;
  }
  let btnTall = 0;
  for (const b of document.querySelectorAll("[data-slot=\"button\"]")) {
    const r = b.getBoundingClientRect();
    if (r.height > 60) btnTall++;
  }
  const h1 = document.querySelector("h1");
  return JSON.stringify({ vw, sw, overflowX, noAlt, tinyCount: tiny.length, tiny: tiny.slice(0, 6), compact, btnTall, h1: h1 ? h1.textContent.trim().slice(0, 48) : "(brez h1)", rs: document.readyState });
  })();
  // FAZA E izkušnja: merjenje MED hidriranjem da lažne tiny tarče (1×1
  // selecti, polovični čipi) — zato obvezen dodaten usedel po load dogodku
  const go = () => setTimeout(() => resolve(measure()), 800);
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go);
})'

# ── 0. dev strežnik (živi LE v tem ukazu — sandbox process-group cleanup) ──
step "0 — dev strežnik + SVEŽ brskalnik"
# počisti vse predhodnike na portu 3000 (sirote iz prejšnjih ukazov umrejo
# sredi sweepinga — izkušnja FAZE E) in zombi Chrome agent-browserja
# (daemon preživi konec ukaza, njegove strani pa so mrtele → eval/open
# veriga odpove — zato OBVEZNO svež zagon brskalnika pred sweepom)
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
agent-browser close >/dev/null 2>&1 || true
pkill -f "agent-browser/browsers" 2>/dev/null || true
sleep 1
cleanup() {
  pkill -f "next dev" 2>/dev/null || true
  pkill -f "next-server" 2>/dev/null || true
  agent-browser close >/dev/null 2>&1 || true
  pkill -f "agent-browser/browsers" 2>/dev/null || true
}
trap cleanup EXIT
bun run dev > /tmp/faza-e-dev.log 2>&1 &
deadline=$(( $(date +%s) + 120 )); ready=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  code=$(curl -sS -m 5 -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" 2>/dev/null) || code=000
  case "$code" in 200|503) ready=1; break ;; esac
  sleep 2
done
[ "$ready" = "1" ] && ok "strežnik pripravljen (lastni, pod trapom)" || die "strežnik ni vstal (glej /tmp/faza-e-dev.log)"

# ── pomožni: strežnik pod nadzorom (OOM izkušnja: next dev RSS zraste
# čez 2,5 GB pri zaporednih kompilacijah → sandbox OOM-kill sredi sweepa) ─
ensure_server() {
  local code
  code=$(curl -sS -m 5 -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" 2>/dev/null) || code=000
  case "$code" in 200|503) return 0 ;; esac
  warn "strežnik mrtev (${code}) — restart"
  restart_server
}
restart_server() {
  pkill -f "next dev" 2>/dev/null || true
  pkill -f "next-server" 2>/dev/null || true
  sleep 2
  bun run dev > /tmp/faza-e-dev.log 2>&1 &
  local deadline=$(( $(date +%s) + 150 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    local code
    code=$(curl -sS -m 5 -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" 2>/dev/null) || code=000
    case "$code" in 200|503) ok "strežnik vstal (restart)"; return 0 ;; esac
    sleep 2
  done
  err "strežnik se NI vstal po restartu"
  return 1
}

# ── pomožni: ena ploskev = open → settle → eval → errors ──────────────────
sweep_one() {
  local vp="$1" path="$2" label="$3"
  # ensure_server izhod POTISNI v stderr — sicer kontaminira jsonl cevi
  ensure_server >&2 || { echo "{\"label\":\"${label}\",\"vp\":\"${vp}\",\"path\":\"${path}\",\"serverFail\":true}" >> "$OUT"; return; }
  agent-browser set viewport ${vp} >/dev/null 2>&1 || true
  if ! agent-browser open "${BASE_URL}${path}" >/dev/null 2>&1; then
    sleep 2
    ensure_server >&2 || true
    agent-browser open "${BASE_URL}${path}" >/dev/null 2>&1 || { echo "{\"label\":\"${label}\",\"vp\":\"${vp}\",\"path\":\"${path}\",\"openFail\":true}" >> "$OUT"; return; }
  fi
  # zemljevid: Leaflet markerji se izrišejo asinhrono (fetch + render) —
  # daljši usedel, sicer merimo prazno karto (izkušnja FAZE E: de/fr
  # ujeli markerje pri ~5 s, sl jih zamudil)
  local settle=4.5
  case "$path" in *zemljevid*) settle=8.5 ;; esac
  sleep $settle
  local res errs
  res=$(agent-browser eval "${MEASURE_JS}" 2>>/tmp/faza-e-eval.err || true)
  if [ -z "$res" ]; then
    sleep 1
    res=$(agent-browser eval "${MEASURE_JS}" 2>>/tmp/faza-e-eval.err || true)
  fi
  [ -z "$res" ] && res="EVAL_FAIL"
  errs=$(agent-browser errors --json 2>/dev/null || echo "[]")
  python3 - "$label" "$vp" "$path" "$res" "$errs" <<'PYEOF'
import json, sys
label, vp, path, res, errs = sys.argv[1:6]
rec = {"label": label, "vp": vp, "path": path}
if res == "EVAL_FAIL":
    rec["evalFail"] = True
else:
    try:
        # agent-browser eval lahko vrne gol JSON niz ali JSON niz v nizu
        s = res.strip()
        if s.startswith('"') and s.endswith('"'):
            s = json.loads(s)
        if isinstance(s, str):
            s = json.loads(s)
        rec.update(s)
    except Exception as e:
        rec["parseError"] = str(e)[:120]; rec["raw"] = res[:200]
try:
    e = json.loads(errs)
    if isinstance(e, dict):
        e = e.get("data", {}).get("errors", e.get("errors", []))
    rec["pageErrors"] = len(e) if isinstance(e, list) else -1
except Exception:
    rec["pageErrors"] = -1
print(json.dumps(rec, ensure_ascii=False))
PYEOF
}

# ── 1. serija ──────────────────────────────────────────────────────────────
case "$BATCH" in
  mobile)
    # ${2}: opcionalna CSV podskupina viewportov, npr. "320 800,360 800"
    # (razbijanje serij za sandbox timeout 10 min/ukaz)
    VPSPEC="${2:-}"; IFS=',' read -ra VPS <<< "${VPSPEC:-320 800,360 800,375 812,390 844,430 932}"
    step "SERIJA mobile — SL × ${#VPS[@]} širin ($([ -n "$VPSPEC" ] && echo podskupina || echo vse))"
    gi=0
    for vp in "${VPS[@]}"; do
      for p in "${SL_PATHS[@]}"; do
        sweep_one "$vp" "$p" "sl@${vp%% *}" | tee -a "$OUT"
      done
      gi=$((gi + 1))
      # proaktivni restart vsaki 2 skupini — RSS daleč od OOM, brez
      # zapravljanja ~20 s na vsako skupino (izkušnja 1. zagona FAZE E)
      if [ $((gi % 2)) -eq 0 ]; then restart_server >&2 || true; fi
    done
    ;;
  locales)
    step "SERIJA locales — 6 jezikov @ 320 (27 ploskev, SL@320 že v mobile)"
    LOC5=("/" "/destinacije" "/destinacija/bled" "/nacrtuj" "/zemljevid")
    li=0
    for loc in en it de fr es; do
      for p in "${LOC5[@]}"; do
        sweep_one "320 800" "/${loc}${p}" "${loc}@320" | tee -a "$OUT"
      done
      li=$((li + 1))
      if [ $((li % 2)) -eq 0 ]; then restart_server >&2 || true; fi
    done
    # EN samo še /moja-potovanja + /na-poti (preostali EN pokriti zgoraj)
    for p in "/moja-potovanja" "/na-poti"; do
      sweep_one "320 800" "/en${p}" "en@320" | tee -a "$OUT"
    done
    ;;
  desktop)
    step "SERIJA desktop — 1280×800 vseh 7 + 1920×1080 3 ključne"
    for p in "${SL_PATHS[@]}"; do
      sweep_one "1280 800" "$p" "sl@1280" | tee -a "$OUT"
    done
    restart_server >&2 || true
    for p in "/" "/nacrtuj" "/zemljevid"; do
      sweep_one "1920 1080" "$p" "sl@1920" | tee -a "$OUT"
    done
    ;;
  custom)
    # ${2}: seznam ploskev "vp|path|label" ločenih s podpičjem — za
    # dopolnjevanje/preverjanje posameznih meritev (neterror/timeout vzorci)
    step "SERIJA custom — dopolnilne meritve"
    IFS=';' read -ra ITEMS <<< "${2}"
    ci=0
    for it in "${ITEMS[@]}"; do
      IFS='|' read -r vp path label <<< "$it"
      sweep_one "$vp" "$path" "$label" | tee -a "$OUT"
      ci=$((ci + 1))
      if [ $((ci % 3)) -eq 0 ]; then restart_server >&2 || true; fi
    done
    ;;
  shots)
    step "SERIJA shots — AFTER screenshoti (qh19-faza-e/)"
    shot() {
      local vp="$1" path="$2" name="$3" full="${4:-}"
      agent-browser set viewport ${vp} >/dev/null 2>&1 || true
      agent-browser open "${BASE_URL}${path}" >/dev/null 2>&1 || true
      sleep 2.5
      agent-browser screenshot "qh19-faza-e/${name}" ${full} >/dev/null 2>&1 || true
      ok "shot ${name}"
    }
    shot "320 800"  "/"            "after-home-mobile-320.png"
    shot "1280 800" "/"            "after-home-desktop-1280.png"
    shot "320 800"  "/nacrtuj"     "after-planner-mobile-320.png"
    shot "1280 800" "/nacrtuj"     "after-planner-desktop-1280.png"
    shot "320 800"  "/zemljevid"   "after-map-mobile-320.png"
    shot "320 800"  "/moja-potovanja" "after-mytrip-mobile-320.png"
    shot "320 800"  "/na-poti"     "after-gomode-mobile-320.png"
    shot "390 844"  "/en"          "after-home-en-390.png"
    ;;
  *)
    die "Neznana serija: '$BATCH' (mobile|locales|desktop|shots)"
    ;;
esac

# ── 2. povzetek ────────────────────────────────────────────────────────────
if [ -s "$OUT" ]; then
  step "POVZETEK ${BATCH}"
  python3 - "$OUT" <<'PYEOF'
import json, sys
rows = []
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.strip()
    if not line: continue
    try: rows.append(json.loads(line))
    except Exception: pass
total = len(rows)
ovf = [r for r in rows if r.get("overflowX", 0) and r["overflowX"] > 0]
tiny = [r for r in rows if r.get("tinyCount", 0) > 0]
noalt = [r for r in rows if r.get("noAlt", 0) > 0]
tall  = [r for r in rows if r.get("btnTall", 0) > 0]
errs  = [r for r in rows if r.get("pageErrors", 0) != 0]
fail  = [r for r in rows if r.get("openFail") or r.get("evalFail") or r.get("parseError")]
comp = sum(r.get("compact", 0) for r in rows)
print(f"ploskev: {total} | overflow: {len(ovf)} | tiny(<24): {len(tiny)} | compact(24-40): {comp} | noAlt: {len(noalt)} | btnTall: {len(tall)} | pageErrors: {len(errs)} | fail: {len(fail)}")
for r in ovf: print(f"  OVERFLOW {r['label']} {r['path']} @{r['vp']}: +{r['overflowX']}px")
for r in tiny[:12]: print(f"  TINY {r['label']} {r['path']}: {r['tinyCount']} → {r['tiny'][:3]}")
for r in noalt[:8]: print(f"  NOALT {r['label']} {r['path']}: {r['noAlt']}")
for r in tall[:8]: print(f"  BTNTALL {r['label']} {r['path']}: {r['btnTall']}")
for r in errs[:8]: print(f"  ERRORS {r['label']} {r['path']}: {r['pageErrors']}")
for r in fail[:8]: print(f"  FAIL {r.get('label')} {r.get('path')}: open={r.get('openFail')} eval={r.get('evalFail')} parse={r.get('parseError')}")
PYEOF
fi
info "rezultati: ${OUT}"
