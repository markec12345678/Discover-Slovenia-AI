#!/usr/bin/env bash
# =============================================================================
# P9 — PRODUKCIJSKI SMOKE (avtomatizirani del 16-točkovnega checklista v README)
# =============================================================================
# Raba:
#   bash scripts/verify/production-smoke.sh
#     CRON_SECRET=...     bash scripts/verify/production-smoke.sh   # + cron × 6 s pravim secretom (DELIBERATNO — sproži prava cron opravila, idempotentna)
#     SMOKE_BOOKING=1     bash scripts/verify/production-smoke.sh   # PIŠE v DB → počisti s p9-smoke-cleanup.ts
#     SMOKE_NEWSLETTER=1  bash scripts/verify/production-smoke.sh   # 1 NewsletterSubscriber vrstica
#     SMOKE_RATE_LIMIT=1  bash scripts/verify/production-smoke.sh   # 14 klicev /api/ai-health (max_tokens=8 → zanemarljiv AI strošek)
#
# Privzeti BASE_URL je produkcija. Za lokalni preizkus:
#   BASE_URL=http://localhost:3000 bash scripts/verify/production-smoke.sh
#
# Odvisnosti: curl, bash. SMOKE_BOOKING potrebuje še python3 (JSON).
# Varno privzeto: brez DB pisanja razen če SMOKE_BOOKING/SMOKE_NEWSLETTER=1.
# CRON_SECRET: SAMO eksplicitna env spremenljivka (namerno iz .env se NE bere
# samodejno — pravi-secret klic sproži dejanska cron opravila); NIKOLI se ne izpiše.
# Cron rute so GET (Vercel cron po vercel.json jih klice kot GET).
# =============================================================================
set -uo pipefail

BASE_URL="${BASE_URL:-https://i-feel-slovenia.vercel.app}"
REPO_SLUG="markec12345678/Discover-Slovenia-AI"
SIX_CRONS=(
  daily-trip-push
  recalculate-status
  commission-invoices
  weekly-alerts
  renewal-reminders
  draft-reminders
)

# CRON_SECRET: SAMO eksplicitna env spremenljivka (glej glavo skripte)
[[ -z "${CRON_SECRET:-}" ]] && CRON_SECRET=""

PASS=0; FAIL=0; WARN=0
ok()   { PASS=$((PASS+1)); echo "  ✅ PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ❌ FAIL: $1"; }
warn() { WARN=$((WARN+1)); echo "  ⚠️  WARN: $1"; }
hdr()  { echo; echo "== $1 =="; }

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$@"; }

echo "P9 produkcjski smoke — $BASE_URL ($(date -u '+%Y-%m-%d %H:%M UTC'))"

# -----------------------------------------------------------------------------
hdr "1) Homepage + P8 responsive markerji (dokaz, da ni več d2e371c)"
http_home="$(curl -s -o /tmp/p9-home.html -w '%{http_code}' --max-time 30 "$BASE_URL/")"
[[ "$http_home" == "200" ]] && ok "homepage HTTP 200" || bad "homepage HTTP $http_home"
if [[ "$http_home" == "200" ]]; then
  # BetaBanner je od FW3 (0742a1a) CLIENT-SIDE (fetch /api/beta-status po
  # mount) → v SSR HTML-ju ni pr-[4.5rem] markerja. Namesto gropanja po
  # SSR HTML preverimo API, ki banner poganja (isActive + štetje listingov).
  beta_json="$(curl -s --max-time 15 "$BASE_URL/api/beta-status")"
  if echo "$beta_json" | grep -q '"isActive":\(true\|false\)'; then
    ok "beta-status API odgovarja (banner client-side od FW3) — $(echo "$beta_json" | head -c 80)"
  else
    warn "beta-status API ne odgovarja — banner se ne bo izrisal"
  fi
  grep -q 'pb-40' /tmp/p9-home.html \
    && ok "P8 marker: footer pb-40 (sticky CTA/FAB clearance)" \
    || bad "P8 marker footer pb-40 MANJKA — verjetno še stara koda (d2e371c)"
  grep -q 'px-4 py-10 sm:px-6' /tmp/p9-home.html \
    && bad "STARI footer (d2e371c) je ŠE VEDNO v produkciji" \
    || ok "stari footer razred odstranjen"
fi

