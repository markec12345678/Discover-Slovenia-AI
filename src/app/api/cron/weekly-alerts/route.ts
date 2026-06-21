import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

// GET /api/cron/weekly-alerts — vsak ponedeljek pošlje email vsem premium/enterprise ownerjem
// Kliče se preko Vercel Cron ali external cron (npr. GitHub Actions)
export async function GET(request: Request) {
  try {
    // Preveri avtentikacijo (CRON_SECRET ali admin geslo)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const adminPassword = process.env.ADMIN_PASSWORD;

    const authorized =
      (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (adminPassword && request.headers.get("x-admin-password") === adminPassword);

    if (!authorized) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    // Pridobi vse premium/enterprise lokalce z ownerjem
    const premiumListings = await db.listing.findMany({
      where: {
        plan: { in: ["premium", "enterprise"] },
      },
      include: {
        owner: true,
      },
    });

    // Grupiraj po ownerju
    const ownerMap = new Map<string, { email: string; name: string; businessName: string; listings: typeof premiumListings }>();
    for (const listing of premiumListings) {
      if (!listing.owner) continue;
      const ownerId = listing.owner.id;
      if (!ownerMap.has(ownerId)) {
        ownerMap.set(ownerId, {
          email: listing.owner.email,
          name: listing.owner.name,
          businessName: listing.owner.businessName,
          listings: [],
        });
      }
      ownerMap.get(ownerId)!.listings.push(listing);
    }

    // Za vsakega ownerja pošlji email s statistiko
    let sentCount = 0;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const [, data] of ownerMap) {
      const listingIds = data.listings.map((l) => l.id);

      // Pridobi evente zadnjih 7 dni
      const [impressions, clicks, aiRecs, leads] = await Promise.all([
        db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "impression", createdAt: { gte: sevenDaysAgo } } }),
        db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "click", createdAt: { gte: sevenDaysAgo } } }),
        db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "ai_recommendation", createdAt: { gte: sevenDaysAgo } } }),
        db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "lead", createdAt: { gte: sevenDaysAgo } } }),
      ]);

      // Pošlji email samo če je bila aktivnost
      if (impressions > 0 || clicks > 0 || aiRecs > 0 || leads > 0) {
        const html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #2d6a3e; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="margin: 0;">🇸🇮 I Feel Slovenia</h1>
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

              <p>Vaši lokalci v bazi: <strong>${data.listings.length}</strong></p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="https://ifeelslovenia.si/owner/dashboard" 
                   style="background: #2d6a3e; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                  Odpri dashboard →
                </a>
              </div>

              <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
                To sporočilo ste prejeli ker ste Premium/Enterprise član I Feel Slovenia platforme.
              </p>
            </div>
          </div>
        `;

        await sendEmail({
          to: data.email,
          subject: `📊 Tedensko poročilo: ${impressions} ogledov, ${aiRecs} AI priporočil, ${leads} leadov`,
          html,
        });
        sentCount++;
      }
    }

    console.log(`[cron/weekly-alerts] Poslano ${sentCount} emailov od ${ownerMap.size} ownerjev`);
    return NextResponse.json({ success: true, sent: sentCount, totalOwners: ownerMap.size });
  } catch (error) {
    console.error("[cron/weekly-alerts] napaka:", error);
    return NextResponse.json({ error: "Napaka pri pošiljanju tedenskih alertov" }, { status: 500 });
  }
}
