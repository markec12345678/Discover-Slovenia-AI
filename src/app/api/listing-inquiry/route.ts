import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { randomId, escapeHtml } from "@/lib/security";
import { sendEmail, emailTemplate } from "@/lib/email";

// POST /api/listing-inquiry — PRAVI lead flow za lokale (B2C → B2B)
//
// Body:
//   {
//     listingId: string,
//     name: string, email: string, phone: string,
//     date?: string, time?: string, groupSize?: number, notes?: string
//   }
//
// 1. Zapiše ListingEvent (type "lead") — lead je VEDNO zabeležen v bazi
// 2. Pošlje email ponudniku (listing.email / ownerEmail / Owner.email)
// 3. Pošlje potrditveni email gostu
//    → napaka emaila NE sesuje zahteve (lead je shranjen v DB)
//
// Razlika do /api/bookings: tu NI rezervacije (ni stranke/cene) — samo
// povpraševanje, ki ga ponudnik obdela osebno (poišče termin, ponudi ceno).
export async function POST(request: Request) {
  // Rate limit povpraševanj (preprečuje spam ponudnikom)
  const limited = rateLimit(request, {
    limit: 10,
    windowMs: 60 * 60_000,
    key: "listing-inquiry",
  });
  if (limited) return limited;

  try {
    const body: unknown = await request.json();
    const b = (body ?? {}) as Record<string, unknown>;

    // === Validacija (enak vzorec kot /api/bookings) ===
    const listingId = String(b.listingId ?? "").trim();
    if (!listingId) {
      return NextResponse.json(
        { success: false, error: "Manjka listingId" },
        { status: 400 }
      );
    }

    const name = String(b.name ?? "").trim();
    if (name.length < 2) {
      return NextResponse.json(
        { success: false, error: "Manjka ime in priimek" },
        { status: 400 }
      );
    }

    const email = String(b.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: "Neveljaven email naslov" },
        { status: 400 }
      );
    }

    const phone = String(b.phone ?? "").trim();
    if (phone.length < 5) {
      return NextResponse.json(
        { success: false, error: "Manjka telefonska številka" },
        { status: 400 }
      );
    }

    const notes = String(b.notes ?? "").trim().slice(0, 2000);

    const time =
      typeof b.time === "string" ? b.time.trim().slice(0, 20) : "";

    const groupSizeRaw = b.groupSize;
    let groupSize: number | null = null;
    if (groupSizeRaw !== undefined && groupSizeRaw !== null && groupSizeRaw !== "") {
      const gs = Number(groupSizeRaw);
      if (!Number.isInteger(gs) || gs < 1 || gs > 100) {
        return NextResponse.json(
          { success: false, error: "Neveljavno število oseb" },
          { status: 400 }
        );
      }
      groupSize = gs;
    }

    const dateRaw = b.date;
    let date: Date | null = null;
    if (dateRaw !== undefined && dateRaw !== null && String(dateRaw).trim() !== "") {
      date = new Date(String(dateRaw));
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json(
          { success: false, error: "Neveljaven datum povpraševanja" },
          { status: 400 }
        );
      }
    }

    // === Server-side preverjanje lokala iz DB ===
    const listing = await db.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        name: true,
        email: true,
        ownerEmail: true,
        ownerId: true,
        status: true,
      },
    });

    if (!listing || listing.status !== "published") {
      return NextResponse.json(
        { success: false, error: "Lokal ne obstaja ali ni aktiven" },
        { status: 404 }
      );
    }

    // Kontaktni email ponudnika: listing.email → ownerEmail → Owner (po ownerId)
    let providerEmail = listing.email || listing.ownerEmail || null;
    if (!providerEmail && listing.ownerId) {
      const owner = await db.owner.findUnique({
        where: { id: listing.ownerId },
        select: { email: true },
      });
      providerEmail = owner?.email ?? null;
    }

    const dateLabel = date
      ? date.toLocaleDateString("sl-SI", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : null;

    // === Zapiši lead v ListingEvent (VEDNO — tudi če email spodleti) ===
    const reference = `IF-POV-${randomId(8)}`;

    await db.listingEvent.create({
      data: {
        listingId: listing.id,
        type: "lead",
        source: "booking-assistant",
        metadata: JSON.stringify({
          reference,
          name,
          email,
          phone,
          date: date ? date.toISOString().slice(0, 10) : null,
          time: time || null,
          groupSize,
          notes: notes || null,
        }),
      },
    });

    // Inkrementiraj leadCount na lokalu (ne-critical)
    try {
      await db.listing.update({
        where: { id: listing.id },
        data: { leadCount: { increment: 1 } },
      });
    } catch (e) {
      console.error("[listing-inquiry] leadCount increment napaka:", e);
    }

    // === Email ponudniku (vsi uporabniški vnosi so escapani) ===
    if (providerEmail) {
      try {
        const rows = [
          ["Ime gosta", escapeHtml(name)],
          ["Email", `<a href="mailto:${escapeHtml(email)}" style="color: #2d6a3e;">${escapeHtml(email)}</a>`],
          [
            "Telefon",
            `<a href="tel:${escapeHtml(phone)}" style="color: #2d6a3e;">${escapeHtml(phone)}</a>`,
          ],
          ["Želeni datum", escapeHtml(dateLabel ?? "—")],
          ["Želeni čas", escapeHtml(time || "—")],
          ["Število oseb", escapeHtml(groupSize !== null ? String(groupSize) : "—")],
          ["Sklic", escapeHtml(reference)],
        ]
          .map(
            ([label, value]) =>
              `<tr><td style="padding: 6px 0; color: #6b7280;">${label}:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${value}</td></tr>`
          )
          .join("");

        const notesHtml = notes
          ? `<div style="background: #f9fafb; border-left: 4px solid #2d6a3e; padding: 14px 18px; margin: 20px 0; border-radius: 4px;"><strong>Sporočilo gosta:</strong><br/><br/>${escapeHtml(notes)}</div>`
          : "";

        const providerHtml = emailTemplate(
          `Novo povpraševanje ${reference}`,
          `
            <p>Prejeli ste novo povpraševanje za <strong>${escapeHtml(listing.name)}</strong> prek platforme Discover Slovenia AI.</p>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <table style="width: 100%; font-size: 14px;">${rows}</table>
            </div>
            ${notesHtml}
            <p>Odgovorite gostu neposredno na <a href="mailto:${escapeHtml(email)}" style="color: #2d6a3e;">${escapeHtml(email)}</a>. Hitri odgovor (v 24 h) močno poveča možnost rezervacije.</p>
          `
        );

        await sendEmail({
          to: providerEmail,
          subject: `Novo povpraševanje ${reference} — ${name}`,
          html: providerHtml,
          text: `Novo povpraševanje ${reference} za ${listing.name}: ${name} (${email}, ${phone}). Datum: ${dateLabel ?? "—"}${time ? `, čas: ${time}` : ""}${groupSize !== null ? `, oseb: ${groupSize}` : ""}.${notes ? `\n\nSporočilo: ${notes}` : ""}`,
        });
      } catch (e) {
        console.error("[listing-inquiry] provider email napaka:", e);
      }
    }

    // === Potrditveni email gostu ===
    try {
      const summaryRows = [
        ["Lokal", escapeHtml(listing.name)],
        ["Datum", escapeHtml(dateLabel ?? "dogovorili se boste s ponudnikom")],
        ["Čas", escapeHtml(time || "—")],
        ["Število oseb", escapeHtml(groupSize !== null ? String(groupSize) : "—")],
        ["Sklic", escapeHtml(reference)],
      ]
        .map(
          ([label, value]) =>
            `<tr><td style="padding: 6px 0; color: #6b7280;">${label}:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${value}</td></tr>`
        )
        .join("");

      const guestHtml = emailTemplate(
        "Povpraševanje poslano ✅",
        `
          <p>Pozdravljeni <strong>${escapeHtml(name)}</strong>,</p>
          <p>Tvoje povpraševanje je poslano ponudniku. Ponudnik te bo kontaktiral (običajno v 24 h).</p>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <table style="width: 100%; font-size: 14px;">${summaryRows}</table>
          </div>
          ${notes ? `<p style="font-size: 13px; color: #6b7280;">Tvoje sporočilo: <em>${escapeHtml(notes)}</em></p>` : ""}
          <p>Medtem si lahko ogledaš več idej za potovanje po Sloveniji:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://discoverslovenia.ai" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Discover Slovenia AI →</a>
          </div>
          <p style="font-size: 13px; color: #6b7280;">Za spremembe odgovori na to sporočilo ali se obrni neposredno na ponudnika.</p>
        `
      );

      await sendEmail({
        to: email,
        subject: `Povpraševanje poslano — ${listing.name} (${reference})`,
        html: guestHtml,
        text: `Povpraševanje ${reference} za ${listing.name} je poslano ponudniku. Ponudnik te bo kontaktiral (običajno v 24 h). Platforma: https://discoverslovenia.ai`,
      });
    } catch (e) {
      console.error("[listing-inquiry] guest email napaka:", e);
    }

    return NextResponse.json({
      success: true,
      reference,
    });
  } catch (error) {
    console.error("[listing-inquiry] POST napaka:", error);
    return NextResponse.json(
      { success: false, error: "Napaka pri pošiljanju povpraševanja" },
      { status: 500 }
    );
  }
}
