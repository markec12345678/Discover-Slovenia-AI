"use client";

import { useState } from "react";
import { Check, Code2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";
import { trackPlannerEvent } from "@/lib/planner-analytics";

// ============================================================================
// D7 (1.140.0, Issue #15 benchmark dodatek D/7): BLOG-EMBED KODA —
// „Vdelaj na svojo stran ali blog“ blok na javni strani deljene pote.
//
// Roam Aroundov „Embed on your site“ vzorec (WordPress + kopiraj kodo),
// BREZ zavrnjene token ekonomije („share and earn“ — benchmark D/7 prvi
// odstavek zavrnitve ostaja): vdelava je brezpogojna, kot ves naš /pot.
//
// Izpis je ČIST HTML iframe — nobenega skripta, ki bi ga moral blogger
// zaupati; vsebina v okviru se ob vsakem obisku bralca naloči SVEŽA z našega
// strežnika („živ“ embed — spremembe poti se pokažejo brez ponovnega
// lepljenja kode). Prikaz se vleče iz /pot/embed/[shareId] (CSP
// frame-ancestors * SAMO za to pot — ostala aplikacija ostaja XFO DENY).
//
// Varnost snippeta: title poti se HTML-escapa v atributski kontekst
// (escapeHtmlAttr) — pot z narekovaji v imenu NE prelomi atributa.
// ============================================================================

/** HTML attribute-context escape (title → varno v ", <, &). */
function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/>/g, "&gt;");
}

/**
 * ČIST graditelj snippet-a (izvožen za regresijske preizkuse):
 * <iframe src="{baseUrl}/pot/embed/{shareId}" title="…" …></iframe>
 *
 * - baseUrl prihaja s STREŽNIKA (currentBaseUrl — stran ga podá skozi;
 *   klient nikoli ne ugiba produkcijske domene iz window.location med SSR)
 * - trailing slash se pobriše (dvojne /
 * - loading="lazy" — embed ne zamudi nalaganja bloga
 * - referrerpolicy zrcali našo lastno politiko (strict-origin-when-cross-origin)
 * - height 720px: razumen privzetek (bloggerju je v UIPripomba povedano,
 *   kako ga prilagodi)
 */
export function buildEmbedSnippet(
  baseUrl: string,
  shareId: string,
  title: string
): string {
  const origin = baseUrl.replace(/\/+$/, "");
  const safeTitle = escapeHtmlAttr(title);
  return `<iframe src="${origin}/pot/embed/${shareId}" title="${safeTitle}" style="width:100%;height:720px;border:0" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

interface TripEmbedCodeProps {
  shareId: string;
  /** Ime poti (naslov iframe-a — a11y + deljilne kartice). */
  title: string;
  /** Absolutni origin (strežniški currentBaseUrl — npr. produkcijska domena). */
  baseUrl: string;
}

export function TripEmbedCode({
  shareId,
  title,
  baseUrl,
}: TripEmbedCodeProps) {
  const [copied, setCopied] = useState(false);
  const code = buildEmbedSnippet(baseUrl, shareId, title);

  async function onCopy() {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      // Telemetrija: interes za vdelavo (dogodek pošlje tudi path=/pot/… →
      // katera pota se vdelujejo, je merljivo; brez PII).
      trackPlannerEvent("trip_embed_copied");
      setTimeout(() => setCopied(false), 2000);
    }
    // Padec obeh mehanizmov: BREZ lažnega „Kopirano!“ — uporabnik lahko
    // kodo vedno ročno prepiše iz <pre> (izberljiv, selected-copy friendly).
  }

  return (
    <details
      className="w-full rounded-xl border border-border/70 bg-muted/20"
      aria-label="Vdelaj načrt na svojo stran"
    >
      <summary className="flex cursor-pointer list-none select-none items-center gap-2 px-4 py-3 text-sm font-medium text-foreground">
        <Code2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        Vdelaj na svojo stran ali blog
      </summary>

      <div className="border-t border-border/70 px-4 py-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Načrt v vdelavi ostane <strong className="font-semibold">živ</strong> —
          bralec bloga vedno vidi trenutno stanje s strežnika, spremembe poti
          se pokažejo brez ponovnega lepljenja kode. WordPress: blok{" "}
          <em>„Po meri HTML“</em>; višino prilagodiš s{" "}
          <code className="rounded bg-muted px-1 py-0.5">height</code> v{" "}
          <code className="rounded bg-muted px-1 py-0.5">style</code>.
        </p>

        <pre
          dir="ltr"
          className="mt-3 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground"
        >
          <code className="break-all">{code}</code>
        </pre>

        <div className="mt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void onCopy()}
            aria-label="Kopiraj kodo za vdelavo na svojo stran"
          >
            {copied ? (
              <>
                <Check className="size-4 mr-2 text-primary" aria-hidden="true" />
                Kopirano!
              </>
            ) : (
              <>
                <Copy className="size-4 mr-2" aria-hidden="true" />
                Kopiraj kodo za vdelavo
              </>
            )}
          </Button>
        </div>
      </div>
    </details>
  );
}
