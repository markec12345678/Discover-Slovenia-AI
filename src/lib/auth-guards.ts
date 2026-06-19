import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

// Preveri ali je uporabnik prijavljen lastnik — uporablja se v owner API-jih
export async function requireOwner() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return {
      error: NextResponse.json(
        { error: "Niste prijavljeni" },
        { status: 401 }
      ),
      session: null,
    };
  }
  return { error: null, session };
}

// Preveri admin geslo (preprost env-based auth za /admin)
export function checkAdmin(password: string | null | undefined): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return password === adminPassword;
}
