#!/usr/bin/env bash
# =============================================================================
# copy-standalone.sh — dopolni .next/standalone za samostojen zagon (VPS/Docker)
# =============================================================================
# Kopira statiko, javne datoteke in manjkajoči manifest v standalone izpis
# (Next.js tracer jih sam ne vključi — E2E dokazano v Fazi 4d).
#
# Na Vercelu tega KORAKA NI TREBA (platforma sama pakira izhod) in
# .next/standalone tam morda sploh ne obstaja → pogojno preskočimo,
# da build skripta ostane prenosljiva med okolji.
#
# Klic: del build skripte v package.json (za .next/standalone → self-host).

set -eu

if [ ! -d .next/standalone ]; then
  echo "[copy-standalone] .next/standalone ne obstaja — preskakujem (Vercel/build brez standalone)"
  exit 0
fi

cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
cp .next/server/interception-route-rewrite-manifest.js .next/standalone/.next/server/

echo "[copy-standalone] OK — standalone pripravljen za samostojen zagon"
