"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bot, X } from "lucide-react";

/**
 * MT NOTICE (W1, Issue #15 V0 — 1.126.0): iskrena oznaka strojnega prevoda.
 *
 * Kanon platforme je PROVENANCE (plast resnice) — IT/DE prevodi v fazi 1
 * so STROJNI (LLM, iz slovenskega izvirnika) in čakajo človeško revizijo.
 * Uporabniku v italijanščini/nemščini to POŠTENO povemo (enkrat, odkljukljivo)
 * in navežemo na uveljavljena kanonična jezika (SL = izvirnik, EN = referenca).
 *
 * - Prikazuje se SAMO za locale "it"/"de" (na SL/EN ni prevoda — ni note).
 * - Lokalna odpoved (localStorage) — brez piškotkov/računa (isti kanon
 *   kot wishlist: stanje uporabnika ostaja pri uporabniku).
 * - Montiran v root layoutu: proxy guard zagotavlja, da locale it/de
 *   nastopi SAMO na IT/DE whitelistnih poteh (nikoli admin/owner/API).
 */
const STORAGE_KEY_PREFIX = "dsa-mt-notice-dismissed-";

export function MachineTranslationNotice() {
  const locale = useLocale() as string;
  const t = useTranslations("mtNotice");
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    if (locale !== "it" && locale !== "de") return;
    // Branje localStorage v async callbacku (isti vzorec kot beta-banner —
    // setState nikoli sinhrono v telesu effekta; hkrati ohranja hydration
    // konzistentnost: prvi render = null na strežniku IN klientu).
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        try {
          setDismissed(
            window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${locale}`) === "1"
          );
        } catch {
          // zasebni način brskalnika idr. — nota ostane (konzervativno)
          setDismissed(false);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (locale !== "it" && locale !== "de") return null;
  if (dismissed !== false) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${locale}`, "1");
    } catch {
      // neblokirajoče
    }
  };

  return (
    <div
      role="note"
      aria-label={t("title")}
      className="w-full border-b border-amber-200/60 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-2.5 px-4 py-2 text-sm sm:px-6">
        <Bot className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden="true" />
        <p className="min-w-0 flex-1 leading-snug">
          <span className="font-medium">{t("title")}</span>{" "}
          <span className="opacity-90">{t("body")}</span>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("dismiss")}
          className="rounded-md p-1 transition-colors hover:bg-amber-100/70 dark:hover:bg-amber-900/40"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default MachineTranslationNotice;
