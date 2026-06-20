import { NextResponse } from "next/server";
import { getBetaStatus } from "@/lib/beta";

// GET /api/beta-status — vrne trenutni beta status platforme
// Client-side komponente uporabljajo ta endpoint za prikaz beta banner-jev
export async function GET() {
  try {
    const status = await getBetaStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("[beta-status] napaka:", error);
    // Fallback — privzemi da smo v beta-ju
    return NextResponse.json({
      isActive: true,
      listingCount: 0,
      remainingToMonetization: 30,
      message: "Beta obdobje — vse brezplačno.",
      betaEndDate: "2025-12-31",
    });
  }
}
