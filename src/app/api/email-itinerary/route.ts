import { NextResponse } from "next/server";
import { sendEmail, emailTemplate } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/security";
import type { Itinerary } from "@/lib/types";

// POST /api/email-itinerary — pošlje generiran itinerer na uporabnikov email
//
// VARNOST:
// - vsi uporabniški podatki (notes, priporočila, nasveti, imena destinacij)
//   se pred vstavitvijo v HTML escapajo (prej: HTML injection / phishing)
// - rate limit: 5 emailov na uro na IP (prej: odprt email relay za spam)
export async function POST(request: Request) {
  try {
    // Rate limit (preprečuje zlorabo kot spam relay)
    const limited = rateLimit(request, {
      limit: 5,
      windowMs: 60 * 60_000,
      key: "email-itinerary",
    });
    if (limited) return limited;

    const { email, itinerary, formData } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return NextResponse.json({ error: "Veljaven email je obvezen" }, { status: 400 });
    }

    if (!itinerary || !itinerary.days || !Array.isArray(itinerary.days)) {
      return NextResponse.json({ error: "Manjka itinerer" }, { status: 400 });
    }

    const it = itinerary as Itinerary;

    // Omeji velikost payloada (preprečuje megabajtske maile / DoS)
    if (it.days.length > 14) {
      return NextResponse.json({ error: "Itinerer je predolg za pošiljanje (max 14 dni)" }, { status: 400 });
    }

    // Formatiraj itinerer kot HTML — VSI vnosi escapani
    const daysHtml = it.days
      .map((day) => {
        const dayNum = Number(day.day) || 1;
        const locations = (Array.isArray(day.locations) ? day.locations : [])
          .map((loc) => {
            const time = escapeHtml(loc.time_slot);
            const dest = escapeHtml(loc.destination_name);
            const duration = escapeHtml(loc.duration);
            const cost = escapeHtml(loc.estimated_cost);
            const notes = loc.notes ? escapeHtml(loc.notes) : "";
            return `
          <div style="margin-bottom: 12px;">
            <strong style="color: #2d6a3e;">${time}</strong> — ${dest}<br>
            <span style="color: #6b7280; font-size: 14px;">${duration}h · €${cost}</span>
            ${notes ? `<br><span style="color: #6b7280; font-size: 13px; font-style: italic;">${notes}</span>` : ""}
          </div>`;
          })
          .join("");
        return `
      <div style="margin-bottom: 24px; padding: 16px; background: #f8faf8; border-radius: 8px; border-left: 4px solid #2d6a3e;">
        <h3 style="margin: 0 0 12px 0; color: #1a2e1a;">Dan ${dayNum}</h3>
        ${locations}
      </div>`;
      })
      .join("");

    const recsHtml = it.recommendations?.length
      ? `<div style="margin-top: 20px;"><h3 style="color: #1a2e1a;">Priporočila</h3><ul>${it.recommendations
          .slice(0, 20)
          .map((r) => `<li style="margin-bottom: 4px;">${escapeHtml(r)}</li>`)
          .join("")}</ul></div>`
      : "";

    const tipsHtml = it.tips?.length
      ? `<div style="margin-top: 20px;"><h3 style="color: #1a2e1a;">Nasveti</h3><ul>${it.tips
          .slice(0, 20)
          .map((t) => `<li style="margin-bottom: 4px;">${escapeHtml(t)}</li>`)
          .join("")}</ul></div>`
      : "";

    const days = Number(it.days.length) || 1;
    const totalBudget = escapeHtml(it.total_budget);

    const html = emailTemplate(
      `Vaš ${days}-dnevni itinerer za Slovenijo`,
      `
        <p>Zdravo!</p>
        <p>Tukaj je vaš AI-generiran itinerer za Slovenijo${
          formData
            ? ` (${escapeHtml(formData.days)} dni, proračun €${escapeHtml(formData.budget)}, sezona: ${escapeHtml(formData.season)})`
            : ""
        }.</p>
        <p style="font-size: 18px; font-weight: bold; color: #2d6a3e;">Skupni strošek: €${totalBudget}</p>
        ${daysHtml}
        ${recsHtml}
        ${tipsHtml}
        <div style="margin-top: 24px; padding: 16px; background: #f0fdf4; border-radius: 8px; text-align: center;">
          <p>Želite rezervirati nastanitev ali aktivnosti?</p>
          <a href="https://discoverslovenia.ai/#načrtuj" style="display: inline-block; background: #2d6a3e; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; margin-top: 8px;">Odpri platformo →</a>
        </div>
      `
    );

    const success = await sendEmail({
      to: String(email),
      subject: `Vaš ${days}-dnevni itinerer za Slovenijo 🇸🇮`,
      html,
    });

    if (success) {
      // Shrani kot newsletter subscriber tudi
      try {
        const fs = await import("fs/promises");
        const path = await import("path");
        const dataDir = path.join(process.cwd(), "data");
        const filePath = path.join(dataDir, "newsletter.json");
        try { await fs.mkdir(dataDir, { recursive: true }); } catch {}
        let subscribers: Array<{ email: string; createdAt: string; source?: string }> = [];
        try { const existing = await fs.readFile(filePath, "utf-8"); subscribers = JSON.parse(existing); } catch {}
        const normalizedEmail = String(email).toLowerCase().trim();
        if (!subscribers.some((s) => s.email === normalizedEmail)) {
          subscribers.push({ email: normalizedEmail, createdAt: new Date().toISOString(), source: "itinerary_email" });
          await fs.writeFile(filePath, JSON.stringify(subscribers, null, 2), "utf-8");
        }
      } catch {}

      return NextResponse.json({ success: true, message: "Itinerer poslan na email!" });
    } else {
      return NextResponse.json({ error: "Napaka pri pošiljanju emaila" }, { status: 500 });
    }
  } catch (error) {
    console.error("[email-itinerary] napaka:", error);
    return NextResponse.json({ error: "Napaka pri pošiljanju" }, { status: 500 });
  }
}
