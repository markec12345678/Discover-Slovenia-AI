import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { verifyCronAuth } from "@/lib/security";

// GET /api/cron/weekly-alerts — vsak ponedeljek pošlje email partnerjem (Faza 3e)
//
// Kliče se preko Vercel Cron ali external cron (npr. GitHub Actions).
//
// Faza 3e (model "ponudniki plačajo" — kot Booking.com):
// - poročilo dobi vsak partner z aktivnostjo, ne le premium/enterprise —
//   FREE partner vidi vrednost AI kanala (rezervacije, €), kar je
//   prodajni moment za premium naročnino
// - nov odsek "AI konzultacije" (turisti ne plačujejo nič): citati,
//   atribuirane rezervacije in njihova vrednost zadnjih 7 dni
export async function GET(request: Request) {
  try {
    // Preveri avtentikacijo (CRON_SECRET Bearer ali admin geslo — timing-safe)
    const unauthorized = verifyCronAuth(request);
    if (unauthorized) return unauthorized;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Pridobi VSE lokalce in izkušnje z ownerjem (partner z izkušnjo,
    // a brez lokala, prav tako dobi poročilo — rezervacije so na izkušnjah)
    const [listings, experiences] = await Promise.all([
      db.listing.findMany({ include: { owner: true } }),
      db.experience.findMany({ include: { owner: true } }),
    ]);

    // Grupiraj po ownerju
    const ownerMap = new Map<
      string,
      {
        email: string;
        name: string;
        businessName: string;
        plan: string;
        listings: typeof listings;
        experienceIds: string[];
      }
    >();

    const ensureOwner = (owner: {
      id: string;
      email: string;
      name: string;
      businessName: string;
      plan: string;
    }) => {
      if (!ownerMap.has(owner.id)) {
        ownerMap.set(owner.id, {
          email: owner.email,
          name: owner.name,
          businessName: owner.businessName,
          plan: owner.plan,
          listings: [],
          experienceIds: [],
        });
      }
    };

    for (const listing of listings) {
      if (!listing.owner) continue;
      ensureOwner(listing.owner);
      ownerMap.get(listing.owner.id)!.listings.push(listing);
    }
    for (const exp of experiences) {
      if (!exp.owner) continue;
      ensureOwner(exp.owner);
      ownerMap.get(exp.owner.id)!.experienceIds.push(exp.id);
    }

    // Za vsakega ownerja pošlji email s statistiko (+ AI kanal)
    let sentCount = 0;
    let consultationOwners = 0;

    for (const [, data] of ownerMap) {
      const listingIds = data.listings.map((l) => l.id);

      // Faza 3e: AI kanal — citati v brezplačnih konzultacijah turistov
      // in rezervacije z atribucijo (Booking.source = "consultation")
      const [
        impressions,
        clicks,
        aiRecs,
        leads,
        consultationCitations,
        consultationBookings,
      ] = await Promise.all([
        db.listingEvent.count({
          where: {
            listingId: { in: listingIds },
            type: "impression",
            createdAt: { gte: sevenDaysAgo },
          },
        }),
        db.listingEvent.count({
          where: {
            listingId: { in: listingIds },
            type: "click",
            createdAt: { gte: sevenDaysAgo },
          },
        }),
        db.listingEvent.count({
          where: {
            listingId: { in: listingIds },
            type: "ai_recommendation",
            createdAt: { gte: sevenDaysAgo },
          },
        }),
        db.listingEvent.count({
          where: {
            listingId: { in: listingIds },
            type: "lead",
            createdAt: { gte: sevenDaysAgo },
          },
        }),
        db.listingEvent.count({
          where: {
            listingId: { in: listingIds },
            type: "ai_recommendation",
            source: "consultation",
            createdAt: { gte: sevenDaysAgo },
          },
        }),
        db.booking.findMany({
          where: {
            source: "consultation",
            experienceId: { in: data.experienceIds },
            createdAt: { gte: sevenDaysAgo },
          },
          select: { experienceName: true, total: true },
        }),
      ]);

      const bookingsFromConsultations = consultationBookings.length;
      const revenueFromConsultations = consultationBookings.reduce(
        (s, b) => s + b.total,
        0
      );

      // Top izkušnje po rezervacijah iz konzultacij (top 3)
      const byExperience = new Map<string, { bookings: number; revenue: number }>();
      for (const b of consultationBookings) {
        const cur = byExperience.get(b.experienceName) ?? { bookings: 0, revenue: 0 };
        cur.bookings += 1;
        cur.revenue += b.total;
        byExperience.set(b.experienceName, cur);
      }
      const topExperiences = Array.from(byExperience.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, 3);

      // Pošlji email samo če je bila aktivnost — vključno z AI kanalom
      // (Booking-style: free partner z rezervacijo IZ konzultacije MORA
      // izvedeti za njo — to je njegova dokazljiva vrednost)
      const hasActivity =
        impressions > 0 ||
        clicks > 0 ||
        aiRecs > 0 ||
        leads > 0 ||
        consultationCitations > 0 ||
        bookingsFromConsultations > 0;

      if (!hasActivity) continue;

      const isPremium = data.plan !== "free";

      // AI kanal odsek (samo če ima kaj pokazati)
      const aiChannelSection =
        consultationCitations > 0 || bookingsFromConsultations > 0
          ? `
              <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #065f46;">🤖 AI konzultacije — turisti ne plačujejo nič</h3>
                <p style="margin: 0 0 12px 0; color: #374151;">
                  Kot pri Booking.com so osebne AI konzultacije za turiste brezplačne —
                  zato jih vpraša več. To je zadnjih 7 dni prineslo <strong>vam</strong>:
                </p>
                <p style="font-size: 18px; margin: 5px 0;">💬 Citati v konzultacijah: <strong>${consultationCitations}×</strong></p>
                <p style="font-size: 18px; margin: 5px 0;">📅 Rezervacije iz konzultacij: <strong>${bookingsFromConsultations}</strong></p>
                <p style="font-size: 18px; margin: 5px 0;">💶 Vrednost rezervacij: <strong>${revenueFromConsultations.toLocaleString("sl-SI")} €</strong></p>
                ${
                  topExperiences.length > 0
                    ? `<p style="margin: 12px 0 0 0; font-size: 14px; color: #374151;">
                         Najbolj prepričljive izkušnje:
                         ${topExperiences
                           .map(
                             (e) =>
                               `<strong>${e.name}</strong> (${e.bookings}× · ${e.revenue.toLocaleString("sl-SI")} €)`
                           )
                           .join(", ")}
                       </p>`
                    : ""
                }
                ${
                  !isPremium
                    ? `<p style="margin: 14px 0 0 0; font-size: 14px; color: #92400e;">
                         💡 Premium partnerji (149 €/mes) dobijo 5-odstotni rangirni boost,
                         vidnejše mesto v konzultacijah in 0 % provizije na
                         AI-prinesenih rezervacijah.
                       </p>`
                    : ""
                }
              </div>
            `
          : "";

      const html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #2d6a3e; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="margin: 0;">🇸🇮 Discover Slovenia AI</h1>
            </div>
            <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <h2>Pozdravljeni, ${data.name}!</h2>
              <p>Pretekli teden je naš AI načrtovalec priporočil vaše lokale turistom. Tukaj je vaša tedenska statistika:</p>

              <div style="background: #f0fdf4; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px 0;">📊 Statistika (zadnjih 7 dni)</h3>
                <p style="font-size: 18px; margin: 5px 0;">👁️ Ogledi: <strong>${impressions}</strong></p>
                <p style="font-size: 18px; margin: 5px 0;">👆 Kliki: <strong>${clicks}</strong></p>
                <p style="font-size: 18px; margin: 5px 0;">🤖 AI priporočila: <strong>${aiRecs}</strong></p>
                <p style="font-size: 18px; margin: 5px 0;">📩 Lead-i: <strong>${leads}</strong></p>
              </div>

              ${aiChannelSection}

              <p>Vaši lokalci v bazi: <strong>${data.listings.length}</strong></p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="https://discoverslovenia.ai/owner/dashboard"
                   style="background: #2d6a3e; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                  Odpri dashboard →
                </a>
              </div>

              <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
                ${
                  isPremium
                    ? "To sporočilo ste prejeli ker ste Premium/Enterprise član Discover Slovenia AI platforme."
                    : "To sporočilo ste prejeli ker ste partner Discover Slovenia AI platforme. Turisti ne plačujejo nič — platformo financirajo ponudniki, ki želijo prioriteto."
                }
              </p>
            </div>
          </div>
        `;

      // Zadeva: rezervacije iz konzultacij so najmočnejši signal → v zadevo
      const subject =
        bookingsFromConsultations > 0
          ? `📊 Tedensko poročilo: ${bookingsFromConsultations} rezervacij iz AI konzultacij (${revenueFromConsultations.toLocaleString("sl-SI")} €)`
          : `📊 Tedensko poročilo: ${impressions} ogledov, ${aiRecs} AI priporočil, ${leads} leadov`;

      await sendEmail({
        to: data.email,
        subject,
        html,
      });
      sentCount++;
      if (consultationCitations > 0 || bookingsFromConsultations > 0) {
        consultationOwners++;
      }
    }

    console.log(
      `[cron/weekly-alerts] Poslano ${sentCount} emailov od ${ownerMap.size} partnerjev (AI kanal aktivnost: ${consultationOwners})`
    );
    return NextResponse.json({
      success: true,
      sent: sentCount,
      totalOwners: ownerMap.size,
      consultationOwners,
    });
  } catch (error) {
    console.error("[cron/weekly-alerts] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pošiljanju tedenskih alertov" },
      { status: 500 }
    );
  }
}
