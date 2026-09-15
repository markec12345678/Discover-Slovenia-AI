import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { draftNudgeEmail } from "@/lib/email-templates";
import { calculateProfileCompletion, canSubmitForReview } from "@/lib/profile-completion";

// ============================================================================
// DRAFT NUDGES — 60-dnevni email niz za stare osnutke lokalov (P2-2b)
// ============================================================================
// Problem (P1 raziskava): ponudnik se registrira → ustvari osnutek lokala
// (draft) → nikoli ne dopolni in odda v pregled. Rešitev: vljuden email niz
// ob dnevih 3 / 10 / 30 / 60 od ustvarjanja (največ 4 sporočila, potem za
// vedno mir). Brez lažne urgency — zadnji email je preprosto zadnji vljuden
// spominek ("vrata ostajajo odprta").
//
// Ta modul je ČISTA LOGIKA brez next/server importov — kliče ga tanka
// ovojnica /api/cron/draft-reminders in E2E testi (direktna invokacija v bun).

/** Dnevi od ustvarjanja osnutka za posamezen korak niza (indeks = korak − 1). */
const NUDGE_DAYS = [3, 10, 30, 60] as const;

/** Zadnji korak niza (dan 60) — po njem ne pošiljamo več nič. */
const LAST_STEP = NUDGE_DAYS.length;

export interface DraftNudgeStats {
  /** Število uspešno poslanih (in v bazi zapisanih) opomnikov. */
  sent: number;
  /** Kandidati, katerih lastnik nima potrjene e-pošte (P0-4 verifikacija). */
  skippedUnverified: number;
  /** Osnutki z zaključenim nizom (draftNudgeStep ≥ 4) — za vedno mir. */
  alreadyDone: number;
  /** Vsi pregledani kandidati (status draft, brez oddaje, z lastnikom). */
  considered: number;
  /** Poslani opomniki po koraku: { "1": n, "2": n, ... }. */
  byStep: Record<string, number>;
}

export interface DraftNudgeOptions {
  /** Referenčni čas (testabilnost) — default: new Date(). */
  now?: Date;
  /**
   * SAMO ZA TESTE — preskoči pogoj STAROSTI (starost ≥ NUDGE_DAYS[korak−1]),
   * ne pa pogoja napredka (draftNudgeStep < korak):
   *   - brez force: pošlje NAJVIŠJI upravičen korak ("catch-up" — 12 dni star
   *     osnuteki dobi korak 2, ne zastarelega koraka 1)
   *   - s force: pošlje NASLEDNJI korak (draftNudgeStep + 1), ne glede na
   *     starost — test lahko korak-po-korak prestreza niz brez čakanja dni
   *
   * Dokumentirana odločitev (spec je bil dvoumen): napredek ostaja varovan
   * tudi pod force — korak se NIKOLI ne pošlje dvakrat in niz se vedno
   * konča pri koraku 4. Časovni pogoj je tisti, ki ga force izpusti.
   */
  force?: boolean;
}

/**
 * Izvede en prehod 60-dnevnega niza opomnikov za osnutke lokalov.
 *
 * Kandidati: status "draft", submittedAt null, ownerId ni null, lastnik ima
 * potrjeno e-pošto. Vsak poskus pošiljanja je v svojem try/catch — napaka
 * enega emaila ne sesuje celotnega niza.
 *
 * ATOMICNOST (P3c-2): vrstni red je optimistična ključavnja — NAJPREJ
 * atomarno "claimamo" korak (updateMany z pogojem draftNudgeStep < step),
 * ŠTELEJ nato pošljemo email. Concurrent klica istega listinga (npr. dva
 * sočasna cron klica, live dokazano v P3-c E2) vidita natanko enega z
 * claimed.count === 1; drugi dobi 0 in preskoči → NI VEČ dvojnega emaila.
 * Če sendEmail po claimu odpove (false ALI throw), claim REVERTIRAMO na
 * prejšnje stanje — s čimer ostaja izvirna semantika "SMTP fail → retry
 * naslednji dan" (korak ni zapravljen). Stanje torej zapisujemo pred
 * pošiljanjem, a uspešno potrdimo SAMO ob uspehu (revert sicer).
 */
