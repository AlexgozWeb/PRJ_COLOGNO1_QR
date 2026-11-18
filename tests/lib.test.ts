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
  it("tutore: mostra ragazzi e altri tutori, e registra tutto il gruppo con lo stesso ID", async () => {
    const store = new MockSheetStore();
    const r = await lookup(store, mario);
    expect(r.status).toBe("found");
    if (r.status === "found") {
      expect(r.kids.map((k) => k.nome).sort()).toEqual(["Anna", "Luca"]);
      expect(r.coTutors.map((k) => k.nome)).toEqual(["Sara"]);
    }
    const reg = await register(store, mario, "203.0.113.7");
    expect(reg.status).toBe("ok");
    expect(JSON.stringify(reg)).not.toContain("203.0.113.7");
    const rows = await store.getRows();
    expect(rows.filter((x) => x.presente).map((x) => x.nome).sort()).toEqual(["Anna", "Luca", "Mario", "Paolo", "Sara"]);
    const ids = new Set(rows.filter((x) => x.presente && x.nome !== "Paolo").map((x) => x.id));
    expect(ids.size).toBe(1);
    const sara = { nome: "Sara", cognome: "Rossi", dataNascita: "02/05/1978", luogoNascita: "Milano" };
    expect((await register(store, sara)).status).toBe("already");
  });
  it("segnala quali ragazzi sono già registrati", async () => {
    const store = new MockSheetStore();
    await store.writeRegistration({ rowNumbers: [3], id: "AAAA1111", ip: "", timestamp: "2026-11-27 10:00:00" });
    const r = await lookup(store, mario);
    if (r.status !== "found") throw new Error("atteso found");
    expect(r.kids.find((k) => k.nome === "Luca")?.registered).toBe(true);
    expect(r.kids.find((k) => k.nome === "Anna")?.registered).toBe(false);
    expect(r.coTutors[0].registered).toBe(false);
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
