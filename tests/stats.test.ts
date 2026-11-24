import { describe, expect, it } from "vitest";
import { validateAssemblyInfo } from "../lib/config";
import { extractAppConfig, parseConfigDate } from "../lib/googleSheet";
import { fakeRows, MockSheetStore } from "../lib/mock";
import { computeStats, getStats } from "../lib/stats";
import { DEFAULT_ASSEMBLY_DATE, DEFAULT_ASSEMBLY_NAME } from "../lib/types";
import { quorumColor } from "../components/StatsPage";

describe("statistiche", () => {
  it("conta persone uniche e votanti", () => {
    const rows = fakeRows().map((r) => ({ ...r, votante: r.nome === "Mario" || r.nome === "Giulia" || r.nome === "Paolo" }));
    const s = computeStats(rows);
    expect(s.soci).toBe(4);
    expect(s.sociVotanti).toBe(2);
    expect(s.votantiTotali).toBe(3);
    expect(s.registrati).toBe(1);
    expect(s.votantiRegistrati).toBe(1);
  });
  it("colori del quorum", () => {
    expect(quorumColor(15, 100)).toBe("#dc2626");
    expect(quorumColor(30, 100)).toBe("#eab308");
    expect(quorumColor(40, 100)).toBe("#fde68a");
    expect(quorumColor(50, 100)).toBe("#fde68a");
    expect(quorumColor(51, 100)).toBe("#16a34a");
  });
  it("getStats include lo stato registrationsClosed e i dati assemblea configurabili", async () => {
    const store = new MockSheetStore();
    const initial = await getStats(store);
    expect(initial.registrationsClosed).toBe(false);
    expect(initial.assemblyName).toBe(DEFAULT_ASSEMBLY_NAME);
    expect(initial.assemblyDate).toBe(DEFAULT_ASSEMBLY_DATE);

    await store.setRegistrationsClosed(true);
    await store.setAssemblyInfo({ assemblyName: "Assemblea Ordinaria Soci", assemblyDate: "15/01/2027" });
    const updated = await getStats(store);
    expect(updated.registrationsClosed).toBe(true);
    expect(updated.assemblyName).toBe("Assemblea Ordinaria Soci");
    expect(updated.assemblyDate).toBe("15/01/2027");
  });

  it("validateAssemblyInfo accetta date future, fa trim e rifiuta input non validi", () => {
    expect(
      validateAssemblyInfo({ assemblyName: "  Assemblea Straordinaria  ", assemblyDate: "28/02/2028" }),
    ).toEqual({
      ok: true,
      data: { assemblyName: "Assemblea Straordinaria", assemblyDate: "28/02/2028" },
    });

    const badEmpty = validateAssemblyInfo({ assemblyName: "   ", assemblyDate: "" });
    expect(badEmpty.ok).toBe(false);
    if (!badEmpty.ok) expect(Object.keys(badEmpty.errors).sort()).toEqual(["assemblyDate", "assemblyName"]);

    const badDate = validateAssemblyInfo({ assemblyName: "Assemblea", assemblyDate: "31/02/2027" });
    expect(badDate.ok).toBe(false);

    const badLong = validateAssemblyInfo({ assemblyName: "A".repeat(121), assemblyDate: "27/11/2026" });
    expect(badLong.ok).toBe(false);
  });

  it("extractAppConfig e parseConfigDate leggono stringhe e seriali da Config mantenendo i default", () => {
    expect(extractAppConfig([])).toEqual({
      registrationsClosed: false,
      assemblyName: DEFAULT_ASSEMBLY_NAME,
      assemblyDate: DEFAULT_ASSEMBLY_DATE,
    });

    // 46353 = seriale Excel/Google Sheets per 2026-11-27
    expect(parseConfigDate(46353)).toBe("27/11/2026");
    expect(parseConfigDate("2027-03-14")).toBe("14/03/2027");

    const cfg = extractAppConfig([
      ["parameter", "value from", "value to"],
      ["REGISTRATIONS_CLOSED", 1, "note"],
      ["ASSEMBLY_NAME", "Assemblea Scout Autunnale", ""],
      ["ASSEMBLY_DATE", 46353, ""],
    ]);
    expect(cfg).toEqual({
      registrationsClosed: true,
      assemblyName: "Assemblea Scout Autunnale",
      assemblyDate: "27/11/2026",
    });
  });
});
