#!/usr/bin/env python3
# ============================================================================
# ingest-fsq.py — EKSTRAKTOR Foursquare OS Places (parquet → vmesni JSONL)
# TASK 61 (1.61.0)
# ============================================================================
# NAMEN: „dumb pipe“ ekstrakcija iz PRIMARNE distribucije fused.io
# (source.coop, S3 BREZ prijave — Apache-2.0 z atribucijo) z DuckDB httpfs
# range-pushdown (prenese SAMO row-groupe, ki se sekajo z regijo — ne 15 GB).
# Vsa POSLOVNA LOGIKA (države, kategorije, obseg) živi v
# scripts/ingest-fsq.ts (TS, isti moduli kot adapter) — ta skripta NE
# odloča o vsebini, samo izlušči vrstice v regiji.
#
# Zahteve: python3 + `pip install duckdb` (uporabljeno 1.5.x).
#
# Uporaba (kliče jo scripts/ingest-fsq.ts — lahko tudi ročno):
#   python3 scripts/ingest-fsq.py \
#     --bbox 39.6,46.9,13.3,21.1 \
#     --snapshot 2025-02-06 \
#     --out /tmp/fsq-raw.jsonl
#
# Izhod: JSONL — ena vrstica na kraj (SUROVA oblika distribucije):
#   { fsq_id, name, latitude, longitude, address(street), locality, region,
#     postcode, country, tel, website, email, date_refreshed, date_closed,
#     categories: [label, …] }
# Izpisi na stdout: števci (datoteke/row-groupi/vrstice) za dnevnik.
#
# Etika/licenca: Apache-2.0 odprti podatki (z atribucijo — atribucijo
# izpisuje mapper: „© Foursquare / Open Places Apache-2.0“). Zaprti kraji
# se prenesejo S (izloča jih TS pot); kategorije so label-poti vira.
# ============================================================================
import argparse
import json
import re
import sys
import time

import duckdb

SOURCE_COOP_LIST = "https://data.source.coop/fused/fsq-os-places"  # ?list-type=2 (S3 prefix list)
SOURCE_COOP_FILE = "https://data.source.coop/fused"  # + /fsq-os-places/<snapshot>/places/*.parquet
# Zrcalo (ista shema, en sam 10 GB parquet — fallback, če source.coop pade):
# https://huggingface.co/datasets/do-me/foursquare_places_100M/resolve/main/foursquare_places.parquet


def list_snapshot_files(snapshot: str) -> list[str]:
    """Seznam parquet datotek posnetka (S3 list, brez prijave)."""
    import urllib.request

    url = f"{SOURCE_COOP_LIST}?list-type=2"
    # UA: gol python-urllib CDN zavrača (403) — vljuden identiteten UA.
    req = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; dsa-fsq-ingest/1.0)"}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        xml = r.read().decode("utf-8")
    keys = re.findall(r"<Key>([^<]+)</Key>", xml)
    files = [
        k for k in keys
        if k.startswith(f"fsq-os-places/{snapshot}/places/") and k.endswith(".parquet")
    ]
    return [f"{SOURCE_COOP_FILE}/{k}" for k in sorted(files, key=natural_key)]


def natural_key(key: str) -> list:
    """Numerično sortiranje (0,1,2,…,10 — ne leksikografsko)."""
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", key)]


