import { cn } from "@/lib/utils";

/**
 * SectionHeader — poenoten vizualni sistem naslovov sekcij.
 *
 * Raziskava P4-5 (bold typography trend 2025): eyebrow (majhne črke,
 * tracking-widest, primarna barva) + izrazit naslov + podnaslov v
 * umirjeni barvi. Enak ritem na vseh sekcijah = občutek premium
 * doslednosti (pattern: Airbnb "gold standard" doslednost).
 *
 * Server-safe (brez stanja) — uporaben v RSC sekcijah.
 */
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "center",
  className,
  id,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "mb-10 flex flex-col gap-3 sm:mb-12",
        align === "center" ? "items-center text-center" : "items-start text-left",
        className
      )}
    >
      {eyebrow ? (
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          <span className="h-px w-6 bg-primary/50" aria-hidden="true" />
          {eyebrow}
          {align === "center" ? (
            <span className="h-px w-6 bg-primary/50" aria-hidden="true" />
          ) : null}
        </span>
      ) : null}
      <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export default SectionHeader;
