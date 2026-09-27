#!/usr/bin/env python3
"""
FW4.3-2: Zlije i18n fragmente (src/i18n/fragments/*.{sl,en,it,de}.json) v
monolitne sporočilne datoteke (src/i18n/messages/{sl,en,it,de}.json).

Vsak fragment je JSON z ENIM top-level imenskim prostorom (npr. {"about": {...}}).
Merge je top-level: če imenski prostor že obstaja v cilju → NAPAKA (podvojitev),
razen če --force (prepiše s fragmentom).

Po uspešnem mergeu se fragmenti NE izbrišejo (izbriše jih integracijski
korak ročno po validaciji, da je merge idempotenten za ponovne poige).

W1 (Issue #15 V0, 1.126.0): zanka razširjena na VSE javne jezike, za katere
obstaja messages/<locale>.json (sl/en/it/de). IT/DE sta izdelana celovito
(scripts/translate-locale.ts iz SL+EN para) — fragmenti zanje so opcijski
(avtoriranje ostane SL/EN-first; it/de fragmenti se dodajo, ko stran
potrebuje delo na svojih nizih).
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRAGMENTS = ROOT / "src" / "i18n" / "fragments"
MESSAGES = ROOT / "src" / "i18n" / "messages"

# W1: vsi javni jeziki (samo tisti z obstoječo messages datoteko)
LOCALES = tuple(
    sorted(
        p.stem
        for p in MESSAGES.glob("*.json")
        if p.stem in {"sl", "en", "it", "de"}
    )
)

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
    for locale in LOCALES:
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

    # Simetrija VSEH jezikov (isti nabor top-level imenskih prostorov + ključev)
    base = json.loads((MESSAGES / f"{LOCALES[0]}.json").read_text(encoding="utf-8"))
    base_ns = set(base.keys())
    for locale in LOCALES[1:]:
        other = json.loads((MESSAGES / f"{locale}.json").read_text(encoding="utf-8"))
        other_ns = set(other.keys())
        if base_ns != other_ns:
            print(f"NAPAKA: nesimetrija imenskih prostorov! {LOCALES[0]}-only: {base_ns - other_ns}, {locale}-only: {other_ns - base_ns}", file=sys.stderr)
            sys.exit(1)
        for ns in base_ns:
            c_base, c_other = flat_count(base[ns]), flat_count(other[ns])
            if c_base != c_other:
                print(f"NAPAKA: ns '{ns}': {LOCALES[0]} {c_base} ključev, {locale} {c_other} ključev", file=sys.stderr)
                sys.exit(1)
    print(f"OK: simetrično ({len(LOCALES)} jezikov) — {len(base_ns)} imenskih prostorov, {flat_count(base)} ključev.")

if __name__ == "__main__":
    main()
