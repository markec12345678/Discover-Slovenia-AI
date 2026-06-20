import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { checkAdmin } from "@/lib/auth-guards";

// Statusi lead-a (admin upravljanje)
export type LeadStatus = "nov" | "kontaktiran" | "zakljucen";

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
  status?: LeadStatus; // dodano za admin upravljanje
}

const LEADS_DIR = path.join(process.cwd(), "data");
const LEADS_FILE = path.join(LEADS_DIR, "leads.json");

const VALID_STATUSES: LeadStatus[] = ["nov", "kontaktiran", "zakljucen"];

function unauthorized() {
  return NextResponse.json(
    { error: "Neavtoriziran dostop" },
    { status: 401 }
  );
}

async function readLeads(): Promise<Lead[]> {
  try {
    const existing = await fs.readFile(LEADS_FILE, "utf-8");
    const parsed = JSON.parse(existing);
    if (Array.isArray(parsed)) {
      return parsed as Lead[];
    }
    return [];
  } catch {
    return [];
  }
}

async function writeLeads(leads: Lead[]): Promise<void> {
  await fs.mkdir(LEADS_DIR, { recursive: true });
  await fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), "utf-8");
}

// GET /api/admin/leads — vsi leadovi (admin)
export async function GET(request: Request) {
  const adminPassword = request.headers.get("x-admin-password");
  if (!checkAdmin(adminPassword)) {
    return unauthorized();
  }

  try {
    const leads = await readLeads();
    // Zagotovi status za stare leadove
    const normalized = leads.map((l) => ({
      ...l,
      status: l.status && VALID_STATUSES.includes(l.status) ? l.status : "nov",
    }));
    return NextResponse.json({ leads: normalized, total: normalized.length });
  } catch (error) {
    console.error("[admin/leads] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju leadov" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/leads — posodobi status lead-a
// Telo: { id: string, status: "nov" | "kontaktiran" | "zakljucen" }
export async function PUT(request: Request) {
  const adminPassword = request.headers.get("x-admin-password");
  if (!checkAdmin(adminPassword)) {
    return unauthorized();
  }

  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { error: "Manjkajoči podatki" },
        { status: 400 }
      );
    }
    const data = body as Record<string, unknown>;
    const id = typeof data.id === "string" ? data.id : null;
    const status = typeof data.status === "string" ? data.status : null;

    if (!id) {
      return NextResponse.json(
        { error: "ID lead-a je obvezen" },
        { status: 400 }
      );
    }
    if (!status || !VALID_STATUSES.includes(status as LeadStatus)) {
      return NextResponse.json(
        { error: "Neveljaven status" },
        { status: 400 }
      );
    }

    const leads = await readLeads();
    const idx = leads.findIndex((l) => l.id === id);
    if (idx === -1) {
      return NextResponse.json(
        { error: "Lead ni najden" },
        { status: 404 }
      );
    }

    leads[idx] = {
      ...leads[idx],
      status: status as LeadStatus,
    };
    await writeLeads(leads);

    return NextResponse.json({
      success: true,
      lead: leads[idx],
      message: "Status posodobljen",
    });
  } catch (error) {
    console.error("[admin/leads] PUT napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri posodabljanju statusa" },
      { status: 500 }
    );
  }
}
