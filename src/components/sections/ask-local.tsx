"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Bot,
  Clock,
  Database,
  Loader2,
  MapPin,
  MessageCircle,
  RotateCcw,
  Sparkles,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConsultationDialog } from "@/components/consultations/consultation-dialog";
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
// B2B flywheel: odgovori, ki citirajo partnerje, pod odgovorom prikažejo
// KLIKABILNE čipe priporočenih partnerjev (vodijo na things-to-do stran
// destinacije) — AI priporočila tako dobijo merljivo klik-pot, partnerjev
// zvezek ★ pa pove, kdo je premium (rahla prednost pri enakovrednih
// možnostih — razloženo v diskretni opombi pod čipi).
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

/** Koliko partner-čipov pokažemo pri nedavnih vprašanjih (kompaktno). */
const RECENT_PARTNER_CHIPS = 3;

/** Vrsta partnerja → berljiva oznaka (lokal, izkušnja, izdelek, dogodek). */
const KIND_LABEL: Record<string, string> = {
  lokal: "Lokal",
  izkušnja: "Izkušnja",
  izdelek: "Izdelek",
  dogodek: "Dogodek",
};

/** Partner, citiran v AI odgovoru (iz recommendedPartners JSON). */
interface RecommendedPartner {
  name: string;
  kind: string;
  category: string | null;
  destinationName: string | null;
  plan: string | null;
}

interface LocalQuestionItem {
  id: string;
  question: string;
  answer: string;
  answerSource: string;
  destinationName: string | null;
  authorName: string | null;
  answeredAt: string;
  recommendedPartners: RecommendedPartner[] | null;
}

interface AskLocalResponse {
  success?: boolean;
  question?: LocalQuestionItem;
  freeRemaining?: number;
  code?: string;
  error?: string;
}

interface RecentResponse {
  questions?: LocalQuestionItem[];
  freeRemaining?: number;
  error?: string;
}

/**
 * Povezava partner-čipa: destinacija → things-to-do stran (slug iz
 * slovenia-data), sicer (splošna vprašanja / neznana destinacija) →
 * domača stran (odgovor je bil splošen, nadaljnja raziskava pa gre od začetka).
 */
function partnerUrl(partner: RecommendedPartner): string {
  if (partner.destinationName) {
    const dest = DESTINATIONS.find(
      (d) => d.name === partner.destinationName
    );
    if (dest) return `/destinacija/${dest.slug}/things-to-do`;
  }
  return "/";
}

/** Ali je partner premium (plan premium/enterprise) → ★ oznaka na čipu. */
function isPremium(partner: RecommendedPartner): boolean {
  return partner.plan === "premium" || partner.plan === "enterprise";
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

  // Dnevna brezplačna meja (1/dan na obiskovalca — Faza 3b-2).
  // null = neznano še (nalaganje), 0 = za danes izkoriščeno.
  const [freeRemaining, setFreeRemaining] = useState<number | null>(null);

  // Konzultacijski čarovnik (brezplačna globja različica — model „ponudniki plačajo")
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultPrefillDest, setConsultPrefillDest] = useState<string | null>(
    null
  );
  const [consultPrefillQuestion, setConsultPrefillQuestion] = useState<
    string | null
  >(null);

  /** Odpre konzultacijski čarovnik s kontekstom (destinacija + vprašanje). */
  const openConsultation = (
    prefillDest: string | null,
    prefillQuestion: string | null
  ) => {
    setConsultPrefillDest(prefillDest);
    setConsultPrefillQuestion(prefillQuestion);
    setConsultOpen(true);
  };

  // Odgovor (izstopajoča kartica) — null = forma
  const [result, setResult] = useState<LocalQuestionItem | null>(null);

  // Nedavna javna vprašanja (social proof)
  const [recent, setRecent] = useState<LocalQuestionItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  // Fetch GET ob mountu — social proof seznam (cache no-store) + stanje
  // dnevne brezplačne meje za tega obiskovalca (honest UX)
  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/ask-local", { cache: "no-store" });
      if (!res.ok) throw new Error("Napaka pri pridobivanju vprašanj");
      const data: RecentResponse = await res.json();
      setRecent((data.questions ?? []).slice(0, RECENT_TAKE));
      if (typeof data.freeRemaining === "number") {
        setFreeRemaining(data.freeRemaining);
      }
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

      // Dnevna meja izčrpana → honest panel z vabilom na konzultacijo
      // (kodo strežnik pošlje izrecno, da UI loči mejo od drugih napak)
      if (res.status === 429 && data.code === "daily_free_limit") {
        setFreeRemaining(0);
        return;
      }

      if (!res.ok || !data.success || !data.question) {
        setFormError(data.error ?? "Odgovora ni bilo mogoče pripraviti");
        return;
      }

      // Uspeh — pokaži odgovor, izmeri funnel, javno objavo pripni
      // na začetek seznama nedavnih (obiskovalec vidi, da je objavljeno)
      setResult(data.question);
      trackFunnel("asked_local");
      if (typeof data.freeRemaining === "number") {
        setFreeRemaining(data.freeRemaining);
      }
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
            izkušenj — brez izmišljotin. Hitro vprašanje (1 na dan) in globja
            osebna konzultacija sta brezplačna.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl">
          {/* Forma / odgovor / dnevna meja */}
          {result ? (
            <AnswerCard
              item={result}
              onReset={handleReset}
              onConsult={() =>
                openConsultation(
                  result.destinationName,
                  result.question
                )
              }
            />
          ) : freeRemaining === 0 ? (
            <FreeLimitCard
              onConsult={() =>
                openConsultation(
                  destination !== ALL_VALUE ? destination : null,
                  question.trim() || null
                )
              }
            />
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

                  {/* Diskretna omemba globje različice — vedno vidna pod formo
                      (odkritje pred prvim vprašanjem; intencijski blok pride po
                      odgovoru) */}
                  <button
                    type="button"
                    onClick={() => openConsultation(null, null)}
                    className="w-full rounded-lg border border-dashed border-emerald-600/40 bg-emerald-50/50 px-3 py-2.5 text-left text-xs text-emerald-900 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                  >
                    <span className="font-semibold">
                      Potrebuješ več kot hiter odgovor?
                    </span>{" "}
                    Osebna konzultacija z lokalcem — celoten načrt po meri
                    (datumi, proračun, druščina), brezplačno.
                  </button>
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

      {/* Konzultacijski čarovnik (brezplačna globja različica — Faza 3c) */}
      <ConsultationDialog
        open={consultOpen}
        onOpenChange={setConsultOpen}
        prefillDestination={consultPrefillDest}
        prefillQuestion={consultPrefillQuestion}
      />
    </section>
  );
}

