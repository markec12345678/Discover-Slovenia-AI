#!/usr/bin/env python3
"""Run z-ai image-search for each query, save URLs to results.json.

Resumable: skips slugs already in results.json.
3s delay between calls to be gentle on the API.
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

BASE = Path(__file__).parent
QUERIES = json.loads((BASE / "queries.json").read_text())
RESULTS_PATH = BASE / "results.json"

def load_results():
    if RESULTS_PATH.exists():
        return json.loads(RESULTS_PATH.read_text())
    return {"listings": {}, "experiences": {}, "products": {}}

def save_results(r):
    RESULTS_PATH.write_text(json.dumps(r, indent=2, ensure_ascii=False))

def run_search(query):
    """Run z-ai image-search and extract original_url from JSON output."""
    try:
        proc = subprocess.run(
            ["z-ai", "image-search", "-q", query, "--count", "1", "--gl", "us", "--no-rank"],
            capture_output=True, text=True, timeout=90,
        )
        out = proc.stdout
        # Find the JSON object in the output
        m = re.search(r'\{\s*"success"', out)
        if not m:
            print(f"    ❌ No JSON in output. stderr: {proc.stderr[:200]}")
            return None
        json_str = out[m.start():]
        # Find matching closing brace
        depth = 0
        end = -1
        for i, ch in enumerate(json_str):
            if ch == '{': depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end == -1:
            print("    ❌ Incomplete JSON")
            return None
        data = json.loads(json_str[:end])
        results = data.get("results", [])
        if not results:
            print("    ❌ No results")
            return None
        return results[0].get("original_url")
    except subprocess.TimeoutExpired:
        print("    ❌ Timeout")
        return None
    except Exception as e:
        print(f"    ❌ Error: {e}")
        return None

def main():
    results = load_results()
    total = 0
    done = 0
    skipped = 0
    for category in ["listings", "experiences", "products"]:
        queries = QUERIES[category]
        for slug, query in queries.items():
            total += 1
            if slug in results[category] and results[category][slug]:
                skipped += 1
                continue
            print(f"[{total}/52] {category}/{slug}: {query}")
            url = run_search(query)
            if url:
                results[category][slug] = url
                save_results(results)
                done += 1
                print(f"    ✅ {url}")
            else:
                results[category][slug] = ""
                save_results(results)
                print("    ⚠️  Saved empty (will retry manually if needed)")
            # 3s delay between calls
            time.sleep(3)
    print(f"\n=== Done: {done} new, {skipped} skipped, {total} total ===")
    # Show empty ones
    empty = []
    for cat in ["listings", "experiences", "products"]:
        for slug, url in results[cat].items():
            if not url:
                empty.append(f"{cat}/{slug}")
    if empty:
        print(f"\n⚠️  Empty URLs ({len(empty)}):")
        for e in empty:
            print(f"  - {e}")

if __name__ == "__main__":
    main()
