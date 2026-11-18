import { describe, expect, it } from "vitest";
import { isoToItalian, normalizeText, toIsoDate } from "../lib/normalize";
import { generateId, romeTimestamp } from "../lib/id";
import { MockSheetStore } from "../lib/mock";
import { lookup, register } from "../lib/service";

const mario = { nome: " mario ", cognome: "ROSSI", dataNascita: "12/03/1975", luogoNascita: "milano" };

describe("normalize", () => {
  it("ignora accenti, apostrofi e maiuscole", () => {
    expect(normalizeText("  d'Ángelo-Rossi ")).toBe("D ANGELO ROSSI");
  });
  it("parsa date valide e rifiuta impossibili", () => {
    expect(toIsoDate("12/03/1975")).toBe("1975-03-12");
    expect(toIsoDate("1975-03-12")).toBe("1975-03-12");
    expect(toIsoDate("31/02/2000")).toBeNull();
    expect(toIsoDate(27465)).toBe("1975-03-12");
    expect(isoToItalian("1975-03-12")).toBe("12/03/1975");
  });
});

describe("id e timestamp", () => {
  it("ID di 8 caratteri A-Z0-9 e univoco", () => {
    const id = generateId(new Set(["AAAAAAAA"]));
    expect(id).toMatch(/^[A-Z0-9]{8}$/);
  });
  it("timestamp formato atteso", () => {
    expect(romeTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe("service", () => {
  it("non trovato", async () => {
    expect((await lookup(new MockSheetStore(), { ...mario, nome: "Zzz" })).status).toBe("not_found");
  });
  it("tutore: mostra i ragazzi e registra solo sé stesso", async () => {
    const store = new MockSheetStore();
    const r = await lookup(store, mario);
    expect(r.status).toBe("found");
    if (r.status === "found") expect(r.kids.map((k) => k.nome).sort()).toEqual(["Anna", "Luca"]);
    const reg = await register(store, mario, "203.0.113.7");
    expect(reg.status).toBe("ok");
    expect(JSON.stringify(reg)).not.toContain("203.0.113.7");
    const rows = await store.getRows();
    expect(rows.filter((x) => x.presente).map((x) => x.nome).sort()).toEqual(["Mario", "Paolo"]);
    expect((rows.find((x) => x.nome === "Mario") as any).ip).toBe("203.0.113.7");
  });
  it("già registrato: nessuna nuova scrittura, solo timestamp", async () => {
    const store = new MockSheetStore();
    const p = { nome: "Paolo", cognome: "Verdi", dataNascita: "30/11/1980", luogoNascita: "Monza" };
    const r = await register(store, p);
    expect(r).toMatchObject({ status: "already", timestamp: "2026-11-27 15:02:10" });
    expect(JSON.stringify(r)).not.toContain("ZZZZ1111");
  });
  it("seconda registrazione non genera nuovo ID", async () => {
    const store = new MockSheetStore();
    await register(store, mario);
    expect((await register(store, mario)).status).toBe("already");
  });
});
