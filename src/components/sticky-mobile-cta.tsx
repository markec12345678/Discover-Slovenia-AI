"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles, Building2 } from "lucide-react";

/**
 * StickyMobileCTA — mobilna konverzijska vrstica.
 *
 * Raziskava P4-5 (data-backed UX pattern): sticky CTA bar, ki se
 * prikaže ŠELE po odscrollu preko heroja (in izgine, ko se uporabnik
 * vrne na vrh) — thumb-friendly, vedno viden primarni CTA.
 *
 * - Vidna samo na mobilnem (< sm), kjer je največji drop-off
 * - Postavi data-sticky-cta na <body> → chat FAB se dvigne (globals.css)
 * - Safe-area inset za iPhone
 */
export function StickyMobileCTA() {
  const t = useTranslations("nav");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Pojav po prečku heroja (~85 % višine zaslona), izgine na vrhu
    const threshold = Math.max(window.innerHeight * 0.85, 420);
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const show = window.scrollY > threshold;
        setVisible((prev) => (prev === show ? prev : show));
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.dataset.stickyCta = visible ? "true" : "false";
    return () => {
      delete document.body.dataset.stickyCta;
    };
  }, [visible]);

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-[70] sm:hidden ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0"
      } transition-transform duration-300 ease-out`}
    >
      <div className="border-t border-border/80 bg-background/92 px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] pt-2.5 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <Link
            href="#načrtuj"
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-md transition-transform active:scale-[0.98]"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {t("cta")}
          </Link>
          <Link
            href="/za-ponudnike"
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 text-sm font-semibold text-primary transition-transform active:scale-[0.98]"
          >
            <Building2 className="size-4" aria-hidden="true" />
            {t("providers")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default StickyMobileCTA;