def region_files(con, urls: list[str], lat_min, lat_max, lng_min, lng_max):
    """Odkrij datoteke, katerih row-groupi se sekajo z regijo (samo nogavice)."""
    hits = []
    for i, u in enumerate(urls):
        try:
            lat = {
                r[0]: (r[1], r[2])
                for r in con.execute(
                    f"SELECT row_group_id, CAST(stats_min_value AS DOUBLE), "
                    f"CAST(stats_max_value AS DOUBLE) FROM parquet_metadata('{u}') "
                    "WHERE path_in_schema='latitude' AND stats_min_value IS NOT NULL"
                ).fetchall()
            }
            lng = {
                r[0]: (r[1], r[2])
                for r in con.execute(
                    f"SELECT row_group_id, CAST(stats_min_value AS DOUBLE), "
                    f"CAST(stats_max_value AS DOUBLE) FROM parquet_metadata('{u}') "
                    "WHERE path_in_schema='longitude' AND stats_min_value IS NOT NULL"
                ).fetchall()
            }
        except Exception as e:  # napaka ene datoteke NE podre skena
            print(f"  [meta] PRESKOČENA {u.rsplit('/', 1)[1]}: {str(e)[:100]}", file=sys.stderr)
            continue
        n = 0
        for rg, (la0, la1) in lat.items():
            g = lng.get(rg)
            if g is None:
                continue
            if la0 <= lat_max and la1 >= lat_min and g[0] <= lng_max and g[1] >= lng_min:
                n += 1
        if n > 0:
            hits.append((u, n))
        if (i + 1) % 20 == 0:
            print(f"  [meta] …{i + 1}/{len(urls)} datotek, zadetki: {len(hits)}", file=sys.stderr)
    return hits


def main() -> int:
    ap = argparse.ArgumentParser(description="FSQ OS Places extractor (parquet → raw JSONL)")
    ap.add_argument("--bbox", required=True, help="latMin,latMax,lngMin,lngMax (regija)")
    ap.add_argument("--snapshot", default="2025-02-06", help="posnetek source.coop (datum)")
    ap.add_argument("--out", required=True, help="izhodna JSONL pot (vmesna, /tmp)")
    ap.add_argument("--memory", default="1500MB", help="meja pomnilnika DuckDB")
    args = ap.parse_args()

    lat_min, lat_max, lng_min, lng_max = (float(x) for x in args.bbox.split(","))
    print(f"[fsq-py] regija bbox: lat {lat_min}–{lat_max}, lng {lng_min}–{lng_max}")

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute(f"SET threads=4; SET memory_limit='{args.memory}';")

    t0 = time.time()
    urls = list_snapshot_files(args.snapshot)
    if not urls:
        print(f"[fsq-py] NAPAKA: posnetka {args.snapshot} ni na source.coop", file=sys.stderr)
        return 2
    print(f"[fsq-py] posnetek {args.snapshot}: {len(urls)} datotek ({time.time() - t0:.0f}s)")

    t1 = time.time()
    hits = region_files(con, urls, lat_min, lat_max, lng_min, lng_max)
    if not hits:
        print("[fsq-py] NAPAKA: nobena datoteka ne seka regije", file=sys.stderr)
        return 3
    print(
        f"[fsq-py] regija seka {len(hits)}/{len(urls)} datotek "
        f"({sum(n for _, n in hits)} row-groupov, {time.time() - t1:.0f}s): "
        + ", ".join(u.rsplit('/', 1)[1] for u, _ in hits)
    )

    t2 = time.time()
    lst = ", ".join(f"'{u}'" for u, _ in hits)
    q = f"""
    SELECT fsq_place_id, name, latitude, longitude, address, locality, region,
           postcode, country, tel, website, email, date_refreshed, date_closed,
           fsq_category_labels
    FROM read_parquet([{lst}])
    WHERE latitude BETWEEN {lat_min} AND {lat_max}
      AND longitude BETWEEN {lng_min} AND {lng_max}
    """
    written = 0
    with open(args.out, "w", encoding="utf-8") as f:
        cur = con.execute(q)
        while True:
            rows = cur.fetchmany(50_000)
            if not rows:
                break
            for row in rows:
                cats = row[14] if row[14] else []
                rec = {
                    "fsq_id": row[0],
                    "name": row[1],
                    "latitude": row[2],
                    "longitude": row[3],
                    "address": row[4],
                    "locality": row[5],
                    "region": row[6],
                    "postcode": row[7],
                    "country": row[8],
                    "tel": row[9],
                    "website": row[10],
                    "email": row[11],
                    "date_refreshed": row[12],
                    "date_closed": row[13],
                    "categories": cats,
                }
                f.write(json.dumps(rec, ensure_ascii=False, separators=(",", ":")) + "\n")
                written += 1
        f.flush()
    print(
        f"[fsq-py] ekstrakcija: {written:,} vrstic → {args.out} ({time.time() - t2:.0f}s, "
        f"skupaj {time.time() - t0:.0f}s)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
