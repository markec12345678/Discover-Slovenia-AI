import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * VLM Verified Badge — trust signal da vse slike na platformi
 * so avtentično preverjene, ne generične stock fotografije.
 *
 * Prikazuje se na homepage in footer.
 */
export function VlmVerifiedBadge({ variant = "default" }: { variant?: "default" | "compact" }) {
  if (variant === "compact") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ShieldCheck className="size-3 text-emerald-600" />
        VLM Verified
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <ShieldCheck className="size-3.5" />
      <span>VLM Verified — vse slike so avtentično preverjene</span>
    </div>
  );
}
