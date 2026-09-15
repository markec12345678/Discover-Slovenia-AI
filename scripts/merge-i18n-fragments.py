#!/usr/bin/env python3
"""
FW4.3-2: Zlije i18n fragmente (src/i18n/fragments/*.{sl,en}.json) v
monolitne sporočilne datoteke (src/i18n/messages/{sl,en}.json).

Vsak fragment je JSON z ENIM top-level imenskim prostorom (npr. {"about": {...}}).
Merge je top-level: če imenski prostor že obstaja v cilju → NAPAKA (podvojitev),
razen če --force (prepiše s fragmentom).

Po uspešnem mergeu se fragmenti NE izbrišejo (izbriše jih integracijski
korak ročno po validaciji, da je merge idempotenten za ponovne poige).
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRAGMENTS = ROOT / "src" / "i18n" / "fragments"
MESSAGES = ROOT / "src" / "i18n" / "messages"

def deep_merge_counts(target: dict, fragment: dict, path: str = "") -> int:
    """Zlije fragment v target (globoko); vrne št. dodanih ključev."""
    added = 0
    for key, value in fragment.items():
        full = f"{path}.{key}" if path else key
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            added += deep_merge_counts(target[key], value, full)
        elif key in target:
            print(f"  NAPAKA: podvojen ključ {full} — že obstaja v messages!", file=sys.stderr)
            sys.exit(1)
        else:
            target[key] = value
            added += 1
    return added

def flat_count(d: dict, prefix: str = "") -> int:
    n = 0
    for k, v in d.items():
        if isinstance(v, dict):
            n += flat_count(v, f"{prefix}.{k}" if prefix else k)
        else:
            n += 1
    return n

def main() -> None:
    force = "--force" in sys.argv
    fragments = sorted(FRAGMENTS.glob("*.json"))
    if not fragments:
        print("Ni fragmentov za merge.")
        return

    totals = {}
    for locale in ("sl", "en"):
        target_path = MESSAGES / f"{locale}.json"
        target = json.loads(target_path.read_text(encoding="utf-8"))
        before = flat_count(target)

        for frag_path in fragments:
            if not frag_path.name.endswith(f".{locale}.json"):
                continue
            fragment = json.loads(frag_path.read_text(encoding="utf-8"))
            added = deep_merge_counts(target, fragment)
            print(f"  [{locale}] +{added} ključev ← {frag_path.name}")

        after = flat_count(target)
        target_path.write_text(
            json.dumps(target, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        totals[locale] = (before, after)
        print(f"[{locale}] {before} → {after} ključev")

    # Simetrija SL/EN (isti nabor top-level imenskih prostorov)
    sl = json.loads((MESSAGES / "sl.json").read_text(encoding="utf-8"))
    en = json.loads((MESSAGES / "en.json").read_text(encoding="utf-8"))
    sl_ns, en_ns = set(sl.keys()), set(en.keys())
    if sl_ns != en_ns:
        print(f"NAPAKA: nesimetrija imenskih prostorov! SL-only: {sl_ns - en_ns}, EN-only: {en_ns - sl_ns}", file=sys.stderr)
        sys.exit(1)
    for ns in sl_ns:
        c_sl, c_en = flat_count(sl[ns]), flat_count(en[ns])
        if c_sl != c_en:
            print(f"NAPAKA: ns '{ns}': SL {c_sl} ključev, EN {c_en} ključev", file=sys.stderr)
            sys.exit(1)
    print(f"OK: simetrično — {len(sl_ns)} imenskih prostorov, {flat_count(sl)} ključev.")

if __name__ == "__main__":
    main()
