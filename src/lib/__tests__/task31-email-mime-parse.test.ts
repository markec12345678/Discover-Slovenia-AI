// ============================================================================
// TASK 31 (Tier 1 #3) — EMAIL-MIME-PARSE: DETERMINISTIČNI RFC 5322/MIME BRALNIK
// ----------------------------------------------------------------------------
// Unit testi čistega bralnika (0 odvisnosti): glava, RFC 2047 kodirane
// besede, quoted-printable/base64 telesa, multipart/alternative (+mixed),
// .ics in .pdf priloge, meje in PASTI (nikoli izjema).
//
// Pokriti primeri:
//  1. preprosta 7bit e-pošta → Subject/From/textBody;
//  2. quoted-printable s slovenščino (č/š/ž) → dekodirano;
//  3. base64 UTF-8 telo;
//  4. RFC 2047 Subject (B in Q kodiranje) → dekodiran Subject;
//  5. multipart/alternative → text/plain PRED text/html;
//  6. html-only → htmlBody + htmlToText izlušči besedilo;
//  7. multipart/mixed + .ics priloga (text/calendar + filename) → surov ICS;
//  8. .ics po imenu datoteke (application/octet-stream) → prepoznana;
//  9. .pdf priloga (base64 + %PDF- magic) → base64 z magično glavo;
// 10. pokvarjena .pdf priloga (brez %PDF-) → iskreno IGNORIRANA (null);
// 11. prelomljena (folded) glava → razpleten Subject;
// 12. LF-only vrstice (prilepljeno iz urejevalnika) → deluje;
// 13. smeti brez glave → ok:false „ni-glave“;
// 14. nadzorni znaki → fail-closed „nadzorni-znaki“;
// 15. prevelik vhod → „preveliko“;
// 16. past mejnika: manjkajoč zaključni --boundary-- → strpano (nič ne manjka);
// 17. globinska meja gnezdenja (6 nivojev) → tiha rezerva;
// 18. ČISTOST: brez Date.now/fetch/prisma uvozov (determinizem);
// 19. emailTextForParsing: Subject + telo; Subject-only; nič → null.
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseEmailSource,
  emailTextForParsing,
  htmlToText,
  MAX_RAW_EMAIL_CHARS,
} from "@/lib/email-mime-parse";

const ROOT = join(__dirname, "..", "..", "..");
const libSrc = readFileSync(join(ROOT, "src/lib/email-mime-parse.ts"), "utf8");

const CRLF = "\r\n";

function email(headers: string[], bodyLines: string[]): string {
  return [...headers, "", ...bodyLines].join(CRLF);
}

