import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  suggestTags,
  type AutoTagRequest,
} from "@/lib/auto-tag-taxonomy";

// POST /api/owner/auto-tag — DETERMINISTIČNI predlagalnik kategorije,
// atributov in tagov iz opisa (Issue #9 ZERO-AI: slovar taksonomije).
//
// Lastnik vnese opis svojega lokala/izdelka/izkušnje, slovar taksonomije
// (SL + EN ključne besede, kuhinja, aktivnosti) pa predlaga:
// - category (ena izmed veljavnih kategorij — izključno iz enuma)
// - attributes (organic, handmade, local, vegan, familyFriendly, itd.)
// - tags (prosti tagi za iskanje — izključno iz lastnikovega besedila
//   in kanonskih taksonomskih žetonov)
//
// Lastnik samo potrdi predloge — prihrani čas pri onboarding-u
// (human-in-the-loop flow NESPREMEMNJEN).
//
// Vir: "deterministic" — nič AI, nič omrežja; enak odgovor za enak vhod.
//
// VARNOST: zahteva prijavljeno owner sejo + rate limit (nespremenjeno).

export async function POST(request: Request) {
  // Rate limit (5 na 10 min na IP — nespremenjena varovalka)
  const limited = rateLimit(request, {
    limit: 5,
    windowMs: 10 * 60_000,
    key: "auto-tag",
  });
  if (limited) return limited;

  // Zahtevaj owner sejo — endpoint je namenjen prijavljelim ponudnikom
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Za auto-tag se prijavite kot ponudnik." },
      { status: 401 }
    );
  }
  // P3a-6: B2C seja (popotnik) nima dostopa do ponudniških endpointov
  if (session.user.accountType === "user") {
    return NextResponse.json(
      { error: "Ta endpoint je za račune ponudnikov" },
      { status: 403 }
    );
  }

  let body: AutoTagRequest;
  try {
    body = (await request.json()) as AutoTagRequest;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  if (!body?.name?.trim() || !body?.description?.trim()) {
    return NextResponse.json(
      { error: "Manjkajo name and description" },
      { status: 400 }
    );
  }

  if (!body.type || !["listing", "product", "experience"].includes(body.type)) {
    return NextResponse.json(
      { error: "Neveljaven type (listing | product | experience)" },
      { status: 400 }
    );
  }

  // DETERMINISTIČNA klasifikacija iz slovarja taksonomije (0 AI, 0 omrežja).
  // Kategorija/atributi so validirani z enumeracijo zgoraj (suggestTags
  // vrača SAMO iz veljavnih seznamov).
  const result = suggestTags(body);

  console.log(
    `[auto-tag] deterministični predlog za "${body.name}" (${body.type}): ` +
      `category=${result.category}, confidence=${result.confidence}, ` +
      `${Object.entries(result.attributes).filter(([, v]) => v).length} attrs, ` +
      `${result.tags.length} tags`
  );

  return NextResponse.json(result);
}
