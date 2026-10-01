# Issue #20 — dokazi faze 1 (1.157.0, 2026-10-01)

Produkcijska verifikacija lastne tržnice (§3 P0) na **Render (primarna
produkcija)**, ~08:50 UTC. Geo-popravek: 2 realna lokala (Postojnska
jama — partner: 45.7819/14.2137; Kavarna Zvezda — Ljubljana:
46.0513/14.5058) — transparentna dopolnitev vzdrževalca (demo
partnerji po P7-A inertni).

| # | Dokaz | Datoteka |
|---|---|---|
| 1 | POI popup lastnega tržničnega produkta na zemljevidu (Kavarna Zvezda — naslov, ★ 4.4 · 156 mnenj, kategorija, gumb »+ Dodaj v mojo pot«) | `p1-own-poi-popup.png` |
| 2 | Gumb po kliku »✓ Dodano« (kanonski write-through #16 F3 z `own:` produktom, source: zemljevid) | `p2-dodano-gumb.png` |
| 3 | Hub /moja-potovanja → »Moja pot 1« vsebuje Kavarna Zvezda — Ljubljana | `p3-hub-moja-pot.png` |

## Supply API dokaz (brez PNG — JSON odgovor)

`GET /api/supply/search?bbox=45.77,14.19,45.79,24&zoom=14&cats=poi`
(natančno: `bbox=45.77,14.19,45.79,14.24`) → `counts.byProvider: {own: 1}`,
adapter `own {status: search, ok: true, count: 1}`, produkt:

```json
{
  "id": "own:cmtvgsm0t000mq5udjus7fcmo",
  "provider": "own",
  "title": "Postojnska jama — partner",
  "type": "poi",
  "lat": 45.7819, "lng": 14.2137, "geoPrecision": "exact",
  "address": "Jamska cesta 30, 6230 Postojna",
  "rating": 4.5, "reviewCount": 302,
  "bookingMode": "own_marketplace",
  "lastUpdated": "2026-10-01T08:47:34.232Z"
}
```

localStorage po kliku »+ Dodaj v mojo pot«:

```json
[{"kind":"product","refId":"own:cmtvgslvj000kq5ud6j8b42es",
  "title":"Kavarna Zvezda — Ljubljana",
  "subtitle":"Restavracija · Krojaška ulica 5, 1000 Ljubljana",
  "href":"/zemljevid?lat=46.0513&lng=14.5058&zoom=13&label=Kavarna%20Zvezda%20%E2%80%94%20Ljubljana",
  "source":"zemljevid","addedAt":"2026-10-01T08:54:09.070Z"}]
```

## Izpuščanje zapisov brez koordinat (negativni dokaz)

Pred popravkom (08:35 UTC): 20 objavljenih zapisov, 0 s koordinatami →
`own` sloj prazen (iskren izpis, opomba po zoom/cat-gating). Po
popravku: 2 od 20 s koordinatami → natanko ta 2 v sloju; ostalih 18
ostaja iskreno izpuščenih (vrata `status=published AND lat NOT NULL AND
lng NOT NULL` — `providers/own/adapter.ts`).
