"use client";

import { useId, useMemo, useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import {
  Baby,
  Backpack,
  CloudRain,
  FileText,
  Footprints,
  HeartPulse,
  Info,
  Plug,
  RotateCcw,
  Shirt,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  buildSmartPackingList,
  smartPackingSignature,
  type PackingCategory,
  type SmartPackingItem,
} from "@/lib/packing-smart";
import { trackPlannerEvent } from "@/lib/planner-analytics";
import {
  getServerPackingSnapshot,
  getPackingSnapshot,
  resetPacking,
  setPackingChecked,
  subscribePacking,
} from "@/lib/ui-persist";
import type { Itinerary, PlannerInput } from "@/lib/types";
import { cn } from "@/lib/utils";

// ============================================================================
// PAMETEN PAKIRNI SEZNAM (F6.1) — "Kaj pakirati"
// ============================================================================
//
// Nadgradnja legacy PackingListSection: STRUKTURIRAN seznam iz realne
// dnevne napovedi + dejanskih postankov na načrtu (glej src/lib/packing-smart.ts).
// Vsak predmet ima razlog; metoda (napoved/sezona) je RAZKRITA.
//
// Odkljuki se PERSISTIRAJO v localStorage (src/lib/ui-persist.ts — zunanja
// shramba prek useSyncExternalStore, hidracijsko varna: strežniški snapshot
// je prazen, klient se naloži po hidraciji brez mismatch-a). Nov podpis
// seznama (ID-ji predmetov) → odkluki se ponastavijo.
//
// Deluje na /nacrtuj (input z interesi/tipom skupine) IN na /pot/[shareId]
// (shranjeni načrti brez inputa — isto čisto funkcijo) — nazaj kompatibilno
// z VSEMI stari shranjenimi načrti.
// ============================================================================

const CATEGORY_META: Record<
  PackingCategory,
  { icon: LucideIcon; sl: string; en: string }
> = {
  clothing: { icon: Shirt, sl: "Oblačila", en: "Clothing" },
  weather: { icon: CloudRain, sl: "Za vreme", en: "For the weather" },
  activity: { icon: Footprints, sl: "Za aktivnosti", en: "For activities" },
  tech: { icon: Plug, sl: "Tehnika", en: "Tech" },
  health: { icon: HeartPulse, sl: "Zdravje & sonce", en: "Health & sun" },
  documents: { icon: FileText, sl: "Dokumenti & denar", en: "Documents & money" },
  kids: { icon: Baby, sl: "Za otroke", en: "For the kids" },
};

interface SmartPackingSectionProps {
  itinerary: Itinerary;
  /** Planner input (interesi/tip skupine) — opcijsko (shranjeni načrti) */
  input?: PlannerInput | null;
  /** "card" = naslov znotraj kartice (planner), "section" = h2 (/pot) */
  variant?: "card" | "section";
  className?: string;
}

export function SmartPackingSection({
  itinerary,
  input,
  variant = "card",
  className,
}: SmartPackingSectionProps) {
  const locale = useLocale();
  const isEn = locale === "en";
  const listId = useId();

  const list = useMemo(
    () => buildSmartPackingList({ itinerary, input, lang: isEn ? "en" : "sl" }),
    [itinerary, input, isEn]
  );

  const sig = list ? smartPackingSignature(list) : "";

  // Persistirani odkljuki — zunanja shramba (hidracijsko varna)
  const checked = useSyncExternalStore(
    subscribePacking,
    () => getPackingSnapshot(sig),
    getServerPackingSnapshot
  );

  if (!list || list.items.length === 0) return null;

  const title = isEn ? "What to pack" : "Kaj pakirati";
  const checkedCount = list.items.filter((i) => checked[i.id]).length;
  const allPacked = checkedCount === list.items.length;

  // Razbitje po kategorijah
  const byCategory = new Map<PackingCategory, SmartPackingItem[]>();
  for (const item of list.items) {
    const arr = byCategory.get(item.category) ?? [];
    arr.push(item);
    byCategory.set(item.category, arr);
  }

  const toggle = (item: SmartPackingItem, next: boolean) => {
    setPackingChecked(sig, item.id, next);
    if (next) {
      trackPlannerEvent("packing_item_checked", {
        category: item.category,
        method: list.method,
        items: list.items.length,
      });
    }
  };

  const progressBadge = (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 font-medium",
        allPacked &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      )}
      aria-live="polite"
    >
      {checkedCount}/{list.items.length}
      {allPacked
        ? isEn
          ? " — packed!"
          : " — spakirano!"
        : isEn
          ? " packed"
          : " spakirano"}
    </Badge>
  );

  const methodBadge = (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium",
        list.method === "forecast"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      )}
    >
      {list.method === "forecast"
        ? isEn
          ? "from daily forecast"
          : "iz dnevne napovedi"
        : isEn
          ? "seasonal"
          : "sezonska"}
    </Badge>
  );

  const hint = (
    <div className="mt-4 space-y-2">
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {list.methodNote}{" "}
          {isEn
            ? "Check items off as you pack — your progress is kept on this device."
            : "Odkljukaj, ko stvar spakiraš — napredek se shrani na tej napravi."}
        </span>
      </p>
      {checkedCount > 0 && (
        <button
          type="button"
          onClick={() => resetPacking(sig)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <RotateCcw className="size-3" aria-hidden="true" />
          {isEn ? "Clear checked items" : "Počisti odkljukane"}
        </button>
      )}
    </div>
  );

  const groups = Array.from(byCategory.entries()).map(([cat, catItems]) => {
    const meta = CATEGORY_META[cat];
    const Icon = meta?.icon ?? Backpack;
    const catLabel = meta ? (isEn ? meta.en : meta.sl) : (isEn ? "Other" : "Ostalo");
    return (
      <div key={cat}>
        <p className="mb-2 mt-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3.5 text-primary" aria-hidden="true" />
          {catLabel}
        </p>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {catItems.map((item) => {
            const isChecked = Boolean(checked[item.id]);
            const checkId = `${listId}-${item.id}`;
            return (
              <li key={item.id}>
                <label
                  htmlFor={checkId}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-card/50 p-3 text-sm transition-colors hover:border-primary/30",
                    isChecked && "border-primary/40 bg-primary/5"
                  )}
                >
                  <Checkbox
                    id={checkId}
                    checked={isChecked}
                    onCheckedChange={(state) => toggle(item, state === true)}
                    aria-label={item.label}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block leading-snug",
                        isChecked && "text-muted-foreground line-through"
                      )}
                    >
                      {item.label}
                      {item.quantity && (
                        <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {item.quantity}
                        </span>
                      )}
                    </span>
                    {item.reason && (
                      <span
                        className={cn(
                          "mt-0.5 block text-xs leading-snug text-muted-foreground/80",
                          isChecked && "line-through decoration-muted-foreground/40"
                        )}
                      >
                        {item.reason}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    );
  });

  if (variant === "section") {
    return (
      <section className={className} aria-label={title}>
        <h2 className="mb-4 flex flex-wrap items-center gap-2 text-xl font-bold sm:text-2xl">
          <Backpack className="size-5 text-primary" aria-hidden="true" />
          {title}
          {progressBadge}
          {methodBadge}
        </h2>
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            {groups}
            {hint}
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className={className} aria-label={title}>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            <Backpack className="size-5 text-primary" aria-hidden="true" />
            {title}
            {methodBadge}
            <span className="ml-auto">{progressBadge}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {groups}
          {hint}
        </CardContent>
      </Card>
    </section>
  );
}

export default SmartPackingSection;