export async function runDraftNudges(
  options: DraftNudgeOptions = {}
): Promise<DraftNudgeStats> {
  const now = options.now ?? new Date();
  const stats: DraftNudgeStats = {
    sent: 0,
    skippedUnverified: 0,
    alreadyDone: 0,
    considered: 0,
    byStep: {},
  };

  const candidates = await db.listing.findMany({
    where: {
      status: "draft",
      submittedAt: null,
      ownerId: { not: null },
    },
    include: { owner: true },
  });

  for (const listing of candidates) {
    stats.considered += 1;

    // Ena napaka enega emaila ne sme sesesti celotnega niza
    try {
      const owner = listing.owner;

      // Brez potrjene e-pošte ne pošiljamo (P0-4: emailVerified = lastništvo
      // nabiralnika — sicer bi opomniki pristajali v nepreverjenih nabiralnikih)
      if (!owner || owner.emailVerified === null) {
        stats.skippedUnverified += 1;
        continue;
      }

      // Niz je zaključen (korak 4 = dan 60) — po tem ne pošiljamo VEČ NIČ
      if (listing.draftNudgeStep >= LAST_STEP) {
        stats.alreadyDone += 1;
        continue;
      }

      const ageDays = Math.floor(
        (now.getTime() - listing.createdAt.getTime()) / (24 * 60 * 60 * 1000)
      );

      // ----- Izbira koraka -----
      // Navadni režim: najvišji korak s (1..4), za katerega velja
      //   starost ≥ NUDGE_DAYS[s−1]  IN  draftNudgeStep < s
      // ("catch-up": osnutek, star 12 dni in brez dosedanjih opomnikov,
      //  dobi korak 2 — zastareli korak 1 bi bil nesmislen)
      //
      // force (SAMO za teste): starostni pogoj je izpuščen, napredni pogoj
      // (draftNudgeStep < s) pa OSTANE — pošlje se naslednji korak v nizu.
      let step: number | null = null;
      if (options.force) {
        step = listing.draftNudgeStep + 1;
        if (step > LAST_STEP) step = null;
      } else {
        for (let s = LAST_STEP; s >= 1; s--) {
          if (ageDays >= NUDGE_DAYS[s - 1] && listing.draftNudgeStep < s) {
            step = s;
            break;
          }
        }
      }

      // Še ni čas za naslednji korak (ali pa je niz že zaključen prej)
      if (step === null) continue;

      // Vsebina po koraku (popolnost profila + manjkajoča obvezna polja)
      const completion = calculateProfileCompletion(listing);
      const { missingRequired } = canSubmitForReview(listing);

      const email = draftNudgeEmail({
        ownerName: owner.name,
        listingName: listing.name,
        step,
        completionPercentage: completion.percentage,
        missingRequiredLabels: missingRequired.map((field) => field.label),
      });

      // ----- OPTIMISTIČNA KLJUČAVNJA (P3c-2) -----
      // Claim je atomarno pogojen na dosedanji napredek: prevzame ga lahko
      // SAMO klic, ki vidi draftNudgeStep < step. Concurrent dvojni klic
      // (isti listing, isti korak) dobi claimed.count === 0 → preskoči.
      // force semantika je neodvisna od tega: force preskoči STAROST, ne
      // napredka — napredek varuje ravno ta updateMany pogoj.
      const previousStep = listing.draftNudgeStep;
      const previousSentAt = listing.draftNudgeSentAt;

      const claimed = await db.listing.updateMany({
        where: { id: listing.id, draftNudgeStep: { lt: step } },
        data: { draftNudgeStep: step, draftNudgeSentAt: now },
      });
      if (claimed.count === 0) {
        // Drugi (sočasni) klic je prevzel korak med našim branjem in zapisom —
        // NIČ ne pošiljamo, števec sent se ne poveča (email gre točno enkrat).
        continue;
      }

      // Pošlji — sendEmail lahko vrne false (SMTP napaka, logirana v email.ts)
      // ALI vreči; oboje obravnavamo kot neuspeh in REVERTIRAMO claim, da
      // naslednji cron poskus (isti ali naslednji dan) znova poskusi.
      let sent = false;
      try {
        sent = await sendEmail({
          to: owner.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
      } catch (sendError) {
        console.error(
          `[draft-nudges] sendEmail throw za listing ${listing.id} (korak ${step}) — claim se revertira:`,
          sendError
        );
        sent = false;
      }

      if (!sent) {
        // Revert claima na prejšnje stanje (korak NI zapravljen; retry ostaja)
        await db.listing.updateMany({
          where: { id: listing.id, draftNudgeStep: step },
          data: {
            draftNudgeStep: previousStep,
            draftNudgeSentAt: previousSentAt ?? null,
          },
        });
        continue;
      }

      // Uspešno poslano — claim ostane, statistika šteje SAMO uspešne pošiljke
      stats.sent += 1;
      stats.byStep[String(step)] = (stats.byStep[String(step)] ?? 0) + 1;
    } catch (error) {
      console.error(`[draft-nudges] napaka za listing ${listing.id}:`, error);
    }
  }

  return stats;
}
