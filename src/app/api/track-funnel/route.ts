import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/track-funnel — sledi konverzijskemu funnelu
// Body: { step, path? } — koraki morajo ostati skladni s FunnelStep v src/lib/funnel.ts
export async function POST(request: Request) {
    // Rate limit analitike (spam zaščita)
    const limited = rateLimit(request, { limit: 60, windowMs: 60000, key: "track-funnel" });
    if (limited) return limited;

  try {
    const { step, path } = await request.json();

    const validSteps = [
      "homepage_view",
      "destination_view",
      "itinerary_generate",
      "newsletter_signup",
      "listing_click",
      "quiz_completed",
      "itinerary_saved",
      "add_to_cart",
      "checkout_completed",
      "experience_booked",
      "asked_local",
      "affiliate_click",
      "trip_push_sent",
      "trip_push_click",
      // Faza 3b-2 — plačljive konzultacije (paid zapiše strežniško)
      "consultation_submit",
      "consultation_paid",
      "consultation_delivered",
    ];
    if (!step || !validSteps.includes(step)) {
      return NextResponse.json({ error: "Neveljaven funnel step" }, { status: 400 });
    }

    await db.pageView.create({
      data: {
        path: path || "/",
        funnelStep: step,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[track-funnel] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}

// GET — funnel statistika (za admin)
export async function GET(request: Request) {
  try {
    const adminPassword = request.headers.get("x-admin-password");
    if (adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [homepage, destination, itinerary, newsletter, listingClick, quizCompleted, itinerarySaved, addToCart, checkoutCompleted, experienceBooked, askedLocal, affiliateClick, tripPushSent, tripPushClick, consultationSubmit, consultationPaid, consultationDelivered] = await Promise.all([
      db.pageView.count({ where: { funnelStep: "homepage_view", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "destination_view", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "itinerary_generate", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "newsletter_signup", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "listing_click", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "quiz_completed", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "itinerary_saved", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "add_to_cart", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "checkout_completed", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "experience_booked", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "asked_local", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "affiliate_click", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "trip_push_sent", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "trip_push_click", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "consultation_submit", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "consultation_paid", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "consultation_delivered", createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    const homeToDest = homepage > 0 ? (destination / homepage) * 100 : 0;
    const destToItinerary = destination > 0 ? (itinerary / destination) * 100 : 0;
    const itineraryToSignup = itinerary > 0 ? (newsletter / itinerary) * 100 : 0;
    const overallConversion = homepage > 0 ? (newsletter / homepage) * 100 : 0;
    const cartToCheckout = addToCart > 0 ? (checkoutCompleted / addToCart) * 100 : 0;
    // Delež klikov na ponudnike/izkušnje, ki se končajo z rezervacijo izkušnje
    const experienceToBooking = listingClick > 0 ? (experienceBooked / listingClick) * 100 : 0;
    // Delež ogledov homepagea, ki so prerasli v javno vprašanje lokalcu
    const homeToAskedLocal = homepage > 0 ? (askedLocal / homepage) * 100 : 0;
    // Delež ogledov destinacij, ki so prerasli v klik na affiliate partnerja
    // (zapis strežniško iz /go/[provider] — vse klike šteje enako)
    const destinationToAffiliate = destination > 0 ? (affiliateClick / destination) * 100 : 0;
    // RETENCIJA: CTR dnevni opomnikov (klik na push / dostavljeni pushi)
    const tripPushCtr = tripPushSent > 0 ? (tripPushClick / tripPushSent) * 100 : 0;
    // KONZULTACIJE: delež spraševalcev, ki oddajo konzultacijo + konverzija
    // oddanih v plačilo + delež plačanih, ki so prejeli odgovor
    const askedToConsultation = askedLocal > 0 ? (consultationSubmit / askedLocal) * 100 : 0;
    const consultationToPaid = consultationSubmit > 0 ? (consultationPaid / consultationSubmit) * 100 : 0;
    const paidToDelivered = consultationPaid > 0 ? (consultationDelivered / consultationPaid) * 100 : 0;

    return NextResponse.json({
      steps: {
        homepage_view: homepage,
        destination_view: destination,
        itinerary_generate: itinerary,
        newsletter_signup: newsletter,
        listing_click: listingClick,
        quiz_completed: quizCompleted,
        itinerary_saved: itinerarySaved,
        add_to_cart: addToCart,
        checkout_completed: checkoutCompleted,
        experience_booked: experienceBooked,
        asked_local: askedLocal,
        affiliate_click: affiliateClick,
        trip_push_sent: tripPushSent,
        trip_push_click: tripPushClick,
        consultation_submit: consultationSubmit,
        consultation_paid: consultationPaid,
        consultation_delivered: consultationDelivered,
      },
      conversionRates: {
        home_to_destination: Math.round(homeToDest * 10) / 10,
        destination_to_itinerary: Math.round(destToItinerary * 10) / 10,
        itinerary_to_signup: Math.round(itineraryToSignup * 10) / 10,
        overall: Math.round(overallConversion * 10) / 10,
        cart_to_checkout: Math.round(cartToCheckout * 10) / 10,
        experience_to_booking: Math.round(experienceToBooking * 10) / 10,
        home_to_asked_local: Math.round(homeToAskedLocal * 10) / 10,
        destination_to_affiliate: Math.round(destinationToAffiliate * 10) / 10,
        trip_push_ctr: Math.round(tripPushCtr * 10) / 10,
        asked_to_consultation: Math.round(askedToConsultation * 10) / 10,
        consultation_to_paid: Math.round(consultationToPaid * 10) / 10,
        paid_to_delivered: Math.round(paidToDelivered * 10) / 10,
      },
      period: "30d",
    });
  } catch (error) {
    console.error("[track-funnel] GET napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
