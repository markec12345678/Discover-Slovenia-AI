import { NextResponse } from "next/server";
import { sendEmail, emailTemplate } from "@/lib/email";
import type { Itinerary } from "@/lib/types";

// POST /api/email-itinerary — pošlje generiran itinerer na uporabnikov email
export async function POST(request: Request) {
  try {
    const { email, itinerary, formData } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Veljaven email je obvezen" }, { status: 400 });
    }

    if (!itinerary || !itinerary.days) {
      return NextResponse.json({ error: "Manjka itinerer" }, { status: 400 });
    }

    const it = itinerary as Itinerary;

    // Formatiraj itinerer kot HTML
    const daysHtml = it.days.map((day) => `
      <div style="margin-bottom: 24px; padding: 16px; background: #f8faf8; border-radius: 8px; border-left: 4px solid #2d6a3e;">
        <h3 style="margin: 0 0 12px 0; color: #1a2e1a;">Dan ${day.day}</h3>
        ${day.locations.map((loc) => `
          <div style="margin-bottom: 12px;">
            <strong style="color: #2d6a3e;">${loc.time_slot}</strong> — ${loc.destination_name}<br>
            <span style="color: #6b7280; font-size: 14px;">${loc.duration}h · €${loc.estimated_cost}</span>
            ${loc.notes ? `<br><span style="color: #6b7280; font-size: 13px; font-style: italic;">${loc.notes}</span>` : ""}
          </div>
        `).join("")}
      </div>
    `).join("");

    const recsHtml = it.recommendations?.length
      ? `<div style="margin-top: 20px;"><h3 style="color: #1a2e1a;">Priporočila</h3><ul>${it.recommendations.map((r) => `<li style="margin-bottom: 4px;">${r}</li>`).join("")}</ul></div>`
      : "";

    const tipsHtml = it.tips?.length
      ? `<div style="margin-top: 20px;"><h3 style="color: #1a2e1a;">Nasveti</h3><ul>${it.tips.map((t) => `<li style="margin-bottom: 4px;">${t}</li>`).join("")}</ul></div>`
      : "";

    const html = emailTemplate(
      `Vaš ${it.days.length}-dnevni itinerer za Slovenijo`,
      `
        <p>Zdravo!</p>
        <p>Tukaj je vaš AI-generiran itinerer za Slovenijo${formData ? ` (${formData.days} dni, proračun €${formData.budget}, sezona: ${formData.season})` : ""}.</p>
        <p style="font-size: 18px; font-weight: bold; color: #2d6a3e;">Skupni strošek: €${it.total_budget}</p>
        ${daysHtml}
        ${recsHtml}
        ${tipsHtml}
        <div style="margin-top: 24px; padding: 16px; background: #f0fdf4; border-radius: 8px; text-align: center;">
          <p>Želite rezervirati nastanitev ali aktivnosti?</p>
          <a href="https://discoverslovenia.ai/#nacrtuj" style="display: inline-block; background: #2d6a3e; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; margin-top: 8px;">Odpri platformo →</a>
        </div>
      `
    );

    const success = await sendEmail({
      to: email,
      subject: `Vaš ${it.days.length}-dnevni itinerer za Slovenijo 🇸🇮`,
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
        const normalizedEmail = email.toLowerCase().trim();
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
