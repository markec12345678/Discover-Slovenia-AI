"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import {
  Bot,
  Database,
  Loader2,
  MapPin,
  MessageCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { trackFunnel } from "@/lib/funnel";

// ============================================================================
// ASK LOCAL — "Vprašaj lokalca" (homepage)
// ============================================================================
//
// Grounded AI Q&A: obiskovalec zastavi vprašanje, AI "lokalnež" odgovori
// SAMO na podlagi baze platforme (destinacije, lokali, izkušnje, izdelki,
// dogodki) — to gradi obljubo "zero hallucination".
//
// Transparentnost: vsak odgovor je vidno označen — "Grounded AI" ali
// "Brez povezave z AI — izključno iz baze" (iskrenost namesto pretvarjanja).
//
// Vprašanja + odgovori se shranjujejo javno (POST /api/ask-local) —
// nedavna vprašanja pod formo so social proof + vsebinski SEO material.
// ============================================================================

/** Validacijske meje — ZRCALI strežnik (api/ask-local). */
const QUESTION_MIN = 10;
const QUESTION_MAX = 500;
const AUTHOR_MIN = 2;
const AUTHOR_MAX = 40;

/** Koliko nedavnih javnih vprašanj pokažemo. */
const RECENT_TAKE = 8;

/** Vrednost Select-a za "brez destinacije" (splošno vprašanje). */
const ALL_VALUE = "all";

/** Nad tem številom znakov odgovor dobri gumb "Pokaži več". */
const EXPAND_THRESHOLD = 240;

interface LocalQuestionItem {
  id: string;
  question: string;
  answer: string;
  answerSource: string;
  destinationName: string | null;
  authorName: string | null;
  answeredAt: string;
}

interface AskLocalResponse {
  success?: boolean;
  question?: LocalQuestionItem;
  error?: string;
}

interface RecentResponse {
  questions?: LocalQuestionItem[];
  error?: string;
}

/**
 * Relativni čas v slovenščini ("pred 3 dnevi", "pred 2 mesecema") —
 * isti vzorec kot community-trips (Intl.RelativeTimeFormat("sl")).
 */
