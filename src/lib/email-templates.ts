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
// Helpers
// =========================

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
