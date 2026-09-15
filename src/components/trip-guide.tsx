"use client";

import { useEffect, useMemo, useState } from "react";
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

/** localStorage ključ avtorskega imena — ENAK kot v trip-social (pripombe):
 *  identiteta obiskovalca je konsistentna med komentarji in vodnikom. */
const AUTHOR_NAME_STORAGE_KEY = "discoverslovenia_comment_name";

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

export function TripGuide({ shareId, dayCount, initialGuide }: TripGuideProps) {
  const locale = useLocale();
  const isEn = locale === "en";
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
    try {
      const savedName = window.localStorage.getItem(AUTHOR_NAME_STORAGE_KEY);
      if (savedName) setAuthorName(savedName);
    } catch {
      // zasebni način — brez predizpolnitve
    }
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
      return isEn
        ? `Name must be 1–${AUTHOR_MAX} characters.`
        : `Ime mora imeti 1–${AUTHOR_MAX} znakov.`;
    const introTrim = intro.trim();
    if (introTrim.length < INTRO_MIN || introTrim.length > INTRO_MAX)
      return isEn
        ? `Intro must be ${INTRO_MIN}–${INTRO_MAX} characters.`
        : `Uvod mora imeti ${INTRO_MIN}–${INTRO_MAX} znakov.`;
    const valid = tips.filter((t) => t.text.trim().length > 0);
    if (valid.length < 1)
      return isEn ? "Add at least one tip." : "Dodaj vsaj en nasvet.";
    for (const t of valid) {
      const len = t.text.trim().length;
      if (len < TIP_TEXT_MIN || len > TIP_TEXT_MAX)
        return isEn
          ? `Each tip must be ${TIP_TEXT_MIN}–${TIP_TEXT_MAX} characters.`
          : `Vsak nasvet mora imeti ${TIP_TEXT_MIN}–${TIP_TEXT_MAX} znakov.`;
    }
    if (verdict.trim().length > VERDICT_MAX)
      return isEn
        ? `“What I'd do differently” is limited to ${VERDICT_MAX} characters.`
        : `»Kaj bi storil drugače« je omejen na ${VERDICT_MAX} znakov.`;
    return null;
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;

    const localError = validate();
    if (localError) {
      toast({
        title: isEn ? "Check the form" : "Preveri obrazec",
        description: localError,
        variant: "destructive",
      });
      return;
    }

    const editToken = getEditToken(shareId);
    if (!editToken) {
      toast({
        title: isEn ? "Missing author token" : "Manjka avtorski žeton",
        description: isEn
          ? "Open this link in the browser where you saved the trip."
          : "Povezavo odpri v brskalniku, kjer si pot shranil.",
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
          lang: isEn ? "en" : "sl",
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        guide?: GuideData;
        error?: string;
      } | null;

      if (!res.ok || !data?.success || !data.guide) {
        toast({
          title: isEn
            ? "Guide could not be saved"
            : "Vodnika ni bilo mogoče shraniti",
          description: data?.error ?? (isEn ? "Try again." : "Poskusi znova."),
          variant: "destructive",
        });
        return;
      }

      // Uspeh — preklopi v prikaz + shrani avtorsko ime za naslednjič
      const wasNew = !guide;
      setGuide(data.guide);
      setEditing(false);
      try {
        window.localStorage.setItem(
          AUTHOR_NAME_STORAGE_KEY,
          authorName.trim()
        );
      } catch {
        // zasebni način — ime ne persistira
      }
      trackPlannerEvent("guide_saved", {
        tips_count: data.guide.tips.length,
        has_verdict: Boolean(data.guide.verdict),
        day_count: days,
        lang: data.guide.lang,
        is_new: wasNew,
      });
      toast({
        title: isEn ? "Guide published" : "Vodnik objavljen",
        description: isEn
          ? "Everyone who opens this link will see it."
          : "Videl ga bo vsak, ki odpre to povezavo.",
      });
    } catch {
      toast({
        title: isEn ? "Guide could not be saved" : "Vodnika ni bilo mogoče shraniti",
        description: isEn ? "Check your connection." : "Preveri povezavo.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // === Besedila (SL privzeto, EN po locale gledalca) ===
  const L = useMemo(
    () => ({
      badge: isEn ? "Guide" : "Vodnik",
      title: isEn ? "Guide by the author" : "Vodnik avtorja poti",
      authorLabel: isEn ? "By" : "Avtor",
      updated: isEn ? "updated" : "posodobljen",
      tipsHeading: isEn ? "Author's tips" : "Avtorjevi nasveti",
      verdictHeading: isEn ? "What I'd do differently" : "Kaj bi storil drugače",
      generalTip: isEn ? "General" : "Splošno",
      dayLabel: isEn ? "Day" : "Dan",
      editButton: isEn ? "Edit guide" : "Uredi vodnik",
      // Lastniški CTA (ni vodnika)
      ctaTitle: isEn
        ? "You created this trip — write a guide"
        : "To pot si ustvaril ti — napiši vodnik",
      ctaDescription: isEn
        ? "Tell others why this route, your tips from the field, and what you'd do differently. Honesty helps more than perfection."
        : "Povej drugim, zakaj ta pot, svoje nasvete iz terena in kaj bi storil drugače. Iskrenost pomaga bolj kot popolnost.",
      ctaButton: isEn ? "Write a guide" : "Napiši vodnik",
      // Obrazec
      formTitleNew: isEn ? "Write a guide" : "Napiši vodnik",
      formTitleEdit: isEn ? "Edit guide" : "Uredi vodnik",
      formDescription: isEn
        ? "Your guide is shown to everyone who opens this link."
        : "Tvoj vodnik bo viden vsem, ki odprejo to povezavo.",
      nameLabel: isEn ? "Your name" : "Tvoje ime",
      namePlaceholder: isEn ? "e.g. Ana" : "npr. Ana",
      introLabel: isEn ? "Why this route" : "Zakaj ta pot",
      introPlaceholder: isEn
        ? "e.g. We wanted lakes and easy hikes with kids…"
        : "npr. Hoteli smo jezera in lahke pohode z otroki…",
      tipsLabel: isEn ? "Tips (1–6)" : "Nasveti (1–6)",
      tipPlaceholder: isEn
        ? "e.g. Arrive at Vintgar before 9 AM — queue gets long"
        : "npr. Vintgar pridi do 9. ure — vrsta se zavleče",
      addTip: isEn ? "Add a tip" : "Dodaj nasvet",
      verdictLabel: isEn
        ? "What I'd do differently (optional)"
        : "Kaj bi storil drugače (neobvezno)",
      verdictPlaceholder: isEn
        ? "e.g. I'd skip day 3's second stop — too much driving"
        : "npr. Drugi postankov dneva 3 bi izpustil — preveč vožnje",
      saveButton: isEn ? "Publish guide" : "Objavi vodnik",
      savingButton: isEn ? "Publishing…" : "Objavljam…",
      cancelButton: isEn ? "Cancel" : "Prekliči",
      charCount: (n: number, max: number) => `${n}/${max}`,
      removeTipAria: isEn ? "Remove tip" : "Odstrani nasvet",
      optionalBadge: isEn ? "optional" : "neobvezno",
    }),
    [isEn]
  );

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
              <p className="font-semibold">{L.ctaTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {L.ctaDescription}
              </p>
            </div>
          </div>
          <Button onClick={openForm} className="shrink-0">
            <Pencil className="size-4" aria-hidden="true" />
            {L.ctaButton}
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
              {L.badge}
            </Badge>
            {guide.lang === "en" ? (
              <Badge variant="secondary">EN</Badge>
            ) : null}
          </div>
          <CardTitle className="text-lg leading-snug">{L.title}</CardTitle>
          <CardDescription>
            {L.authorLabel} <span className="font-medium text-foreground">{guide.authorName}</span>
            {" · "}
            {L.updated} {relativniCas(updated, locale)}
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
                {L.tipsHeading}
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
                        {L.dayLabel} {tip.day}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="w-fit shrink-0 text-muted-foreground"
                      >
                        {L.generalTip}
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
                {L.verdictHeading}
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
              {L.editButton}
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
          {guide ? L.formTitleEdit : L.formTitleNew}
        </CardTitle>
        <CardDescription>{L.formDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5" noValidate>
          {/* Avtorsko ime */}
          <div className="space-y-1.5">
            <label htmlFor="guide-author" className="text-sm font-medium">
              {L.nameLabel}
            </label>
            <Input
              id="guide-author"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder={L.namePlaceholder}
              maxLength={AUTHOR_MAX}
              autoComplete="name"
              required
            />
          </div>

          {/* Zakaj ta pot */}
          <div className="space-y-1.5">
            <label htmlFor="guide-intro" className="text-sm font-medium">
              {L.introLabel}
            </label>
            <Textarea
              id="guide-intro"
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder={L.introPlaceholder}
              rows={3}
              maxLength={INTRO_MAX}
              required
            />
            <p className="text-right text-xs text-muted-foreground">
              {L.charCount(introLen, INTRO_MAX)}
            </p>
          </div>

          {/* Nasveti */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{L.tipsLabel}</span>
              {tips.length < TIPS_MAX ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTip}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {L.addTip}
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
                      aria-label={isEn ? "Which day" : "Kateri dan"}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{L.generalTip}</SelectItem>
                      {Array.from({ length: days }, (_, i) => i + 1).map(
                        (d) => (
                          <SelectItem key={d} value={String(d)}>
                            {L.dayLabel} {d}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  value={tip.text}
                  onChange={(e) => updateTip(index, { text: e.target.value })}
                  placeholder={L.tipPlaceholder}
                  maxLength={TIP_TEXT_MAX}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTip(index)}
                  disabled={tips.length <= 1}
                  aria-label={L.removeTipAria}
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
                {L.verdictLabel}
              </label>
              <Badge variant="outline" className="text-muted-foreground">
                {L.optionalBadge}
              </Badge>
            </div>
            <Textarea
              id="guide-verdict"
              value={verdict}
              onChange={(e) => setVerdict(e.target.value)}
              placeholder={L.verdictPlaceholder}
              rows={2}
              maxLength={VERDICT_MAX}
            />
            <p className="text-right text-xs text-muted-foreground">
              {L.charCount(verdictLen, VERDICT_MAX)}
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
              {saving ? L.savingButton : L.saveButton}
            </Button>
            {guide ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                {L.cancelButton}
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default TripGuide;
