import { db } from "@/lib/db";

async function main() {
  const r = await db.listing.findFirst({
    where: { name: "Hotel Grad Otočec" },
    select: {
      name: true,
      status: true,
      partnerStatus: true,
      partnerSince: true,
      verifiedByAdmin: true,
      premiumUntil: true,
    },
  });
  console.log(JSON.stringify(r, null, 2));
}

main().finally(() => db.$disconnect());