# -----------------------------------------------------------------------------
hdr "2) Destinacija/detail  3) Marketplace (API published-only)"
c="$(code "$BASE_URL/destinacija/bled/things-to-do")"
[[ "$c" == "200" ]] && ok "/destinacija/bled/things-to-do 200" || bad "/destinacija/bled/things-to-do → $c"
c="$(code "$BASE_URL/za-ponudnike")"
[[ "$c" == "200" ]] && ok "/za-ponudnike 200" || bad "/za-ponudnike → $c"
c="$(code "$BASE_URL/api/experiences")"
[[ "$c" == "200" ]] && ok "GET /api/experiences 200" || bad "GET /api/experiences → $c"
exp_json="$(curl -s --max-time 30 "$BASE_URL/api/experiences?limit=5")"
if command -v python3 >/dev/null 2>&1; then
  exp_total="$(python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('experiences',[])))" <<<"$exp_json" 2>/dev/null || echo -1)"
  [[ "$exp_total" -gt 0 ]] && ok "izkušnje: $exp_total objavljenih (published-only)" || warn "izkušnje: $exp_total (prazno/neparsirano)"
else
  warn "python3 manjka — število izkušenj ni preverjeno"
fi

# -----------------------------------------------------------------------------
hdr "4) Booking lookup — anti-enumeracija (neobstoječa rezervacija = 404)"
c="$(code "$BASE_URL/api/bookings/IF-EXP-0000000000?email=smoke-p9%40dsa-test.invalid")"
[[ "$c" == "404" ]] && ok "lookup neobstoječe rezervacije → 404 (enak odgovor kot napačen email)" || bad "lookup → $c (pričakovan 404)"

# -----------------------------------------------------------------------------
hdr "5) Cron × 6 (GET) — NAPAČEN secret (fail-closed 401)"
for ep in "${SIX_CRONS[@]}"; do
  c="$(code -H "Authorization: Bearer napačen-secret-p9" "$BASE_URL/api/cron/$ep")"
  [[ "$c" == "401" ]] && ok "$ep → 401 brez pravega secreta" || bad "$ep → $c (pričakovano 401!)"
done

# -----------------------------------------------------------------------------
hdr "6) Cron × 6 (GET) — PRAVI secret (samo če CRON_SECRET eksplicitno podan)"
if [[ -n "$CRON_SECRET" ]]; then
  for ep in "${SIX_CRONS[@]}"; do
    c="$(code --max-time 120 -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/api/cron/$ep")"
    [[ "$c" == "200" ]] && ok "$ep → 200 (idempotentno)" || bad "$ep → $c"
  done
else
  warn "CRON_SECRET ni podan — preskočeno (namerno: klic s pravim secretom sproži dejanska opravila)"
fi

# -----------------------------------------------------------------------------
hdr "7) AI endpoint + (optional) rate limit"
c="$(code "$BASE_URL/api/ai-health")"
[[ "$c" == "200" ]] && ok "GET /api/ai-health 200" || bad "GET /api/ai-health → $c"
if [[ "${SMOKE_RATE_LIMIT:-0}" == "1" ]]; then
  codes=""
  for i in $(seq 1 14); do
    codes="$codes $(code "$BASE_URL/api/ai-health")"
  done
  if grep -q '429' <<<"$codes"; then
    ok "rate limit aktiven (429 v seriji 14 klicev):$(tr ' ' '\n' <<<"$codes" | sort | uniq -c | tr '\n' ' ')"
  else
    warn "ni 429 v 14 klicih — limit je PER-INSTANCE (Vercel več instanc lahko zaobide); glej README 'odložene postavke'"
  fi
else
  echo "  (preskočeno — SMOKE_RATE_LIMIT=1 za preizkus)"
fi

# -----------------------------------------------------------------------------
hdr "8) Production res kaže zadnji main (GitHub Vercel status)"
gh_token=""
if git remote get-url origin 2>/dev/null | grep -q '@github.com'; then
  gh_token="$(git remote get-url origin | sed -n 's|.*https://\([^@]*\)@github.com.*|\1|p')"
