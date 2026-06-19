import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Tip rezultata — uporabljen v booking-panel.tsx
interface ParsedListing {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  destinationId: string | null;
  destinationName: string | null;
  address: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  images: string[];
  plan: string;
  featured: boolean;
  verified: boolean;
  rating: number;
  reviewCount: number;
  priceRange: string;
  specialties: string[];
}

interface ParsedExperience {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  destinationId: string | null;
  destinationName: string | null;
  pricePerPerson: number;
  currency: string;
  durationHours: number;
  minGroupSize: number;
  maxGroupSize: number;
  languages: string[];
  meetingPoint: string | null;
  address: string;
  images: string[];
  providerName: string;
  providerEmail: string | null;
  providerPhone: string | null;
  providerWebsite: string | null;
  featured: boolean;
  verified: boolean;
  rating: number;
  reviewCount: number;
  familyFriendly: boolean;
}

interface ParsedProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  destinationId: string | null;
  destinationName: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  images: string[];
  organic: boolean;
  handmade: boolean;
  local: boolean;
  vegan: boolean;
  featured: boolean;
  verified: boolean;
  rating: number;
  reviewCount: number;
  sellerName: string;
  sellerEmail: string | null;
  sellerWebsite: string | null;
  shippingFree: boolean;
}

export interface BookingOptions {
  listings: ParsedListing[];
  experiences: ParsedExperience[];
  products: ParsedProduct[];
}

export type BookingData = Record<string, BookingOptions>;

// POST /api/itinerary/bookings
// Telo: { destinationIds: string[] }
// Vrne: { [destinationId]: { listings, experiences, products } }
//
// Za vsako destinacijo pridobi:
//  - listings  (limit 3, featured first)
//  - experiences (limit 3, featured first)
//  - products  (limit 3, featured first)
// Če destinacija nima ničesar, vrne prazne arraye.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { destinationIds?: unknown };
    const raw = Array.isArray(body?.destinationIds) ? body.destinationIds : [];
    // Sanitiziraj — sprejmi samo unikatne, ne-prazne string IDje
    const destinationIds = Array.from(
      new Set(
        raw.filter((x): x is string => typeof x === "string" && x.length > 0)
      )
    );

    if (destinationIds.length === 0) {
      return NextResponse.json({} as BookingData);
    }

    // Vzporedno pridobi podatke za vse destinacije
    // Listingi: vsi lokalni z destinationId v našem seznamu, featured prvi
    const [listings, experiences, products] = await Promise.all([
      db.listing.findMany({
        where: { destinationId: { in: destinationIds } },
        orderBy: [{ featured: "desc" }, { rating: "desc" }],
        take: destinationIds.length * 3, // dovolj velik pool, nato razdelimo
      }),
      db.experience.findMany({
        where: { destinationId: { in: destinationIds } },
        orderBy: [{ featured: "desc" }, { rating: "desc" }],
        take: destinationIds.length * 3,
      }),
      db.product.findMany({
        where: { destinationId: { in: destinationIds } },
        orderBy: [{ featured: "desc" }, { rating: "desc" }],
        take: destinationIds.length * 3,
      }),
    ]);

    // Razčleni JSON polja in razvrsti po destinacijah
    const result: BookingData = {};
    for (const id of destinationIds) {
      result[id] = { listings: [], experiences: [], products: [] };
    }

    for (const l of listings) {
      if (!l.destinationId || !result[l.destinationId]) continue;
      if (result[l.destinationId].listings.length >= 3) continue;
      result[l.destinationId].listings.push({
        id: l.id,
        name: l.name,
        slug: l.slug,
        description: l.description,
        category: l.category,
        destinationId: l.destinationId,
        destinationName: l.destinationName,
        address: l.address,
        phone: l.phone,
        email: l.email,
        website: l.website,
        images: JSON.parse(l.images || "[]") as string[],
        plan: l.plan,
        featured: l.featured,
        verified: l.verified,
        rating: l.rating,
        reviewCount: l.reviewCount,
        priceRange: l.priceRange,
        specialties: l.specialties
          ? (JSON.parse(l.specialties) as string[])
          : [],
      });
    }

    for (const e of experiences) {
      if (!e.destinationId || !result[e.destinationId]) continue;
      if (result[e.destinationId].experiences.length >= 3) continue;
      result[e.destinationId].experiences.push({
        id: e.id,
        name: e.name,
        slug: e.slug,
        description: e.description,
        category: e.category,
        destinationId: e.destinationId,
        destinationName: e.destinationName,
        pricePerPerson: e.pricePerPerson,
        currency: e.currency,
        durationHours: e.durationHours,
        minGroupSize: e.minGroupSize,
        maxGroupSize: e.maxGroupSize,
        languages: JSON.parse(e.languages || "[]") as string[],
        meetingPoint: e.meetingPoint,
        address: e.address,
        images: JSON.parse(e.images || "[]") as string[],
        providerName: e.providerName,
        providerEmail: e.providerEmail,
        providerPhone: e.providerPhone,
        providerWebsite: e.providerWebsite,
        featured: e.featured,
        verified: e.verified,
        rating: e.rating,
        reviewCount: e.reviewCount,
        familyFriendly: e.familyFriendly,
      });
    }

    for (const p of products) {
      if (!p.destinationId || !result[p.destinationId]) continue;
      if (result[p.destinationId].products.length >= 3) continue;
      result[p.destinationId].products.push({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        category: p.category,
        destinationId: p.destinationId,
        destinationName: p.destinationName,
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        currency: p.currency,
        images: JSON.parse(p.images || "[]") as string[],
        organic: p.organic,
        handmade: p.handmade,
        local: p.local,
        vegan: p.vegan,
        featured: p.featured,
        verified: p.verified,
        rating: p.rating,
        reviewCount: p.reviewCount,
        sellerName: p.sellerName,
        sellerEmail: p.sellerEmail,
        sellerWebsite: p.sellerWebsite,
        shippingFree: p.shippingFree,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[itinerary/bookings] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju booking opcij" },
      { status: 500 }
    );
  }
}
