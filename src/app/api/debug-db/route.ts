import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";

// ============================================================================
// GET /api/debug-db — diagnostika povezave na bazo (Faza 4e)
// ============================================================================
// P3a-5: NE-JAVNA več — zahteva admin geslo (timing-safe checkAdmin iz
// auth-guards; brez/napačno geslo → 401). Diagnostični izpis (okolje,
// resolucija DATABASE_URL, prisotnost demo seeda, preprosta poizvedba) ostane
// namenoma NEobčutljiv (brez skrivnosti, brez vsebin) — zdaj viden samo
// avtoriziranemu admin-u.
export async function GET(request: Request) {
  if (!checkAdmin(request.headers.get("x-admin-password"))) {
    return NextResponse.json(
      { error: "Neavtorizirano" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const raw = process.env.DATABASE_URL ?? null;

  let productProbe: { ok: true; count: number } | { ok: false; error: string };
  try {
    const count = await db.product.count();
    productProbe = { ok: true, count };
  } catch (error) {
    productProbe = {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 200) : String(error),
    };
  }

  return NextResponse.json(
    {
      environment: {
        nodeEnv: process.env.NODE_ENV ?? null,
        vercel: process.env.VERCEL ?? null,
        vercelRegion: process.env.VERCEL_REGION ?? null,
        nextRuntime: process.env.NEXT_RUNTIME ?? null,
        demoDbDisabled: process.env.DSA_DISABLE_DEMO_DB === "1",
      },
      database: {
        urlScheme: raw?.split(":")[0] ?? null,
        urlIsFile: raw?.startsWith("file:") ?? false,
        // Polna pot NI občutljiva, vendar javno ne objavljamo — samo indikator:
        urlIsTmpDemo: raw === "file:/tmp/dsa-demo.db",
        cwd: process.cwd(),
        demoSeedInBundle: fs.existsSync(
          path.join(process.cwd(), "db", "demo-seed.db")
        ),
        tmpDemoCopy: fs.existsSync("/tmp/dsa-demo.db"),
      },
      productProbe,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
