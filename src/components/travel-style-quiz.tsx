"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  MapPin,
  Coffee,
  Scale,
  Gauge,
  Mountain,
  Wine,
  Zap,
  Landmark,
  Flower2,
  Sun,
  Leaf,
  Snowflake,
  User,
  Heart,
  Users,
  UsersRound,
  PiggyBank,
  Wallet,
  Gem,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { trackFunnel } from "@/lib/funnel";
import { useTripProfile } from "@/components/trip-profile";
import type { Destination, Season } from "@/lib/types";

// ============================================================================
// TRAVEL STYLE QUIZ — "Kakšen popotnik si?"
// ============================================================================
//
// 5 vprašanj → travelStyle (Pustolovec / Gurman / Narava / Kulturnik /
// Varčen raziskovalec / Luksuzni popotnik) → shrani profil (useTripProfile)
// → CTA pošlje personaliziran "heroQuery" event v AI načrtovalnik
// (isti mehanizem kot demo-scenariji / pre-generated itinererji).
// ============================================================================

interface QuizOption {
  value: string;
  label: string;
  description: string;
  icon: typeof Coffee;
}

interface QuizQuestion {
  key: "tempo" | "vibe" | "season" | "group" | "budget";
  title: string;
  options: QuizOption[];
}

const QUESTIONS: QuizQuestion[] = [
  {
    key: "tempo",
    title: "Kakšen tempo ti ustreza?",
    options: [
      { value: "sproscen", label: "Sproščen", description: "Počasi, brez urnika", icon: Coffee },
      { value: "uravnotezen", label: "Uravnotežen", description: "Mešanica miru in gibanja", icon: Scale },
      { value: "akcija", label: "Akcija", description: "Od zore do mraka", icon: Gauge },
    ],
  },
  {
    key: "vibe",
    title: "Kaj te najbolj privlači?",
    options: [
      { value: "narava", label: "Narava & pohodi", description: "Jezera, soteske, gorovje", icon: Mountain },
      { value: "hrana", label: "Hrana & vino", description: "Gostilne in degustacije", icon: Wine },
      { value: "adrenalin", label: "Adrenalin & šport", description: "Rafting, kolesarjenje, smučanje", icon: Zap },
      { value: "kultura", label: "Kultura & mesta", description: "Stara mesta, gradovi, muzeji", icon: Landmark },
    ],
  },
  {
    key: "season",
    title: "Kdaj bi potoval(a)?",
    options: [
      { value: "spring", label: "Pomlad", description: "Cvetje in sveža zelen", icon: Flower2 },
      { value: "summer", label: "Poletje", description: "Kopanje in dolgi dnevi", icon: Sun },
      { value: "autumn", label: "Jesen", description: "Barve in burja v vinogradih", icon: Leaf },
      { value: "winter", label: "Zima", description: "Smučanje in praznični vonj", icon: Snowflake },
    ],
  },
  {
    key: "group",
    title: "S kom potuješ?",
    options: [
      { value: "solo", label: "Sama/sam", description: "Svoboda brez kompromisov", icon: User },
      { value: "par", label: "Par", description: "Romantika za dva", icon: Heart },
      { value: "druzina", label: "Družina z otroki", description: "Zabava za vse starosti", icon: Users },
      { value: "prijatelji", label: "Prijatelji", description: "Ekipa in smeh", icon: UsersRound },
    ],
  },
  {
    key: "budget",
    title: "Kakšen proračun?",
    options: [
      { value: "low", label: "Varčen", description: "Dosegljivo, a pametno", icon: PiggyBank },
      { value: "mid", label: "Srednji", description: "Udobje brez razmetavanja", icon: Wallet },
      { value: "lux", label: "Brez omejitev", description: "Vrhunske izkušnje", icon: Gem },
    ],
  },
];

interface QuizAnswers {
  tempo?: string;
  vibe?: string;
  season?: string;
  group?: string;
  budget?: string;
}

// === Stil potovanja ===

interface TravelStyleResult {
  /** ujema se z id-ji TRAVEL_STYLES v trip-profile.tsx */
  id: string;
  label: string;
  emoji: string;
  description: string;
}

