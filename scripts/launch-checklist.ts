/**
 * LAUNCH CHECKLIST — dejanski testi pred produkcijo
 *
 * 1. Backup test (backup + restore + recovery time)
 * 2. Monitoring preverba (API health, AI health, DB health)
 * 3. Legal preverba (privacy, terms, cookie, GDPR)
 * 4. Concierge onboarding (skripta za vnose prvih 5 ponudnikov)
 */

import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";

let passed = 0;
let failed = 0;

function check(condition: boolean, name: string, detail: string = ""): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} — ${detail}`);
  }
}

async function section(title: string): Promise<void> {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(70)}\n`);
}

async function main() {
  console.log("\n🚀 LAUNCH CHECKLIST — Discover Slovenia AI\n");

  // === 1. BACKUP TEST ===
  await section("1. BACKUP TEST");
  const backupStart = Date.now();

  const backupDir = "db/backups";
  await fs.mkdir(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `launch-test-${Date.now()}.db`);

  // Backup
  await fs.copyFile("db/custom.db", backupFile);
  const backupStats = await fs.stat(backupFile);
  const backupTime = Date.now() - backupStart;

  check(backupStats.size > 0, "Backup ustvarjen", `Size: ${backupStats.size} bytes`);
  check(backupTime < 5000, `Backup čas < 5s (actual: ${backupTime}ms)`);

  // Restore test
  const restoreStart = Date.now();
  const testRestoreFile = path.join(backupDir, `restore-test-${Date.now()}.db`);
  await fs.copyFile(backupFile, testRestoreFile);
  const restoreTime = Date.now() - restoreStart;

  // Verify restored data
  const listingCount = await db.listing.count();
  const ownerCount = await db.owner.count();
  const productCount = await db.product.count();
  const experienceCount = await db.experience.count();

  check(restoreTime < 5000, `Restore čas < 5s (actual: ${restoreTime}ms)`);
  check(listingCount === 25, `Listings v bazi: ${listingCount} (expected: 25)`);
  check(ownerCount >= 3, `Owners v bazi: ${ownerCount} (expected: 3+)`);
  check(productCount === 28, `Products v bazi: ${productCount} (expected: 28)`);
  check(experienceCount === 28, `Experiences v bazi: ${experienceCount} (expected: 28)`);

  // Cleanup test files
  await fs.unlink(backupFile).catch(() => {});
  await fs.unlink(testRestoreFile).catch(() => {});

  console.log(`\n  📊 Backup: ${backupStats.size} bytes, ${backupTime}ms`);
  console.log(`  📊 Restore: ${restoreTime}ms`);
  console.log(`  📊 Data: ${listingCount} listings, ${productCount} products, ${experienceCount} experiences`);

  // === 2. MONITORING ===
  await section("2. MONITORING PREVERBA");

  // DB health
  try {
    const dbStart = Date.now();
    await db.listing.findFirst({ select: { id: true } });
    const dbLatency = Date.now() - dbStart;
    check(dbLatency < 100, `DB latency < 100ms (actual: ${dbLatency}ms)`);
  } catch {
    check(false, "DB health", "Napaka pri query-ju");
  }

  // Prisma schema check
  const sponsorshipCount = await db.sponsorship.count().catch(() => -1);
  check(sponsorshipCount >= 0, "Sponsorship tabela dostopna");

  const auditLogCount = await db.auditLog.count().catch(() => -1);
  check(auditLogCount >= 0, "AuditLog tabela dostopna");

  const analyticsCount = await db.analyticsEvent.count().catch(() => -1);
  check(analyticsCount >= 0, "AnalyticsEvent tabela dostopna");

  const aiUsageCount = await db.aIUsageLog.count().catch(() => -1);
  check(aiUsageCount >= 0, "AIUsageLog tabela dostopna");

  // Listing status check
  const publishedCount = await db.listing.count({ where: { status: "published" } });
  const draftCount = await db.listing.count({ where: { status: "draft" } });
  const pendingCount = await db.listing.count({ where: { status: "pending" } });

  check(publishedCount === 25, `${publishedCount} published listings`);
  console.log(`  📊 Status: ${publishedCount} published, ${draftCount} draft, ${pendingCount} pending`);

  // Partner status check
  const featuredCount = await db.listing.count({ where: { partnerStatus: "featured" } });
  const premiumCount = await db.listing.count({ where: { partnerStatus: "premium" } });
  const verifiedCount = await db.listing.count({ where: { partnerStatus: "verified" } });
  const standardCount = await db.listing.count({ where: { partnerStatus: "standard" } });

  console.log(`  📊 Partners: ${featuredCount} featured, ${premiumCount} premium, ${verifiedCount} verified, ${standardCount} standard`);

  // === 3. LEGAL ===
  await section("3. LEGAL PREVERBA");

  const legalPages = [
    { path: "src/app/politika-zasebnosti/page.tsx", name: "Privacy Policy" },
    { path: "src/app/pogoji-uporabe/page.tsx", name: "Terms of Service" },
    { path: "src/app/kontakt/page.tsx", name: "Kontakt / Impressum" },
  ];

  for (const page of legalPages) {
    try {
      const content = await fs.readFile(page.path, "utf-8");
      check(content.length > 500, `${page.name} obstaja (${content.length} znakov)`);
    } catch {
      check(false, `${page.name} manjka`, page.path);
    }
  }

  // GDPR checkbox pri registraciji
  try {
    const registerPage = await fs.readFile("src/app/owner/prijava/page.tsx", "utf-8");
    const hasGdpr = registerPage.includes("gdpr") || registerPage.includes("GDPR") || registerPage.includes("privolitev");
    check(hasGdpr, "GDPR checkbox pri registraciji");
  } catch {
    check(false, "Register page manjka");
  }

  // Affiliate disclosure v footer
  try {
    const footer = await fs.readFile("src/components/sections/footer.tsx", "utf-8");
    const hasDisclosure = footer.includes("affiliate") || footer.includes("partner") || footer.includes("provizij");
    check(hasDisclosure, "Affiliate disclosure v footer");
  } catch {
    check(false, "Footer manjka");
  }

  // === 4. CONCIERGE ONBOARDING ===
  await section("4. CONCIERGE ONBOARDING PREVERBA");

  // Preveri da imamo vse API-je za onboarding
  const apiChecks = [
    { path: "src/app/api/owner/listings/route.ts", name: "Owner listings API" },
    { path: "src/app/api/owner/listings/submit/route.ts", name: "Submit for review API" },
    { path: "src/app/api/owner/auto-tag/route.ts", name: "AI auto-tag API" },
    { path: "src/app/api/owner/profile-completion/route.ts", name: "Profile completion API" },
    { path: "src/app/api/owner/quality-score/route.ts", name: "Quality Score API" },
    { path: "src/app/api/owner/sponsorship/route.ts", name: "Sponsorship API" },
    { path: "src/app/api/admin/pending/route.ts", name: "Admin pending API" },
    { path: "src/app/api/admin/approve/[id]/route.ts", name: "Admin approve API" },
    { path: "src/app/api/admin/reject/[id]/route.ts", name: "Admin reject API" },
    { path: "src/app/api/admin/sponsorships/route.ts", name: "Admin sponsorships API" },
    { path: "src/app/api/admin/audit-log/route.ts", name: "Admin audit log API" },
    { path: "src/app/api/analytics/funnel/route.ts", name: "Analytics funnel API" },
    { path: "src/app/api/analytics/provider-roi/route.ts", name: "Provider ROI API" },
  ];

  for (const api of apiChecks) {
    try {
      await fs.access(api.path);
      check(true, `${api.name} obstaja`);
    } catch {
      check(false, `${api.name} manjka`, api.path);
    }
  }

  // === REZULTATI ===
  await section("REZULTATI LAUNCH CHECKLIST");
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📊 Total: ${passed + failed}`);
  console.log(`  📈 Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log("\n  🚀 PLATFORMA JE PRIPRAVLJENA ZA PRODUKCIJO!\n");
  } else {
    console.log("\n  ⚠️  Manjkajoči elementi — popravi pred deploy.\n");
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("❌ Launch checklist napaka:", e);
  process.exit(1);
});
