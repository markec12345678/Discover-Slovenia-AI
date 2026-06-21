import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// POST /api/newsletter/subscribe — preprost email capture
// Shrani v data/newsletter.json (demo mode)
// Za production: zamenjaj z Brevo/MailerLite/Resend API
export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Veljaven email je obvezen" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Shrani v data/newsletter.json
    const dataDir = path.join(process.cwd(), "data");
    const filePath = path.join(dataDir, "newsletter.json");

    try { await fs.mkdir(dataDir, { recursive: true }); } catch {}

    let subscribers: Array<{ email: string; createdAt: string }> = [];
    try {
      const existing = await fs.readFile(filePath, "utf-8");
      subscribers = JSON.parse(existing);
    } catch {}

    // Preveri duplikate
    if (subscribers.some((s) => s.email === normalizedEmail)) {
      return NextResponse.json({ success: true, message: "Že prijavljen!" });
    }

    subscribers.push({ email: normalizedEmail, createdAt: new Date().toISOString() });
    await fs.writeFile(filePath, JSON.stringify(subscribers, null, 2), "utf-8");

    // TODO: Production — klici Brevo/MailerLite/Resend API:
    // await fetch("https://api.brevo.com/v3/contacts", {
    //   method: "POST",
    //   headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" },
    //   body: JSON.stringify({ email: normalizedEmail, listIds: [parseInt(process.env.BREVO_LIST_ID || "1")] }),
    // });

    console.log(`[newsletter] Nov subscriber: ${normalizedEmail} (skupno: ${subscribers.length})`);

    return NextResponse.json({ success: true, message: "Uspešno prijavljen!" });
  } catch (error) {
    console.error("[newsletter] napaka:", error);
    return NextResponse.json({ error: "Napaka pri prijavi" }, { status: 500 });
  }
}

// GET — število subscriberjev (za admin)
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "newsletter.json");
    const data = await fs.readFile(filePath, "utf-8");
    const subscribers = JSON.parse(data);
    return NextResponse.json({ count: subscribers.length, latest: subscribers[subscribers.length - 1]?.createdAt || null });
  } catch {
    return NextResponse.json({ count: 0, latest: null });
  }
}