const STYLE_RESULTS: Record<string, TravelStyleResult> = {
  narava: {
    id: "nature",
    label: "Narava",
    emoji: "🌿",
    description:
      "Mir, svež zrak in poti, ki se končajo ob jezeru. Tvoja Slovenija: Triglavski narodni park, Soča in Bohinj.",
  },
  hrana: {
    id: "foodie",
    label: "Gurman",
    emoji: "🍷",
    description:
      "Potuješ z želodcem. Tvoja Slovenija: gostilne z lokalnimi sestavinami, vinske ceste Štajerske in Dolenjske.",
  },
  adrenalin: {
    id: "adventurer",
    label: "Pustolovec",
    emoji: "🧗",
    description:
      "Adrenalin je tvoje gorivo. Tvoja Slovenija: rafting na Soči, kanjoning v soteskah in smučanje na Voglu.",
  },
  kultura: {
    id: "culture",
    label: "Kulturnik",
    emoji: "🏛️",
    description:
      "Zgodovina in mestna vrvež te naredita srečnega. Tvoja Slovenija: Ljubljana, Ptuj, Celje in Piran.",
  },
  budget: {
    id: "budget",
    label: "Varčen raziskovalec",
    emoji: "💸",
    description:
      "Vidiš veliko, porabiš malo. Tvoja Slovenija: brezplačne poti, javni prevoz in lokalni bazarji.",
  },
  luxury: {
    id: "luxury",
    label: "Luksuzni popotnik",
    emoji: "👑",
    description:
      "Brez kompromisov. Tvoja Slovenija: wellness zdravilišča, vrhunske degustacije in hotelska doživetja.",
  },
};

// Tempo glasuje za "vibe" (teža 1), Q2 ima težo 2 → dominanten stil
const TEMPO_TO_VIBE: Record<string, string> = {
  sproscen: "narava",
  akcija: "adrenalin",
};

function computeTravelStyle(a: QuizAnswers): TravelStyleResult {
  const votes: Record<string, number> = {};
  const addVote = (key: string | undefined, weight: number) => {
    if (!key) return;
    votes[key] = (votes[key] ?? 0) + weight;
  };
  addVote(TEMPO_TO_VIBE[a.tempo ?? ""], 1);
  addVote(a.vibe, 2);

  let dominant = a.vibe ?? "narava";
  let maxVotes = -1;
  for (const [key, count] of Object.entries(votes)) {
    if (count > maxVotes) {
      maxVotes = count;
      dominant = key;
    }
  }

  // Proračun lahko preklopi stil pri naravnem/kulturnem profilu
  if (a.budget === "low" && (dominant === "narava" || dominant === "kultura")) {
    return STYLE_RESULTS.budget;
  }
  if (a.budget === "lux" && (dominant === "hrana" || dominant === "kultura")) {
    return STYLE_RESULTS.luxury;
  }
  return STYLE_RESULTS[dominant] ?? STYLE_RESULTS.narava;
}

// === Priporočene destinacije ===

const NATURE_TYPES = new Set(["mountain", "lake", "river", "gorge", "cave"]);

function styleMatchesDestination(styleId: string, d: Destination): boolean {
  switch (styleId) {
    case "nature":
      return NATURE_TYPES.has(d.type) || d.bestFor.some((b) => b === "narava" || b === "mir");
    case "foodie":
      return (
        d.bestFor.some((b) => b === "hrana" || b === "vino") ||
        d.activities.some((a) => /degust|večerj|kosil|gastro|vinska/i.test(a))
      );
    case "adventurer":
      return d.bestFor.some((b) => b === "avantura" || b === "adrenalin" || b === "aktivnosti" || b === "pohodništvo");
    case "culture":
      return (
        d.bestFor.some((b) => b === "kultura" || b === "zgodovina" || b === "mesto") ||
        d.type === "city" ||
        d.type === "castle"
      );
    case "budget":
      return d.budget === "€" || d.costPerPerson <= 15;
    case "luxury":
      return d.budget === "€€€" || d.type === "spa";
    default:
      return false;
  }
}

function recommendedDestinations(styleId: string, season?: string): Destination[] {
  const matches = DESTINATIONS.filter((d) => styleMatchesDestination(styleId, d));
  const seasonSet = season as Season | undefined;
  const sorted = [...matches].sort((a, b) => {
    const aSeason = seasonSet ? (a.bestSeason.includes(seasonSet) ? 1 : 0) : 0;
    const bSeason = seasonSet ? (b.bestSeason.includes(seasonSet) ? 1 : 0) : 0;
    if (aSeason !== bSeason) return bSeason - aSeason;
    return b.rating - a.rating;
  });
  return sorted.slice(0, 3);
}

