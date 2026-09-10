import { emailTemplate, getBaseUrl } from "@/lib/email";

// Angleške oznake paketov (za globalne stranke)
export const PLAN_LABELS_EN: Record<string, string> = {
  free: "Free",
  premium: "Premium",
  enterprise: "Enterprise",
};

// Mesečna cena po paketu (EUR) — mora biti v sinhnronu s stripe-server.ts
const PLAN_MONTHLY_PRICE: Record<string, number> = {
  free: 0,
  premium: 149,
  enterprise: 499,
};

// =========================
// 1. WELCOME EMAIL
// =========================
export function welcomeEmail(
  ownerName: string,
  businessName: string,
  plan: string
): { subject: string; html: string; text: string } {
  const planLabel = PLAN_LABELS_EN[plan] || "Free";
  const dashboardUrl = `${getBaseUrl()}/owner/dashboard`;
  const subject = "Dobrodošli na platformi Discover Slovenia AI! 🎉";

  const content = `
    <p style="margin-top: 0;">Pozdravljeni <strong>${escapeHtml(ownerName)}</strong>,</p>
    <p>Dobrodošli na platformi <strong>Discover Slovenia AI</strong> — prvi AI-turistični portal za Slovenijo. Veselimo se sodelovanja z <strong>${escapeHtml(businessName)}</strong>.</p>

    <p><em>Welcome to Discover Slovenia AI — the first AI-powered tourism platform for Slovenia. We are excited to partner with ${escapeHtml(businessName)}.</em></p>

    <h3 style="color: #2d6a3e; margin-bottom: 8px;">Kaj lahko storite v nadzorni plošči?</h3>
    <ul style="padding-left: 20px; line-height: 1.8;">
      <li><strong>Dodajte svoje lokalce</strong> — hotele, restavracije, aktivnosti</li>
      <li><strong>Ustvarite izdelke in izkušnje</strong> — prodajajte lokalne dobrote, organizirajte ture</li>
      <li><strong>Spremljajte statistiko</strong> — ogledi, kliki, konverzija, ROI</li>
      <li><strong>Nadgradite paket</strong> — višji paket = večje omejitve in boljša vidljivost</li>
    </ul>

    <h3 style="color: #2d6a3e; margin-bottom: 8px;">Vaš trenutni paket</h3>
    <p>Trenutno uporabljate paket <strong>${planLabel}</strong>. ${plan === "free" ? "Med beta obdobjem so vse funkcionalnosti na voljo brezplačno." : ""}</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${dashboardUrl}" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Pojdi v dashboard →
      </a>
    </div>

    <p style="font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px;">
      Imate vprašanja? Odgovorite na to sporočilo ali pišite na <a href="mailto:support@discoverslovenia.ai" style="color: #2d6a3e;">support@discoverslovenia.ai</a>.
    </p>
  `;

  const text = `Dobrodošli na Discover Slovenia AI, ${ownerName}!

Vaše podjetje ${businessName} je uspešno registrirano. Trenutni paket: ${planLabel}.

Naslednji koraki:
1. Prijavite se v dashboard
2. Dodajte svoje lokalce, izdelke ali izkušnje
3. Spremljajte statistiko in ROI

Pojdi v dashboard: ${dashboardUrl}

Lep pozdrav,
Ekipa Discover Slovenia AI`;

  return { subject, html: emailTemplate("Dobrodošli! 🎉", content), text };
}

