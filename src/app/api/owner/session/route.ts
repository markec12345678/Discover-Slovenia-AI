import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET /api/owner/session — vrne trenutno sejo za client-side preverbe
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ session: null, authenticated: false });
  }
  return NextResponse.json({ session, authenticated: true });
}
