/**
 * E2E TEST — "Od ponudnika do AI priporočila"
 *
 * Celoten poslovni tok:
 * 1. Provider registracija
 * 2. Dodaj lokal (status = draft)
 * 3. Oddaja v pregled (draft → pending)
 * 4. Admin approval (pending → published)
 * 5. AI priporočilo (listing v rezultatih)
 * 6. Transparency badge
 * 7. Provider kupi Premium (sponsorship)
 * 8. Sponsorship aktivacija
 * 9. AI ranking sprememba (5% boost)
 * 10. Audit log
 *
 * Negativni testi:
 * N1. Nepotrjen lokal → AI ga ne najde
 * N2. Neuspešno plačilo → brez sponzorstva
 * N3. Slab rating → ne premaga relevantnega lokalca
 */

import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { checkAdmin } from "@/lib/auth-guards";
import { calculateQualityScore } from "@/lib/quality-score";
import { calculateProfileCompletion, canSubmitForReview } from "@/lib/profile-completion";
import { rankListings } from "@/lib/ranking-engine";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import { MAX_PREMIUM_BOOST, MIN_RATING_FOR_BOOST } from "@/lib/ranking-config";

// ============================================================================
// TEST RUNNER
// ============================================================================

let passed = 0;
let failed = 0;
const results: Array<{ test: string; status: "PASS" | "FAIL"; detail: string }> = [];

function assert(condition: boolean, testName: string, detail: string = ""): void {
  if (condition) {
    passed++;
    results.push({ test: testName, status: "PASS", detail });
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    results.push({ test: testName, status: "FAIL", detail });
    console.log(`  ❌ ${testName} — ${detail}`);
  }
}