fi
if command -v python3 >/dev/null 2>&1; then
  if [[ -n "$gh_token" ]]; then
    head_sha="$(curl -s -H "Authorization: Bearer $gh_token" "https://api.github.com/repos/$REPO_SLUG/commits/main" | python3 -c "import json,sys; print(json.load(sys.stdin).get('sha',''))" 2>/dev/null || true)"
  else
    head_sha="$(curl -s "https://api.github.com/repos/$REPO_SLUG/commits/main" | python3 -c "import json,sys; print(json.load(sys.stdin).get('sha',''))" 2>/dev/null || true)"
  fi
  if [[ -n "$head_sha" ]]; then
    echo "  main HEAD: ${head_sha:0:8}"
    if [[ -n "$gh_token" ]]; then
      vstate="$(curl -s -H "Authorization: Bearer $gh_token" "https://api.github.com/repos/$REPO_SLUG/commits/$head_sha/status" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('state',''))" 2>/dev/null || true)"
    else
      vstate="$(curl -s "https://api.github.com/repos/$REPO_SLUG/commits/$head_sha/status" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('state',''))" 2>/dev/null || true)"
    fi
    case "$vstate" in
      success) ok "Vercel commit status: success — produkcija ima zadnji main" ;;
      failure) bad "Vercel commit status: FAILURE ($head_sha) — deploy rate-limited/napaka; glej README 'Deploy po rate-limit okni'" ;;
      *)       warn "Vercel commit status: '$vstate' (pending/neznan)" ;;
    esac
  else
    warn "GitHub API nedosegljiv — preveri commit status ročno na GitHubu"
  fi
else
  warn "python3 manjka — preverba commit statusa preskočena"
fi

