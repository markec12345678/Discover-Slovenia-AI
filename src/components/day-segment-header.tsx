import { CloudSun, Moon, Sun } from "lucide-react";

import { DAY_SEGMENT_LABELS, type DaySegment } from "@/lib/day-segments";
import { cn } from "@/lib/utils";

// TASK 93 — skupna glava segmenta dneva (Jutro / Popoldan / Večer) za VSE
// površine načrta: podrobni pogled plannerja, TripTimeline in SharedTrip.
// Vizual IDENTIČEN UI sprint različici (črtkani črti + ikona + oznaka) —
// komponenta samo odstranjuje duplikat, ne spreminja izgleda.

const SEGMENT_ICONS: Record<DaySegment, typeof Sun> = {
  morning: Sun,
  afternoon: CloudSun,
  evening: Moon,
};

interface DaySegmentHeaderProps {
  segment: DaySegment;
  lang: "sl" | "en";
  className?: string;
}

export function DaySegmentHeader({ segment, lang, className }: DaySegmentHeaderProps) {
  const Icon = SEGMENT_ICONS[segment];
  return (
    <div
      className={cn("flex items-center gap-2 py-1", className)}
      role="presentation"
    >
      <span className="h-px flex-1 border-t border-border/70" aria-hidden="true" />
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {DAY_SEGMENT_LABELS[segment][lang]}
      </span>
      <span className="h-px flex-1 border-t border-border/70" aria-hidden="true" />
    </div>
  );
}
