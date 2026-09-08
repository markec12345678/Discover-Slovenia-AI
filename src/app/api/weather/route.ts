import { NextResponse } from "next/server";
import { weatherCodeToIcon, weatherCodeToText } from "@/lib/weather-utils";

// GET /api/weather?lat=46.37&lng=14.09
// Uporablja Open-Meteo (brez API ključa, brezplačno)
// Prevajanje WMO kod → slovensko besedilo/ikone je v skupnem @/lib/weather-utils
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

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Europe/Ljubljana`;

    const res = await fetch(url, { next: { revalidate: 600 } }); // cache 10 min
    if (!res.ok) {
      throw new Error(`Open-Meteo: ${res.status}`);
    }

    const data = await res.json();
    const current = data.current;
    const code = current.weather_code as number;

    return NextResponse.json({
      condition: weatherCodeToText(code),
      temp: Math.round(current.temperature_2m),
      humidity: Math.round(current.relative_humidity_2m),
      windSpeed: Math.round(current.wind_speed_10m),
      icon: weatherCodeToIcon(code),
    });
  } catch (error) {
    console.error("[weather] napaka:", error);
    return NextResponse.json(
      { error: "Vreme trenutno ni na voljo" },
      { status: 502 }
    );
  }
}
