import { NextResponse } from "next/server";
import {
  openMeteoCurrentUrl,
  parseOpenMeteoCurrent,
  parseOpenMeteoToday,
  type CurrentWeatherPayload,
  type TodayOutlookPayload,
} from "@/lib/weather-utils";

// GET /api/weather?lat=46.37&lng=14.09[&lang=sl|en][&daily=1]
// Uporablja Open-Meteo (brez API ključa, brezplačno).
// Prevajanje WMO kod → besedilo/ikone je v skupnem @/lib/weather-utils
// (ČISTI parse sloji TASK 65 — fail-closed, testirljivi brez omrežja).
//
// TASK 65 (Go Mode „Na poti"): `lang` izbere jezik besedila pogoje
// (privzeto sl — obstoječi klici brez parametra se obnašajo ENAKO kot prej),
// `daily=1` doda današnjo dnevno napoved (tempMax + verjetnost padavin)
// iz ISTEGA klica Open-Meteo (0 dodatnih klicev na vir).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "Manjkata lat in lng parametra" },
      { status: 400 }
    );
  }

  // P7-B (F5): validacija pred interpolacijo v zunanji URL — sprejmemo samo
  // decimalne številke (prej bi šel skozi poljuben npr. "1.0&x=Injector")
  const COORD_RE = /^-?\d{1,3}(\.\d+)?$/;
  if (!COORD_RE.test(lat) || !COORD_RE.test(lng)) {
    return NextResponse.json(
      { error: "Neveljavna koordinata" },
      { status: 400 }
    );
  }

  // TASK 65: jezik besedila (fail-closed na privzeti sl — samo "en" preklopi)
  const lang = searchParams.get("lang") === "en" ? "en" : "sl";
  // TASK 65: današnja dnevna napoved (samo dobesedno "1" jo vklopi)
  const withDaily = searchParams.get("daily") === "1";

  try {
    const url = openMeteoCurrentUrl(lat, lng, withDaily);

    const res = await fetch(url, { next: { revalidate: 600 } }); // cache 10 min
    if (!res.ok) {
      throw new Error(`Open-Meteo: ${res.status}`);
    }

    const data: unknown = await res.json();

    // Fail-closed parse: neveljaven odgovor vira → 502 (nikoli izmišljenih
    // vrednosti). Prej se je .current dostopal neposredno (TypeError → 502)
    // — vedenje ob napaki ostaja enako, zdaj pa je logika testirana.
    const current = parseOpenMeteoCurrent(data, lang);
    if (!current) {
      throw new Error("Open-Meteo: neveljaven odgovor (current)");
    }

    // Daily: SAMO če je zahtevan IN veljaven — neveljaven daily blok NE sesuje
    // trenutnega vremena (iskrena odsotnost polja today, ne napaka).
    const today: TodayOutlookPayload | null = withDaily
      ? parseOpenMeteoToday(data, lang)
      : null;

    const payload: CurrentWeatherPayload & { today?: TodayOutlookPayload } =
      current;
    if (today) payload.today = today;

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[weather] napaka:", error);
    return NextResponse.json(
      { error: "Vreme trenutno ni na voljo" },
      { status: 502 }
    );
  }
}