// === Personaliziran prompt za AI načrtovalnik (heroQuery mehanizem) ===

const INTEREST_TEXT: Record<string, string> = {
  narava: "naravo in pohode",
  hrana: "lokalno hrano in vino",
  adrenalin: "adrenalin in šport",
  kultura: "kulturo in mesta",
};

const SEASON_TEXT: Record<string, string> = {
  spring: "pomlad",
  summer: "poletje",
  autumn: "jesen",
  winter: "zimo",
};

const GROUP_TEXT: Record<string, string> = {
  solo: "sama",
  par: "s partnerjem",
  druzina: "z družino",
  prijatelji: "s prijatelji",
};

const BUDGET_TEXT: Record<string, string> = {
  low: "varčen",
  mid: "srednji",
  lux: "brez omejitev",
};

// Interesi iz kviza → vrednosti INTERESTS iz slovenia-data
function interestsFromAnswers(a: QuizAnswers): string[] {
  const interests: string[] = [];
  switch (a.vibe) {
    case "narava":
      interests.push("narava");
      break;
    case "hrana":
      interests.push("hrana");
      break;
    case "adrenalin":
      interests.push("avantura", "adrenalin");
      break;
    case "kultura":
      interests.push("kultura");
      break;
  }
  if (a.group === "druzina") interests.push("družina");
  return interests.length > 0 ? interests : ["narava"];
}

function buildPrompt(a: QuizAnswers): string {
  const vibe = a.vibe ?? "narava";
  const interestText = INTEREST_TEXT[vibe] ?? "naravo";
  const seasonText = SEASON_TEXT[a.season ?? "summer"] ?? "poletje";
  const groupText = GROUP_TEXT[a.group ?? "par"] ?? "s partnerjem";
  const budgetText = BUDGET_TEXT[a.budget ?? "mid"] ?? "srednji";
  return `Načrtuj 3-dnevno potovanje za popotnika, ki obožuje ${interestText}, raje ${seasonText}, potuje ${groupText}, proračun ${budgetText}`;
}

// ============================================================================

