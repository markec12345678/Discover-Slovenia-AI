import nodemailer from "nodemailer";

// SMTP config iz env (demo: console.log fallback)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Demo mode: samo log (če SMTP ni konfiguriran)
export function isEmailDemo(): boolean {
  return !process.env.SMTP_HOST || process.env.SMTP_HOST === "localhost";
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: EmailParams): Promise<boolean> {
  if (isEmailDemo()) {
    console.log(
      `[EMAIL DEMO] To: ${to}\nSubject: ${subject}\n---\n${text || html}\n---`
    );
    return true;
  }

  try {
    await transporter.sendMail({
      from:
        process.env.SMTP_FROM ||
        "I Feel Slovenia <noreply@ifeelslovenia.si>",
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ""),
    });
    return true;
  } catch (error) {
    console.error("[email] napaka:", error);
    return false;
  }
}

// Helper: osnovni HTML template
export function emailTemplate(title: string, content: string): string {
  return `<!DOCTYPE html><html><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: #2d6a3e; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
      <h1 style="margin: 0;">🇸🇮 I Feel Slovenia</h1>
    </div>
    <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
      <h2 style="color: #1a2e1a; margin-top: 0;">${title}</h2>
      ${content}
    </div>
    <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 12px;">
      <p>I Feel Slovenia — AI turistična platforma</p>
      <p>To sporočilo ste prejeli ker ste registrirani ponudnik.</p>
    </div>
  </body></html>`;
}

// Admin e-mail iz env (fallback)
export function getAdminEmail(): string {
  return process.env.ADMIN_EMAIL || "admin@ifeelslovenia.si";
}

// Base URL za povezave v e-mailih
export function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}
