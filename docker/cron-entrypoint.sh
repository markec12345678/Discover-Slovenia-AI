#!/bin/sh
# =============================================================================
# cron-entrypoint.sh — zagon mini-cron v Cron vsebniku (glej docker/cron.Dockerfile)
# =============================================================================
#
# ZAKAJ sed substitucija: busybox crond NE posreduje okoljskih spremenljivk
# vsebnika cron taskom — CRON_SECRET zato vpišemo v crontab ob zagonu
# (iz template-ja docker/crontab.template).
#
# Logger: taski pišejo v /proc/1/fd/1 (= stdout vsebnika → `docker compose logs cron`).

set -eu

: "${CRON_SECRET:?CRON_SECRET ni nastavljen — podaj ga v .env.docker (enak kot app)}"
: "${APP_URL:=http://app:3000}"

sed -e "s|__CRON_SECRET__|${CRON_SECRET}|g" \
    -e "s|__APP_URL__|${APP_URL}|g" \
    /crontab.template > /etc/crontabs/root

chmod 600 /etc/crontabs/root
echo "[cron] razpored pripravljen (urniki UTC — enaki vercel.json):"
grep -v '^\s*#' /etc/crontabs/root | grep -v '^\s*$' || true

exec crond -f -l 8
