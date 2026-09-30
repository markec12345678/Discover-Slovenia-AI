import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { safeJsonLd } from "@/lib/security";
import { matchEventsForItinerary } from "@/lib/events-match";
import { tripWindowMs } from "@/lib/trip-dates";
import { resolveTripRole, roleAtLeast } from "@/lib/trip-permissions";
import { PageViewTracker } from "@/components/page-view-tracker";
import { SharedTrip } from "@/components/shared-trip";
import { Chatbot } from "@/components/chatbot";
import { TripCollaboration } from "@/components/trip-collaboration";
import { TripPresence } from "@/components/trip-presence";
import { TripReservations } from "@/components/trip-reservations";
import { TripBudgetCard } from "@/components/trip-budget-card";
import { TripDocumentsCard } from "@/components/trip-documents-card";
import { TripGuide, type GuideData } from "@/components/trip-guide";
import { TripDiary, type DiaryEntry } from "@/components/trip-diary";
import { TripPolls } from "@/components/trip-polls";
import { TripSocial } from "@/components/trip-social";
import { TripPushCard } from "@/components/trip-push-card";
import { PrintQr } from "./[shareId]/print-qr";
// TASK 8 / D8-E (P-NAV-1): enotna lupina — Navigation solid + Footer.
// Obe sta znotraj .pot-page: standardni Footer se v PDF izhodu skrije
// samodejno (obstoječe .pot-page footer print pravilo), Navigation pa
// ovijemo v .print-hide (PDF izhod ostane čist — samo vsebina poti +
// URL nogica). SharedTrip že izrisuje svoj <main> — brez gnezdenja.
import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { currentBaseUrl } from "@/lib/host";
import type { Itinerary, PlannerInput } from "@/lib/types";

// ============================================================================
// SKUPNI ZASLON DE LJENE POTE (D7, 1.140.0) — en vir resnice za:
//   1. /pot/[shareId]        — polna javna stran (lupina + skupnostne plošče)
//   2. /pot/embed/[shareId]  — blog-embed (iframe): SAMO itinerer + avtorska
//                             -atribucija, brez lupine in urejalnih ploskev
//
// ZAKO en zaslon (ne ločena datoteka): varnostna vrata (SHARE_ID_RE,
// isPublic + resolveTripRole → 404) in views-increment morata ostati
// ENA resnica — dupliciran bi zagotovo zaidil. Razliko nosi `embed`:
//   - embed PRESKOČI poizvedbe, ki njegov izris ne potrebuje
//     (klepet/všečki/ankete/dnevnik/vodnik) → embed ogled je LAHKEJŠI za DB;
//   - embed NE izriše Navigation/Footer (blog-embed je brez lupine) in NE
//     izriše pooblaščenih urejalnih ploskev (TripCollaboration/Guide/
//     Documents/Push — klikjacking površina iz naslednja.config.ts koment.);
//   - PageViewTracker nosi pot /pot/embed/… → promet LOČENO merljiv.
// ============================================================================

// Validna dolžina shareId (hex, 10 znakov) — zavrnemo očitno neveljavne
// zahteve brez DB klica.
const SHARE_ID_RE = /^[a-z0-9]{1,32}$/;

interface ScreenProps {
  shareId: string;
  /** D7: embed način (brez lupine, brez urejalnih ploskev, lažje poizvedbe) */
  embed?: boolean;
}

