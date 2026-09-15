# =============================================================================
# Cron vsebnik — mini-cron, ki pokliče vseh 5 /api/cron/* končnih točk
# =============================================================================
# ZAKAJ lastna slika: VPS/Docker nima vercel.json cronov. Ta vsebnik z
# busybox crond poganja IDENTIČNE urnike (UTC) kot serverless produkcija.
# Bearer skrivnost se vpiše ob zagonu (glej docker/cron-entrypoint.sh).

FROM alpine:3.20

RUN apk add --no-cache curl tzdata

# Ne pozabi: datoteka mora imeti LF končnice (ne CRLF)!
COPY docker/crontab.template /crontab.template
COPY docker/cron-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV TZ=Europe/Ljubljana

ENTRYPOINT ["/entrypoint.sh"]
