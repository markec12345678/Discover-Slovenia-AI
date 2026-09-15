/**
 * Analiza: kje program prinaša največ — funnel + monetizacijski kanali.
 * Zaženi: bun scripts/revenue-analysis.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:/home/z/Discover-Slovenia-AI/db/custom.db' } },
})

const money = (n: number) =>
  new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  ANALIZA PRIHODKOV — Discover-Slovenia-AI')
  console.log('═══════════════════════════════════════════════════════════\n')

  // ── 1. FUNNEL ─────────────────────────────────────────────
  const steps = [
    'visit_home', 'planner_started', 'itinerary_generated', 'itinerary_saved',
    'asked_local', 'add_to_cart', 'checkout_completed', 'experience_booked',
    'affiliate_click', 'lead_submitted', 'newsletter_subscribed', 'push_subscribed',
    'signup_completed', 'login_completed',
  ]
  console.log('── FUNNEL (AnalyticsEvent) ──')
  const totalViews = await prisma.pageView.count()
  console.log(`PageView skupaj: ${totalViews}`)
  for (const s of steps) {
    const n = await prisma.analyticsEvent.count({ where: { type: `funnel_${s}` } })
    if (n > 0) console.log(`  ${s.padEnd(22)} ${n}`)
  }

  // ── 2. B2B: lastniki, naročnine, plani ─────────────────────
  console.log('\n── B2B (Owner + plani + Stripe) ──')
  const owners = await prisma.owner.findMany({ select: { plan: true, subscriptionStatus: true, createdAt: true } })
  const byPlan: Record<string, number> = {}
  for (const o of owners) byPlan[o.plan] = (byPlan[o.plan] ?? 0) + 1
  console.log(`Lastniki (Owner) skupaj: ${owners.length}`)
  for (const [p, n] of Object.entries(byPlan)) console.log(`  plan=${p}: ${n}`)
  const activeSubs = owners.filter(o => o.subscriptionStatus === 'active').length
  const premium = owners.filter(o => o.plan !== 'free').length
  console.log(`Aktivne naročnine: ${activeSubs} · premium/enterprise lastniki: ${premium}`)
  // MRR po ceni: premium €149/mes, enterprise €399/mes
  const mrr = (byPlan['premium'] ?? 0) * 149 + (byPlan['enterprise'] ?? 0) * 399
  console.log(`Teoretični MRR (premium €149 + enterprise €399): ${money(mrr)}`)

  // ── 3. SPONZORSTVA ─────────────────────────────────────────
  console.log('\n── Sponzorstva (Sponsorship) ──')
  const spon = await prisma.sponsorship.findMany({ select: { amount: true, status: true, startsAt: true, endsAt: true } })
  const sponRev = spon.filter(s => s.status !== 'refunded').reduce((a, s) => a + s.amount, 0)
  console.log(`Št. sponzorstev: ${spon.length} · skupaj: ${money(sponRev)}`)

  // ── 4. PRODAJA IZDELKOV (Order) ────────────────────────────
  console.log('\n── Tržnica izdelkov (Order) ──')
  const orders = await prisma.order.findMany({ select: { status: true, total: true, createdAt: true } })
  const paid = orders.filter(o => o.status === 'paid')
  const ordRev = paid.reduce((a, o) => a + o.total, 0)
  console.log(`Naročila: ${orders.length} · plačana: ${paid.length} · promet: ${money(ordRev)}`)
  console.log(`  (Prihodek platforme ob 15% proviziji: ${money(ordRev * 0.15)})`)

  // ── 5. REZERVACIJE IZKUŠENJ (Booking) ──────────────────────
  console.log('\n── Izkušnje (Booking) ──')
  const bks = await prisma.booking.findMany({ select: { status: true, total: true, createdAt: true, experienceId: true } })
  const conf = bks.filter(b => b.status === 'confirmed' || b.status === 'pending')
  const bkRev = conf.reduce((a, b) => a + b.total, 0)
  console.log(`Rezervacije: ${bks.length} · v obravnavi: ${conf.length} · promet: ${money(bkRev)}`)
  console.log(`  (Prihodek platforme ob 20% proviziji: ${money(bkRev * 0.2)})`)

  // ── 6. LEAD-GEN ZA LISTINGE ────────────────────────────────
  console.log('\n── Lead-gen (Listing) ──')
  const listings = await prisma.listing.findMany({
    select: { leadCount: true, viewCount: true, clickCount: true, aiRecommendations: true, plan: true, category: true, status: true },
  })
  const pub = listings.filter(l => l.status === 'published')
  const totLeads = pub.reduce((a, l) => a + (l.leadCount ?? 0), 0)
  const totViews = pub.reduce((a, l) => a + (l.viewCount ?? 0), 0)
  const totClicks = pub.reduce((a, l) => a + (l.clickCount ?? 0), 0)
  const totAI = pub.reduce((a, l) => a + (l.aiRecommendations ?? 0), 0)
  console.log(`Objavljeni listingi: ${pub.length}`)
  console.log(`  Skupaj leadov: ${totLeads} · ogledi: ${totViews} · klikov: ${totClicks} · AI priporočil: ${totAI}`)
  // Top listingi po leadih
  const topLeads = [...pub].sort((a, b) => b.leadCount - a.leadCount).slice(0, 8)
  console.log('  Top listingi po leadih:')
  for (const l of topLeads) console.log(`    leads=${l.leadCount ?? 0} clicks=${l.clickCount ?? 0} aiRec=${l.aiRecommendations ?? 0} plan=${l.plan} cat=${l.category}`)
  // Event tipi na listingih
  const evtTypes = await prisma.listingEvent.groupBy({ by: ['type'], _count: { type: true } })
  console.log('  ListingEvent tipi:')
  for (const e of evtTypes) console.log(`    ${e.type}: ${e._count.type}`)

  // ── 7. LOCAL QUESTIONS ─────────────────────────────────────
  console.log('\n── Vprašaj lokalca (LocalQuestion) ──')
  const lq = await prisma.localQuestion.findMany({ select: { answerSource: true, createdAt: true } })
  const bySrc: Record<string, number> = {}
  for (const q of lq) bySrc[q.answerSource ?? 'nepoznano'] = (bySrc[q.answerSource ?? 'nepoznano'] ?? 0) + 1
  console.log(`Skupaj: ${lq.length}`)
  for (const [s, n] of Object.entries(bySrc)) console.log(`  answerSource=${s}: ${n}`)

  // ── 8. UPORABNIKI / RETENCIJA ──────────────────────────────
  console.log('\n── Uporabniki ──')
  const users = await prisma.user.count()
  const saved = await prisma.savedItinerary.count()
  const votes = await prisma.tripVote.count()
  console.log(`Registrirani: ${users} · shranjeni načrti: ${saved} · glasovi: ${votes}`)
  const push = await prisma.pushSubscription.count()
  console.log(`Push naročnine: ${push}`)

  // ── 9. AI UPORABA ──────────────────────────────────────────
  console.log('\n── AI poraba (AIUsageLog) ──')
  const aiLogs = await prisma.aIUsageLog.count()
  console.log(`AI klici skupaj: ${aiLogs}`)

  // ── 10. ANALITIKA EVENTOV (tipi) ───────────────────────────
  console.log('\n── AnalyticsEvent tipi (top) ──')
  const groups = await prisma.analyticsEvent.groupBy({ by: ['type'], _count: { type: true }, orderBy: { _count: { type: 'desc' } }, take: 20 })
  for (const g of groups) console.log(`  ${g.type}: ${g._count.type}`)

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