function relativniCas(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const rtf = new Intl.RelativeTimeFormat("sl", { numeric: "auto" });
  const sekunde = (d.getTime() - Date.now()) / 1000; // negativno = preteklost
  const abs = Math.abs(sekunde);

  if (abs < 60) return rtf.format(Math.round(sekunde), "second");
  if (abs < 3_600) return rtf.format(Math.round(sekunde / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(sekunde / 3_600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(sekunde / 86_400), "day");
  if (abs < 86_400 * 365)
    return rtf.format(Math.round(sekunde / (86_400 * 30)), "month");
  return rtf.format(Math.round(sekunde / (86_400 * 365)), "year");
}

export function AskLocal() {
  const uid = useId();

  // Forma
  const [destination, setDestination] = useState<string>(ALL_VALUE);
  const [question, setQuestion] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Odgovor (izstopajoča kartica) — null = forma
  const [result, setResult] = useState<LocalQuestionItem | null>(null);

  // Nedavna javna vprašanja (social proof)
  const [recent, setRecent] = useState<LocalQuestionItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  // Fetch GET ob mountu — social proof seznam (cache no-store)
  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/ask-local", { cache: "no-store" });
      if (!res.ok) throw new Error("Napaka pri pridobivanju vprašanj");
      const data: RecentResponse = await res.json();
      setRecent((data.questions ?? []).slice(0, RECENT_TAKE));
    } catch {
      // Tiho — social proof je "nice to have", ne blokiraj sekcije
      setRecent([]);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  /** Client validacija — zrcali strežnik (enaka sporočila). */
  const validateForm = (): string | null => {
    const q = question.trim();
    if (q.length < QUESTION_MIN || q.length > QUESTION_MAX) {
      return `Vprašanje mora imeti ${QUESTION_MIN}–${QUESTION_MAX} znakov`;
    }
    const name = authorName.trim();
    if (name && (name.length < AUTHOR_MIN || name.length > AUTHOR_MAX)) {
      return `Ime mora imeti ${AUTHOR_MIN}–${AUTHOR_MAX} znakov`;
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
      const res = await fetch("/api/ask-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          ...(destination !== ALL_VALUE ? { destinationName: destination } : {}),
          ...(authorName.trim() ? { authorName: authorName.trim() } : {}),
        }),
      });
      const data: AskLocalResponse = await res.json().catch(() => ({}));

      if (!res.ok || !data.success || !data.question) {
        setFormError(data.error ?? "Odgovora ni bilo mogoče pripraviti");
        return;
      }

      // Uspeh — pokaži odgovor, izmeri funnel, javno objavo pripni
      // na začetek seznama nedavnih (obiskovalec vidi, da je objavljeno)
      setResult(data.question);
      trackFunnel("asked_local");
      setRecent((prev) => [data.question as LocalQuestionItem, ...prev].slice(0, RECENT_TAKE));
    } catch {
      setFormError("Vprašanja ni bilo mogoče poslati — preverite povezavo");
    } finally {
      setSubmitting(false);
    }
  };

  /** Reset — "Novo vprašanje". */
  const handleReset = () => {
    setResult(null);
    setQuestion("");
    setAuthorName("");
    setDestination(ALL_VALUE);
    setFormError(null);
  };

  return (
    <section
      id="vprasi-lokalca"
      className="scroll-mt-20 py-16 sm:py-20"
      aria-labelledby="vprasi-lokalca-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Glava sekcije */}
        <div className="mx-auto max-w-2xl text-center">
          <Badge
            variant="outline"
            className="mb-3 border-primary/30 text-primary"
          >
            <MessageCircle className="size-3" aria-hidden="true" />
            AI lokalna znanja
          </Badge>
          <h2
            id="vprasi-lokalca-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Vprašaj lokalca
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Odgovori temeljijo na naši bazi realnih destinacij, lokalov in
            izkušenj — brez izmišljotin.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl">
          {/* Forma (ali odgovor, ko prispe) */}
          {result ? (
            <AnswerCard item={result} onReset={handleReset} />
          ) : (
            <Card className="gap-0 py-0">
              <CardContent className="p-4 sm:p-6">
                <form
                  onSubmit={handleSubmit}
                  noValidate
                  aria-label="Obrazec za vprašanje lokalcu"
                  className="space-y-4"
                >
                  {/* Destinacija + ime */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${uid}-destination`}>
                        Destinacija (neobvezno)
                      </Label>
                      <Select
                        value={destination}
                        onValueChange={setDestination}
                        disabled={submitting}
                      >
                        <SelectTrigger
                          id={`${uid}-destination`}
                          aria-label="Izberi destinacijo"
                          className="w-full"
                        >
                          <SelectValue placeholder="Vsa Slovenija" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL_VALUE}>Vsa Slovenija</SelectItem>
                          {DESTINATIONS.map((d) => (
                            <SelectItem key={d.id} value={d.name}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p
                        id={`${uid}-destination-hint`}
                        className="text-[11px] text-muted-foreground"
                      >
                        Zoži odgovor na en kot Slovenije.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`${uid}-author`}>Tvoje ime (neobvezno)</Label>
                      <Input
                        id={`${uid}-author`}
                        type="text"
                        autoComplete="name"
                        maxLength={AUTHOR_MAX}
                        value={authorName}
                        onChange={(e) => setAuthorName(e.target.value)}
                        disabled={submitting}
                        placeholder="npr. Ana"
                        aria-describedby={`${uid}-author-hint`}
                      />
                      <p
                        id={`${uid}-author-hint`}
                        className="text-[11px] text-muted-foreground"
                      >
                        {AUTHOR_MIN}–{AUTHOR_MAX} znakov. Ime bo objavljeno ob vprašanju.
                      </p>
                    </div>
                  </div>

                  {/* Vprašanje */}
                  <div className="space-y-1.5">
                    <Label htmlFor={`${uid}-question`}>Tvoje vprašanje</Label>
                    <Textarea
                      id={`${uid}-question`}
                      rows={3}
                      maxLength={QUESTION_MAX}
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      disabled={submitting}
                      placeholder="npr. Kam z otroki v deževni dan na Bledu?"
                      aria-describedby={`${uid}-question-hint`}
                    />
                    <p
                      id={`${uid}-question-hint`}
                      className="text-[11px] text-muted-foreground"
                    >
                      {QUESTION_MIN}–{QUESTION_MAX} znakov ({question.trim().length} / {QUESTION_MAX})
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

                  {/* Submit */}
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="min-h-11 w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
                  >
                    {submitting ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <MessageCircle className="size-4" aria-hidden="true" />
                    )}
                    {submitting ? "Lokalnež odgovarja …" : "Vprašaj"}
                  </Button>

                  {/* Status za bralnike zaslona */}
                  <p role="status" aria-live="polite" className="sr-only">
                    {submitting
                      ? "Pridobivam odgovor lokalca, prosimo počakajte."
                      : ""}
                  </p>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Nedavna javna vprašanja — social proof */}
        <div className="mx-auto mt-12 max-w-3xl">
          <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            <MessageCircle className="size-5 text-primary" aria-hidden="true" />
            Nedavno so vprašali
          </h3>

          {recentLoading ? (
            <div className="mt-4 space-y-3" aria-label="Nalaganje nedavnih vprašanj">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4"
                >
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          ) : null}

          {!recentLoading && recent.length > 0 ? (
            <ul className="mt-4 max-h-96 space-y-3 overflow-y-auto scroll-area-custom pr-1">
              {recent.map((q) => (
                <RecentQuestion key={q.id} item={q} />
              ))}
            </ul>
          ) : null}

          {!recentLoading && recent.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
              Bodi prvi, ki vpraša — tvoje vprašanje in odgovor bosta javno
              vidna in bosta drugim obiskovalcem v pomoč.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// ODGOVOR — izstopajoča kartica z transparentnostjo vira
// ============================================================================

function AnswerCard({
  item,
  onReset,
}: {
  item: LocalQuestionItem;
  onReset: () => void;
}) {
  const isFallback = item.answerSource === "fallback";

  return (
    <Card
      className="gap-0 border-primary/30 py-0 shadow-md"
      aria-label="Odgovor lokalca"
    >
      <CardContent className="p-4 sm:p-6">
        {/* Vprašanje (kontekst odgovora) */}
        <div className="rounded-lg bg-muted/50 p-3 sm:p-4">
          <p className="text-sm font-semibold leading-relaxed">
            „{item.question}“
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[item.authorName, item.destinationName, relativniCas(item.answeredAt)]
              .filter(Boolean)
              .join(" • ")}
          </p>
        </div>

        {/* Odgovor */}
        <div className="mt-4 flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <Bot className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">AI lokalnež</span>
              {isFallback ? (
                <Badge
                  variant="outline"
                  className="border-amber-300/60 text-amber-800 dark:border-amber-700/60 dark:text-amber-300"
                >
                  <Database className="size-3" aria-hidden="true" />
                  Brez povezave z AI — izključno iz baze
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-emerald-300/60 text-emerald-800 dark:border-emerald-700/60 dark:text-emerald-300"
                >
                  <Sparkles className="size-3" aria-hidden="true" />
                  Grounded AI
                </Badge>
              )}
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {item.answer}
            </p>
          </div>
        </div>

        {/* Nazaj na formo */}
        <div className="mt-5">
          <Button
            type="button"
            variant="outline"
            onClick={onReset}
            className="min-h-11 gap-2"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Novo vprašanje
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// NEDAVNO VPRAŠANJE — objavljeno Q&A (social proof)
// ============================================================================

function RecentQuestion({ item }: { item: LocalQuestionItem }) {
  const [expanded, setExpanded] = useState(false);
  const longAnswer = item.answer.length > EXPAND_THRESHOLD;
  const isFallback = item.answerSource === "fallback";

  return (
    <li className="rounded-lg border border-border/60 bg-muted/20 p-3 transition-colors hover:border-border sm:p-4">
      <p className="text-sm font-semibold leading-relaxed">{item.question}</p>

      <p
        className={`mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground/90 ${
          expanded || !longAnswer ? "" : "line-clamp-4"
        }`}
      >
        {item.answer}
      </p>

      {longAnswer ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          aria-expanded={expanded}
        >
          {expanded ? "Pokaži manj" : "Pokaži več"}
        </button>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        {item.authorName ? <span className="font-medium">{item.authorName}</span> : null}
        {item.destinationName ? (
          <Badge variant="secondary" className="font-medium">
            <MapPin className="size-3" aria-hidden="true" />
            {item.destinationName}
          </Badge>
        ) : null}
        {isFallback ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/80">
            <Database className="size-3" aria-hidden="true" />
            iz baze
          </span>
        ) : null}
        <span className="ml-auto">{relativniCas(item.answeredAt)}</span>
      </div>
    </li>
  );
}

export default AskLocal;