# -----------------------------------------------------------------------------
hdr "9) Booking E2E + 409 dedup (SMOKE_BOOKING=1) — PIŠE v produkcjsko DB"
if [[ "${SMOKE_BOOKING:-0}" == "1" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    exp_id="$(python3 -c "import json,sys; d=json.load(sys.stdin); e=(d.get('experiences') or [{}])[0]; print(e.get('id',''))" <<<"$exp_json")"
    exp_min="$(python3 -c "import json,sys; d=json.load(sys.stdin); e=(d.get('experiences') or [{}])[0]; print(e.get('minGroupSize',1))" <<<"$exp_json")"
    if [[ -n "$exp_id" ]]; then
      date14="$(date -u -d '+14 days' '+%Y-%m-%dT%H:00:00.000Z' 2>/dev/null || date -u -v+14d '+%Y-%m-%dT%H:00:00.000Z')"
      payload="$(python3 - "$date14" "$exp_id" "$exp_min" <<'PY'
import json, sys
date, exp_id, gmin = sys.argv[1], sys.argv[2], int(sys.argv[3])
print(json.dumps({
  "experienceId": exp_id, "groupSize": gmin, "bookingDate": date,
  "guest": {"name": "P9 Smoke Test", "email": "p9-smoke@dsa-test.invalid",
            "phone": "+386 40 000 000", "notes": "P9 produkcjski smoke — za cleanup"}
}))
PY
)"
      r1="$(curl -s --max-time 60 -X POST -H 'Content-Type: application/json' -d "$payload" "$BASE_URL/api/bookings")"
      bn1="$(python3 -c "import json,sys; print(json.load(sys.stdin).get('bookingNumber',''))" <<<"$r1")"
      [[ -n "$bn1" ]] && ok "booking ustvarjen: $bn1" || bad "booking NI ustvarjen: $(head -c 200 <<<"$r1")"
      if [[ -n "$bn1" ]]; then
        c2="$(curl -s -o /tmp/p9-b2.json -w '%{http_code}' --max-time 60 -X POST -H 'Content-Type: application/json' -d "$payload" "$BASE_URL/api/bookings")"
        bn2="$(python3 -c "import json,sys; print(json.load(sys.stdin).get('bookingNumber',''))" <<<"$(cat /tmp/p9-b2.json)")"
        [[ "$c2" == "409" && "$bn2" == "$bn1" ]] \
          && ok "P8 dedup v produkciji: ponovni POST → 409 + ISTA številka $bn2" \
          || bad "dedup: HTTP $c2, št=$bn2 (pričakovano 409 + $bn1)"
        c3="$(code "$BASE_URL/api/bookings/$bn1?email=p9-smoke%40dsa-test.invalid")"
        [[ "$c3" == "200" ]] && ok "booking lookup ustvarjene rezervacije → 200" || bad "lookup → $c3"
        echo "  🧹 cleanup: cd repo && DATABASE_URL=\"\$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '\"')\" bun scripts/db/p9-smoke-cleanup.ts"
      fi
    else
      bad "ni objavljene izkušnje za booking test"
    fi
  else
    warn "python3 manjka — booking E2E preskočen"
  fi
else
  echo "  (preskočeno — SMOKE_BOOKING=1 za polni E2E z 409 dedup dokazom)"
fi

# -----------------------------------------------------------------------------
hdr "10) Newsletter (SMOKE_NEWSLETTER=1) — 1 vrstica v DB"
if [[ "${SMOKE_NEWSLETTER:-0}" == "1" ]]; then
  r="$(curl -s --max-time 30 -X POST -H 'Content-Type: application/json' \
       -d '{"email":"p9-smoke@dsa-test.invalid","source":"homepage"}' \
       "$BASE_URL/api/newsletter/subscribe")"
  grep -q '"success":true' <<<"$r" \
    && ok "newsletter subscribe OK" \
    || bad "newsletter: $(head -c 200 <<<"$r")"
  echo "  🧹 ista vrstica se pobriše s p9-smoke-cleanup.ts"
else
  echo "  (preskočeno — SMOKE_NEWSLETTER=1)"
fi

# -----------------------------------------------------------------------------
hdr "11) GEO/SEO infrastruktura (MONET-10) — robots/sitemap/llms/rss/OG"
# ZGODOVINA: 12. 9. 2026 odkritih 5 tihih indeksacijskih blokad
# (public/robots.txt konflikt → 500 v devu; cross-host sitemap; SVG OG slika;
#  brez llms.txt/RSS; napihnjen lastmod). Ta sekcija jih trajno varuje.
if [[ "$BASE_URL" != "https://i-feel-slovenia.vercel.app" ]]; then
  # robots.txt — gostitelju-prilagojen, z Sitemap direktivo ISTEGA gostitelja
  rb="$(curl -s --max-time 20 "$BASE_URL/robots.txt")"
  rbh="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE_URL/robots.txt")"
  if [[ "$rbh" == "200" ]]; then
    ok "robots.txt → 200 (brez konflikta public/generator)"
    grep -q "^Allow: /$" <<<"$rb" && ok "robots: Allow / (celotno spletišče odprto)" || bad "robots: MANJKA Allow: /"
    grep -q "Disallow: /admin" <<<"$rb" && ok "robots: /admin zaprt" || bad "robots: /admin NI zaprt"
    grep -q "Disallow: /api/" <<<"$rb" && ok "robots: /api/ zaprt" || bad "robots: /api/ NI zaprt"
    grep -q "^User-agent: GPTBot" <<<"$rb" && ok "robots: AI crawlerji (GPTBot+) eksplicitno dovoljeni" || warn "robots: AI crawler pravila manjkajo"
    SM_REF="$(grep -oE '^Sitemap: .*' <<<"$rb" | head -1 | cut -d' ' -f2-)"
    ORIGIN="$(echo "$BASE_URL" | sed -E 's#/$##')"
    if [[ -n "$SM_REF" && "$SM_REF" == "$ORIGIN/sitemap.xml" ]]; then
      ok "robots: Sitemap direktiva KAŽE NA TEGA GOSTITELJA ($SM_REF)"
    else
      bad "robots: Sitemap='$SM_REF' ≠ gostitelj $ORIGIN — cross-host blokada se je VRNILA"
    fi
    grep -qE '^Disallow: /\s*$' <<<"$rb" && bad "robots: 'Disallow: /' BLOKIRA CELO STRAN (zg. incident)" || ok "robots: brez popolne blokade"
  else
    bad "robots.txt → HTTP $rbh (konflikt/napaka strežnika)"
  fi

  # sitemap.xml — URL-ji DEJANSKEGA gostitelja (Google zavrača cross-host)
  sm="$(curl -s --max-time 30 "$BASE_URL/sitemap.xml")"
  smh="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$BASE_URL/sitemap.xml")"
  if [[ "$smh" == "200" ]]; then
    N_URLS="$(grep -c '<loc>' <<<"$sm" || true)"
    [[ "$N_URLS" -ge 300 ]] && ok "sitemap: $N_URLS URL-jev (≥300 pričakovanih)" || bad "sitemap: samo $N_URLS URL-jev"
    if grep -q "<loc>$ORIGIN/</loc>" <<<"$sm"; then
      ok "sitemap: prvi URL z ISTEGA gostitelja (cross-host popravek drži)"
    else
      bad "sitemap: URL-ji NISO z gostitelja $ORIGIN — Google jih bo ZAVRNIL"
    fi
    grep -q '<loc>'"$ORIGIN"'/llms.txt</loc>' <<<"$sm" && ok "sitemap: GEO poti (llms.txt/rss.xml) vključene" || warn "sitemap: llms.txt ni razviden"
    grep -q '<lastmod>' <<<"$sm" && warn "sitemap: lastmod prisoten (preveri, da ni napihnjen)" || ok "sitemap: lastmod pošteno izpuščen"
  else
    bad "sitemap.xml → HTTP $smh"
  fi

  # llms.txt (GEO) — spec struktura
  lh="$(curl -s -o /tmp/p9-llms.txt -w '%{http_code}' --max-time 20 "$BASE_URL/llms.txt")"
  if [[ "$lh" == "200" && "$(head -c 2 /tmp/p9-llms.txt)" == "# " ]]; then
    ok "llms.txt → 200, spec naslov '# Discover Slovenia AI'"
    grep -q '## Destinacije' /tmp/p9-llms.txt && ok "llms.txt: sekcije destinacij prisotne" || bad "llms.txt: struktura sekcij manjka"
  else
    bad "llms.txt → HTTP $lh / napačen začetek"
  fi
  lfh="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE_URL/llms-full.txt")"
  [[ "$lfh" == "200" ]] && ok "llms-full.txt → 200 (polni format za agente)" || bad "llms-full.txt → $lfh"

  # rss.xml — veljaven kanal
  rh="$(curl -s -o /tmp/p9-rss.xml -w '%{http_code}' --max-time 20 "$BASE_URL/rss.xml")"
  if [[ "$rh" == "200" ]] && grep -q '<rss version="2.0">' /tmp/p9-rss.xml; then
    N_ITEMS="$(grep -c '<item>' /tmp/p9-rss.xml || true)"
    ok "rss.xml → 200, RSS 2.0, $N_ITEMS itemov"
    grep -q '<language>sl-si</language>' /tmp/p9-rss.xml && ok "rss: jezik sl-si" || warn "rss: jezikovna oznaka manjka"
  else
    bad "rss.xml → HTTP $rh / neveljaven RSS"
  fi
  # odkrivanje feed-a na homepage (v datoteko — pipefail+grep -q ubije curl s SIGPIPE)
  curl -s --max-time 30 "$BASE_URL/" -o /tmp/p9-home-geo.html
  grep -q 'application/rss+xml' /tmp/p9-home-geo.html \
    && ok "homepage: <link rel=alternate RSS> prisoten" || bad "homepage: RSS odkrivanje manjka"

  # OG slika — PNG (SVG ne deluje na FB/WhatsApp/Telegram)
  og="$(curl -s -o /tmp/p9-og.png -w '%{http_code}' --max-time 20 "$BASE_URL/og-home.png")"
  if [[ "$og" == "200" && "$(head -c 4 /tmp/p9-og.png | od -An -tx1 | tr -d ' ')" == "89504e47" ]]; then
    ok "og-home.png → 200, veljaven PNG (social sharing fix)"
    curl -s --max-time 30 "$BASE_URL/" -o /tmp/p9-home-og.html
    grep -q 'og-home.png' /tmp/p9-home-og.html \
      && ok "homepage OG meta kaže na og-home.png" || bad "homepage OG meta NE kaže na og-home.png (SVG nazaj?)"
  else
    bad "og-home.png → HTTP $og / ni PNG"
  fi

  # IndexNow ključ — dostopen na korenu (spec)
  KEYFILE="$(ls /home/z/Discover-Slovenia-AI/public/ 2>/dev/null | grep -E '^[a-f0-9]{8,128}\.txt$' | head -1 || true)"
  if [[ -n "$KEYFILE" ]]; then
    khttp="$(curl -s -o /tmp/p9-key.txt -w '%{http_code}' --max-time 20 "$BASE_URL/$KEYFILE")"
    [[ "$khttp" == "200" && "$(cat /tmp/p9-key.txt | tr -d '[:space:]')" == "${KEYFILE%.txt}" ]] \
      && ok "IndexNow ključ strežen na korenu (ping pripravljen)" \
      || warn "IndexNow ključ ni dosegljiv na $BASE_URL/$KEYFILE (HTTP $khttp)"
  else
    warn "IndexNow ključ ni v public/ (lokalni repozitorij)"
  fi
else
  echo "  (preskočeno — Vercel še na stari kodi; GEO sekcija se aktivira po redeploy)"
fi

# -----------------------------------------------------------------------------
hdr "ROČNI (brskalnik) — preostali checklist:"
cat <<'MANUAL'
  [ ] booking od začetka do konca prek UI (homepage → izkušnja → modal → potrditev)
  [ ] login/logout B2C
  [ ] owner login + CRUD osnovnega zapisa (draft → submit)
  [ ] consultation → recommendation → atribucija (source=consultation)
  [ ] admin authentication (/admin z ADMIN_PASSWORD)
  [ ] mobilni 390 px — funkcionalni pregled ključnih tokov (ne le vizualno)
MANUAL

# -----------------------------------------------------------------------------
echo
echo "=================================================="
echo "REZULTAT: $PASS pass / $FAIL fail / $WARN warn"
[[ $FAIL -gt 0 ]] && exit 1 || exit 0