async function getSharedItinerary(shareId: string) {
  if (!SHARE_ID_RE.test(shareId)) return null;

  const saved = await db.savedItinerary.findUnique({
    where: { shareId },
    select: {
      name: true,
      itinerary: true,
      views: true,
      createdAt: true,
      isPublic: true,
      // TASK 28 (live-sync): verzija ob renderu — osnova za polling banner.
      contentVersion: true,
      // ISSUE #8 §26 / F2-C (fork skupnostne poti): vhodni podatki
      // načrtovalnika (PlannerInput) — podlaga za „Shrani kot svojo kopijo“.
      formData: true,
    },
  });

  if (!saved) return null;

  // Parse itinererja — ob pokvarjenem JSON-u se obnašamo kot da ne obstaja
  let itinerary: Itinerary;
  try {
    itinerary = JSON.parse(saved.itinerary) as Itinerary;
  } catch {
    console.error("[pot] pokvarjen JSON itinererja:", shareId);
    return null;
  }

  if (!Array.isArray(itinerary?.days) || itinerary.days.length === 0) {
    return null;
  }

  // Hardening: obdrži samo dneve z veljavnim seznamom lokacij
  itinerary.days = itinerary.days.filter(
    (d) => typeof d === "object" && d !== null && Array.isArray(d.locations)
  );
  if (itinerary.days.length === 0) return null;

  // ISSUE #8 §26 / F2-C: formData (PlannerInput) za „Shrani kot svojo
  // kopijo“. Starejše/anonimne pote imajo zapisan literal "null" (API:
  // b.formData ?? null) → null; pokvarjen/veljaven le delno JSON → null
  // (NE sesuje strani — fork takrat shrani kopijo brez formData).
  let formData: PlannerInput | null = null;
  if (typeof saved.formData === "string" && saved.formData !== "null") {
    try {
      const parsed: unknown = JSON.parse(saved.formData);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        formData = parsed as PlannerInput;
      }
    } catch {
      console.error("[pot] pokvarjen JSON formData:", shareId);
    }
  }

  return { ...saved, itinerary, formData };
}

