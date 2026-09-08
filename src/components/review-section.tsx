"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { Loader2, MessageSquareQuote, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

// ============================================================================
// REVIEW SECTION — UGC mnenja obiskovalcev (social proof)
// ============================================================================
//
// Prikaz + objava uporabških mnenj za izdelek ALI izkušnjo tržnice.
// NAMENOMA ločeno od demo rating/reviewCount (CSV seed) — povprečje se
// izračuna iz UGC vrstic, ki jih prinese GET /api/reviews.
//
// Props (natanko en od obeh):
//   productId     — prikaz v ProductModal
//   experienceId  — prikaz v ExperienceModal
//   title         — opcijski naslov sekcije (privzeto "Mnenja obiskovalcev")
// ============================================================================

interface ReviewSectionProps {
  productId?: string;
  experienceId?: string;
  title?: string;
}

interface ReviewItem {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

interface ReviewsResponse {
  reviews?: ReviewItem[];
  error?: string;
}

interface ReviewPostResponse {
  success?: boolean;
  review?: ReviewItem;
  error?: string;
}

/** Validacijska meja — ZRCALI strežnik (api/reviews). */
const AUTHOR_MIN = 2;
const AUTHOR_MAX = 60;
const COMMENT_MIN = 10;
const COMMENT_MAX = 1000;

/** Slovenski zapis povprečja: "4,6". */
function formatAverage(avg: number): string {
  return avg.toLocaleString("sl-SI", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** ISO datum → "5. september 2026" (sl-SI). */
function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("sl-SI", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Zvezdice (samo za prikaz) — polnjene amber-400 do `rating`. */
function StarRow({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      className={`flex items-center gap-0.5 ${className ?? ""}`}
      role="img"
      aria-label={`Ocena ${rating} od 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={`size-3.5 ${
            n <= rating ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/30"
          }`}
        />
      ))}
    </span>
  );
}

export function ReviewSection({
  productId,
  experienceId,
  title = "Mnenja obiskovalcev",
}: ReviewSectionProps) {
  const { toast } = useToast();
  const uid = useId();

  const targetId = productId ?? experienceId;
  const targetParam = productId ? "productId" : "experienceId";

  // Seznam mnenj (najnovejša prva)
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  // Initial loading=true ko imaš target → ni utripa praznega stanja pred fetch
  const [loading, setLoading] = useState(Boolean(targetId));
  const [fetchError, setFetchError] = useState(false);

  // Forma
  const [formOpen, setFormOpen] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch GET ob mountu — samo ko velja natanko en ID
  const fetchReviews = useCallback(async (id: string, param: string) => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetch(
        `/api/reviews?${param}=${encodeURIComponent(id)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Napaka pri pridobivanju mnenj");
      const data: ReviewsResponse = await res.json();
      setReviews(data.reviews ?? []);
    } catch {
      // Tiho — seznam skrijemo (mnenja so "nice to have")
      setFetchError(true);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (targetId) {
      fetchReviews(targetId, targetParam);
    } else {
      setReviews([]);
      setFetchError(false);
    }
    // Reset forme ob zamenjavi entitete (nov ključ = nov fetch)
    setFormOpen(false);
    setAuthorName("");
    setRating(0);
    setHoverRating(0);
    setComment("");
    setFormError(null);
  }, [targetId]);

  // Brez ID-ja (ali oba) — ne riši ničesar
  if (!targetId || (productId && experienceId)) return null;

  // Povprečje UGC (iz nabora, ki ga ima klient)
  const ugcCount = reviews.length;
  const ugcAverage =
    ugcCount > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / ugcCount
      : 0;

  /** Client validacija — zrcali strežnik (enaka sporočila). */
  const validateForm = (): string | null => {
    const name = authorName.trim();
    if (name.length < AUTHOR_MIN || name.length > AUTHOR_MAX) {
      return "Ime mora imeti 2–60 znakov";
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return "Izberite oceno od 1 do 5";
    }
    const text = comment.trim();
    if (text.length < COMMENT_MIN || text.length > COMMENT_MAX) {
      return `Mnenje mora imeti ${COMMENT_MIN}–${COMMENT_MAX} znakov`;
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    const localError = validateForm();
    if (localError) {
      setFormError(localError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [targetParam]: targetId,
          authorName: authorName.trim(),
          rating,
          comment: comment.trim(),
        }),
      });
      const data: ReviewPostResponse = await res.json().catch(() => ({}));

      if (!res.ok || !data.success || !data.review) {
        setFormError(data.error ?? "Mnenja trenutno ni bilo mogoče objaviti");
        return;
      }

      // Prepend + počisti formo
      setReviews((prev) => [data.review as ReviewItem, ...prev]);
      setAuthorName("");
      setRating(0);
      setHoverRating(0);
      setComment("");
      setFormOpen(false);
      toast({
        title: "Mnenje objavljeno",
        description: "Hvala, da delite svojo izkušnjo z drugimi obiskovalci.",
      });
    } catch {
      setFormError("Mnenja ni bilo mogoče poslati — preverite povezavo");
    } finally {
      setSubmitting(false);
    }
  };

  const displayRating = hoverRating || rating;

  return (
    <section aria-label={title}>
      {/* Header: povprečje UGC (ločeno od demo ratinga izdelka) */}
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <MessageSquareQuote className="size-4 text-primary" aria-hidden="true" />
        {title}
        {ugcCount > 0 ? (
          <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
            <Star
              className="size-3.5 fill-amber-400 text-amber-400"
              aria-hidden="true"
            />
            <span className="tabular-nums">{formatAverage(ugcAverage)}</span>
            <span>({ugcCount})</span>
          </span>
        ) : null}
        {ugcCount > 0 ? (
          <span className="ml-auto hidden text-[10px] uppercase tracking-wide text-muted-foreground/70 sm:inline">
            Mnenja obiskovalcev
          </span>
        ) : null}
      </h3>

      {/* Loading — skeleton */}
      {loading ? (
        <div className="mt-3 space-y-3" aria-label="Nalaganje mnenj">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : null}

      {/* Seznam mnenj */}
      {!loading && !fetchError && ugcCount > 0 ? (
        <ul className="mt-3 max-h-96 space-y-3 overflow-y-auto scroll-area-custom pr-1">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-border/60 bg-muted/30 p-3"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                >
                  {r.authorName.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {r.authorName}
                  </p>
                  <div className="flex items-center gap-2">
                    <StarRow rating={r.rating} />
                    <time
                      dateTime={r.createdAt}
                      className="text-[11px] text-muted-foreground"
                    >
                      {formatReviewDate(r.createdAt)}
                    </time>
                  </div>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                {r.comment}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Prazen state (fetch uspešen, ni še mnenj) */}
      {!loading && !fetchError && ugcCount === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
          Prvi podaj svoje mnenje — tvoja izkušnja pomaga drugim obiskovalcem
          pri odločitvi.
        </p>
      ) : null}

      {/* Gumb za odpiranje forme (če zaprta) */}
      {!formOpen ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 gap-2"
          onClick={() => setFormOpen(true)}
        >
          <MessageSquareQuote className="size-4" aria-hidden="true" />
          {ugcCount === 0 && !loading ? "Napiši prvo mnenje" : "Napiši mnenje"}
        </Button>
      ) : null}

      {/* Forma — Napiši mnenje */}
      {formOpen ? (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-3 space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4"
          aria-label="Obrazec za novo mnenje"
        >
          {/* Ime */}
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-author`}>Ime</Label>
            <Input
              id={`${uid}-author`}
              type="text"
              autoComplete="name"
              maxLength={AUTHOR_MAX}
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              disabled={submitting}
              placeholder="npr. Ana Novak"
              aria-describedby={`${uid}-author-hint`}
            />
            <p
              id={`${uid}-author-hint`}
              className="text-[11px] text-muted-foreground"
            >
              2–60 znakov. Ime bo objavljeno ob mnenju.
            </p>
          </div>

          {/* Ocena — interaktivne zvezdice */}
          <div className="space-y-1.5">
            <span id={`${uid}-rating-label`} className="text-sm font-medium">
              Ocena
            </span>
            <div
              role="radiogroup"
              aria-labelledby={`${uid}-rating-label`}
              className="flex items-center gap-1"
              onMouseLeave={() => setHoverRating(0)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} ${n === 1 ? "zvezdica" : "zvezdice"}`}
                  disabled={submitting}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHoverRating(n)}
                  onFocus={() => setHoverRating(n)}
                  onBlur={() => setHoverRating(0)}
                  className="rounded-md p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <Star
                    aria-hidden="true"
                    className={`size-6 ${
                      n <= displayRating
                        ? "fill-amber-400 text-amber-400"
                        : "fill-muted text-muted-foreground/40"
                    }`}
                  />
                </button>
              ))}
              <span
                className="ml-2 text-xs text-muted-foreground"
                aria-live="polite"
              >
                {rating > 0 ? `${rating} / 5` : "Izberi oceno"}
              </span>
            </div>
          </div>

          {/* Mnenje */}
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-comment`}>Tvoje mnenje</Label>
            <Textarea
              id={`${uid}-comment`}
              rows={4}
              maxLength={COMMENT_MAX}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={submitting}
              placeholder="Kaj ti je bilo všeč? Ali bi priporočil drugim?"
              aria-describedby={`${uid}-comment-hint`}
            />
            <p
              id={`${uid}-comment-hint`}
              className="text-[11px] text-muted-foreground"
            >
              10–1000 znakov ({comment.trim().length} / {COMMENT_MAX})
            </p>
          </div>

          {/* Napaka — inline, slovensko (iz strežnika ali client validacije) */}
          {formError ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          ) : null}

          {/* Akcije */}
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={submitting}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Star className="size-4" aria-hidden="true" />
              )}
              {submitting ? "Objavljam…" : "Objavi mnenje"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFormOpen(false);
                setFormError(null);
              }}
              disabled={submitting}
            >
              Prekliči
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

export default ReviewSection;
