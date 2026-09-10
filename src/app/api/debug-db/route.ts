import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";

// ============================================================================
// GET /api/debug-db — diagnostika povezave na bazo (Faza 4e)
// ============================================================================
// JAVNA, a neobčutljiva diagnostika (brez skrivnosti, brez vsebin):
// okolje, resolucija DATABASE_URL, prisotnost demo seeda in rezultat preproste
// poizvedbe. Namenjena opazovanju zdravja DB plasti — zlasti na Vercelu,
// kjer so runtime razmere (cwd, bundle) drugačne od lokalnega okolja.
export async function GET() {
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