// ============================================================================
// DNEVNA MEJA — za danes izkoriščeno hitro vprašanje (1/dan)
// ============================================================================

function FreeLimitCard({ onConsult }: { onConsult: () => void }) {
  return (
    <Card className="gap-0 border-amber-300/50 py-0" aria-label="Dnevna meja brezplačnih vprašanj">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          >
            <Clock className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Za danes si že izkoristil hitro vprašanje
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Naslednje hitro vprašanje ti je na voljo jutri — meja je eno
              vprašanje dnevno, ker vsak odgovor piše AI, ki bere našo bazo.
              Globja osebna konzultacija pa je tu — prav tako brezplačna (do 3
              dnevno).
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={onConsult}
                className="min-h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Sparkles className="size-4" aria-hidden="true" />
                Osebna konzultacija — brezplačno
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Spodaj lahko še vedno bereš javna vprašanja drugih obiskovalcev.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// ODGOVOR — izstopajoča kartica z transparentnostjo vira
// ============================================================================

function AnswerCard({
  item,
  onReset,
  onConsult,
}: {
  item: LocalQuestionItem;
  onReset: () => void;
  /** Odpre konzultacijski čarovnik (intencijski blok po odgovoru). */
  onConsult: () => void;
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

            {/* Priporočeni partnerji — klikabilni čipi (B2B flywheel) */}
            {item.recommendedPartners && item.recommendedPartners.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Priporočeni partnerji
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.recommendedPartners.map((p) => (
                    <PartnerChip key={`${item.id}-${p.name}`} partner={p} />
                  ))}
                </div>
                {/* Transparentnost (EU princip odkrite označitve) */}
                <p className="mt-2.5 text-xs text-muted-foreground">
                  Oznaka ★ označuje premium partnerje — med enakovrednimi
                  možnostmi imajo rahlo prednost. Vsa priporočila so realni,
                  ocenjeni lokali iz naše baze.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Intencijski blok — točka najvišje konverzije: pravkar je dobil
            hiter odgovor, globjega pa želi takoj */}
        <div className="mt-4 rounded-lg border border-emerald-600/30 bg-emerald-50/60 p-3.5 dark:border-emerald-500/25 dark:bg-emerald-950/25">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            To je bil hiter odgovor.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-800/90 dark:text-emerald-200/90">
            Za popoln osebni načrt — prilagojen tvojim datumom, proračunu in
            družčini, z imeni, cenami in rezervacijskimi nasveti — priskrbi
            globokejšo konzultacijo z istim lokalcem. Brezplačno.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={onConsult}
            className="mt-2.5 min-h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Osebna konzultacija — brezplačno
          </Button>
        </div>

        {/* Nazaj na formo */}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={onReset}
            className="min-h-11 gap-2"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Novo vprašanje (jutri)
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

      {/* Partnerji, citirani v odgovoru — kompaktni čipi (max 3) */}
      {item.recommendedPartners && item.recommendedPartners.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.recommendedPartners.slice(0, RECENT_PARTNER_CHIPS).map((p) => (
            <Link
              key={`${item.id}-recent-${p.name}`}
              href={partnerUrl(p)}
              className="inline-flex min-h-6 items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2.5 py-0.5 text-xs font-medium text-foreground/80 transition hover:bg-accent hover:text-foreground"
            >
              {isPremium(p) ? (
                <Star
                  className="size-3 fill-emerald-500 text-emerald-500"
                  aria-hidden="true"
                />
              ) : null}
              {p.name}
            </Link>
          ))}
        </div>
      ) : null}
    </li>
  );
}

// ============================================================================
// PARTNER ČIP — klikabilen Link na things-to-do stran destinacije
// ============================================================================

function PartnerChip({ partner }: { partner: RecommendedPartner }) {
  const premium = isPremium(partner);

  return (
    <Link
      href={partnerUrl(partner)}
      title={premium ? "Premium partner" : undefined}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 dark:focus-visible:ring-offset-background"
      aria-label={`${partner.name} — ${KIND_LABEL[partner.kind] ?? partner.kind}${premium ? " (premium partner)" : ""}`}
    >
      {premium ? (
        <Star
          className="size-3.5 fill-emerald-500 text-emerald-500"
          aria-hidden="true"
        />
      ) : null}
      <span>{partner.name}</span>
      <span
        className={
          premium
            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
            : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        }
      >
        {KIND_LABEL[partner.kind] ?? partner.kind}
      </span>
    </Link>
  );
}

export default AskLocal;