// =========================
// 2. PAYMENT CONFIRMATION EMAIL
// =========================
export function paymentConfirmationEmail(
  ownerName: string,
  plan: string,
  amount: number,
  renewalDate: Date
): { subject: string; html: string; text: string } {
  const planLabel = PLAN_LABELS_EN[plan] || plan;
  const amountStr = formatEur(amount);
  const renewalStr = renewalDate.toLocaleDateString("sl-SI", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const portalUrl = `${getBaseUrl()}/owner/dashboard`;
  const subject = "Potrditev plačila — Discover Slovenia AI";

  const content = `
    <p style="margin-top: 0;">Pozdravljeni <strong>${escapeHtml(ownerName)}</strong>,</p>
    <p>Hvala za plačilo! Vaša naročnina na platformi Discover Slovenia AI je uspešno aktivirana.</p>
    <p><em>Thank you for your payment! Your subscription to Discover Slovenia AI has been successfully activated.</em></p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <table style="width: 100%; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Paket / Plan:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold;">${planLabel}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Znesek / Amount:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold;">${amountStr} / mesec</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Obnovitev / Renews on:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold;">${renewalStr}</td>
        </tr>
      </table>
    </div>

    <p>Naročnina se samodejno obnovi na navedeni datum. Če želite spremeniti ali preklicati naročnino, lahko to storite v nadzorni plošči.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${portalUrl}" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Upravljaj naročnino →
      </a>
    </div>

    <p style="font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px;">
      Za pomoč pišite na <a href="mailto:billing@discoverslovenia.ai" style="color: #2d6a3e;">billing@discoverslovenia.ai</a>.
    </p>
  `;

  const text = `Potrditev plačila — Discover Slovenia AI

Pozdravljeni ${ownerName},

Hvala za plačilo! Vaša naročnina je uspešno aktivirana.

Paket: ${planLabel}
Znesek: ${amountStr} / mesec
Obnovitev: ${renewalStr}

Naročnina se samodejno obnovi. Upravljate jo lahko v nadzorni plošči:
${portalUrl}

Lep pozdrav,
Ekipa Discover Slovenia AI`;

  return { subject, html: emailTemplate("Potrditev plačila ✅", content), text };
}

// =========================
// 3. RENEWAL REMINDER EMAIL
// =========================
export function renewalReminderEmail(
  ownerName: string,
  plan: string,
  daysLeft: number,
  renewalDate: Date
): { subject: string; html: string; text: string } {
  const planLabel = PLAN_LABELS_EN[plan] || plan;
  const amount = PLAN_MONTHLY_PRICE[plan] || 0;
  const amountStr = formatEur(amount);
  const renewalStr = renewalDate.toLocaleDateString("sl-SI", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const subject = `Opomnik: Obnovitev naročnine čez ${daysLeft} dni`;
  const renewUrl = `${getBaseUrl()}/owner/dashboard`;

  const content = `
    <p style="margin-top: 0;">Pozdravljeni <strong>${escapeHtml(ownerName)}</strong>,</p>
    <p>To je prijazni opomnik: vaša naročnina na platformi Discover Slovenia AI se obnovi čez <strong>${daysLeft} dni</strong>.</p>
    <p><em>Friendly reminder: your Discover Slovenia AI subscription renews in ${daysLeft} days.</em></p>

    <div style="background: #fef9c3; border: 1px solid #fde68a; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <table style="width: 100%; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Paket / Plan:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold;">${planLabel}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Znesek / Amount:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold;">${amountStr} / mesec</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Datum obnovitve / Renews:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold;">${renewalStr}</td>
        </tr>
      </table>
    </div>

    <h3 style="color: #2d6a3e;">Kaj se zgodi ob obnovitvi?</h3>
    <ul style="padding-left: 20px; line-height: 1.8;">
      <li>Vaša kartica bo samodejno bremenjena za ${amountStr}</li>
      <li>Naročnina se podaljša za en mesec</li>
      <li>Vsi vaši oglasi in izdelki ohranijo premium/enterprise ugodnosti</li>
    </ul>

    <h3 style="color: #b91c1c;">Kaj če ne obnovite?</h3>
    <p>Če preklicete ali pustite naročnino preteči, bo vaš paket preklopil na <strong>free</strong>. To pomeni:</p>
    <ul style="padding-left: 20px; line-height: 1.8;">
      <li>Omejenitev na manj oglasov (1 lokal, 1 izdelek, 1 izkušnja)</li>
      <li>Brez izpostavljenega prikaza v AI itinererjih</li>
      <li>Brez priority support</li>
    </ul>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${renewUrl}" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Upravljaj naročnino →
      </a>
    </div>

    <p style="font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px;">
      Če ste naročnino že podaljšali ali preklicali, lahko to sporočilo ignorirate.
    </p>
  `;

  const text = `Opomnik: Obnovitev naročnine čez ${daysLeft} dni

Pozdravljeni ${ownerName},

Vaša naročnina se obnovi čez ${daysLeft} dni (${renewalStr}).

Paket: ${planLabel}
Znesek: ${amountStr} / mesec

Če želite nadaljevati z enakim paketom, vam ni treba storiti ničesar — naročnina se obnovi samodejno.

Če želite spremeniti ali preklicati naročnino, obiščite:
${renewUrl}

Lep pozdrav,
Ekipa Discover Slovenia AI`;

  return { subject, html: emailTemplate("Opomnik za obnovitev ⏰", content), text };
}

// =========================
// 4. LEAD NOTIFICATION EMAIL (za ownerja)
// =========================
export function leadNotificationEmail(
  ownerName: string,
  businessName: string,
  leadName: string,
  leadEmail: string,
  leadPhone: string | undefined,
  plan: string,
  message?: string
): { subject: string; html: string; text: string } {
  const planLabel = PLAN_LABELS_EN[plan] || plan;
  const subject = `Nov povpraševalec za ${businessName}! 📩`;
  const replyUrl = `mailto:${leadEmail}`;
  const phoneHtml = leadPhone
    ? `<tr><td style="padding: 6px 0; color: #6b7280;">Telefon / Phone:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;"><a href="tel:${escapeHtml(leadPhone)}" style="color: #2d6a3e;">${escapeHtml(leadPhone)}</a></td></tr>`
    : "";

  const messageHtml = message
    ? `<div style="background: #f9fafb; border-left: 4px solid #2d6a3e; padding: 14px 18px; margin: 20px 0; border-radius: 4px;"><strong>Sporočilo povpraševalca:</strong><br/><br/>${escapeHtml(message)}</div>`
    : "";

  const content = `
    <p style="margin-top: 0;">Pozdravljeni <strong>${escapeHtml(ownerName)}</strong>,</p>
    <p>Prejeli ste novo povpraševanje preko platforme Discover Slovenia AI za <strong>${escapeHtml(businessName)}</strong>.</p>
    <p><em>You have received a new inquiry through Discover Slovenia AI for ${escapeHtml(businessName)}.</em></p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <table style="width: 100%; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #6b7280;">Ime / Name:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${escapeHtml(leadName)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Email:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;"><a href="${replyUrl}" style="color: #2d6a3e;">${escapeHtml(leadEmail)}</a></td></tr>
        ${phoneHtml}
        <tr><td style="padding: 6px 0; color: #6b7280;">Zanimanje za / Plan:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${planLabel}</td></tr>
      </table>
    </div>

    ${messageHtml}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${replyUrl}" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Odgovori povpraševalcu →
      </a>
    </div>

    <p style="font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px;">
      💡 Nasvet: hitri odgovor (v 24 urah) poveča verjetnost rezervacije za 80 %.
    </p>
  `;

  const text = `Nov povpraševalec za ${businessName}!

Pozdravljeni ${ownerName},

Prejeli ste novo povpraševanje:

Ime: ${leadName}
Email: ${leadEmail}
${leadPhone ? `Telefon: ${leadPhone}\n` : ""}Zanimanje za paket: ${planLabel}
${message ? `\nSporočilo:\n${message}\n` : ""}
Odgovorite lahko neposredno na ${leadEmail}.

Lep pozdrav,
Ekipa Discover Slovenia AI`;

  return { subject, html: emailTemplate("Nov povpraševalec 📩", content), text };
}

// =========================
// 5. ADMIN ALERT EMAIL
// =========================
export type AdminAlertType =
  | "new_signup"
  | "new_lead"
  | "cancellation"
  | "payment_failed";

export function adminAlertEmail(
  alertType: AdminAlertType,
  details: Record<string, string | number | boolean | null | undefined>
): { subject: string; html: string; text: string } {
  const meta: Record<AdminAlertType, { subject: string; title: string; icon: string }> = {
    new_signup: {
      subject: "🔔 Nova registracija na Discover Slovenia AI",
      title: "Nova registracija ponudnika",
      icon: "🔔",
    },
    new_lead: {
      subject: "📩 Nov lead preko JoinUs obrazca",
      title: "Nov lead sprejet",
      icon: "📩",
    },
    cancellation: {
      subject: "⚠️ Preklic naročnine",
      title: "Lastnik je preklical naročnino",
      icon: "⚠️",
    },
    payment_failed: {
      subject: "❌ Neuspešno plačilo (subscription)",
      title: "Plačilo naročnine je spodletelo",
      icon: "❌",
    },
  };

  const m = meta[alertType];
  const rows = Object.entries(details)
    .map(
      ([key, value]) =>
        `<tr><td style="padding: 6px 0; color: #6b7280; vertical-align: top;">${escapeHtml(key)}:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${escapeHtml(String(value ?? "—"))}</td></tr>`
    )
    .join("");

  const content = `
    <p style="margin-top: 0;">Pozdravljen admin,</p>
    <p>To je avtomatsko obvestilo iz platforme Discover Slovenia AI.</p>

    <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <h3 style="margin: 0 0 12px 0; color: #92400e;">${m.icon} ${m.title}</h3>
      <table style="width: 100%; font-size: 14px;">
        ${rows}
      </table>
    </div>

    <p>Podrobnosti so shranjene v bazi. Za več obiščite admin nadzorno ploščo.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${getBaseUrl()}/admin" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Odpri admin dashboard →
      </a>
    </div>
  `;

  const text = `${m.subject}

Avtomatsko obvestilo:

${Object.entries(details)
  .map(([k, v]) => `${k}: ${v ?? "—"}`)
  .join("\n")}

Admin dashboard: ${getBaseUrl()}/admin`;

  return { subject: m.subject, html: emailTemplate(m.title, content), text };
}

// =========================
// 6. ORDER CONFIRMATION EMAIL (kupec v tržnici)
// =========================
export interface OrderEmailItem {
  name: string;
  quantity: number;
  price: number;
}

export interface OrderConfirmationEmailData {
  orderNumber: string;
  buyerName: string;
  items: OrderEmailItem[];
  subtotal: number;
  shipping: number;
  total: number;
}

export function orderConfirmationEmail({
  orderNumber,
  buyerName,
  items,
  subtotal,
  shipping,
  total,
}: OrderConfirmationEmailData): { subject: string; html: string; text: string } {
  const subject = `Potrditev naročila ${orderNumber} — Discover Slovenia AI`;

  // Tabelica artiklov (isti vizualni jezik kot paymentConfirmationEmail)
  const itemRows = items
    .map((item) => {
      const lineTotal = item.price * item.quantity;
      return `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #1a2e1a;">${escapeHtml(item.name)}</td>
          <td style="padding: 10px 0 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #374151; white-space: nowrap;">${item.quantity}×</td>
          <td style="padding: 10px 0 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151; white-space: nowrap;">${formatEur(item.price)}</td>
          <td style="padding: 10px 0 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold; white-space: nowrap;">${formatEur(lineTotal)}</td>
        </tr>`;
    })
    .join("");

  const shippingValue =
    shipping === 0
      ? `<span style="color: #2d6a3e; font-weight: bold;">Brezplačna</span>`
      : formatEur(shipping);

  const content = `
    <p style="margin-top: 0;">Pozdravljeni <strong>${escapeHtml(buyerName)}</strong>,</p>
    <p>Hvala za nakup! Vaše naročilo <strong>${escapeHtml(orderNumber)}</strong> je bilo uspešno oddano in plačilo je potrjeno. Spodaj je povzetek naročila.</p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
        <tr>
          <th style="padding: 0 0 10px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #2d6a3e; text-align: left;">Izdelek</th>
          <th style="padding: 0 0 10px 12px; color: #6b7280; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #2d6a3e; text-align: center;">Kol.</th>
          <th style="padding: 0 0 10px 12px; color: #6b7280; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #2d6a3e; text-align: right;">Cena</th>
          <th style="padding: 0 0 10px 12px; color: #6b7280; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #2d6a3e; text-align: right;">Skupaj</th>
        </tr>
        ${itemRows}
      </table>
      <table style="width: 100%; font-size: 14px; margin-top: 16px;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Vrednost izdelkov:</td>
          <td style="padding: 6px 0; text-align: right;">${formatEur(subtotal)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Dostava:</td>
          <td style="padding: 6px 0; text-align: right;">${shippingValue}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0 0 0; border-top: 1px solid #e5e7eb; font-weight: bold; color: #1a2e1a;">Skupaj:</td>
          <td style="padding: 10px 0 0 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: bold; font-size: 16px; color: #2d6a3e;">${formatEur(total)}</td>
        </tr>
      </table>
    </div>

    <p>Naročilo obdelamo v 1–2 delovnih dneh in vam pošljemo obvestilo o odpošiljki. Številko naročila <strong>${escapeHtml(orderNumber)}</strong> navedite pri morebitnih vprašanjih.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${getBaseUrl()}" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Discover Slovenia AI →
      </a>
    </div>

    <p style="font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px;">
      Za vprašanja odgovorite na to sporočilo ali pišite na <a href="mailto:support@discoverslovenia.ai" style="color: #2d6a3e;">support@discoverslovenia.ai</a>.
    </p>
  `;

  const text = `Potrditev naročila ${orderNumber} — Discover Slovenia AI

Pozdravljeni ${buyerName},

Hvala za nakup! Vaše naročilo ${orderNumber} je bilo uspešno oddano in plačilo je potrjeno.

${items
  .map(
    (i) =>
      `- ${i.name}: ${i.quantity} × ${formatEur(i.price)} = ${formatEur(i.price * i.quantity)}`
  )
  .join("\n")}

Vrednost izdelkov: ${formatEur(subtotal)}
Dostava: ${shipping === 0 ? "Brezplačna" : formatEur(shipping)}
Skupaj: ${formatEur(total)}

Naročilo obdelamo v 1–2 delovnih dneh. Za vprašanja odgovorite na to sporočilo.

Lep pozdrav,
Ekipa Discover Slovenia AI`;

  return {
    subject,
    html: customerEmailTemplate("Potrditev naročila ✅", content),
    text,
  };
}

// =========================
// 7. BOOKING CONFIRMATION EMAIL (gost — rezervacija izkušnje)
// =========================
export interface BookingConfirmationEmailData {
  bookingNumber: string;
  guestName: string;
  experienceName: string;
  bookingDate: Date;
  groupSize: number;
  pricePerPerson: number;
  total: number;
  meetingPoint?: string | null;
  providerName: string;
}

export function bookingConfirmationEmail({
  bookingNumber,
  guestName,
  experienceName,
  bookingDate,
  groupSize,
  pricePerPerson,
  total,
  meetingPoint,
  providerName,
}: BookingConfirmationEmailData): { subject: string; html: string; text: string } {
  // slovenski dolgi format: npr. "torek, 9. september 2026"
  const dateStr = new Intl.DateTimeFormat("sl-SI", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(bookingDate);

  const subject = `Potrditev rezervacije ${bookingNumber} — Discover Slovenia AI`;

  const meetingPointHtml = meetingPoint
    ? `<tr><td style="padding: 6px 0; color: #6b7280;">Kraj srečanja:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${escapeHtml(meetingPoint)}</td></tr>`
    : "";

  const content = `
    <p style="margin-top: 0;">Pozdravljeni <strong>${escapeHtml(guestName)}</strong>,</p>
    <p>Vaša rezervacija izkušnje <strong>${escapeHtml(experienceName)}</strong> je <strong>potrjena</strong>! Vaša rezervacijska številka je <strong>${escapeHtml(bookingNumber)}</strong>.</p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <table style="width: 100%; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #6b7280;">Izkušnja:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${escapeHtml(experienceName)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Datum:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${escapeHtml(dateStr)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Število oseb:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${groupSize}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Cena na osebo:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${formatEur(pricePerPerson)}</td></tr>
        ${meetingPointHtml}
        <tr><td style="padding: 6px 0; color: #6b7280;">Ponudnik:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${escapeHtml(providerName)}</td></tr>
        <tr>
          <td style="padding: 10px 0 0 0; border-top: 1px solid #e5e7eb; font-weight: bold; color: #1a2e1a;">Skupaj:</td>
          <td style="padding: 10px 0 0 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: bold; font-size: 16px; color: #2d6a3e;">${formatEur(total)}</td>
        </tr>
      </table>
    </div>

    <p>Na dan izkušnje se prijavite pri ponudniku <strong>${escapeHtml(providerName)}</strong>${meetingPoint ? ` na kraju srečanja: <strong>${escapeHtml(meetingPoint)}</strong>` : ""}. Priporočamo prihod 10–15 minut pred začetkom.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${getBaseUrl()}" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Discover Slovenia AI →
      </a>
    </div>

    <p style="font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px;">
      Za spremembe ali vprašanja odgovorite na to sporočilo — sporočilo posredujemo ponudniku.
    </p>
  `;

  const text = `Potrditev rezervacije ${bookingNumber} — Discover Slovenia AI

Pozdravljeni ${guestName},

Vaša rezervacija izkušnje ${experienceName} je potrjena! Rezervacijska številka: ${bookingNumber}.

Izkušnja: ${experienceName}
Datum: ${dateStr}
Število oseb: ${groupSize}
Cena na osebo: ${formatEur(pricePerPerson)}
${meetingPoint ? `Kraj srečanja: ${meetingPoint}\n` : ""}Ponudnik: ${providerName}
Skupaj: ${formatEur(total)}

Na dan izkušnje se prijavite pri ponudniku${meetingPoint ? ` na kraju srečanja (${meetingPoint})` : ""}. Priporočamo prihod 10–15 minut pred začetkom.

Za spremembe odgovorite na to sporočilo.

Lep pozdrav,
Ekipa Discover Slovenia AI`;

  return {
    subject,
    html: customerEmailTemplate("Potrditev rezervacije 🎉", content),
    text,
  };
}

// =========================
// 8. PROVIDER BOOKING NOTIFICATION EMAIL (ponudniku o novi rezervaciji)
// =========================
export interface ProviderBookingNotificationEmailData {
  bookingNumber: string;
  experienceName: string;
  bookingDate: Date;
  groupSize: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  total: number;
}

export function providerBookingNotificationEmail({
  bookingNumber,
  experienceName,
  bookingDate,
  groupSize,
  guestName,
  guestEmail,
  guestPhone,
  total,
}: ProviderBookingNotificationEmailData): { subject: string; html: string; text: string } {
  // slovenski dolgi format: npr. "torek, 9. september 2026"
  const dateStr = new Intl.DateTimeFormat("sl-SI", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(bookingDate);

  const subject = `Nova rezervacija ${bookingNumber} — ${experienceName}`;

  const content = `
    <p style="margin-top: 0;">Pozdravljeni,</p>
    <p>Prejeli ste <strong>novo rezervacijo</strong> za <strong>${escapeHtml(experienceName)}</strong> prek platforme Discover Slovenia AI. Rezervacija je <strong>potrjena</strong> — gost pričakuje vaš potrditveni kontakt.</p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <table style="width: 100%; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #6b7280;">Rezervacijska številka:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${escapeHtml(bookingNumber)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Izkušnja:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${escapeHtml(experienceName)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Datum:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${escapeHtml(dateStr)}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Število oseb:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${groupSize}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Skupaj:</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${formatEur(total)}</td></tr>
      </table>
    </div>

    <h3 style="color: #2d6a3e; margin-bottom: 8px;">Kontakt gosta</h3>
    <div style="background: #f9fafb; border-left: 4px solid #2d6a3e; padding: 14px 18px; margin: 20px 0; border-radius: 4px;">
      <table style="width: 100%; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #6b7280;">Ime:</td><td style="padding: 4px 0; text-align: right; font-weight: bold;">${escapeHtml(guestName)}</td></tr>
        <tr><td style="padding: 4px 0; color: #6b7280;">Email:</td><td style="padding: 4px 0; text-align: right; font-weight: bold;"><a href="mailto:${escapeHtml(guestEmail)}" style="color: #2d6a3e;">${escapeHtml(guestEmail)}</a></td></tr>
        <tr><td style="padding: 4px 0; color: #6b7280;">Telefon:</td><td style="padding: 4px 0; text-align: right; font-weight: bold;"><a href="tel:${escapeHtml(guestPhone)}" style="color: #2d6a3e;">${escapeHtml(guestPhone)}</a></td></tr>
      </table>
    </div>

    <p>Obrnite se na gosta in potrdite podrobnosti (točen termin, kraj srečanja, potrebna oprema). Hitri odgovor (v 24 urah) močno poveča zadovoljstvo gostov in ponovne rezervacije.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="mailto:${escapeHtml(guestEmail)}" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Odgovori gostu →
      </a>
    </div>

    <p style="font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px;">
      Rezervacija je shranjena v bazi platforme. Za podporo pišite na <a href="mailto:support@discoverslovenia.ai" style="color: #2d6a3e;">support@discoverslovenia.ai</a>.
    </p>
  `;

  const text = `Nova rezervacija ${bookingNumber} — ${experienceName}

Pozdravljeni,

Prejeli ste novo rezervacijo za ${experienceName} prek platforme Discover Slovenia AI. Rezervacija je potrjena — gost pričakuje vaš potrditveni kontakt.

Rezervacijska številka: ${bookingNumber}
Datum: ${dateStr}
Število oseb: ${groupSize}
Skupaj: ${formatEur(total)}

Kontakt gosta:
Ime: ${guestName}
Email: ${guestEmail}
Telefon: ${guestPhone}

Obrnite se na gosta in potrdite podrobnosti (točen termin, kraj srečanja, potrebna oprema).

Lep pozdrav,
Ekipa Discover Slovenia AI`;

  return { subject, html: emailTemplate("Nova rezervacija 🎉", content), text };
}

// =========================
// 9. CONSULTATION DELIVERY EMAIL (brezplačna konzultacija — zasebna povezava)
// =========================
// Model „ponudniki plačajo" (Faza 3c): konzultacija je BREZPLAČNA za
// uporabnika — e-pošta je dostavna pot do odgovora + vabilo na rezervacije
// (monetizacija poteka na strani ponudnikov, ne kupca).
export interface ConsultationDeliveryEmailData {
  /** accessToken konzultacije → /konzultacija/{token} */
  token: string;
  question: string;
  destinationName?: string | null;
}

export function consultationDeliveryEmail({
  token,
  question,
  destinationName,
}: ConsultationDeliveryEmailData): { subject: string; html: string; text: string } {
  const link = `${getBaseUrl()}/konzultacija/${token}`;

  // Vprašanje skrajšamo na 220 znakov (e-pošta je obvestilo, ne arhiv)
  const shortQuestion =
    question.length > 220 ? `${question.slice(0, 217).trimEnd()}…` : question;

  const subject = `Vaša osebna konzultacija je pripravljena — Discover Slovenia AI`;

  const content = `
    <p style="margin-top: 0;">Pozdravljeni,</p>
    <p>Vaša <strong>brezplačna</strong> osebna konzultacija${destinationName ? ` za <strong>${escapeHtml(destinationName)}</strong>` : ""} je pripravljena! Lokalni vpogled, oseben načrt in praktični nasveti vas čakajo na zasebni povezavi:</p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0; font-size: 14px;">
      <p style="margin: 0 0 4px 0; color: #6b7280; font-size: 12px; text-transform: uppercase;">Vaše vprašanje</p>
      <p style="margin: 0; color: #1a2e1a; font-style: italic;">${escapeHtml(shortQuestion)}</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${link}" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Odpri svojo konzultacijo →
      </a>
      <p style="font-size: 12px; color: #6b7280; margin: 12px 0 0 0; word-break: break-all;">${link}</p>
    </div>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px 20px; margin: 20px 0; font-size: 14px;">
      <strong>Naslednji korak:</strong> priporočene izkušnje lahko takoj rezervirate neposredno na konzultaciji — vsaka rezervacija podpira lokalne ponudnike, ki so omogočili ta brezplačen nasvet.
    </div>

    <p style="font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px;">
      🔒 Ta povezava je <strong>zasebna</strong> — vsebuje vaše osebne podatke (datume, proračun). Shranite si to sporočilo in povezave ne objavljajte javno. Za vprašanja odgovorite na to sporočilo.
    </p>
  `;

  const text = `Vaša osebna konzultacija je pripravljena — Discover Slovenia AI

Pozdravljeni,

Vaša brezplačna osebna konzultacija${destinationName ? ` za ${destinationName}` : ""} je pripravljena!

Vaše vprašanje:
${shortQuestion}

Odpri svojo konzultacijo:
${link}

(Naslednji korak: priporočene izkušnje rezervirate neposredno na konzultaciji.)

(Ta povezava je zasebna — shranite si to sporočilo in je ne delite javno.)

Lep pozdrav,
Ekipa Discover Slovenia AI`;

  return {
    subject,
    html: customerEmailTemplate("Vaša konzultacija je pripravljena 📍", content),
    text,
  };
}

// =========================
// 10. COMMISSION INVOICE EMAIL (za ownerja — Faza 4b samodejni obračun)
// =========================

export type CommissionInvoiceEmailData = {
  ownerName: string;
  invoiceNumber: string;
  periodStart: Date;
  periodEnd: Date; // ekskluzivna meja — zadnji dan = end − 1 ms
  bookingCount: number;
  commissionBase: number;
  rate: number;
  amount: number;
};

export function commissionInvoiceEmail({
  ownerName,
  invoiceNumber,
  periodStart,
  periodEnd,
  bookingCount,
  commissionBase,
  rate,
  amount,
}: CommissionInvoiceEmailData): { subject: string; html: string; text: string } {
  const fmtDay = (d: Date) =>
    d.toLocaleDateString("sl-SI", { day: "numeric", month: "long", year: "numeric" });
  const periodStr = `${fmtDay(periodStart)} – ${fmtDay(
    new Date(periodEnd.getTime() - 1)
  )}`;
  const amountStr = formatEur(amount);
  const baseStr = formatEur(commissionBase);
  const ratePercent = Math.round(rate * 100);
  const subject = `Račun ${invoiceNumber}: provizija ${amountStr} (${periodStr})`;
  const dashboardUrl = `${getBaseUrl()}/owner/dashboard`;

  const content = `
    <p style="margin-top: 0;">Pozdravljeni <strong>${escapeHtml(ownerName)}</strong>,</p>
    <p>za obdobje <strong>${periodStr}</strong> vam je brezplačna AI konzultacija prinesla
    <strong>${bookingCount} ${bookingCount === 1 ? "rezervacijo" : "rezervacije"}</strong>.
    Skladno s provizijskim modelom (kot pri Booking.com) vam izdajemo račun za provizijo.</p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <div style="font-size: 13px; color: #166534; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
        🧾 Provizijski račun
      </div>
      <table style="width: 100%; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Številka računa:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold; font-family: monospace;">${escapeHtml(invoiceNumber)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Obdobje:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold;">${periodStr}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Rezervacije iz AI konzultacij:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold;">${bookingCount}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Osnova (vrednost rezervacij):</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold;">${baseStr}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Provizijska stopnja:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold;">${ratePercent} %</td>
        </tr>
        <tr>
          <td style="padding: 10px 0 0 0; color: #1a2e1a; border-top: 1px solid #bbf7d0; font-weight: bold;">Znesek za plačilo:</td>
          <td style="padding: 10px 0 0 0; text-align: right; border-top: 1px solid #bbf7d0; font-weight: bold; font-size: 18px; color: #2d6a3e;">${amountStr}</td>
        </tr>
      </table>
    </div>

    <p><strong>Kako deluje ta model?</strong> Turist plača polno ceno neposredno vam — provizija
    zajema izključno rezervacije, ki jih je prinesla brezplačna AI konzultacija.
    Rezervacije, ki pridejo od drugod, ostanejo povsem brez provizije.</p>

    <div style="background: #fef9c3; border: 1px solid #fde68a; border-radius: 8px; padding: 16px 20px; margin: 24px 0; font-size: 14px; color: #92400e;">
      💡 <strong>Želite 0&nbsp;% provizije?</strong> Premium partnerji (149&nbsp;€/mes) ne plačujejo
      provizije na AI-prinesenih rezervacijah — poleg tega dobijo 5-odstotni rangirni boost
      in vidnejše mesto v konzultacijah.
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${dashboardUrl}" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Odpri račun v dashboardu →
      </a>
    </div>

    <p style="font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px;">
      Račun in zgodovina obračunov so vedno vidni v vašem dashboardu (zavihek „Provizije") —
      tam lahko vsak račun prenesete ali natisnete tudi kot PDF.
      Status plačila bomo posodobili ob prejetem plačilu.
    </p>
  `;

  const text = `Račun ${invoiceNumber}: provizija ${amountStr}

Pozdravljeni ${ownerName},

za obdobje ${periodStr} vam je brezplačna AI konzultacija prinesla ${bookingCount} ${
    bookingCount === 1 ? "rezervacijo" : "rezervacije"
  }.

Številka računa: ${invoiceNumber}
Osnova: ${baseStr}
Stopnja: ${ratePercent} %
Znesek za plačilo: ${amountStr}

Turist plača polno ceno neposredno vam — provizija zajema izključno rezervacije iz AI konzultacij.

Račun je viden v vašem dashboardu (PDF za tisk na voljo v zavihku „Provizije"):
${dashboardUrl}

Želite 0 % provizije? Premium (149 EUR/mes) vključuje 0 % provizije in 5-odstotni boost.

Lep pozdrav,
Ekipa Discover Slovenia AI`;

  return { subject, html: emailTemplate("Provizijski račun 🧾", content), text };
}

// =========================
// 11. COMMISSION INVOICE PAID EMAIL (potrdilo — Faza 5, Stripe plačilo)
// =========================

export type CommissionInvoicePaidEmailData = {
  ownerName: string;
  invoiceNumber: string;
  amount: number;
  paidAt: Date;
};

export function commissionInvoicePaidEmail({
  ownerName,
  invoiceNumber,
  amount,
  paidAt,
}: CommissionInvoicePaidEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const amountStr = formatEur(amount);
  const paidStr = paidAt.toLocaleDateString("sl-SI", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const subject = `Potrdilo: račun ${invoiceNumber} je poravnan (${amountStr})`;
  const dashboardUrl = `${getBaseUrl()}/owner/dashboard`;

  const content = `
    <p style="margin-top: 0;">Pozdravljeni <strong>${escapeHtml(ownerName)}</strong>,</p>
    <p>vaš provizijski račun je <strong>uspešno poravnan</strong>. Hvala za hitro plačilo!</p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <div style="font-size: 13px; color: #166534; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
        ✅ Potrdilo o plačilu
      </div>
      <table style="width: 100%; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Številka računa:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold; font-family: monospace;">${escapeHtml(invoiceNumber)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Datum plačila:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold;">${paidStr}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0 0 0; color: #1a2e1a; border-top: 1px solid #bbf7d0; font-weight: bold;">Poravnani znesek:</td>
          <td style="padding: 10px 0 0 0; text-align: right; border-top: 1px solid #bbf7d0; font-weight: bold; font-size: 18px; color: #2d6a3e;">${amountStr}</td>
        </tr>
      </table>
    </div>

    <p>Zgodovina obračunov in PDF računi so vedno na voljo v vašem dashboardu
    (zavihek „Provizije"). Če menite, da je prišlo do napake, odgovorite na to sporočilo.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${dashboardUrl}" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        Odpri dashboard →
      </a>
    </div>
  `;

  const text = `Potrdilo: račun ${invoiceNumber} je poravnan

Pozdravljeni ${ownerName},

vaš provizijski račun je uspešno poravnan.

Številka računa: ${invoiceNumber}
Datum plačila: ${paidStr}
Poravnani znesek: ${amountStr}

Zgodovina obračunov in PDF računi so na voljo v vašem dashboardu:
${dashboardUrl}

Lep pozdrav,
Ekipa Discover Slovenia AI`;

  return { subject, html: emailTemplate("Potrdilo o plačilu ✅", content), text };
}

// =========================
// 12. DRAFT NUDGE EMAILS (P2-2b — 60-dnevni niz za osnutke lokalov)
// =========================
// Osnutek lokala, ki nikoli ni bil dopolnjen in oddan v pregled, dobi
// največ 4 vljudne opomnike (dan 3 / 10 / 30 / 60 od ustvarjanja).
// Iskrena komunikacija brez lažne urgency: zadnji email je zgolj vljuden
// zaključek niza ("vrata ostajajo odprta") — BREZ groženj z arhiviranjem.

export interface DraftNudgeEmailData {
  ownerName: string;
  listingName: string;
  /** Korak niza 1–4 (dan 3 / 10 / 30 / 60 od ustvarjanja). */
  step: number;
  /** Odstotek popolnosti profila (prikazan v koraku 1). */
  completionPercentage?: number;
  /** Oznake manjkajočih OBAVEZNIH polj (prikazane v koraku 2). */
  missingRequiredLabels?: string[];
}

export function draftNudgeEmail({
  ownerName,
  listingName,
  step,
  completionPercentage = 0,
  missingRequiredLabels = [],
}: DraftNudgeEmailData): { subject: string; html: string; text: string } {
  const dashboardUrl = `${getBaseUrl()}/owner/dashboard`;
  const pct = Math.max(0, Math.min(100, Math.round(completionPercentage)));

  // CTA gumb + gola povezava kot fallback (isti vizualni jezik kot ostali emaili)
  const cta = (label: string) => `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${dashboardUrl}" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
        ${label}
      </a>
      <p style="font-size: 12px; color: #6b7280; margin: 12px 0 0 0; word-break: break-all;">${dashboardUrl}</p>
    </div>`;

  let subject: string;
  let title: string;
  let content: string;
  let text: string;

  switch (step) {
    case 1: {
      // Dan 3 — prijazno: odstotek popolnosti + kje nadaljevati
      subject = `Vaš lokal ${listingName} čaka na dopolnitev`;
      title = "Vaš lokal čaka na dopolnitev ✏️";
      content = `
    <p style="margin-top: 0;">Pozdravljeni <strong>${escapeHtml(ownerName)}</strong>,</p>
    <p>pred nekaj dnevi ste na platformi Discover Slovenia AI ustvarili osnutek lokala <strong>${escapeHtml(listingName)}</strong>. Profil je trenutno dopolnjen na <strong>${pct} %</strong> — do oddaje v pregled manjka le še nekaj podatkov.</p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <div style="font-size: 13px; color: #166534; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">Popolnost profila</div>
      <p style="font-size: 24px; margin: 0; color: #2d6a3e; font-weight: bold;">${pct} %</p>
      <div style="background: #e5e7eb; border-radius: 999px; height: 10px; margin-top: 12px; overflow: hidden;">
        <div style="background: #2d6a3e; height: 10px; width: ${pct}%; border-radius: 999px;"></div>
      </div>
    </div>

    <p>Vaš osnutek je varno shranjen — nadaljujete točno tam, kjer ste končali. Ko dopolnite zahtevana polja, lokal oddate v pregled; po odobritvi se začne samodejno prikazovati turistom v AI načrtih potovanj.</p>
    ${cta("Dopolni lokal →")}
  `;
      text = `Vaš lokal ${listingName} čaka na dopolnitev

Pozdravljeni ${ownerName},

pred nekaj dnevi ste ustvarili osnutek lokala ${listingName}. Profil je trenutno dopolnjen na ${pct} % — do oddaje v pregled manjka le še nekaj podatkov.

Osnutek je shranjen v vašem dashboardu, nadaljujete točno tam, kjer ste končali:
${dashboardUrl}

Lep pozdrav,
Ekipa Discover Slovenia AI`;
      break;
    }

    case 2: {
      // Dan 10 — vrednostna ponudba AI kanala + manjkajoča obvezna polja
      subject = `AI kanal čaka na ${listingName}`;
      title = "AI kanal čaka na vaš lokal 🤖";
      const missingList =
        missingRequiredLabels.length > 0
          ? `<ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: #92400e;">${missingRequiredLabels
              .map((label) => `<li>${escapeHtml(label)}</li>`)
              .join("")}</ul>`
          : `<p style="margin: 0; color: #92400e;">Vsi zahtevani podatki so že na mestu — lokal lahko takoj oddate v pregled.</p>`;
      const missingText =
        missingRequiredLabels.length > 0
          ? `Za oddajo v pregled manjka še: ${missingRequiredLabels.join(", ")}.`
          : "Vsi zahtevani podatki so že na mestu — lokal lahko takoj oddate v pregled.";
      content = `
    <p style="margin-top: 0;">Pozdravljeni <strong>${escapeHtml(ownerName)}</strong>,</p>
    <p>vaš osnutek <strong>${escapeHtml(listingName)}</strong> čaka že <strong>10 dni</strong>. Preden ga opustite, poglejte, kaj vas kot ponudnika čaka na drugi strani:</p>

    <ul style="padding-left: 20px; line-height: 1.8;">
      <li><strong>Brezplačna vključitev v AI načrte</strong> — naš AI načrtovalec priporoča lokal turistom pri sestavljanju potovanj po Sloveniji.</li>
      <li><strong>Brezplačne konzultacije turistov</strong> — turisti zastavljajo osebna vprašanja, AI pa citira primerne partnerje, tudi vas.</li>
      <li><strong>Brez vstopnih stroškov</strong> — osnovna prisotnost je brezplačna; plačate le, če želite dodatno vidnost.</li>
    </ul>

    <div style="background: #fef9c3; border: 1px solid #fde68a; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <div style="font-size: 13px; color: #92400e; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">Za oddajo v pregled manjka</div>
      ${missingList}
    </div>

    <p>Osnutek ostaja shranjen v vašem dashboardu — dopolnitev vzame le nekaj minut.</p>
    ${cta("Dopolni in oddaj lokal →")}
  `;
      text = `AI kanal čaka na ${listingName}

Pozdravljeni ${ownerName},

vaš osnutek ${listingName} čaka že 10 dni. Kot objavljen lokal vas čaka:
- brezplačna vključitev v AI načrte potovanj,
- brezplačne konzultacije turistov (AI citira primerne partnerje),
- brez vstopnih stroškov.

${missingText}

Osnutek ostaja shranjen v vašem dashboardu:
${dashboardUrl}

Lep pozdrav,
Ekipa Discover Slovenia AI`;
      break;
    }

    case 3: {
      // Dan 30 — kratko, iskreno, korak-za-korakom
      subject = `30 dni od ustvarjanja — ${listingName} je še vedno osnutek`;
      title = "Vaš osnutek po 30 dneh 📋";
      content = `
    <p style="margin-top: 0;">Pozdravljeni <strong>${escapeHtml(ownerName)}</strong>,</p>
    <p>od ustvarjanja osnutka <strong>${escapeHtml(listingName)}</strong> je minilo 30 dni in je še vedno nedokončan. Če ste obtičali, je to celoten postopek v treh korakih:</p>

    <ol style="padding-left: 20px; line-height: 1.8;">
      <li><strong>Odpri dashboard</strong> — osnutek čaka točno tam, kjer ste končali.</li>
      <li><strong>Dopolni manjkajoča polja</strong> — dashboard sproti kaže, kaj manjka.</li>
      <li><strong>Oddaj lokal v pregled</strong> — naša ekipa ga pregleda in objavi.</li>
    </ol>

    <p>Če trenutno nimate časa ali želje, lahko to sporočilo mirno ignorirate — osnutek ne nikamor.</p>
    ${cta("Nadaljuj z dopolnjevanjem →")}
  `;
      text = `30 dni od ustvarjanja — ${listingName} je še vedno osnutek

Pozdravljeni ${ownerName},

od ustvarjanja osnutka ${listingName} je minilo 30 dni. Če ste obtičali, je to celoten postopek:
1. Odpri dashboard — osnutek čaka točno tam, kjer ste končali.
2. Dopolni manjkajoča polja — dashboard sproti kaže, kaj manjka.
3. Oddaj lokal v pregled — naša ekipa ga pregleda in objavi.

Če trenutno nimate časa ali želje, lahko to sporočilo mirno ignorirate.

Nadaljuj v dashboardu:
${dashboardUrl}

Lep pozdrav,
Ekipa Discover Slovenia AI`;
      break;
    }

    case 4: {
      // Dan 60 — ZADNJI: vljuden zaključek niza, vrata ostajajo odprta
      subject = `Zadnjič vas spomnimo na ${listingName}`;
      title = "Zadnji opomnik — vrata ostajajo odprta 🚪";
      content = `
    <p style="margin-top: 0;">Pozdravljeni <strong>${escapeHtml(ownerName)}</strong>,</p>
    <p>pred dvema mesecema ste ustvarili osnutek <strong>${escapeHtml(listingName)}</strong>. To je <strong>zadnjič</strong>, da vas nanj spomnimo — nadaljnjih sporočil o tem osnutku ne bomo več pošiljali.</p>

    <p>Vrata pa ostajajo odprta: osnutek ostaja shranjen v vašem dashboardu in ga lahko kadarkoli dopolnite ter oddate v pregled — brez rokov in brez pritiska. Enako velja, če se za nov začetek odločite kadarkoli v prihodnje.</p>

    <p>Se vidimo na slovenskih potovanjih! 🇸🇮</p>
    ${cta("Odpri moj dashboard →")}
  `;
      text = `Zadnjič vas spomnimo na ${listingName}

Pozdravljeni ${ownerName},

pred dvema mesecema ste ustvarili osnutek ${listingName}. To je zadnjič, da vas nanj spomnimo — nadaljnjih sporočil o tem osnutku ne bomo več pošiljali.

Vrata ostajajo odprta: osnutek ostaja shranjen v vašem dashboardu in ga lahko kadarkoli dopolnite ter oddate v pregled — brez rokov in brez pritiska.

Dashboard:
${dashboardUrl}

Lep pozdrav in hvala, da ste del platforme,
Ekipa Discover Slovenia AI`;
      break;
    }

    default: {
      // Neznan korak — defenzivno (ne bi se smelo zgoditi; klic se preskoči že v lib)
      subject = `Vaš lokal ${listingName} čaka na dopolnitev`;
      title = "Vaš lokal čaka na dopolnitev ✏️";
      content = `
    <p style="margin-top: 0;">Pozdravljeni <strong>${escapeHtml(ownerName)}</strong>,</p>
    <p>vaš osnutek <strong>${escapeHtml(listingName)}</strong> še vedno čaka na dopolnitev v vašem dashboardu.</p>
    ${cta("Dopolni lokal →")}
  `;
      text = `Vaš lokal ${listingName} čaka na dopolnitev

Pozdravljeni ${ownerName},

vaš osnutek ${listingName} še vedno čaka na dopolnitev:
${dashboardUrl}

Lep pozdrav,
Ekipa Discover Slovenia AI`;
      break;
    }
  }

  return { subject, html: emailTemplate(title, content), text };
}

// =========================
// Helpers
// =========================

// Template za končne stranke (kupci/gosti) — IDENTIČEN vizualni jezik kot
// emailTemplate() v email.ts (zelena glava, bela vsebina, siva noga), le noga
// je prirejena strankam (ne "registriranim ponudnikom").
function customerEmailTemplate(title: string, content: string): string {
  return `<!DOCTYPE html><html><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: #2d6a3e; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
      <h1 style="margin: 0;">🇸🇮 Discover Slovenia AI</h1>
    </div>
    <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
      <h2 style="color: #1a2e1a; margin-top: 0;">${title}</h2>
      ${content}
    </div>
    <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 12px;">
      <p>Discover Slovenia AI — AI turistična platforma</p>
      <p>To sporočilo ste prejeli ker ste opravili nakup oz. rezervacijo prek platforme Discover Slovenia AI.</p>
    </div>
  </body></html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat("sl-SI", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
