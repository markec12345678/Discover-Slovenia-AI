import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";

// Validni razlogi za zavrnitev
const REJECTION_REASONS = [
  "Manjkajo fotografije",
  "Nepopoln opis",
  "Napačna kategorija",
  "Podvojeni vnos",
  "Ni povezano s turizmom",
  "Napačni kontakt podatki",
  "Neprimerna vsebina",
  "Drugo",
];

// POST /api/admin/reject/[id] — zavrne lokal z razlogom
// Header: x-admin-password
// Body: { reason: string, customReason?: string }
//
// Status → rejected (lastnik lahko uredi in ponovno odda)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkAdmin(request.headers.get("x-admin-password"))) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { reason, customReason } = body;

    if (!reason) {
      return NextResponse.json(
        { error: "Manjka razlog za zavrnitev" },
        { status: 400 }
      );
    }

    if (!REJECTION_REASONS.includes(reason) && reason !== "Drugo") {
      return NextResponse.json(
        { error: "Neveljaven razlog" },
        { status: 400 }
      );
    }

    const listing = await db.listing.findUnique({ where: { id } });
    if (!listing) {
      return NextResponse.json({ error: "Lokal ni najden" }, { status: 404 });
    }

    if (listing.status !== "pending") {
      return NextResponse.json(
        { error: `Lokal ima status "${listing.status}", ne more biti zavrnjen` },
        { status: 400 }
      );
    }

    // Sestavi polni razlog
    const fullReason = reason === "Drugo" && customReason
      ? `Drugo: ${customReason}`
      : reason;

    // Zavrnitev → status nazaj na draft (lastnik lahko popravi in ponovno odda)
    await db.listing.update({
      where: { id },
      data: {
        status: "rejected",
        rejectionReason: fullReason,
        approvedBy: null,
        approvedAt: null,
      },
    });

    // Pošlji email lastniku
    if (listing.ownerId) {
      const owner = await db.owner.findUnique({
        where: { id: listing.ownerId },
        select: { email: true, name: true },
      });
      if (owner) {
        sendRejectionEmail(
          owner.email,
          owner.name,
          listing.name,
          fullReason
        ).catch(() => {});
      }
    }

    console.log(`[admin/reject] ${listing.name} → rejected (${fullReason})`);

    return NextResponse.json({
      success: true,
      message: "Lokal zavrnjen",
      reason: fullReason,
    });
  } catch (error) {
    console.error("[admin/reject] napaka:", error);
    return NextResponse.json({ error: "Napaka pri zavrnitvi" }, { status: 500 });
  }
}

// GET — vrne seznam validnih razlogov
export async function GET(request: Request) {
  if (!checkAdmin(request.headers.get("x-admin-password"))) {
    return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
  }
  return NextResponse.json({ reasons: REJECTION_REASONS });
}

async function sendRejectionEmail(
  email: string,
  name: string,
  listingName: string,
  reason: string
) {
  const { sendEmail, emailTemplate } = await import("@/lib/email");

  await sendEmail(
    email,
    `Vaš lokal "${listingName}" potrebuje popravke`,
    emailTemplate(
      "Lokal potrebuje popravke",
      `<p>Pozdravljeni <strong>${name}</strong>,</p>
      <p>Vaš lokal <strong>${listingName}</strong> je bil pregledan in potrebuje naslednje popravke:</p>
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 16px 0; border-radius: 4px;">
        <strong>Razlog:</strong> ${reason}
      </div>
      <p>Prosimo, da uredite lokal in ga ponovno oddate v pregled. V dashboardu kliknite "Uredi" in nato "Oddaj v pregled".</p>
      <p>Če imate vprašanja, pišite na <a href="mailto:support@discoverslovenia.ai">support@discoverslovenia.ai</a>.</p>`
    )
  );
}
