"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import {
  BookOpen,
  CalendarDays,
  Loader2,
  Lightbulb,
  MessageSquareText,
  Pencil,
  Plus,
  Save,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getEditToken } from "@/lib/itinerary-share";
import { trackPlannerEvent } from "@/lib/planner-analytics";
// TASK 99-b (§18): skupni vir avtorskega imena (prej lokalna kopija ključa)
import { getAuthorName, saveAuthorName } from "@/lib/client-identity";

// ============================================================================
// TRIP GUIDE — avtorski vodnik na deljeni poti (F7 skupnostni vodniki)
// ============================================================================
//
// Odgovor na MindTrip "community guides (realni avtorji, »Saved by 23«)":
// vodnik NI promocijska vsebina, temveč KOREKTIVNA — avtor (lastnik poti)
// zapiše, zakaj je izbral to pot, dnevno vezane nasvete IZKUŠNJE in
// "kaj bi storil drugače". Zadnje je jedro našega poštenostnega
// diferencatorja: noben tekmec ne zbere popotnih popravkov načrta.
//
// Trije načini:
//  1. PRIKAZ (vodnik obstaja) — vsem obiskovalcem, tiskan (ni print-hide).
//  2. AVTORSTVO (lastnik) — ta brskalnik ima tajni editToken (localStorage,
//     iz odgovora shranjevanja) → gumb "Napiši/Uredi vodnik" + obrazec.
//  3. NIČ (ni vodnika, obiskovalec ni lastnik) — komponenta se skrije.
//
// Identiteta: editToken (anonimni lastnik) — enak vzorec zaupanja kot
// voterId/clientId pri glasovanju/všečkih (žeton nikoli ne zapusti
// brskalnika lastnika; strežnik primerja SHA-256 hash).
//
// Jeziki: UI oznake sledijo locale gledalca (useLocale — isti vzorec kot
// F6 komponente na /pot); VSEBINO vodnika piše avtor v svojem jeziku
// (lang polje, privzeto iz locale obrazca ob oddaji).
// ============================================================================

/** Veljaven vodnik, kot ga vrne strežnik (RSC initial ali PUT odgovor). */
export interface GuideData {
  authorName: string;
  intro: string;
  verdict: string | null;
  tips: { day: number | null; text: string }[];
  lang: string;
  updatedAt: string; // ISO
}

interface TripGuideProps {
  shareId: string;
  /** Število dni načrta (za izbiro dneva pri nasvetih) */
  dayCount: number;
  /** Vodnik prebran na strežniku (RSC) — takoj viden, tudi brez JS */
  initialGuide?: GuideData | null;
}

// Omejitve — IDENTIČNE strežniški validaciji v /api/trip-guide/route.ts
const AUTHOR_MAX = 60;
const INTRO_MIN = 2;
const INTRO_MAX = 500;
const VERDICT_MAX = 500;
const TIP_TEXT_MIN = 2;
const TIP_TEXT_MAX = 280;
const TIPS_MAX = 6;

/** Avtorsko ime — od TASK 99-b iz SKUPNEGA vira @/lib/client-identity
 *  (prej 5. lokalna kopija istega ključa — konsistentna identiteta obiskovalca
 *  med komentarji, dnevnikom, anketami in vodnikom). */

/** Vrstica obrazca za nasvet (prazna besedila so še neveljavna). */
interface TipDraft {
  /** null = splošen nasvet (ni vezan na dan) */
  day: number | null;
  text: string;
}

function emptyTip(): TipDraft {
  return { day: null, text: "" };
}

