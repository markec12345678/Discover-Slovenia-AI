"use client";

import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================================
// EMPTY STATE — družina stanj TASK 8 / F3-B (issue #8 §33, D8-A P-STATE-2:
// 7 lokalnih EmptyState klonov, vsak s svojo slovnico).
// ============================================================================
// Enota: ikona + naslov + opis + CTA v črtkasti obliki (dashed-border
// slovnica destinations.tsx / moja-potovanja EmptyState). Dobra prazna
// stanja KAŽEJO NASLEDNJE DEJANJE (D8-A §13) — CTA je vedno ≥44px dotik.
//
// BESEDILO PRINOSI KLICATELJ: površina pozna svoje besedje (npr. „Ni še
// shranjenih potovanj" vs „Ni dogodkov za izbrane filtre"). Ta komponenta
// nima NOGA hardcodanega uporabniškega besedila — edini nizi so strukturni
// (ikone/sr-only), zato je sam po sebi i18n-varen (trdi predpogoj F3-E).
// ============================================================================

export function EmptyState({
  /** Lucide ikona (komponenta, ne instanca — SSR-varno posredovanje). */
  icon: Icon,
  title,
  description,
  /** CTA: href (navigacija) in/ali onClick (dejanje). Izbiranje: brez CTA. */
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    /** Notranja navigacija (next/link) — klik ne stara strani. */
    href?: string;
    /** Dejanje na mestu (npr. počisti filtre) ali spremljevalec href-a. */
    onClick?: () => void;
    /** Onemogočen CTA (npr. dosežen načrtovalni limit lastnika). */
    disabled?: boolean;
    /** Vodilna ikona CTA (privzeto: brez pri onClick, puščica pri href). */
    icon?: LucideIcon;
  };
  className?: string;
}) {
  const ActionIcon = action?.icon;
  const actionClasses = "mt-4 gap-1.5 font-semibold sm:min-h-[44px] min-h-11";

  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-border bg-background/60 p-8 text-center",
        className
      )}
    >
      {Icon && (
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-7 text-primary" aria-hidden="true" />
        </div>
      )}
      <p className="font-medium">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}

      {action &&
        (action.href ? (
          <Button asChild className={actionClasses}>
            <Link href={action.href} onClick={action.onClick}>
              {ActionIcon && (
                <ActionIcon className="size-4" aria-hidden="true" />
              )}
              {action.label}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={action.onClick}
            disabled={action.disabled}
            className={actionClasses}
          >
            {ActionIcon && (
              <ActionIcon className="size-4" aria-hidden="true" />
            )}
            {action.label}
          </Button>
        ))}
    </div>
  );
}
