/**
 * P7-A — UPAVIJANJE/ODSTRANITEV demo računov v skupni (produkcija+dev) Neon DB.
 *
 * Kontekst (P6-2 + uporabnikova P6 ocena): demo računi z ZNANIMI gesli
 * (demo1234 / admin-demo-2026) obstajajo v produkciji. Admin ravnina je
 * x-admin-password (seja super_admin ne odpre ničesar — P7-B), a znana
 * privilegirana identiteta v produkcijski bazi je nesprejemljiva pred pilotom.
 *
 * Ukrep (uporabnikova odločitev: "delete/deactivate, ne samo sprememba gesla"):
 *   1. admin@demo.discoverslovenia.si (super_admin, enterprise) → IZBRISAN.
 *      Admin funkcionalnost ne potrebuje računa (admin API = x-admin-password;
 *      RBAC/plast v sejah je mrtva koda — P7-B). AuditLog.actorId ni FK,
 *      zgodovina se ohrani.
 *   2. ana/marko/tina/luka@demo… → geslo ROTIRANO na naključno 32-bajtno
 *      vrednost, ki se NE izpiše nikamor + tokenVersion++ (vse seje umrejo
 *      ≤60 s) + resetToken/verificationToken počiščeni. Računi ostanejo kot
 *      lastniki demo vsebine (10 listingov / 6 izdelkov / 10 izkušenj).
 *
 * Idempotentno — lahko poganjaš večkrat.
 *
 * Zagon: cd /home/z/Discover-Slovenia-AI && DATABASE_URL="$(grep '^DATABASE_URL' .env | cut -d= -f2- | tr -d '"')" bun scripts/db/retire-demo-accounts.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const db = new PrismaClient();
const DEMO_DOMAIN = "@demo.discoverslovenia.si";
const ADMIN_DEMO_EMAIL = `admin${DEMO_DOMAIN}`;

async function retireAdmin() {
  const admin = await db.owner.findUnique({ where: { email: ADMIN_DEMO_EMAIL } });
  if (!admin) {
    console.log("[SKIP] admin@demo ne obstaja (že upravljen)");
    return;
  }
  const [listings, products, experiences, sponsorships, invoices, audits] = await Promise.all([
    db.listing.count({ where: { ownerId: admin.id } }),
    db.product.count({ where: { ownerId: admin.id } }),
    db.experience.count({ where: { ownerId: admin.id } }),
    db.sponsorship.count({ where: { ownerId: admin.id } }),
    db.commissionInvoice.count({ where: { ownerId: admin.id } }),
    db.auditLog.count({ where: { actorId: admin.id } }),
  ]);
  const ownedRefs = listings + products + experiences + sponsorships + invoices;
  console.log(
    `[ADMIN] ${ADMIN_DEMO_EMAIL} role=${admin.role} plan=${admin.plan} — lastniških zapisov: ${ownedRefs} (listingov ${listings}, izdelkov ${products}, izkušenj ${experiences}, sponzoriranj ${sponsorships}, računov ${invoices}), audit zapisov: ${audits}`
  );
  if (ownedRefs > 0) {
    // Varnostna varovalka: če bi admin kaj posedoval, rotiramo namesto brisanja.
    const randomPassword = crypto.randomBytes(32).toString("base64url");
    await db.owner.update({
      where: { id: admin.id },
      data: {
        passwordHash: await bcrypt.hash(randomPassword, 12),
        tokenVersion: { increment: 1 },
        resetToken: null,
        resetTokenExpires: null,
        verificationToken: null,
        verificationTokenExpires: null,
      },
    });
    console.log("[ROTATED] admin@demo ima lastniške zapise → geslo rotirano na neznano vrednost, seje razveljavljene");
    return;
  }
  await db.owner.delete({ where: { id: admin.id } });
  console.log(`[DELETED] ${ADMIN_DEMO_EMAIL} (super_admin) — 0 lastniških zapisov; ${audits} audit zapisov ostaja (brez FK, zgodovina ohranjena)`);
}

async function rotateContentOwners() {
  const contentOwners = await db.owner.findMany({
    where: {
      AND: [{ email: { endsWith: DEMO_DOMAIN } }, { email: { not: ADMIN_DEMO_EMAIL } }],
    },
    select: { id: true, email: true, plan: true },
  });
  for (const o of contentOwners) {
    const [listings, products, experiences] = await Promise.all([
      db.listing.count({ where: { ownerId: o.id } }),
      db.product.count({ where: { ownerId: o.id } }),
      db.experience.count({ where: { ownerId: o.id } }),
    ]);
    // Naključno geslo, ki se NE izpiše — račun ostane kot lastnik demo vsebine,
    // prijava ni več mogoča (dokler uporabnik sam ne ponastavi gesla prek
    // pozabljenega-gesla toka, ko bo SMTP aktiven).
    const randomPassword = crypto.randomBytes(32).toString("base64url");
    await db.owner.update({
      where: { id: o.id },
      data: {
        passwordHash: await bcrypt.hash(randomPassword, 12),
        tokenVersion: { increment: 1 },
        resetToken: null,
        resetTokenExpires: null,
        verificationToken: null,
        verificationTokenExpires: null,
      },
    });
    console.log(`[ROTATED] ${o.email} (plan=${o.plan}) — geslo neznano, seje razveljavljene; vsebina ostaja: ${listings} listingov, ${products} izdelkov, ${experiences} izkušenj`);
  }
  if (contentOwners.length === 0) console.log("[SKIP] demo partnerji ne obstajajo");
}

async function checkB2CUsers() {
  const demoUsers = await db.user.findMany({
    where: { email: { endsWith: DEMO_DOMAIN } },
    select: { id: true, email: true },
  });
  if (demoUsers.length === 0) {
    console.log("[OK] 0 demo računov v B2C User tabeli");
    return;
  }
  for (const u of demoUsers) {
    const randomPassword = crypto.randomBytes(32).toString("base64url");
    await db.user.update({
      where: { id: u.id },
      data: {
        passwordHash: await bcrypt.hash(randomPassword, 12),
        tokenVersion: { increment: 1 },
        resetToken: null,
        resetTokenExpires: null,
        verificationToken: null,
        verificationTokenExpires: null,
      },
    });
    console.log(`[ROTATED] B2C ${u.email}`);
  }
}

async function main() {
  console.log("=== INVENTURA (pred) ===");
  const owners = await db.owner.findMany({
    select: { email: true, role: true, plan: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const o of owners) console.log(`  Owner: ${o.email} role=${o.role} plan=${o.plan}`);
  const users = await db.user.findMany({ select: { email: true, createdAt: true } });
  for (const u of users) console.log(`  User(B2C): ${u.email}`);
  console.log(`  Skupaj: ${owners.length} Owner + ${users.length} User računov`);

  console.log("\n=== REMEDIACIJA ===");
  await retireAdmin();
  await rotateContentOwners();
  await checkB2CUsers();

  console.log("\n=== INVENTURA (po) ===");
  const after = await db.owner.findMany({
    select: { email: true, role: true, plan: true },
    orderBy: { email: "asc" },
  });
  for (const o of after) console.log(`  Owner: ${o.email} role=${o.role} plan=${o.plan}`);
  const adminGone = !(await db.owner.findUnique({ where: { email: ADMIN_DEMO_EMAIL } }));
  console.log(`\nadmin@demo izbrisan: ${adminGone}`);
  console.log("Vsi preostali @demo računi imajo NEZNANO geslo + razveljavljene seje.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
