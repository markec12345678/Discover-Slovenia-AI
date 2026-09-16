/// <reference types="bun-types" />
// FAIL-MODE (1.27.0): unit testi za startup-migration-status.
// Zagon: bun test src/lib/__tests__/startup-migration-status.test.ts
//
// Najpomembnejši del: redactStartupDetail() — Prisma/Neon napake pogosto
// vsebujejo povezovalne nize z GOSTITELJEM IN POVERILNICAMI. Če bi ti
// prišli na javni /api/health, bi bil to varnostni incident (razkritje
// poverilnic produkcijske baze). Testi dokazujejo, da so vsi znani
// formati nizov sanitizirani in da ostanejo nedolžna sporočila berljiva.

import { describe, test, expect } from "bun:test";
import {
  redactStartupDetail,
  recordStartupStep,
  getStartupMigrationReport,
} from "@/lib/startup-migration-status";

describe("redactStartupDetail — sanitizacija poverilnic", () => {
  test("postgres URL z gostiteljem in geslom je zamenjan", () => {
    const out = redactStartupDetail(
      'P1001: Can\'t reach database server at "ep-cool-name.us-east-2.aws.neon.tech:5432" postgres://app_user:S3cr3t-Pw@ep-cool-name.us-east-2.aws.neon.tech/neondb?sslmode=require'
    );
    expect(out).toBeDefined();
    expect(out).not.toContain("S3cr3t-Pw");
    expect(out).not.toContain("postgres://");
    expect(out).toContain("[redacted-db-url]");
  });

  test("postgresql:// varianta je prav tako zamenjana", () => {
    const out = redactStartupDetail("connect failed: postgresql://u:hunter2@db.example.com/prod");
    expect(out).not.toContain("hunter2");
    expect(out).toContain("[redacted-db-url]");
  });

  test("file: pot (sqlite demo) je zamenjana", () => {
    const out = redactStartupDetail("Error opening database: file:/tmp/dsa-demo.db");
    expect(out).not.toContain("/tmp/dsa-demo.db");
    expect(out).toContain("[redacted-file-path]");
  });

  test("generični URL z vgrajenimi poverilnicami je zamenjan (mysql/redis)", () => {
    const out = redactStartupDetail("upstream mysql://admin:pass123@db.internal:3306/x failed");
    expect(out).not.toContain("pass123");
    expect(out).toContain("[redacted-url-with-credentials]");
  });

  test("nedolžno sporočilo ostane berljivo", () => {
    const out = redactStartupDetail("stolpci že prisotni (sqlite)");
    expect(out).toBe("stolpci že prisotni (sqlite)");
  });

  test("dolžina je omejena (konec napake lahko vsebuje še en URL)", () => {
    const long = "x".repeat(500) + " postgres://u:leak@h/db";
    const out = redactStartupDetail(long);
    expect(out!.length).toBeLessThanOrEqual(300 + 20); // meja + oznaka odrezka
    expect(out).not.toContain("leak");
    expect(out).toContain("…[orezano]");
  });

  test("undefined/null vračata undefined", () => {
    expect(redactStartupDetail(undefined)).toBeUndefined();
    expect(redactStartupDetail(null)).toBeUndefined();
  });

  test("Error objekt se pretvori v razumno besedilo", () => {
    const out = redactStartupDetail(new Error("pragma failed: no such table"));
    expect(out).toContain("pragma failed");
  });
});

describe("recordStartupStep + getStartupMigrationReport", () => {
  test("zapis sanitizira detail in doda ISO čas", () => {
    const before = getStartupMigrationReport().length;
    recordStartupStep({
      name: "test:corrupted",
      status: "failed",
      detail: "postgres://u:topsecret@h/db unreachable",
    });
    const report = getStartupMigrationReport();
    expect(report.length).toBe(before + 1);
    const last = report[report.length - 1];
    expect(last.name).toBe("test:corrupted");
    expect(last.status).toBe("failed");
    expect(last.detail).not.toContain("topsecret");
    expect(last.detail).toContain("[redacted-db-url]");
    expect(!Number.isNaN(Date.parse(last.at))).toBe(true);
  });

  test("poročilo je defenzivna kopija (mutacija ne okuži stanja)", () => {
    const report = getStartupMigrationReport();
    const lenBefore = report.length;
    if (report.length > 0) {
      report[0].name = "hacked";
      report.push({ name: "injected", status: "ok", at: "1970-01-01T00:00:00Z" });
      const fresh = getStartupMigrationReport();
      expect(fresh.length).toBe(lenBefore);
      expect(fresh[0].name).not.toBe("hacked");
      expect(fresh.every((r) => r.name !== "injected")).toBe(true);
    }
  });
});