/** Relativni čas (kompatibilen s community-trips vzorcem). */
function relativniCas(date: Date, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const sekunde = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(sekunde);
  if (abs < 60) return rtf.format(Math.round(sekunde), "second");
  if (abs < 3_600) return rtf.format(Math.round(sekunde / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(sekunde / 3_600), "hour");
  if (abs < 86_400 * 30)
    return rtf.format(Math.round(sekunde / 86_400), "day");
  if (abs < 86_400 * 365)
    return rtf.format(Math.round(sekunde / (86_400 * 30)), "month");
  return rtf.format(Math.round(sekunde / (86_400 * 365)), "year");
}

// === Besedila (SL privzeto, EN po locale gledalca) ===
// ISSUE #24 Sklop 1 (1.164.0): L-vzorec {sl,en} razširjen na celo komponento —
// prej že dvojezično (isEn ternariji v useMemo L), zdaj kanonska oblika
// L = { sl, en } po TripPresence (isti kanon kot ostale /pot komponente).
const L = {
  sl: {
    badge: "Vodnik",
    title: "Vodnik avtorja poti",
    authorLabel: "Avtor",
    updated: "posodobljen",
    tipsHeading: "Avtorjevi nasveti",
    verdictHeading: "Kaj bi storil drugače",
    generalTip: "Splošno",
    dayLabel: "Dan",
    editButton: "Uredi vodnik",
    // Lastniški CTA (ni vodnika)
    ctaTitle: "To pot si ustvaril ti — napiši vodnik",
    ctaDescription:
      "Povej drugim, zakaj ta pot, svoje nasvete iz terena in kaj bi storil drugače. Iskrenost pomaga bolj kot popolnost.",
    ctaButton: "Napiši vodnik",
    // Obrazec
    formTitleNew: "Napiši vodnik",
    formTitleEdit: "Uredi vodnik",
    formDescription: "Tvoj vodnik bo viden vsem, ki odprejo to povezavo.",
    nameLabel: "Tvoje ime",
    namePlaceholder: "npr. Ana",
    introLabel: "Zakaj ta pot",
    introPlaceholder: "npr. Hoteli smo jezera in lahke pohode z otroki…",
    tipsLabel: "Nasveti (1–6)",
    tipPlaceholder: "npr. Vintgar pridi do 9. ure — vrsta se zavleče",
    addTip: "Dodaj nasvet",
    verdictLabel: "Kaj bi storil drugače (neobvezno)",
    verdictPlaceholder: "npr. Drugi postankov dneva 3 bi izpustil — preveč vožnje",
    saveButton: "Objavi vodnik",
    savingButton: "Objavljam…",
    cancelButton: "Prekliči",
    charCount: (n: number, max: number) => `${n}/${max}`,
    removeTipAria: "Odstrani nasvet",
    optionalBadge: "neobvezno",
    daySelectAria: "Kateri dan",
    // Validacija + toasti (prej isEn ternariji znotraj validate/submit)
    vName: () => `Ime mora imeti 1–${AUTHOR_MAX} znakov.`,
    vIntro: () => `Uvod mora imeti ${INTRO_MIN}–${INTRO_MAX} znakov.`,
    vTipRequired: "Dodaj vsaj en nasvet.",
    vTipLength: () => `Vsak nasvet mora imeti ${TIP_TEXT_MIN}–${TIP_TEXT_MAX} znakov.`,
    vVerdict: () => `»Kaj bi storil drugače« je omejen na ${VERDICT_MAX} znakov.`,
    errFormTitle: "Preveri obrazec",
    errTokenTitle: "Manjka avtorski žeton",
    errTokenDesc: "Povezavo odpri v brskalniku, kjer si pot shranil.",
    errSaveTitle: "Vodnika ni bilo mogoče shraniti",
    errSaveDesc: "Poskusi znova.",
    errNetworkDesc: "Preveri povezavo.",
    okTitle: "Vodnik objavljen",
    okDesc: "Videl ga bo vsak, ki odpre to povezavo.",
  },
  en: {
    badge: "Guide",
    title: "Guide by the author",
    authorLabel: "By",
    updated: "updated",
    tipsHeading: "Author's tips",
    verdictHeading: "What I'd do differently",
    generalTip: "General",
    dayLabel: "Day",
    editButton: "Edit guide",
    // Lastniški CTA (ni vodnika)
    ctaTitle: "You created this trip — write a guide",
    ctaDescription:
      "Tell others why this route, your tips from the field, and what you'd do differently. Honesty helps more than perfection.",
    ctaButton: "Write a guide",
    // Obrazec
    formTitleNew: "Write a guide",
    formTitleEdit: "Edit guide",
    formDescription: "Your guide is shown to everyone who opens this link.",
    nameLabel: "Your name",
    namePlaceholder: "e.g. Ana",
    introLabel: "Why this route",
    introPlaceholder: "e.g. We wanted lakes and easy hikes with kids…",
    tipsLabel: "Tips (1–6)",
    tipPlaceholder: "e.g. Arrive at Vintgar before 9 AM — queue gets long",
    addTip: "Add a tip",
    verdictLabel: "What I'd do differently (optional)",
    verdictPlaceholder: "e.g. I'd skip day 3's second stop — too much driving",
    saveButton: "Publish guide",
    savingButton: "Publishing…",
    cancelButton: "Cancel",
    charCount: (n: number, max: number) => `${n}/${max}`,
    removeTipAria: "Remove tip",
    optionalBadge: "optional",
    daySelectAria: "Which day",
    vName: () => `Name must be 1–${AUTHOR_MAX} characters.`,
    vIntro: () => `Intro must be ${INTRO_MIN}–${INTRO_MAX} characters.`,
    vTipRequired: "Add at least one tip.",
    vTipLength: () => `Each tip must be ${TIP_TEXT_MIN}–${TIP_TEXT_MAX} characters.`,
    vVerdict: () => `“What I'd do differently” is limited to ${VERDICT_MAX} characters.`,
    errFormTitle: "Check the form",
    errTokenTitle: "Missing author token",
    errTokenDesc: "Open this link in the browser where you saved the trip.",
    errSaveTitle: "Guide could not be saved",
    errSaveDesc: "Try again.",
    errNetworkDesc: "Check your connection.",
    okTitle: "Guide published",
    okDesc: "Everyone who opens this link will see it.",
  },
} as const;

export function TripGuide({ shareId, dayCount, initialGuide }: TripGuideProps) {
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const t = L[lang];
  const { toast } = useToast();

  const days = Math.max(1, Math.min(dayCount, 14));

  // === Stanje ===
  const [guide, setGuide] = useState<GuideData | null>(initialGuide ?? null);
  // Lastništvo (editToken v localStorage tega brskalnika) — napačno na
  // strežniku/prvem paintu (SSR ne ve za localStorage) → CTA se pojavi
  // šele po hidraciji; prikaz vodnika pa deluje takoj (initialGuide).
  const [isOwner, setIsOwner] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Obrazec (izpolnjen ob odprtju urejanja)
  const [authorName, setAuthorName] = useState("");
  const [intro, setIntro] = useState("");
  const [verdict, setVerdict] = useState("");
  const [tips, setTips] = useState<TipDraft[]>([emptyTip()]);

  // Mount: preveri lastništvo (žeton) + predizpolni avtorsko ime iz
  // komentarjev (konsistentna identiteta obiskovalca)
  useEffect(() => {
    setIsOwner(Boolean(getEditToken(shareId)));
    const savedName = getAuthorName();
    if (savedName) setAuthorName(savedName);
  }, [shareId]);

  /** Odpri obrazec (nov ali urejanje obstoječega vodnika). */
  const openForm = () => {
    if (guide) {
      setAuthorName(guide.authorName);
      setIntro(guide.intro);
      setVerdict(guide.verdict ?? "");
      setTips(
        guide.tips.length > 0
          ? guide.tips.map((t) => ({ day: t.day, text: t.text }))
          : [emptyTip()]
      );
    } else if (!authorName) {
      // frisch obrazec — en prazen nasvet
      setIntro("");
      setVerdict("");
      setTips([emptyTip()]);
    }
    setEditing(true);
  };

  const updateTip = (index: number, patch: Partial<TipDraft>) => {
    setTips((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t))
    );
  };

  const removeTip = (index: number) => {
    setTips((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : prev
    );
  };

  const addTip = () => {
    setTips((prev) =>
      prev.length < TIPS_MAX ? [...prev, emptyTip()] : prev
    );
  };

  /** Lokalna validacija pred oddajo (strežnik validira enako). */
  function validate(): string | null {
    const name = authorName.trim();
    if (name.length < 1 || name.length > AUTHOR_MAX)
      return t.vName();
    const introTrim = intro.trim();
    if (introTrim.length < INTRO_MIN || introTrim.length > INTRO_MAX)
      return t.vIntro();
    const valid = tips.filter((tip) => tip.text.trim().length > 0);
    if (valid.length < 1)
      return t.vTipRequired;
    for (const tip of valid) {
      const len = tip.text.trim().length;
      if (len < TIP_TEXT_MIN || len > TIP_TEXT_MAX)
        return t.vTipLength();
    }
    if (verdict.trim().length > VERDICT_MAX)
      return t.vVerdict();
    return null;
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;

    const localError = validate();
    if (localError) {
      toast({
        title: t.errFormTitle,
        description: localError,
        variant: "destructive",
      });
      return;
    }

    const editToken = getEditToken(shareId);
    if (!editToken) {
      toast({
        title: t.errTokenTitle,
        description: t.errTokenDesc,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/trip-guide", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareId,
          editToken,
          authorName: authorName.trim(),
          intro: intro.trim(),
          verdict: verdict.trim() || null,
          tips: tips
            .filter((t) => t.text.trim().length > 0)
            .map((t) => ({ day: t.day, text: t.text.trim() })),
          lang,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        guide?: GuideData;
        error?: string;
      } | null;

      if (!res.ok || !data?.success || !data.guide) {
        toast({
          title: t.errSaveTitle,
          description: data?.error ?? t.errSaveDesc,
          variant: "destructive",
        });
        return;
      }

      // Uspeh — preklopi v prikaz + shrani avtorsko ime za naslednjič
      const wasNew = !guide;
      setGuide(data.guide);
      setEditing(false);
      saveAuthorName(authorName.trim());
      trackPlannerEvent("guide_saved", {
        tips_count: data.guide.tips.length,
        has_verdict: Boolean(data.guide.verdict),
        day_count: days,
        lang: data.guide.lang,
        is_new: wasNew,
      });
      toast({
        title: t.okTitle,
        description: t.okDesc,
      });
    } catch {
      toast({
        title: t.errSaveTitle,
        description: t.errNetworkDesc,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // === Način 3: ni vodnika in ta brskalnik ni lastnik → nič ===
  if (!guide && !isOwner) return null;

  // === Način 2: lastniški CTA brez vodnika ===
  if (!guide && isOwner && !editing) {
    return (
      <Card className="border-dashed print:hidden">
        <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BookOpen className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold">{t.ctaTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.ctaDescription}
              </p>
            </div>
          </div>
          <Button onClick={openForm} className="shrink-0">
            <Pencil className="size-4" aria-hidden="true" />
            {t.ctaButton}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // === Način 1: prikaz vodnika ===
  if (guide && !editing) {
    const updated = new Date(guide.updatedAt);
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-primary/30 text-primary" variant="outline">
              <BookOpen className="size-3" aria-hidden="true" />
              {t.badge}
            </Badge>
            {guide.lang === "en" ? (
              <Badge variant="secondary">EN</Badge>
            ) : null}
          </div>
          <CardTitle className="text-lg leading-snug">{t.title}</CardTitle>
          <CardDescription>
            {t.authorLabel} <span className="font-medium text-foreground">{guide.authorName}</span>
            {" · "}
            {t.updated} {relativniCas(updated, locale)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Zakaj ta pot */}
          <p className="leading-relaxed text-foreground/90">{guide.intro}</p>

          {/* Avtorjevi nasveti */}
          {guide.tips.length > 0 ? (
            <div>
              <h4 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
                <MessageSquareText className="size-4 text-primary" aria-hidden="true" />
                {t.tipsHeading}
              </h4>
              <ul className="space-y-2">
                {guide.tips.map((tip, i) => (
                  <li
                    key={`${tip.day ?? "g"}-${i}`}
                    className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-start sm:gap-3"
                  >
                    {tip.day !== null ? (
                      <Badge
                        variant="secondary"
                        className="w-fit shrink-0 font-medium"
                      >
                        <CalendarDays className="size-3" aria-hidden="true" />
                        {t.dayLabel} {tip.day}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="w-fit shrink-0 text-muted-foreground"
                      >
                        {t.generalTip}
                      </Badge>
                    )}
                    <span className="text-sm leading-relaxed text-foreground/90">
                      {tip.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Kaj bi storil drugače — poštenostni diferencator */}
          {guide.verdict ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
              <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
                <Lightbulb className="size-4" aria-hidden="true" />
                {t.verdictHeading}
              </h4>
              <p className="text-sm italic leading-relaxed text-foreground/90">
                {guide.verdict}
              </p>
            </div>
          ) : null}
        </CardContent>
        {isOwner ? (
          <CardFooter className="print:hidden">
            <Button variant="outline" size="sm" onClick={openForm}>
              <Pencil className="size-4" aria-hidden="true" />
              {t.editButton}
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    );
  }

  // === Obrazec (nov ali urejanje) ===
  const introLen = intro.trim().length;
  const verdictLen = verdict.trim().length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg leading-snug">
          {guide ? t.formTitleEdit : t.formTitleNew}
        </CardTitle>
        <CardDescription>{t.formDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5" noValidate>
          {/* Avtorsko ime */}
          <div className="space-y-1.5">
            <label htmlFor="guide-author" className="text-sm font-medium">
              {t.nameLabel}
            </label>
            <Input
              id="guide-author"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder={t.namePlaceholder}
              maxLength={AUTHOR_MAX}
              autoComplete="name"
              required
            />
          </div>

          {/* Zakaj ta pot */}
          <div className="space-y-1.5">
            <label htmlFor="guide-intro" className="text-sm font-medium">
              {t.introLabel}
            </label>
            <Textarea
              id="guide-intro"
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder={t.introPlaceholder}
              rows={3}
              maxLength={INTRO_MAX}
              required
            />
            <p className="text-right text-xs text-muted-foreground">
              {t.charCount(introLen, INTRO_MAX)}
            </p>
          </div>

          {/* Nasveti */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t.tipsLabel}</span>
              {tips.length < TIPS_MAX ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTip}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {t.addTip}
                </Button>
              ) : null}
            </div>
            {tips.map((tip, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"
              >
                <div className="w-full sm:w-36 sm:shrink-0">
                  <Select
                    value={tip.day === null ? "none" : String(tip.day)}
                    onValueChange={(v) =>
                      updateTip(index, {
                        day: v === "none" ? null : Number(v),
                      })
                    }
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-label={t.daySelectAria}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t.generalTip}</SelectItem>
                      {Array.from({ length: days }, (_, i) => i + 1).map(
                        (d) => (
                          <SelectItem key={d} value={String(d)}>
                            {t.dayLabel} {d}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  value={tip.text}
                  onChange={(e) => updateTip(index, { text: e.target.value })}
                  placeholder={t.tipPlaceholder}
                  maxLength={TIP_TEXT_MAX}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTip(index)}
                  disabled={tips.length <= 1}
                  aria-label={t.removeTipAria}
                  className="shrink-0"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>

          {/* Kaj bi storil drugače */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label htmlFor="guide-verdict" className="text-sm font-medium">
                {t.verdictLabel}
              </label>
              <Badge variant="outline" className="text-muted-foreground">
                {t.optionalBadge}
              </Badge>
            </div>
            <Textarea
              id="guide-verdict"
              value={verdict}
              onChange={(e) => setVerdict(e.target.value)}
              placeholder={t.verdictPlaceholder}
              rows={2}
              maxLength={VERDICT_MAX}
            />
            <p className="text-right text-xs text-muted-foreground">
              {t.charCount(verdictLen, VERDICT_MAX)}
            </p>
          </div>

          {/* Oddaja */}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              {saving ? t.savingButton : t.saveButton}
            </Button>
            {guide ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                {t.cancelButton}
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default TripGuide;