export async function SharedTripScreen({
  shareId,
  embed = false,
}: ScreenProps) {
  const saved = await getSharedItinerary(shareId);

  if (!saved) notFound();

  // ISSUE #4 §13 (val 2): ZASEBNA pot (isPublic=false) — dostop ima samo
  // prijavljen uporabnik z vlogo (lastnik/sodelujoči). RSC vidi SAMO sejo
  // (editToken živi v brskalniku — zasebni način je zato rezerviran za
  // računske lastnike, glej PATCH varovalko). Drugi → 404 (obstoj poti
  // ostane skrit, ne 403). VELJA ENAKO v embed načinu — zasebna pot v
  // tujem iframe-u pomeni 404, nikoli prikaz (D7 varnostno vrata).
  if (!saved.isPublic) {
    let session = null;
    try {
      session = await getServerSession(authOptions);
    } catch {
      // napaka seje = anonimno → 404 spodaj
    }
    const { role } = await resolveTripRole(shareId, { session });
    if (!roleAtLeast(role, "VIEWER")) notFound();
  }

  // SEO-2: tiskalna noga z DEJANSKO povezavo (prej mrtva domena);
  // D7: v embed načinu ISTA baza nosi atribucijski pas (Discover Slovenia
  // AI + „Odpri celoten načrt“) — en vir resnice za origin.
  const base = await currentBaseUrl();

  // Inkrementiraj števec ogledov (SAMO tu — ne v generateMetadata, ki deli
  // getSharedItinerary — sicer bi double-countal). Ne-critical: ob napaki
  // prikažemo shranjeno vrednost. D7: embed ogledi ŠTEJEJO — pot je bila
  // res videna (iskrena številka, en resnični ogled = en pogled).
  let views = saved.views;
  try {
    const updated = await db.savedItinerary.update({
      where: { shareId },
      data: { views: { increment: 1 } },
      select: { views: true },
    });
    views = updated.views;
  } catch (e) {
    console.error("[pot] views increment napaka:", e);
  }

  const name = saved.name || "AI načrt potovanja po Sloveniji";
  const totalBudget =
    typeof saved.itinerary.total_budget === "number"
      ? saved.itinerary.total_budget
      : 0;

  // === Dogodki — SVEŽE ob vsakem renderju (datumi v shranjenem JSON-u so
  // lahko zastareli; matchEventsForItinerary upošteva današnji datum) ===
  // FW4.2: če ima shranjen načrt okvir potovanja, gredo dogodki, ki se
  // zgodi MED obiskom, na prvih mestih (datumski ujem)
  const events = matchEventsForItinerary(
    saved.itinerary.days,
    6,
    tripWindowMs(saved.itinerary.tripStartDate, saved.itinerary.days.length),
    // 1.29.0 (revizija #13): /pot stran je SL-only površina (celoten
    // SharedTrip izpis je slovenski) → dogodki eksplicitno v SL; EN
    // prekrivna plast se uporabi samo v plannerju (/en/nacrtuj).
    "sl"
  );

  // === Začetni glasovi (locationKey → število) — izhodišče za UI (7-b) ===
  // D7: tudi v embed (SharedTrip izrisuje ThumbUp glasovanje).
  let initialVotes: Record<string, number> = {};
  try {
    const grouped = await db.tripVote.groupBy({
      by: ["locationKey"],
      where: { shareId },
      _count: { _all: true },
    });
    initialVotes = Object.fromEntries(
      grouped.map((g) => [g.locationKey, g._count._all])
    );
  } catch (e) {
    // Glasovanje ni kritično za prikaz strani — nadaljuj s praznimi glasovi
    console.error("[pot] tripVote groupBy napaka:", e);
  }

  // === Začetne vrstice klepeta/komentarjev in všečki (P1-2a + W2 skupinski
  // klepet z @AI) — ne-kritično: ob napaki nadaljujemo s praznimi (stran se
  // mora izrisati). W2: isAI + payload (priloga AI odgovorov) sta aditivni —
  // obstoječa zgodovina komentarjev postane zgodovina klepeta. ===
  // D7: v embed načinu SKUPNOSTNIH ploskev NE nalagamo (niti poizvedbe) —
  // blog bralec vidi itinerer; klepet/ankete/dnevnik so domena polne strani.
  let initialComments: {
    id: string;
    authorName: string;
    text: string;
    isAI: boolean;
    payload: string | null;
    createdAt: string;
  }[] = [];
  let initialLikes = 0;
  if (!embed) {
    try {
      const comments = await db.tripComment.findMany({
        where: { shareId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          authorName: true,
          text: true,
          // W2 (Issue #15, 1.131.0): značka AI svetovalca + JSON priloga.
          isAI: true,
          payload: true,
          createdAt: true,
        },
      });
      initialComments = comments.map((c) => ({
        id: c.id,
        authorName: c.authorName,
        text: c.text,
        isAI: c.isAI,
        payload: c.payload,
        createdAt: c.createdAt.toISOString(),
      }));
    } catch (e) {
      console.error("[pot] tripComment findMany napaka:", e);
    }

    try {
      initialLikes = await db.tripLike.count({ where: { shareId } });
    } catch (e) {
      console.error("[pot] tripLike count napaka:", e);
    }
  }

  // === F11: skupinske ankete (ne-kritično — ob napaki nadaljujemo brez) ===
  // Server-side izhodišče (brez myVote — ta se dopolni na klientu z voterId)
  let initialPolls: {
    id: string;
    question: string;
    options: string[];
    authorName: string | null;
    closed: boolean;
    createdAt: string;
    counts: number[];
    total: number;
  }[] = [];
  if (!embed) {
    try {
      const pollRows = await db.tripPoll.findMany({
        where: { shareId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          question: true,
          options: true,
          authorName: true,
          closed: true,
          createdAt: true,
        },
      });
      initialPolls = await Promise.all(
        pollRows.map(async (p) => {
          let options: string[] = [];
          try {
            const parsed = JSON.parse(p.options) as unknown;
            if (Array.isArray(parsed)) {
              options = parsed.filter(
                (o): o is string => typeof o === "string" && o.trim().length > 0
              );
            }
          } catch {
            // pokvarjen JSON → prazna lista
          }
          const votes = await db.tripPollVote.findMany({
            where: { pollId: p.id },
            select: { optionIdx: true },
          });
          const counts = new Array<number>(options.length).fill(0);
          for (const v of votes) {
            if (v.optionIdx >= 0 && v.optionIdx < counts.length) {
              counts[v.optionIdx] += 1;
            }
          }
          return {
            id: p.id,
            question: p.question,
            options,
            authorName: p.authorName,
            closed: p.closed,
            createdAt: p.createdAt.toISOString(),
            counts,
            total: votes.length,
          };
        })
      );
    } catch (e) {
      console.error("[pot] tripPoll findMany napaka:", e);
    }
  }

  // === F12: potni dnevnik (ne-kritično — ob napaki nadaljujemo brez) ===
  // Server-side izhodišče (brez isAuthor — ta se dopolni na klientu)
  let initialDiary: Omit<DiaryEntry, "isAuthor">[] = [];
  if (!embed) {
    try {
      const diaryRows = await db.tripDiaryEntry.findMany({
        where: { shareId },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          dayIndex: true,
          placeName: true,
          rating: true,
          text: true,
          authorName: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      initialDiary = diaryRows.map((r) => ({
        id: r.id,
        dayIndex: r.dayIndex,
        placeName: r.placeName,
        rating: r.rating,
        text: r.text,
        authorName: r.authorName,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));
    } catch (e) {
      console.error("[pot] tripDiaryEntry findMany napaka:", e);
    }
  }

  // === F12: oznake dni za dnevnik — "Dan N — destinacije" (index = N-1) ===
  // Iz načrta (po filtriranju veljavnih dni); vrzeli (ne-sekvenčni day.day)
  // zapolnimo z "Dan N", da izbirnik ostane konsistenten z SharedTrip sidri.
  // D7: potrebno SAMO za dnevnik (ne-embed).
  const dayLabels: string[] = [];
  if (!embed) {
    for (const d of saved.itinerary.days) {
      const dayNum =
        Number.isInteger(d.day) && d.day > 0 ? d.day : dayLabels.length + 1;
      const dests = (d.locations ?? [])
        .map((l) => l.destination_name)
        .filter((n): n is string => typeof n === "string" && n.length > 0)
        .slice(0, 3)
        .join(" → ");
      while (dayLabels.length < dayNum) {
        dayLabels.push(`Dan ${dayLabels.length + 1}`);
      }
      dayLabels[dayNum - 1] = dests
        ? `Dan ${dayNum} — ${dests}`
        : `Dan ${dayNum}`;
    }
  }

  // === F7: avtorski vodnik poti (ne-kritično — ob napaki nadaljujemo brez) ===
  // D7: izključen iz embeda (avtorska urejalna ploskev — klikjacking varnost).
  let initialGuide: GuideData | null = null;
  if (!embed) {
    try {
      const guide = await db.tripGuide.findUnique({ where: { shareId } });
      if (guide) {
        initialGuide = {
          authorName: guide.authorName,
          intro: guide.intro,
          verdict: guide.verdict,
          tips: JSON.parse(guide.tips) as GuideData["tips"],
          lang: guide.lang,
          updatedAt: guide.updatedAt.toISOString(),
        };
      }
    } catch (e) {
      console.error("[pot] tripGuide findUnique napaka:", e);
    }
  }

  // === JSON-LD: TouristTrip ===
  const dayCount = saved.itinerary.days.length;
  const destNames = saved.itinerary.days
    .flatMap((d) => d.locations?.map((l) => l.destination_name) ?? [])
    .filter(Boolean)
    .slice(0, 8);

  const touristTrip = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name,
    description: `${dayCount}-dnevni AI načrt potovanja po Sloveniji. Skupni proračun ~€${totalBudget}.`,
    itinerary: {
      "@type": "ItemList",
      numberOfItems: dayCount,
      itemListElement: saved.itinerary.days.map((day, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `Dan ${day.day}`,
        item: (day.locations ?? [])
          .map((l) => l.destination_name)
          .filter(Boolean)
          .join(" → "),
      })),
    },
    touristDestination: destNames.map((n) => ({
      "@type": "TouristDestination",
      name: n,
      address: { "@type": "PostalAddress", addressCountry: "SI" },
    })),
    offers: {
      "@type": "Offer",
      price: totalBudget,
      priceCurrency: "EUR",
    },
  };

  // D7: v embed načinu celotna vsebina v okviru — manjši vertikalni dih
  // (iframe višino določa blogger, vsebina naj ne razteguje robov).
  const embedShell = embed ? "pot-embed-page" : "pot-page";

  return (
    <div
      className={`${embedShell} min-h-screen flex flex-col bg-background`}
    >
      {/* 1.140.1: preconnect na OSM ploščice (Leaflet {s} = a/b/c). LCP
          element na OBEH /pot poteh je prva Leafletova ploščica (produkcijska
          diagnostika 28. 9.: resource load delay ~1.8 s — zemljevid se
          prikaže šele po hidriranju). Odprta povezava od vznožja strežniškega
          izrisa prihrani DNS+TLS (~200–400 ms) ob prvi zahtevi ploščice.
          React 19 Float sam dvigne <link> v <head> (preverjeno v SSR HTML;
          preconnect() iz react-dom v RSC okolju namiga NI izstrelil). BREZ
          crossorigin: ploščice se nalagajo kot navadne <img> (brez CORS) —
          anonimna povezava bi odprla NAPAČEN skupno povezavo. */}
      <link rel="preconnect" href="https://a.tile.openstreetmap.org" />
      <link rel="preconnect" href="https://b.tile.openstreetmap.org" />
      <link rel="preconnect" href="https://c.tile.openstreetmap.org" />
      {/* TASK 8 / D8-E (P-NAV-1): enotna lupina (Navigation + Footer) —
          prej sirota z lastnim v-strani headerjem (ta ostaja nespremenjen
          znotraj SharedTrip). print-hide: header se NE natisne v PDF.
          D7: v embed načinu lupine NI (blogger želi SAMO vsebino poti). */}
      {!embed && (
        <div className="print-hide">
          <Navigation solid />
        </div>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(touristTrip) }}
      />

      {/* PageView tracking — beleži ogled v PageView tabelo (rendera null).
          D7: embed ogledi nosijo svojo pot /pot/embed/… → promet iz blogov
          je LOČENO merljiv od direktnih ogledov (iskrena analitika). */}
      <PageViewTracker
        path={embed ? `/pot/embed/${shareId}` : `/pot/${shareId}`}
        title={name}
      />

      <SharedTrip
        itinerary={saved.itinerary}
        shareId={shareId}
        name={saved.name}
        views={views}
        createdAt={saved.createdAt.toISOString()}
        events={events}
        initialVotes={initialVotes}
        initialVersion={saved.contentVersion}
        formData={saved.formData}
        isPublic={saved.isPublic}
        baseUrl={base}
      />

      {embed ? (
        /* === D7 (1.140.0): ATRIBUCIJSKI PAS EMBEDA — poštena menjava za
               brezplačno vdelavo: povezava na izvor + celoten načrt. Links
               se odprejo v novem zavihku (iframe → top-level navigacijo
               NIKOLI ne silimo v okvir). === */
        <footer className="mt-auto border-t border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
          <a
            href={base}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            Discover Slovenia AI
          </a>
          {" · "}
          {/* ABSOLUTNA povezava (base + pot): relativna pot se v iframe-u
              sicer pravilno razreši proti dokumentu iframa (ne bloga), a je
              absolutna oblika imuna na robne kontekste (npr. base-tag
              prepiše) in samo-dokumentirajoča za bloggerja, ki jo vidi v
              source. target=_blank odpre top-level zavihek — iframe nikoli
              ne navigiramo nase. */}
          <a
            href={`${base}/pot/${shareId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Odpri celoten načrt
          </a>
        </footer>
      ) : (
        <>
          {/* === ISSUE #13 / P2-2 (UX-BENCHMARK §4 G2): PRISOTNOST — „✍ ureja
              v živo" indikator (Wanderlog vzorec). ČISTO kozmetična plast nad
              CAS; mrtv mini-service → rendera NIČ (praznina je poštena). === */}
          <TripPresence shareId={shareId} />

          {/* === ISSUE #4 §13 (val 2): SODELOVANJE — vloga, vabila, revokacija,
              javna/zasebna povezava + preimenovanje s CAS. Lastniku pokaže
              upravljanje, povabljenim sprejem, obiskovalcem stanje. === */}
          <div className="mx-auto max-w-5xl px-4 pb-10 pt-2 sm:px-6 lg:px-8">
            <TripCollaboration shareId={shareId} initialName={saved.name} />
          </div>

          {/* === ISSUE #4 §4+§14 (val 3): REZERVACIJE + PRORAČUN — uvoz/ročni
              vnos rezervacij (parse → predogled → potrditev; DRAFT ostane
              vidno označen) + 5 vednic proračuna (ocena/denar ločeno, neznane
              cene nikoli €0). === */}
          <div className="mx-auto max-w-5xl px-4 pb-10 pt-2 sm:px-6 lg:px-8">
            <TripReservations shareId={shareId} />
          </div>
          <div className="mx-auto max-w-5xl px-4 pb-10 pt-2 sm:px-6 lg:px-8">
            <TripBudgetCard
              shareId={shareId}
              dayCount={saved.itinerary.days.length}
            />
          </div>

          {/* === ISSUE #4 §15 (val 4): DOKUMENTI POTI — metapodatki (vrsta/
              zapis/izvor/ustvarjeno) + povezava na rezervacijo + zunanja https
              povezava. Binarna vsebina se NE shranjuje (zasebnost — isti
              vzorec kot dnevnik/parse). Offline: strežniško izrisan HTML →
              SW predpomnjen. === */}
          <div className="mx-auto max-w-5xl px-4 pb-10 pt-2 sm:px-6 lg:px-8">
            <TripDocumentsCard shareId={shareId} />
          </div>

          {/* === F7: AVTORJSKI VODNIK (skupnostni vodniki) — prikaz vsem,
              avtorstvo le lastniku (editToken v localStorage); prazna kartica
              se skrije, če vodnika ni in obiskovalec ni lastnik === */}
          <div className="mx-auto max-w-5xl px-4 pb-10 pt-2 sm:px-6 lg:px-8">
            <TripGuide
              shareId={shareId}
              dayCount={saved.itinerary.days.length}
              initialGuide={initialGuide}
            />
          </div>

          {/* === F11: SKUPINSKE ANKETE (brez-računa glasovanje, MindTrip
              vrzel #2) === */}
          <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6 lg:px-8">
            <TripPolls
              shareId={shareId}
              initialPolls={initialPolls}
              createdAt={saved.createdAt.toISOString()}
            />
          </div>

          {/* === SKUPINSKI KLEPET Z @AI + VŠEČKI (P1-2a + W2, Issue #15) —
              zgodovina komentarjev postane klepet; @AI svetovalec odgovarja
              deterministično, predloge krajev doda v pot človek === */}
          <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6 lg:px-8">
            <TripSocial
              shareId={shareId}
              initialComments={initialComments}
              initialLikes={initialLikes}
              createdAt={saved.createdAt.toISOString()}
            />
          </div>

          {/* === F12: POTNI DNEVNIK (vrzel #3 — skupinski spomini brez
              računov; natisnjena stran = naš "photobook", zavestno brez
              fotografij) === */}
          <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6 lg:px-8">
            <TripDiary
              shareId={shareId}
              initialEntries={initialDiary}
              dayLabels={dayLabels}
              createdAt={saved.createdAt.toISOString()}
            />
          </div>

          {/* === DNEVNI OPOMNIKI ZA TO POTOVANJE (retencijski motor, 3b) === */}
          <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6 lg:px-8">
            <TripPushCard
              shareId={shareId}
              days={saved.itinerary.days.length}
            />
          </div>

          {/* === PRINT NOGICA — vidna SAMO ob tiskanju (Natisni → Shrani kot
              PDF) === */}
          <p
            className="mt-6 hidden border-t border-border pt-3 text-center text-xs text-muted-foreground print:block"
            aria-hidden="true"
          >
            Izvoženo z Discover Slovenia AI · {`${base}/pot/${shareId}`}
          </p>

          {/* === PRINT QR (FW2-A) — QR deljive povezave v PDF izhodu; UI za
              deljenje ima print-hide, zato ta blok nosi QR na papirju === */}
          <PrintQr shareId={shareId} />

          {/* TASK 8 / D8-E (P-NAV-1): standardna noga lupine (v printu jo
              skrije obstoječe .pot-page footer pravilo — URL nogica ostane
              edina) */}
          <Footer />

          {/* ISSUE #16 faza 4 — klepet je asistent ZNOTRAJ potovanja (#16
              §Klepet): deljena pot je bila zadnja površina brez asistentnika
              (audit #16: Chatbot na 18 straneh, /pot/[shareId] NE) — gledalec
              deljene poti lahko vpraša (npr. „Kaj početi na Bledu?") in
              doda v SVOJO zbirko. print:hidden: PDF izvoz ostane čist
              (recept .pot-page — tu zadostuje Tailwind pomočnik). */}
          <div className="print:hidden">
            <Chatbot />
          </div>
        </>
      )}
    </div>
  );
}

export { getSharedItinerary, SHARE_ID_RE };
