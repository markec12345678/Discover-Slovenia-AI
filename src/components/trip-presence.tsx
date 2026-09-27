"use client";

/**
 * TripPresence — prisotnostni indikator na /pot (Issue #13 / P2-2 ·
 * UX-BENCHMARK 2026 §4 G2 — vzorec Wanderlog „uredi v živo").
 *
 * „✍ Anja ureja …" + „· 3 na strani" — ČISTO kozmetična plast nad CAS
 * (načrt Issue #13: brez prisotnosti vse deluje; izklopljen service →
 * komponenta rendera NIČ, brez napak).
 *
 * Iskrenost (kanon platforme):
 * - urejevalci so SAMO tisti z eksplicitnim editing signalom v zadnjih 6 s
 *   (ne ugibamo iz povezave);
 * - self-suppression: če sem EDINI urejevalec z istim prijavnim imenom,
 *   svojega chipa NE prikazujem (to sem jaz — drugi ga pa vidijo);
 * - en sam obiskovalec brez urejanja → NIČ (praznina je poštena).
 *
 * Editing signal: document-level „input" (bubbling) — SAMO dejanski
 * vnos (tipkanje/menjava vrednosti) šteje kot urejanje; klik ni urejanje.
 */

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "next-intl";
import { PencilLine, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTripPresence } from "@/hooks/use-trip-presence";

const L = {
  sl: {
    /** {name} ureja — 1 urejevalec z imenom. */
    editingOne: (name: string) => `${name} ureja …`,
    /** Anonimen urejevalec (brez prijave). */
    editingGuest: "Obiskovalec ureja …",
    /** {n} urejajo — 2+ urejevalcev. */
    editingMany: (n: number) =>
      n === 2 ? "2 osebi urejata …" : `${n} osebi urejajo …`,
    /** {n} prisotnih (vključno z mano) — prikažemo od 2+. */
    viewers: (n: number) => `${n} na strani`,
    ariaLabel: "Prisotnost ob poti",
  },
  en: {
    editingOne: (name: string) => `${name} is editing …`,
    editingGuest: "A guest is editing …",
    editingMany: (n: number) =>
      n === 2 ? "2 people are editing …" : `${n} people are editing …`,
    viewers: (n: number) => `${n} on this page`,
    ariaLabel: "Trip presence",
  },
} as const;

export function TripPresence({ shareId }: { shareId: string }) {
  const locale = useLocale();
  const t = L[locale === "en" ? "en" : "sl"];
  const { data: session } = useSession();
  const myName =
    typeof session?.user?.name === "string" && session.user.name.trim() !== ""
      ? session.user.name.trim().slice(0, 40)
      : null;

  const { viewers, editors, signalEditing } = useTripPresence(shareId, myName);

  // Editing signal iz DEJANSKIH vnosov (tipkanje) — bubbling listener na
  // dokumentu. Debounce živi v hooku (1 s).
  useEffect(() => {
    const onInput = () => signalEditing();
    document.addEventListener("input", onInput, { passive: true });
    return () => document.removeEventListener("input", onInput);
  }, [signalEditing]);

  // Self-suppression: če sem edini urejevalec z istim imenom → moj chip.
  const soleEditorIsMe =
    editors.length === 1 && myName !== null && editors[0]?.name === myName;
  const visibleEditors = soleEditorIsMe ? [] : editors;

  // Praznina je poštena: 1 obiskovalec, nihče ne ureja → NIČ.
  if (visibleEditors.length === 0 && viewers < 2) return null;

  const editorText =
    visibleEditors.length === 1
      ? visibleEditors[0]?.name
        ? t.editingOne(visibleEditors[0].name)
        : t.editingGuest
      : visibleEditors.length > 1
        ? t.editingMany(visibleEditors.length)
        : null;

  return (
    <div
      // Prisotnost je mehka, ne-urgentna informacija → polite (ne assertive).
      aria-live="polite"
      aria-label={t.ariaLabel}
      className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 pt-2 sm:px-6 lg:px-8"
    >
      {editorText ? (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1",
            "text-xs font-medium text-primary"
          )}
        >
          {/* Utrip samo brez vestibularnih omejitev (globals kanon). */}
          <PencilLine
            className="size-3.5 motion-safe:animate-pulse"
            aria-hidden="true"
          />
          {editorText}
        </span>
      ) : null}
      {viewers >= 2 ? (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 px-3 py-1",
            "text-xs font-medium text-muted-foreground"
          )}
        >
          <Users className="size-3.5" aria-hidden="true" />
          {t.viewers(viewers)}
        </span>
      ) : null}
    </div>
  );
}

export default TripPresence;
