import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/security";
import { runDraftNudges } from "@/lib/draft-nudges";

// GET /api/cron/draft-reminders — dnevni 60-dnevni email niz za osnutke (P2-2b)
//
// Kliče se preko Vercel Cron (dnevno ob 10:00 — glej vercel.json) ali
// external cron. Vsa logika je v src/lib/draft-nudges.ts (čista, brez
// next/server importov) — ta route je tanka ovojnica: avtentikacija + klic.
//
// Niz: dan 3 / 10 / 30 / 60 od ustvarjanja osnutka (status "draft", brez
// oddaje v pregled, lastnik s potrjeno e-pošto). Po koraku 4 neha za vedno.
export async function GET(request: Request) {
  try {
    // Preveri avtentikacijo (CRON_SECRET Bearer ali admin geslo — timing-safe)
    const unauthorized = verifyCronAuth(request);
    if (unauthorized) return unauthorized;

    const stats = await runDraftNudges();

    console.log(
      `[cron/draft-reminders] Osnutki: pregledanih ${stats.considered}, poslanih ${stats.sent} ` +
        `(koraki: ${JSON.stringify(stats.byStep)}), brez potrjene e-pošte: ${stats.skippedUnverified}, ` +
        `zaključenih nizov: ${stats.alreadyDone}`
    );

    return NextResponse.json({ success: true, ...stats });
  } catch (error) {
    console.error("[cron/draft-reminders] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pošiljanju opomnikov za osnutke lokalov" },
      { status: 500 }
    );
  }
}
