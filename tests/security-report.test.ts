import { afterEach, describe, expect, it } from "vitest";
import { MockSheetStore } from "../lib/mock";
import { getReport } from "../lib/report";
import { accessGranted, adminGranted, parseInput } from "../lib/server";

const origAccess = process.env.ACCESS_CODE;
const origAdmin = process.env.ADMIN_CODE;
const origMock = process.env.MOCK_SHEET;

afterEach(() => {
  if (origAccess === undefined) delete process.env.ACCESS_CODE;
  else process.env.ACCESS_CODE = origAccess;
  if (origAdmin === undefined) delete process.env.ADMIN_CODE;
  else process.env.ADMIN_CODE = origAdmin;
  if (origMock === undefined) delete process.env.MOCK_SHEET;
  else process.env.MOCK_SHEET = origMock;
});

describe("report", () => {
  it("espone solo i campi ammessi ed esclude ID, IP ed email", async () => {
    const store = new MockSheetStore();
    await store.writeRegistration({ rowNumbers: [2], id: "SECRET99", ip: "203.0.113.9", timestamp: "2026-11-27 18:00:00" });
    const report = await getReport(store);
    expect(report.rows.length).toBeGreaterThan(0);
    for (const r of report.rows) {
      expect(Object.keys(r).sort()).toEqual(["codiceSocio", "cognome", "dataNascita", "luogoNascita", "nome", "presente", "tipo"]);
    }
    expect(report.rows.find((r) => r.nome === "Mario")?.luogoNascita).toBe("Milano");
    expect(report.rows.find((r) => r.nome === "Giulia")?.luogoNascita).toBe("Cologno Monzese");
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("ZZZZ1111");
    expect(serialized).not.toContain("SECRET99");
    expect(serialized).not.toContain("203.0.113.9");
    expect(serialized).not.toContain("mario.rossi@example.com");
    expect(serialized).not.toContain("giulia.bianchi@example.com");
    expect(report.registrationsClosed).toBe(false);

    await store.setRegistrationsClosed(true);
    expect((await getReport(store)).registrationsClosed).toBe(true);
  });
});

describe("server security e parseInput", () => {
  it("parseInput valida campi obbligatori, lunghezza e date", () => {
    expect(
      parseInput({ nome: " Mario ", cognome: " Rossi ", dataNascita: "12/03/1975", luogoNascita: " Milano " }),
    ).toEqual({ nome: "Mario", cognome: "Rossi", dataNascita: "12/03/1975", luogoNascita: "Milano" });

    expect(parseInput(null)).toBeNull();
    expect(parseInput({ nome: "", cognome: "Rossi", dataNascita: "12/03/1975", luogoNascita: "Milano" })).toBeNull();
    expect(parseInput({ nome: "a".repeat(101), cognome: "Rossi", dataNascita: "12/03/1975", luogoNascita: "Milano" })).toBeNull();
    expect(parseInput({ nome: "Mario", cognome: "Rossi", dataNascita: "31/02/2000", luogoNascita: "Milano" })).toBeNull();
  });

  it("accessGranted e adminGranted verificano i codici con confronti sicuri", () => {
    process.env.ACCESS_CODE = "scout-2026";
    process.env.ADMIN_CODE = "capo-2026";
    delete process.env.MOCK_SHEET;

    expect(accessGranted("scout-2026")).toBe(true);
    expect(accessGranted("  scout-2026  ")).toBe(true);
    expect(accessGranted("wrong")).toBe(false);
    expect(accessGranted(12345)).toBe(false);
    expect(accessGranted("x".repeat(201))).toBe(false);

    expect(adminGranted("capo-2026")).toBe(true);
    expect(adminGranted(" capo-2026 ")).toBe(true);
    expect(adminGranted("scout-2026")).toBe(false);
    expect(adminGranted(null)).toBe(false);
    expect(adminGranted("x".repeat(201))).toBe(false);
  });

  it("nega accesso senza variabili in produzione e usa admin1 solo con MOCK_SHEET=1", () => {
    delete process.env.ACCESS_CODE;
    delete process.env.ADMIN_CODE;
    delete process.env.MOCK_SHEET;

    expect(accessGranted("qualsiasi")).toBe(false);
    expect(adminGranted("admin1")).toBe(false);

    process.env.MOCK_SHEET = "1";
    expect(accessGranted("qualsiasi")).toBe(true);
    expect(adminGranted("admin1")).toBe(true);
    expect(adminGranted("altro")).toBe(false);
  });
});
