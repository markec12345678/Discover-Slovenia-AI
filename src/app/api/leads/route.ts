import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

interface Lead {
  id: string;
  timestamp: string;
  name: string;
  email: string;
  phone?: string;
  businessName: string;
  businessType: string;
  location: string;
  plan: string;
  message?: string;
  gdprConsent: boolean;
}

// Validacija
function validateLead(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return "Manjkajoči podatki.";
  }
  const d = data as Record<string, unknown>;

  if (typeof d.name !== "string" || !d.name.trim()) {
    return "Ime je obvezno";
  }
  if (
    typeof d.email !== "string" ||
    !d.email.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)
  ) {
    return "Veljaven email je obvezen";
  }
  if (typeof d.businessName !== "string" || !d.businessName.trim()) {
    return "Ime lokala je obvezno";
  }
  if (typeof d.businessType !== "string" || !d.businessType.trim()) {
    return "Tip lokala je obvezen";
  }
  if (typeof d.location !== "string" || !d.location.trim()) {
    return "Kraj je obvezen";
  }
  if (typeof d.plan !== "string" || !d.plan.trim()) {
    return "Paket je obvezen";
  }
  if (d.gdprConsent !== true) {
    return "GDPR privolitev je obvezna";
  }
  return null;
}

const LEADS_DIR = path.join(process.cwd(), "data");
const LEADS_FILE = path.join(LEADS_DIR, "leads.json");

async function readLeads(): Promise<Lead[]> {
  try {
    const existing = await fs.readFile(LEADS_FILE, "utf-8");
    const parsed = JSON.parse(existing);
    if (Array.isArray(parsed)) {
      return parsed as Lead[];
    }
    return [];
  } catch {
    // Datoteka ne obstaja ali ni veljaven JSON — začni prazno
    return [];
  }
}

async function writeLeads(leads: Lead[]): Promise<void> {
  await fs.mkdir(LEADS_DIR, { recursive: true });
  await fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), "utf-8");
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    // Validacija
    const error = validateLead(body);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const data = body as Record<string, unknown>;

    const lead: Lead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
      name: String(data.name).trim(),
      email: String(data.email).trim().toLowerCase(),
      phone:
        typeof data.phone === "string" && data.phone.trim()
          ? data.phone.trim()
          : undefined,
      businessName: String(data.businessName).trim(),
      businessType: String(data.businessType),
      location: String(data.location).trim(),
      plan: String(data.plan),
      message:
        typeof data.message === "string" && data.message.trim()
          ? data.message.trim()
          : undefined,
      gdprConsent: true,
    };

    // Preberi obstoječe leadove in dodaj novega (append-only)
    const leads = await readLeads();
    leads.push(lead);

    // Shrani nazaj
    await writeLeads(leads);

    return NextResponse.json({
      success: true,
      id: lead.id,
      message: "Prijava uspešno prejeta",
    });
  } catch (error) {
    console.error("[leads] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri shranjevanju prijave. Poskusite kasneje." },
      { status: 500 }
    );
  }
}

// GET — za preverjanje števila leadov (admin, brez občutljivih podatkov)
export async function GET() {
  try {
    const leads = await readLeads();
    return NextResponse.json({
      count: leads.length,
      latest: leads[leads.length - 1]?.timestamp ?? null,
    });
  } catch {
    return NextResponse.json({ count: 0, latest: null });
  }
}
