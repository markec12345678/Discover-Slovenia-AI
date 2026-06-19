import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth-guards";

// POST /api/admin/verify — preveri admin geslo
// Telo: { password: string }
// Odgovor: { success: true } | { error: string } (401)
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const password =
      typeof body === "object" &&
      body !== null &&
      "password" in body &&
      typeof (body as Record<string, unknown>).password === "string"
        ? ((body as Record<string, unknown>).password as string)
        : null;

    if (checkAdmin(password)) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json(
      { error: "Napačno geslo" },
      { status: 401 }
    );
  } catch (error) {
    console.error("[admin/verify] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri preverjanju gesla" },
      { status: 500 }
    );
  }
}