export function TravelStyleQuiz() {
  const { updateProfile, completeOnboarding } = useTripProfile();

  const [step, setStep] = useState(0); // 0..4 vprašanja, 5 = rezultat
  const [answers, setAnswers] = useState<QuizAnswers>({});
  /** ključ zadnjega obdelanega rezultata (prepreči dvojno shranjevanje) */
  const processedKeyRef = useRef<string | null>(null);

  const isResult = step >= QUESTIONS.length;
  const currentQuestion = QUESTIONS[Math.min(step, QUESTIONS.length - 1)];
  const totalSteps = QUESTIONS.length;
  const progress = Math.min(step / totalSteps, 1);

  const style = useMemo(() => (isResult ? computeTravelStyle(answers) : null), [isResult, answers]);
  const recommendations = useMemo(
    () => (isResult ? recommendedDestinations(style?.id ?? "nature", answers.season) : []),
    [isResult, style, answers.season]
  );

  // Ob prikazu rezultata: shrani profil + funnel dogodek (enkrat na nabor odgovorov)
  useEffect(() => {
    if (!isResult || !style) return;
    const key = JSON.stringify(answers);
    if (processedKeyRef.current === key) return;
    processedKeyRef.current = key;

    updateProfile({
      interests: interestsFromAnswers(answers),
      preferredSeason: answers.season ?? null,
      budgetRange: answers.budget ?? null,
      groupType: answers.group ?? null,
      travelStyle: style.id,
    });
    // Označi onboarding kot zaključen (updateProfile zgoraj je shranil podatke)
    completeOnboarding({});
    trackFunnel("quiz_completed");
  }, [isResult, style, answers, updateProfile, completeOnboarding]);

  function selectOption(question: QuizQuestion, value: string) {
    setAnswers((prev) => ({ ...prev, [question.key]: value }));
    setStep((s) => s + 1);
  }

  function restart() {
    setAnswers({});
    setStep(0);
  }

  function startPlanning() {
    // Enak mehanizem kot DemoScenariosWrapper: scroll načrtovalca + heroQuery
    const planner = document.getElementById("načrtuj");
    planner?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("heroQuery", { detail: buildPrompt(answers) }));
    }, 500);
  }

  return (
    <section id="kviz" className="scroll-mt-24 bg-gradient-to-b from-muted/40 to-background py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mb-3 flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium">
                <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                Ne veš, kje začeti? ⭐ 2-minutni kviz
              </span>
            </div>
            <h2 className="text-2xl font-bold sm:text-3xl">Kakšen popotnik si?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Odgovori na 5 vprašanj in AI ti sestavi popotovanje po meri
            </p>
            <button
              type="button"
              onClick={() => {
                document.getElementById("načrtuj")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="mt-3 rounded-sm text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Preskoči kviz
            </button>
          </div>

          {/* Kviz kartica */}
          <Card className="border-primary/20 shadow-md">
            <CardContent className="p-5 sm:p-8">
              {!isResult ? (
                <div key={step} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Progress */}
                  <div className="mb-6 space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium" aria-live="polite">
                        Vprašanje {step + 1} od {totalSteps}
                      </span>
                      <span>{Math.round(progress * 100)} %</span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={Math.round(progress * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Napredek kviza"
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${progress * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Vprašanje */}
                  <fieldset>
                    <legend className="mb-4 text-lg font-bold sm:text-xl">
                      {currentQuestion.title}
                    </legend>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {currentQuestion.options.map((option) => {
                        const Icon = option.icon;
                        const selected = answers[currentQuestion.key] === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => selectOption(currentQuestion, option.value)}
                            aria-pressed={selected}
                            className={cn(
                              "group flex min-h-[76px] items-start gap-3 rounded-xl border-2 p-4 text-left transition-all",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                              selected
                                ? "border-primary bg-primary/5"
                                : "border-border/60 hover:border-primary/40 hover:bg-primary/5"
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                                selected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                              )}
                            >
                              <Icon className="size-5" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold leading-tight">{option.label}</span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
                            </span>
                            <ArrowRight
                              className="ml-auto size-4 shrink-0 self-center text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary"
                              aria-hidden="true"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  {/* Nazaj */}
                  {step > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-5 gap-1.5 text-muted-foreground"
                      onClick={() => setStep((s) => Math.max(0, s - 1))}
                      aria-label="Nazaj na prejšnje vprašanje"
                    >
                      <ArrowLeft className="size-4" aria-hidden="true" />
                      Nazaj
                    </Button>
                  )}
                </div>
              ) : (
                /* ===================== REZULTAT ===================== */
                style && (
                  <div key="result" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="text-center">
                      <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-full bg-primary/10">
                        <span className="text-4xl" role="img" aria-label={style.label}>
                          {style.emoji}
                        </span>
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                        Tvoj stil potovanja
                      </p>
                      <h3 className="mt-1 text-2xl font-bold sm:text-3xl">{style.label}</h3>
                      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                        {style.description}
                      </p>
                    </div>

                    {/* Priporočene destinacije */}
                    <div className="mt-6">
                      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Priporočene destinacije
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {recommendations.map((d) => (
                          <a
                            key={d.id}
                            href="#destinacije"
                            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3.5 py-2 text-sm font-medium text-foreground transition-all hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <MapPin className="size-3.5 text-primary" aria-hidden="true" />
                            {d.name}
                            {answers.season && d.bestSeason.includes(answers.season as Season) && (
                              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                                {SEASON_TEXT[answers.season]}
                              </Badge>
                            )}
                          </a>
                        ))}
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="mt-7 space-y-2">
                      <Button
                        type="button"
                        size="lg"
                        className="w-full gap-2 bg-primary"
                        onClick={startPlanning}
                        aria-label="Načrtuj moje potovanje z AI načrtovalnikom"
                      >
                        <Sparkles className="size-4" aria-hidden="true" />
                        Načrtuj moje potovanje
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full gap-1.5 text-muted-foreground"
                        onClick={restart}
                        aria-label="Ponovi kviz od začetka"
                      >
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                        Ponovi kviz
                      </Button>
                    </div>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

export default TravelStyleQuiz;
