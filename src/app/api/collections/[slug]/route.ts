import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toPublicProduct, toPublicExperience } from "@/lib/public-fields";
import {
  getCollectionBySlug,
  PRODUCT_CATEGORY_VALUES,
  EXPERIENCE_CATEGORY_VALUES,
  type CollectionFilters,
} from "@/lib/collections";

// GET /api/collections/[slug]
// Vrne { collection, products, experiences } kjer products/experiences ustrezajo
// filtrom zbirke. Filtri so aplikirani tipno:
//  - categories: presek z experience kategorijami → experiences; presek z product
//    kategorijami (ali productCategories, če je podan) → products
//  - attributes: organic/handmade/local/vegan → products; familyFriendly/accessibility → experiences
//  - destinationIds: OR pogoj (IN list) na obeh modelih
//  - priceMin/priceMax: products.price / experiences.pricePerPerson
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const collection = getCollectionBySlug(slug);

    if (!collection) {
      return NextResponse.json(
        { error: "Zbirka ni najdena" },
        { status: 404 }
      );
    }

    const [products, experiences] = await Promise.all([
      fetchProducts(collection.filters),
      fetchExperiences(collection.filters),
    ]);

    return NextResponse.json({
      collection,
      products,
      experiences,
      total: products.length + experiences.length,
    });
  } catch (error) {
    console.error("[collections] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju zbirke" },
      { status: 500 }
    );
  }
}

async function fetchProducts(filters: CollectionFilters) {
  // P3c-8: zbirka je javna stran — SAMO objavljeni izdelki. `status` je vedno
  // v where, zato "praznega" where ne more biti; "ni dejanskih filtrov"
  // preverimo ločeno (Object.keys brez statusa).
  const where: Record<string, unknown> = { status: "published" };
  const hasProductFilter = () =>
    Object.keys(where).some((k) => k !== "status");

  // Kategorije izdelkov: uporabi productCategories, če je podan; sicer presek
  // `categories` z veljavnimi kategorijami izdelkov.
  const sourceCats = filters.productCategories ?? filters.categories ?? [];
  const prodCats = sourceCats.filter((c) =>
    (PRODUCT_CATEGORY_VALUES as readonly string[]).includes(c)
  );
  if (prodCats.length > 0) {
    where.category = { in: prodCats };
  }

  if (filters.destinationIds && filters.destinationIds.length > 0) {
    where.destinationId = { in: filters.destinationIds };
  }

  // Cena (min in/ali max) — kombiniramo v eno cenovno-objekt.
  const priceFilter: { gte?: number; lte?: number } = {};
  if (typeof filters.priceMin === "number") priceFilter.gte = filters.priceMin;
  if (typeof filters.priceMax === "number") priceFilter.lte = filters.priceMax;
  if (priceFilter.gte !== undefined || priceFilter.lte !== undefined) {
    where.price = priceFilter;
  }

  // Atributi (veljavni za products).
  const attrs = filters.attributes ?? [];
  if (attrs.includes("organic")) where.organic = true;
  if (attrs.includes("handmade")) where.handmade = true;
  if (attrs.includes("local")) where.local = true;
  if (attrs.includes("vegan")) where.vegan = true;

  // Če noben filter ne velja za products, vrni prazen seznam (ne vseh vrstic).
  if (!hasProductFilter()) return [];

  const rows = await db.product.findMany({
    where,
    orderBy: [{ featured: "desc" }, { rating: "desc" }],
    take: 50,
  });

  // FW1 (audit R3 🟠): sanitiziran javni odgovor — brez ownerId/
  // rejectionReason/submittedAt (glej public-fields.ts)
  return rows.map((p) => ({
    ...toPublicProduct(p),
    images: JSON.parse(p.images || "[]") as string[],
  }));
}

async function fetchExperiences(filters: CollectionFilters) {
  // P3c-8: zbirka je javna stran — SAMO objavljene izkušnje (isti vzorec kot
  // fetchProducts zgoraj).
  const where: Record<string, unknown> = { status: "published" };
  const hasExperienceFilter = () =>
    Object.keys(where).some((k) => k !== "status");

  const sourceCats = filters.categories ?? [];
  const expCats = sourceCats.filter((c) =>
    (EXPERIENCE_CATEGORY_VALUES as readonly string[]).includes(c)
  );
  if (expCats.length > 0) {
    where.category = { in: expCats };
  }

  if (filters.destinationIds && filters.destinationIds.length > 0) {
    where.destinationId = { in: filters.destinationIds };
  }

  // Cena (pricePerPerson) — kombiniramo v eno cenovno-objekt.
  const priceFilter: { gte?: number; lte?: number } = {};
  if (typeof filters.priceMin === "number") priceFilter.gte = filters.priceMin;
  if (typeof filters.priceMax === "number") priceFilter.lte = filters.priceMax;
  if (priceFilter.gte !== undefined || priceFilter.lte !== undefined) {
    where.pricePerPerson = priceFilter;
  }

  // Atributi (veljavni za experiences).
  const attrs = filters.attributes ?? [];
  if (attrs.includes("familyFriendly")) where.familyFriendly = true;
  if (attrs.includes("accessibility")) where.accessibility = true;

  // Če noben filter ne velja za experiences, vrni prazen seznam.
  if (!hasExperienceFilter()) return [];

  const rows = await db.experience.findMany({
    where,
    orderBy: [{ featured: "desc" }, { rating: "desc" }],
    take: 50,
  });

  // FW1 (audit R3 🟠): sanitiziran javni odgovor — brez ownerId/
  // rejectionReason/submittedAt (glej public-fields.ts)
  return rows.map((e) => ({
    ...toPublicExperience(e),
    images: JSON.parse(e.images || "[]") as string[],
    languages: JSON.parse(e.languages || "[]") as string[],
  }));
}
