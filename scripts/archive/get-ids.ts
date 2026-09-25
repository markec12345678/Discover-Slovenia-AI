import { db } from "@/lib/db";

async function main() {
  const listing = await db.listing.findFirst({
    where: { name: "Hotel Vila Bled" },
    select: { id: true, name: true, ownerId: true },
  });
  console.log("Listing:", JSON.stringify(listing, null, 2));

  const owners = await db.owner.findMany({
    select: { id: true, email: true, businessName: true },
    take: 3,
  });
  console.log("Owners:", JSON.stringify(owners, null, 2));
}

main().finally(() => db.$disconnect());