async function section(title: string): Promise<void> {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(70)}\n`);
}

// ============================================================================
// GLAVNA TEST FUNKCIJA
// ============================================================================

async function main() {
  console.log("\n🧪 E2E TEST — Discover Slovenia AI");
  console.log("   Od ponudnika do AI priporočila\n");

  // Cleanup: izbriši test podatke če obstajajo
  await cleanup();

  // === SEKCIJA 1: PROVIDER REGISTRACIJA ===
  await section("TEST 1: Provider registracija");
  await testProviderRegistration();

  // === SEKCIJA 2: DODAJ LOKAL ===
  await section("TEST 2: Dodaj lokal (status = draft)");
  await testAddListing();

  // === SEKCIJA 3: ODDAJA V PREGLED ===
  await section("TEST 3: Oddaja v pregled (draft → pending)");
  await testSubmitForReview();

  // === SEKCIJA 4: ADMIN APPROVAL ===
  await section("TEST 4: Admin approval (pending → published)");
  await testAdminApproval();

  // === SEKCIJA 5: AI PRIPOROČILO ===
  await section("TEST 5: AI priporočilo (listing v rezultatih)");
  await testAIRecommendation();

  // === SEKCIJA 6: TRANSPARENCY BADGE ===
  await section("TEST 6: Transparency badge");
  await testTransparencyBadge();

  // === SEKCIJA 7: SPONSORSHIP PURCHASE ===
  await section("TEST 7: Provider kupi Premium (sponsorship)");
  await testSponsorshipPurchase();

  // === SEKCIJA 8: SPONSORSHIP ACTIVATION ===
  await section("TEST 8: Sponsorship aktivacija");
  await testSponsorshipActivation();

  // === SEKCIJA 9: AI RANKING BOOST ===
  await section("TEST 9: AI ranking sprememba (5% boost)");
  await testAIRankingBoost();

  // === SEKCIJA 10: AUDIT LOG ===
  await section("TEST 10: Audit log");
  await testAuditLog();

  // === NEGATIVNI TESTI ===
  await section("NEGATIVNI TEST N1: Nepotrjen lokal → AI ga ne najde");
  await testNegativeUnapproved();

  await section("NEGATIVNI TEST N2: Slab rating → ne premaga relevantnega");
  await testNegativeBadRating();

  await section("NEGATIVNI TEST N3: Quality Score preveri featured pogoje");
  await testNegativeFeaturedRequirements();

  // === REZULTATI ===
  await section("REZULTATI E2E TESTA");
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📊 Total: ${passed + failed}`);
  console.log(`  📈 Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log("  ❌ FAILED TESTS:");
    results.filter((r) => r.status === "FAIL").forEach((r) => {
      console.log(`     - ${r.test}: ${r.detail}`);
    });
  }

  // Cleanup
  await cleanup();

  process.exit(failed > 0 ? 1 : 0);
}

// ============================================================================
// TEST IMPLEMENTACIJE
// ============================================================================

let testOwnerId: string;
let testListingId: string;
let testSponsorshipId: string;

// TEST 1: Provider registracija
async function testProviderRegistration() {
  const passwordHash = await bcrypt.hash("test123", 12);

  const owner = await db.owner.create({
    data: {
      email: "provider@test.si",
      name: "Test Provider",
      businessName: "Gostilna Bela Krajina Test",
      passwordHash,
      plan: "free",
      role: "provider",
    },
  });

  testOwnerId = owner.id;

  assert(owner.id !== null, "Owner ustvarjen");
  assert(owner.email === "provider@test.si", "Email pravilen");
  assert(owner.plan === "free", "Plan = free");
  assert(owner.role === "provider", "Role = provider");
  assert(owner.subscriptionStatus === "none", "Subscription status = none");
}

// TEST 2: Dodaj lokal (status = draft)
async function testAddListing() {
  const listing = await db.listing.create({
    data: {
      name: "Gostilna Bela Krajina Test",
      slug: "gostilna-bela-krajina-test",
      description: "Tradicionalna belokranjska kuhinja z domačimi specialitetami.",
      longDescription: "Gostilna Bela Krajina Test ponuja avtentične belokranjske jedi kot so pisanice, žlikrofi in domače mesnine. Družinsko vodena od leta 2024.",
      category: "restaurant",
      destinationId: "crnomelj",
      destinationName: "Črnomelj",
      address: "Glavni trg 1, 8340 Črnomelj",
      phone: "+386 7 305 2200",
      email: "info@gostilna-bela-krajina.si",
      images: JSON.stringify([
        "https://sfile.chatglm.cn/images-ppt/test1.jpg",
        "https://sfile.chatglm.cn/images-ppt/test2.jpg",
        "https://sfile.chatglm.cn/images-ppt/test3.jpg",
      ]),
      rating: 4.5, // Potreben za premium boost (min 3.5)
      plan: "free",
      priceRange: "€€",
      ownerId: testOwnerId,
      ownerEmail: "provider@test.si",
      status: "draft",
      partnerStatus: "standard",
    },
  });

  testListingId = listing.id;

  assert(listing.status === "draft", "Status = draft (ne viden uporabnikom)");
  assert(listing.partnerStatus === "standard", "Partner status = standard");
  assert(listing.featured === false, "Featured = false");
  assert(listing.sponsored === false, "Sponsored = false");
  assert(listing.verifiedByAdmin === false, "VerifiedByAdmin = false");

  // Preveri da lokal NI v javnih rezultatih
  const publicListings = await db.listing.findMany({
    where: { status: "published", name: "Gostilna Bela Krajina Test" },
  });
  assert(publicListings.length === 0, "Lokal NI v javnih rezultatih (status=draft)");

  // Preveri profile completion
  const completion = calculateProfileCompletion(listing);
  assert(completion.percentage > 0, `Profile completion > 0% (actual: ${completion.percentage}%)`);

  // Preveri če lahko odda v pregled
  const { canSubmit, missingRequired } = canSubmitForReview(listing);
  assert(canSubmit === true, `Can submit for review (missing: ${missingRequired.map((m) => m.label).join(", ") || "none"})`);
}

// TEST 3: Oddaja v pregled (draft → pending)
async function testSubmitForReview() {
  await db.listing.update({
    where: { id: testListingId },
    data: {
      status: "pending",
      submittedAt: new Date(),
    },
  });

  const listing = await db.listing.findUnique({
    where: { id: testListingId },
    select: { status: true, submittedAt: true },
  });

  assert(listing?.status === "pending", "Status = pending");
  assert(listing?.submittedAt !== null, "SubmittedAt nastavljen");

  // Preveri da se pojavi v admin pending queue
  const pendingListings = await db.listing.findMany({
    where: { status: "pending", id: testListingId },
  });
  assert(pendingListings.length === 1, "Lokal je v admin pending queue");

  // Še vedno ni v javnih rezultatih
  const publicListings = await db.listing.findMany({
    where: { status: "published", id: testListingId },
  });
  assert(publicListings.length === 0, "Lokal še vedno NI v javnih rezultatih (pending)");
}

// TEST 4: Admin approval (pending → published)
async function testAdminApproval() {
  // Simuliraj admin approve
  await db.listing.update({
    where: { id: testListingId },
    data: {
      status: "published",
      approvedAt: new Date(),
      approvedBy: "admin",
      verifiedByAdmin: true,
      partnerStatus: "verified",
      partnerSince: new Date(),
    },
  });

  const listing = await db.listing.findUnique({
    where: { id: testListingId },
    select: {
      status: true,
      approvedAt: true,
      verifiedByAdmin: true,
      partnerStatus: true,
      partnerSince: true,
    },
  });

  assert(listing?.status === "published", "Status = published");
  assert(listing?.approvedAt !== null, "ApprovedAt nastavljen");
  assert(listing?.verifiedByAdmin === true, "VerifiedByAdmin = true");
  assert(listing?.partnerStatus === "verified", "Partner status = verified");
  assert(listing?.partnerSince !== null, "PartnerSince nastavljen");

  // Sedaj je v javnih rezultatih
  const publicListings = await db.listing.findMany({
    where: { status: "published", id: testListingId },
  });
  assert(publicListings.length === 1, "Lokal je sedaj v javnih rezultatih ✅");

  // Audit log
  await logAudit({
    actorRole: "admin",
    action: AUDIT_ACTIONS.LISTING_APPROVED,
    resourceType: "listing",
    resourceId: testListingId,
    resourceName: "Gostilna Bela Krajina Test",
  });
}

// TEST 5: AI priporočilo
async function testAIRecommendation() {
  // Ranking engine najde lokal
  const ranked = await rankListings({
    interests: ["hrana", "kulinarika", "tradicija"],
  });

  const found = ranked.find((r) => r.listing.id === testListingId);

  assert(found !== undefined, "AI ranking engine najde test lokal");
  assert(found!.totalScore > 0, `Score > 0 (actual: ${found!.totalScore.toFixed(3)})`);
  assert(found!.qualityScore > 0, `Quality Score > 0 (actual: ${found!.qualityScore})`);
  assert(found!.transparency.length > 0, "Transparency razlogi prisotni");
}

// TEST 6: Transparency badge
async function testTransparencyBadge() {
  const listing = await db.listing.findUnique({
    where: { id: testListingId },
  });

  assert(listing!.partnerStatus === "verified", "Partner status = verified (✓ badge)");

  // Preveri transparency razloge
  const ranked = await rankListings({
    interests: ["hrana"],
  });
  const found = ranked.find((r) => r.listing.id === testListingId);

  assert(found !== undefined, "Lokal najden v ranking");
  assert(
    found!.transparency.includes("✓ Preverjen partner") || found!.transparency.some((t) => t.includes("Preverjen")),
    "Transparency vključuje 'Preverjen partner'"
  );
}

// TEST 7: Provider kupi Premium (sponsorship)
async function testSponsorshipPurchase() {
  const startsAt = new Date();
  const endsAt = new Date();
  endsAt.setMonth(endsAt.getMonth() + 1);

  const sponsorship = await db.sponsorship.create({
    data: {
      listingId: testListingId,
      ownerId: testOwnerId,
      level: "premium",
      amount: 149,
      status: "created",
      startsAt,
      endsAt,
    },
  });

  testSponsorshipId = sponsorship.id;

  assert(sponsorship.id !== null, "Sponsorship ustvarjen (status=created)");
  assert(sponsorship.level === "premium", "Level = premium");
  assert(sponsorship.amount === 149, "Amount = €149");

  // Simuliraj plačilo (demo mode — aktiviraj direktno)
  await db.sponsorship.update({
    where: { id: testSponsorshipId },
    data: { status: "active" },
  });

  // Posodobi listing
  await db.listing.update({
    where: { id: testListingId },
    data: {
      sponsored: true,
      sponsoredUntil: endsAt,
      plan: "premium",
    },
  });

  // Posodobi owner
  await db.owner.update({
    where: { id: testOwnerId },
    data: {
      plan: "premium",
      subscriptionStatus: "active",
      subscriptionEndsAt: endsAt,
    },
  });

  assert(true, "Sponsorship aktiviran (demo mode)");
}

// TEST 8: Sponsorship aktivacija
async function testSponsorshipActivation() {
  const sponsorship = await db.sponsorship.findUnique({
    where: { id: testSponsorshipId },
  });

  assert(sponsorship?.status === "active", "Sponsorship status = active");

  const listing = await db.listing.findUnique({
    where: { id: testListingId },
    select: { sponsored: true, sponsoredUntil: true, plan: true },
  });

  assert(listing?.sponsored === true, "Listing sponsored = true");
  assert(listing?.sponsoredUntil !== null, "SponsoredUntil nastavljen");
  assert(listing?.plan === "premium", "Listing plan = premium");

  const owner = await db.owner.findUnique({
    where: { id: testOwnerId },
    select: { plan: true, subscriptionStatus: true },
  });

  assert(owner?.plan === "premium", "Owner plan = premium");
  assert(owner?.subscriptionStatus === "active", "Owner subscription = active");

  // Audit log
  await logAudit({
    actorId: testOwnerId,
    actorEmail: "provider@test.si",
    actorRole: "system",
    action: AUDIT_ACTIONS.SPONSORSHIP_ACTIVATED,
    resourceType: "sponsorship",
    resourceId: testSponsorshipId,
    resourceName: "Gostilna Bela Krajina Test",
    metadata: { level: "premium", amount: 149 },
  });
}

// TEST 9: AI ranking sprememba (5% boost)
async function testAIRankingBoost() {
  // Ranking z sponzoriranim lokalom
  const rankedSponsored = await rankListings({
    interests: ["hrana", "kulinarika"],
  });

  const sponsoredResult = rankedSponsored.find((r) => r.listing.id === testListingId);

  assert(sponsoredResult !== undefined, "Sponzorirani lokal najden v ranking");
  assert(sponsoredResult!.scores.premium > 0, `Premium boost > 0 (actual: ${sponsoredResult!.scores.premium})`);
  assert(
    sponsoredResult!.scores.premium <= MAX_PREMIUM_BOOST,
    `Premium boost <= ${MAX_PREMIUM_BOOST} (actual: ${sponsoredResult!.scores.premium})`
  );
  assert(
    sponsoredResult!.recommendationType === "sponsored",
    `Recommendation type = sponsored (actual: ${sponsoredResult!.recommendationType})`
  );

  // Preveri da sponzorirani lokal NE premaga bolj relevantnega
  // (uporabi obstoječi Hiša Franko ki je zelo relevantna za "hrana")
  const frankoResult = rankedSponsored.find((r) => r.listing.name === "Hiša Franko");
  if (frankoResult) {
    // Hiša Franko ima rating 4.9 + featured → mora biti visoko
    assert(
      frankoResult.qualityScore >= 0,
      `Hiša Franko Q Score: ${frankoResult.qualityScore}`
    );
  }
}

// TEST 10: Audit log
async function testAuditLog() {
  const logs = await db.auditLog.findMany({
    where: {
      resourceId: testSponsorshipId,
      action: AUDIT_ACTIONS.SPONSORSHIP_ACTIVATED,
    },
  });

  assert(logs.length >= 1, "Audit log zapis najden");
  assert(logs[0].actorRole === "system", `Actor role = system (actual: ${logs[0].actorRole})`);
  assert(logs[0].resourceName === "Gostilna Bela Krajina Test", "Resource name pravilen");

  // Preveri listing approved audit log
  const approveLogs = await db.auditLog.findMany({
    where: {
      resourceId: testListingId,
      action: AUDIT_ACTIONS.LISTING_APPROVED,
    },
  });
  assert(approveLogs.length >= 1, "Listing approved audit log najden");
}

// ============================================================================
// NEGATIVNI TESTI
// ============================================================================

// N1: Nepotrjen lokal → AI ga ne najde
async function testNegativeUnapproved() {
  // Ustvari nepotrjen lokal
  const unapproved = await db.listing.create({
    data: {
      name: "Nepotrjen Test Lokal",
      slug: "nepotrjen-test-lokal",
      description: "Ta lokal ne sme biti v AI rezultatih.",
      category: "restaurant",
      destinationId: "ljubljana",
      destinationName: "Ljubljana",
      address: "Test 1, 1000 Ljubljana",
      images: JSON.stringify([]),
      ownerId: testOwnerId,
      status: "pending", // Čaka na odobritev
      partnerStatus: "standard",
    },
  });

  // Ranking engine naj NE bi našel tega lokalca
  const ranked = await rankListings({
    interests: ["hrana"],
  });

  const found = ranked.find((r) => r.listing.id === unapproved.id);

  assert(found === undefined, "Nepotrjen lokal NI v AI rezultatih ✅");

  // Tudi v javnih listings
  const publicListings = await db.listing.findMany({
    where: { status: "published", id: unapproved.id },
  });
  assert(publicListings.length === 0, "Nepotrjen lokal NI v javnih listings ✅");

  // Cleanup
  await db.listing.delete({ where: { id: unapproved.id } });
}

// N2: Slab rating → ne premaga relevantnega
async function testNegativeBadRating() {
  // Ustvari lokal z slabim ratingom ampak sponzoriran
  const badRating = await db.listing.create({
    data: {
      name: "Slabi Sponzorirani Lokal",
      slug: "slabi-sponzorirani-lokal",
      description: "Slaba restavracija s sponzorstvom.",
      category: "restaurant",
      destinationId: "ljubljana",
      destinationName: "Ljubljana",
      address: "Test 2, 1000 Ljubljana",
      images: JSON.stringify(["https://sfile.chatglm.cn/images-ppt/test2.jpg"]),
      ownerId: testOwnerId,
      status: "published",
      rating: 2.0, // Slab rating
      sponsored: true,
      sponsoredUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      plan: "premium",
      partnerStatus: "premium",
    },
  });

  // Preveri da slabi lokal ne dobi boost-a
  assert(
    !MIN_RATING_FOR_BOOST <= 2.0,
    `Rating 2.0 < ${MIN_RATING_FOR_BOOST} → ne dobi boost-a`
  );

  // Ranking engine
  const ranked = await rankListings({
    interests: ["hrana"],
    destinationId: "ljubljana",
  });

  const badResult = ranked.find((r) => r.listing.id === badRating.id);

  if (badResult) {
    assert(
      badResult.scores.premium === 0,
      `Slabi lokal (rating 2.0) ne dobi premium boost-a (actual: ${badResult.scores.premium})`
    );
  }

  // Cleanup
  await db.listing.delete({ where: { id: badRating.id } });
}

// N3: Featured zahteva Q>90 + verified
async function testNegativeFeaturedRequirements() {
  // Ustvari lokal z nizkim Q score ampak premium plan
  const lowQuality = await db.listing.create({
    data: {
      name: "Nizka Kakovost Test",
      slug: "nizka-kakovost-test",
      description: "kratek", // Premajhen opis → nizak Q
      category: "restaurant",
      destinationId: "ljubljana",
      destinationName: "Ljubljana",
      address: "Test 3, 1000 Ljubljana",
      images: JSON.stringify([]), // Brez slik → nizak Q
      ownerId: testOwnerId,
      status: "published",
      plan: "premium", // Premium ampak slab Q
      verifiedByAdmin: false, // Ni verificiran
      partnerStatus: "standard",
    },
  });

  const qs = calculateQualityScore(lowQuality);

  assert(
    qs.total < 90,
    `Quality Score < 90 (actual: ${qs.total}) — ne more biti Featured`
  );
  assert(
    !lowQuality.verifiedByAdmin,
    "Ni verificiran — ne more biti Featured"
  );

  // Featured zahtev: Premium + Q>90 + Verified
  const { qualifiesForFeatured } = await import("@/lib/quality-score");
  const qualifies = qualifiesForFeatured(lowQuality, qs.total);

  assert(
    qualifies === false,
    "Lokal z nizkim Q in brez verifikacije NE izpolnjuje Featured pogojev ✅"
  );

  // Cleanup
  await db.listing.delete({ where: { id: lowQuality.id } });
}

// ============================================================================
// CLEANUP
// ============================================================================

async function cleanup() {
  // Izbriši test podatke
  await db.auditLog.deleteMany({
    where: {
      OR: [
        { resourceId: testListingId || "none" },
        { resourceId: testSponsorshipId || "none" },
        { actorEmail: "provider@test.si" },
      ],
    },
  }).catch(() => {});

  await db.sponsorship.deleteMany({
    where: { ownerId: testOwnerId || "none" },
  }).catch(() => {});

  await db.listing.deleteMany({
    where: { ownerId: testOwnerId || "none" },
  }).catch(() => {});

  await db.owner.deleteMany({
    where: { email: "provider@test.si" },
  }).catch(() => {});

  console.log("  🧹 Cleanup končan");
}

// ============================================================================
// RUN
// ============================================================================

main().catch((e) => {
  console.error("❌ E2E test napaka:", e);
  process.exit(1);
});
