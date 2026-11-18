import { describe, expect, it } from "vitest";
import { fakeRows } from "../lib/mock";
import { computeStats } from "../lib/stats";
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
});