// ─────────────────────────────────────────────────────────────────────────
// 1–4: osnovna dekodiranja
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 31: osnovna glava + telesa", () => {
  test("① preprosta 7bit e-pošta → Subject/From/Date/textBody", () => {
    const raw = email(
      [
        "From: potrditve@getyourguide.com",
        "To: janez@example.com",
        "Subject: GetYourGuide potrditev GYG-123456",
        "Date: Sat, 26 Sep 2026 10:00:00 +0200",
        "Content-Type: text/plain; charset=utf-8",
      ],
      ["Pozdravljeni,", "Vaša rezervacija GYG-123456 je potrjena.", "Znesek: 58 EUR"]
    );
    const r = parseEmailSource(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message.subject).toBe("GetYourGuide potrditev GYG-123456");
    expect(r.message.from).toBe("potrditve@getyourguide.com");
    expect(r.message.to).toBe("janez@example.com");
    expect(r.message.date).toBe("Sat, 26 Sep 2026 10:00:00 +0200");
    expect(r.message.textBody).toContain("GYG-123456");
    expect(r.message.icsAttachment).toBeNull();
    expect(r.message.pdfAttachmentBase64).toBeNull();
  });

  test("② quoted-printable s č/š/ž → dekodirano telo", () => {
    const raw = email(
      [
        "From: noreply@booking.com",
        "Subject: potrditev",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
      ],
      ["Va=C5=A1a =C5=A1t. rezervacije 48291037 je potrjena. =C4=8Carobno!"]
    );
    const r = parseEmailSource(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message.textBody).toContain("Vaša št. rezervacije 48291037");
    expect(r.message.textBody).toContain("Čarobno!");
  });

  test("③ base64 UTF-8 telo → dekodirano", () => {
    const b64 = Buffer.from(
      "Rezervacija 408921371224 pri Booking.com. Bled, 14.08.2026.",
      "utf8"
    ).toString("base64");
    const raw = email(
      [
        "From: confirm@booking.com",
        "Subject: rezervacija",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: base64",
      ],
      [b64]
    );
    const r = parseEmailSource(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message.textBody).toContain("408921371224");
    expect(r.message.textBody).toContain("Booking.com");
  });

  test("④ RFC 2047 Subject (B + Q) → dekodiran", () => {
    const b64Subj = Buffer.from("Booking.com – potrditev 48291037", "utf8")
      .toString("base64");
    const raw = email(
      [
        "From: noreply@booking.com",
        `Subject: =?utf-8?B?${b64Subj}?=`,
        "Content-Type: text/plain",
        "",
        "vsebina",
      ].slice(0, 3).concat(["Content-Type: text/plain"], [""]),
      ["vsebina"]
    );
    const r = parseEmailSource(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message.subject).toBe("Booking.com – potrditev 48291037");

    // Q varianta: podčrtaj = presledek.
    const qRaw = email(
      [
        "From: noreply@getyourguide.com",
        "Subject: =?utf-8?Q?GetYourGuide_potrditev=3FGYG=2D777?=",
        "Content-Type: text/plain",
      ],
      ["vsebina"]
    );
    const rq = parseEmailSource(qRaw);
    expect(rq.ok).toBe(true);
    if (!rq.ok) return;
    expect(rq.message.subject).toBe("GetYourGuide potrditev?GYG-777");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5–7: MIME struktura
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 31: multipart struktura", () => {
  test("⑤ multipart/alternative → text/plain PRED text/html", () => {
    const inner = "INNERALT";
    const raw = email(
      [
        "From: x@y.com",
        "Subject: rezervacija",
        `Content-Type: multipart/alternative; boundary="${inner}"`,
      ],
      [
        `--${inner}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Št. rezervacije: GYG-998",
        `--${inner}`,
        "Content-Type: text/html; charset=utf-8",
        "",
        "<p>Št. rezervacije: <b>GYG-998</b></p>",
        `--${inner}--`,
      ]
    );
    const r = parseEmailSource(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // text/plain ima PREDNOST (isti vrstni red kot odjemalci):
    expect(r.message.textBody).toBe("Št. rezervacije: GYG-998");
    expect(r.message.htmlBody).toContain("<b>GYG-998</b>");
  });

  test("⑥ html-only → htmlBody + htmlToText rezerva", () => {
    const raw = email(
      [
        "From: x@y.com",
        "Subject: potrdilo",
        "Content-Type: text/html; charset=utf-8",
      ],
      [
        "<html><head><style>.x{color:red}</style></head>",
        "<body><p>Potrjena rezervacija <b>GYG-555</b></p>",
        "<p>Cena 42&nbsp;EUR</p></body></html>",
      ]
    );
    const r = parseEmailSource(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message.textBody).toBeNull();
    expect(r.message.htmlBody).toContain("GYG-555");
    const text = htmlToText(r.message.htmlBody ?? "");
    expect(text).toContain("Potrjena rezervacija GYG-555");
    expect(text).toContain("Cena 42 EUR");
    expect(text).not.toContain("<");
    expect(text).not.toContain("color:red"); // style odstranjen
  });

  test("⑦ multipart/mixed + .ics priloga (text/calendar) → surov ICS", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:408921371224@booking.com",
      "DTSTART:20260814T140000Z",
      "SUMMARY:Booking.com \\, Hotel Park",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join(CRLF);
    const outer = "OUTERMIX";
    const raw = email(
      [
        "From: confirm@booking.com",
        "Subject: Rezervacija 408921371224",
        `Content-Type: multipart/mixed; boundary="${outer}"`,
      ],
      [
        `--${outer}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Glej koledarsko prilogo.",
        `--${outer}`,
        'Content-Type: text/calendar; name="booking.ics"; charset=utf-8',
        'Content-Disposition: attachment; filename="booking.ics"',
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(ics, "utf8").toString("base64"),
        `--${outer}--`,
      ]
    );
    const r = parseEmailSource(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message.icsAttachment).toContain("BEGIN:VCALENDAR");
    expect(r.message.icsAttachment).toContain("UID:408921371224@booking.com");
    expect(r.message.textBody).toBe("Glej koledarsko prilogo.");
  });

  test("⑧ .ics po imenu datoteke (application/octet-stream) → prepoznana", () => {
    const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:77123@getyourguide.com\r\nDTSTART:20260712T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR";
    const outer = "OCTETB";
    const raw = email(
      [
        "From: x@y.com",
        "Subject: priloga",
        `Content-Type: multipart/mixed; boundary="${outer}"`,
      ],
      [
        `--${outer}`,
        'Content-Type: application/octet-stream; name="confirm.ics"',
        'Content-Disposition: attachment; filename="confirm.ics"',
        "",
        ics,
        `--${outer}--`,
      ]
    );
    const r = parseEmailSource(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message.icsAttachment).toContain("BEGIN:VCALENDAR");
  });

  test("⑨–⑩ .pdf priloga: veljavna (magic) in pokvarjena (brez %PDF-)", () => {
    const outer = "PDFB";
    const valid = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF", "latin1");
    const raw = email(
      ["From: x@y.com", "Subject: pdf", `Content-Type: multipart/mixed; boundary="${outer}"`],
      [
        `--${outer}`,
        'Content-Type: application/pdf; name="confirm.pdf"',
        'Content-Disposition: attachment; filename="confirm.pdf"',
        "Content-Transfer-Encoding: base64",
        "",
        valid.toString("base64"),
        `--${outer}--`,
      ]
    );
    const r = parseEmailSource(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message.pdfAttachmentBase64).toBeTruthy();
    const head = Buffer.from(
      (r.message.pdfAttachmentBase64 ?? "").slice(0, 1024),
      "base64"
    ).toString("latin1");
    expect(head.startsWith("%PDF-")).toBe(true);

    // Pokvarjena „pdf“ priloga (brez magične glave) → iskreno prezrta:
    const junk = Buffer.from("to ni pdf, samo besedilo v preobleki", "utf8");
    const rawJunk = email(
      ["From: x@y.com", "Subject: pdf2", `Content-Type: multipart/mixed; boundary="${outer}"`],
      [
        `--${outer}`,
        "Content-Type: application/pdf",
        'Content-Disposition: attachment; filename="junk.pdf"',
        "Content-Transfer-Encoding: base64",
        "",
        junk.toString("base64"),
        `--${outer}--`,
      ]
    );
    const rj = parseEmailSource(rawJunk);
    expect(rj.ok).toBe(true);
    if (!rj.ok) return;
    expect(rj.message.pdfAttachmentBase64).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 11–17: meje in pasti (nikoli izjema)
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 31: meje in pasti", () => {
  test("⑪ prelomljena (folded) glava → razpleten Subject", () => {
    const raw = email(
      [
        "From: x@y.com",
        "Subject: GetYourGuide",
        "  potrditev GYG-123456", // nadaljevalna vrstica
        "Content-Type: text/plain",
      ],
      ["vsebina"]
    );
    const r = parseEmailSource(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message.subject).toBe("GetYourGuide potrditev GYG-123456");
  });

  test("⑫ LF-only vrstice (prilepljeno iz urejevalnika) → deluje", () => {
    const raw = [
      "From: x@y.com",
      "Subject: potrdilo GYG-321",
      "Content-Type: text/plain",
      "",
      "Št. rezervacije: GYG-321",
    ].join("\n");
    const r = parseEmailSource(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message.subject).toBe("potrdilo GYG-321");
    expect(r.message.textBody).toContain("GYG-321");
  });

  test("⑬ smeti brez glave → ok:false „ni-glave“", () => {
    const r = parseEmailSource("samo navadno besedilo brez glave in zadeve");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("ni-glave");
  });

  test("⑭ nadzorni znaki → fail-closed", () => {
    const raw = `From: x@y.com${String.fromCharCode(3)}\nSubject: s\n\nbody`;
    const r = parseEmailSource(raw);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("nadzorni-znaki");
  });

  test("⑮ prevelik vhod → „preveliko“", () => {
    const r = parseEmailSource("x".repeat(MAX_RAW_EMAIL_CHARS + 1));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("preveliko");
  });

  test("⑯ manjkajoč zaključni mejnik → strpano (nič ne manjka)", () => {
    const inner = "NOEND";
    const raw = email(
      ["From: x@y.com", "Subject: s", `Content-Type: multipart/mixed; boundary="${inner}"`],
      [
        `--${inner}`,
        "Content-Type: text/plain",
        "",
        "Rezervacija GYG-888 potrjena.",
        // NAMENOMA BREZ `--NOEND--`
      ]
    );
    const r = parseEmailSource(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message.textBody).toContain("GYG-888");
  });

  test("⑰ pretirano gnezdenje (6 nivojev) → tiha rezerva meje", () => {
    // 6 nivojev gnezdenja → meja MAX_MULTIPART_DEPTH=5 presežena → tiho.
    let body = "Content-Type: text/plain\n\nzelo globoko";
    for (let i = 0; i < 6; i++) {
      const b = `DEPTH${i}`;
      body = `Content-Type: multipart/mixed; boundary="${b}"\n\n--${b}\n${body}\n--${b}--`;
    }
    const raw = `From: x@y.com\nSubject: s\n${body}`;
    const r = parseEmailSource(raw);
    // NE vrže — globoki deli tiho odpadejo (dokumentirana meja):
    expect(r.ok).toBe(true);
  });

  test("adversarialni vhodi NIKOLI ne vržejo", () => {
    const nasties = [
      "",
      "\r\n\r\n",
      "Subject:",
      "Subject: \r\n\r\n telo",
      `Content-Type: multipart/mixed; boundary=""\r\n\r\n--\r\n--`,
      `Content-Type: multipart/mixed; boundary=X\r\n\r\n--X\r\n--X\r\n--X--`,
      "From: " + "a".repeat(10_000) + "\nSubject: s\n\n" + "b".repeat(300_000),
      `Content-Transfer-Encoding: base64\n\n!!!!not-base64!!!!`,
      `Content-Type: text/plain; charset=bogus-charset\n\nĐĐĐ`,
    ];
    for (const raw of nasties) {
      expect(() => parseEmailSource(raw)).not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 18–19: čistost + sestavljeno besedilo
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 31: čistost modula + emailTextForParsing", () => {
  test("⑱ ČISTOST: brez Date.now()/fetch/prisma (determinizem)", () => {
    // Pozor: klic s poklicaji () — komentar v glavi moduta upravičeno
    // NAVAJA »Date.now« kot prepoved, kar NI uporaba.
    expect(libSrc).not.toContain("Date.now(");
    expect(libSrc).not.toContain("fetch(");
    expect(libSrc).not.toContain("from \"@/lib/db\"");
    expect(libSrc).not.toContain("PrismaClient");
  });

  test("⑲ emailTextForParsing: Subject + telo / Subject-only / nič", () => {
    const r = parseEmailSource(
      email(
        ["From: x@y.com", "Subject: GYG-123 potrjeno", "Content-Type: text/plain"],
        ["Datum: 12.07.2026 10:00"]
      )
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const composed = emailTextForParsing(r.message);
    expect(composed).toContain("From: x@y.com");
    expect(composed).toContain("GYG-123 potrjeno");
    expect(composed).toContain("Datum: 12.07.2026 10:00");

    // Brez telesa → From + Subject-only:
    const r2 = parseEmailSource(
      email(["From: x@y.com", "Subject: GYG-777", "Content-Type: text/plain"], [])
    );
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(emailTextForParsing(r2.message)).toBe("From: x@y.com\n\nGYG-777");

    // Nič → null:
    expect(emailTextForParsing({
      subject: null,
      from: null,
      to: null,
      date: null,
      textBody: null,
      htmlBody: null,
      icsAttachment: null,
      pdfAttachmentBase64: null,
    })).toBeNull();
  });
});
