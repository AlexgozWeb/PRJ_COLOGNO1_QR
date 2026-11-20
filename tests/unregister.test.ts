import { describe, expect, it } from "vitest";
import { fakeRows, MockSheetStore } from "../lib/mock";
import { planUnregister, previewUnregister, register, unregister } from "../lib/service";
import type { SheetRow } from "../lib/types";

const base: Omit<SheetRow, "rowNumber" | "codiceSocio" | "nome" | "cognome" | "tipo" | "dataNascita"> = {
  adultoGiovane: "",
  luogoNascita: "Monza",
  email: "",
  presente: true,
  votante: false,
  id: "IDTEST01",
  ip: "203.0.113.5",
  timestamp: "2026-11-27 17:00:00",
};

const mario = { nome: "Mario", cognome: "Rossi", dataNascita: "12/03/1975", luogoNascita: "Milano" };
const sara = { nome: "Sara", cognome: "Rossi", dataNascita: "02/05/1978", luogoNascita: "Milano" };
const luca = { nome: "Luca", cognome: "Rossi", dataNascita: "01/06/2012", luogoNascita: "Monza" };

describe("cancellazione a cascata — Regola A (Adulto / Tutore)", () => {
  it("adulto singolo presente: spegne solo la propria riga senza impattare altri", async () => {
    const store = new MockSheetStore();
    const paolo = { nome: "Paolo", cognome: "Verdi", dataNascita: "30/11/1980", luogoNascita: "Monza" };
    const prev = await previewUnregister(store, paolo);
    expect(prev.status).toBe("ok");
    if (prev.status === "ok") {
      expect(prev.cascadeRemoved).toEqual([]);
      expect(prev.relatedKept).toEqual([]);
      expect(prev.rowNumbers).toEqual([6]);
    }
    const res = await unregister(store, paolo);
    expect(res).toEqual({ status: "ok", clearedRows: 1 });
    const paoloRow = (await store.getRows()).find((r) => r.nome === "Paolo");
    expect(paoloRow).toMatchObject({ presente: false, id: "", ip: "", timestamp: "" });
  });

  it("tutore unico con 2 minorenni: cancella sé e a cascata entrambi i ragazzi azzerando L/M/N/O", async () => {
    const store = new MockSheetStore();
    await register(store, mario, "203.0.113.7");
    const prev = await previewUnregister(store, mario);
    expect(prev.status).toBe("ok");
    if (prev.status === "ok") {
      expect(prev.cascadeRemoved.map((p) => p.nome).sort()).toEqual(["Anna", "Luca"]);
      expect(prev.relatedKept.map((p) => p.nome)).toEqual(["Sara"]);
      const raw = JSON.stringify(prev);
      expect(raw).not.toContain("203.0.113.7");
      expect(raw).not.toContain("mario.rossi@example.com");
    }
    const res = await unregister(store, mario);
    expect(res).toEqual({ status: "ok", clearedRows: 3 });
    const rows = await store.getRows();
    for (const nome of ["Mario", "Luca", "Anna"]) {
      const row = rows.find((r) => r.nome === nome);
      expect(row).toMatchObject({ presente: false, id: "", ip: "", timestamp: "" });
    }
  });

  it("tutore con altro tutore ancora presente: cancella solo sé; poi l'ultimo tutore cancella anche i ragazzi", async () => {
    const store = new MockSheetStore();
    await register(store, mario, "203.0.113.7");
    await register(store, sara, "203.0.113.8");

    const prevMario = await previewUnregister(store, mario);
    expect(prevMario.status).toBe("ok");
    if (prevMario.status === "ok") {
      expect(prevMario.cascadeRemoved).toEqual([]);
      expect(prevMario.relatedKept.map((p) => p.nome).sort()).toEqual(["Anna", "Luca", "Sara"]);
    }
    await unregister(store, mario);
    let rows = await store.getRows();
    expect(rows.find((r) => r.nome === "Mario")?.presente).toBe(false);
    expect(rows.find((r) => r.nome === "Luca")?.presente).toBe(true);
    expect(rows.find((r) => r.nome === "Anna")?.presente).toBe(true);
    expect(rows.find((r) => r.nome === "Sara")?.presente).toBe(true);

    const prevSara = await previewUnregister(store, sara);
    expect(prevSara.status).toBe("ok");
    if (prevSara.status === "ok") {
      expect(prevSara.cascadeRemoved.map((p) => p.nome).sort()).toEqual(["Anna", "Luca"]);
    }
    await unregister(store, sara);
    rows = await store.getRows();
    expect(rows.filter((r) => r.codiceSocio === "1" && r.presente)).toEqual([]);
  });

  it("persona su più righe (Socio Adulto + 2 codici Tutore): spegne tutte le sue righe e solo i minori rimasti senza tutore", async () => {
    const rows: SheetRow[] = [
      { ...base, rowNumber: 2, codiceSocio: "10", nome: "Pippo", cognome: "Sparrow", tipo: "Socio", adultoGiovane: "Adulto", dataNascita: "1971-01-01", luogoNascita: "Ancona" },
      { ...base, rowNumber: 3, codiceSocio: "11", nome: "Pippo", cognome: "Sparrow", tipo: "Tutore", dataNascita: "1971-01-01", luogoNascita: "Ancona" },
      { ...base, rowNumber: 4, codiceSocio: "12", nome: "Pippo", cognome: "Sparrow", tipo: "Tutore", dataNascita: "1971-01-01", luogoNascita: "Ancona" },
      { ...base, rowNumber: 5, codiceSocio: "11", nome: "Gianni", cognome: "Sparrow", tipo: "Socio", adultoGiovane: "Giovane", dataNascita: "2013-02-02", luogoNascita: "Ancona" },
      { ...base, rowNumber: 6, codiceSocio: "11", nome: "Elena", cognome: "Sparrow", tipo: "Tutore", dataNascita: "1974-03-03", luogoNascita: "Ancona" },
      { ...base, rowNumber: 7, codiceSocio: "12", nome: "Anita", cognome: "Sparrow", tipo: "Socio", adultoGiovane: "Giovane", dataNascita: "2015-04-04", luogoNascita: "Ancona" },
    ];
    const store = new MockSheetStore(rows);
    const pippo = { nome: "Pippo", cognome: "Sparrow", dataNascita: "01/01/1971", luogoNascita: "Ancona" };

    const prev = await previewUnregister(store, pippo);
    expect(prev.status).toBe("ok");
    if (prev.status === "ok") {
      expect(prev.target.tipo).toBe("Socio / Tutore");
      expect(prev.cascadeRemoved.map((p) => p.nome)).toEqual(["Anita"]);
      expect(prev.relatedKept.map((p) => p.nome).sort()).toEqual(["Elena", "Gianni"]);
      expect(prev.rowNumbers).toEqual([2, 3, 4, 7]);
    }
    await unregister(store, pippo);
    const after = await store.getRows();
    expect(after.filter((r) => r.presente).map((r) => r.nome).sort()).toEqual(["Elena", "Gianni"]);
    expect(after.filter((r) => r.nome === "Pippo").every((r) => !r.presente && !r.id && !r.ip && !r.timestamp)).toBe(true);
    expect(after.find((r) => r.nome === "Anita")?.presente).toBe(false);
  });

  it("figlio maggiorenne sullo stesso Codice Socio: cancellare il tutore non cancella il maggiorenne", () => {
    const rows: SheetRow[] = [
      { ...base, rowNumber: 2, codiceSocio: "20", nome: "Aldo", cognome: "Neri", tipo: "Tutore", dataNascita: "1970-01-01" },
      { ...base, rowNumber: 3, codiceSocio: "20", nome: "Matteo", cognome: "Neri", tipo: "Socio", adultoGiovane: "Adulto", dataNascita: "2000-05-10" },
    ];
    const plan = planUnregister(rows, { nome: "Aldo", cognome: "Neri", dataNascita: "01/01/1970", luogoNascita: "Monza" }, "2026-11-27");
    expect(plan.status).toBe("ok");
    if (plan.status === "ok") {
      expect(plan.cascadeRemoved).toEqual([]);
      expect(plan.relatedKept.map((p) => p.nome)).toEqual(["Matteo"]);
      expect(plan.rowNumbers).toEqual([2]);
    }
  });
});

describe("cancellazione a cascata — Opzione B2 (Minorenne)", () => {
  it("minorenne con unico tutore senza altro titolo: cancella sé e a cascata il tutore", async () => {
    const rows = fakeRows()
      .filter((r) => r.codiceSocio === "1" && r.nome !== "Anna" && r.nome !== "Sara")
      .map((r) => ({ ...r, presente: true, id: "ID1", ip: "198.51.100.1", timestamp: "2026-11-27 17:00:00" }));
    const store = new MockSheetStore(rows);
    const prev = await previewUnregister(store, luca);
    expect(prev.status).toBe("ok");
    if (prev.status === "ok") {
      expect(prev.cascadeRemoved.map((p) => p.nome)).toEqual(["Mario"]);
      expect(prev.relatedKept).toEqual([]);
    }
    await unregister(store, luca);
    expect((await store.getRows()).every((r) => !r.presente)).toBe(true);
  });

  it("minorenne con 2 tutori presenti senza altro titolo: cancella sé e entrambi i tutori", async () => {
    const rows = fakeRows()
      .filter((r) => r.codiceSocio === "1" && r.nome !== "Anna")
      .map((r) => ({ ...r, presente: true, id: "ID1", ip: "198.51.100.1", timestamp: "2026-11-27 17:00:00" }));
    const store = new MockSheetStore(rows);
    const prev = await previewUnregister(store, luca);
    expect(prev.status).toBe("ok");
    if (prev.status === "ok") {
      expect(prev.cascadeRemoved.map((p) => p.nome).sort()).toEqual(["Mario", "Sara"]);
    }
    await unregister(store, luca);
    expect((await store.getRows()).every((r) => !r.presente)).toBe(true);
  });

  it("minorenne con tutore che ha un altro figlio presente sullo stesso codice: spegne solo il minorenne", async () => {
    const store = new MockSheetStore();
    await register(store, mario, "203.0.113.7");
    const prev = await previewUnregister(store, luca);
    expect(prev.status).toBe("ok");
    if (prev.status === "ok") {
      expect(prev.cascadeRemoved).toEqual([]);
      expect(prev.relatedKept.map((p) => p.nome).sort()).toEqual(["Anna", "Mario", "Sara"]);
      expect(prev.rowNumbers).toEqual([3]);
    }
    await unregister(store, luca);
    const rows = await store.getRows();
    expect(rows.find((r) => r.nome === "Luca")?.presente).toBe(false);
    expect(rows.find((r) => r.nome === "Mario")?.presente).toBe(true);
    expect(rows.find((r) => r.nome === "Anna")?.presente).toBe(true);
  });

  it("minorenne con tutore che è anche Socio Adulto su altro codice: spegne solo la riga Tutore collegata lasciando il Socio Adulto", async () => {
    const rows: SheetRow[] = [
      { ...base, rowNumber: 2, codiceSocio: "10", nome: "Pippo", cognome: "Sparrow", tipo: "Socio", adultoGiovane: "Adulto", dataNascita: "1971-01-01", luogoNascita: "Ancona" },
      { ...base, rowNumber: 3, codiceSocio: "11", nome: "Pippo", cognome: "Sparrow", tipo: "Tutore", dataNascita: "1971-01-01", luogoNascita: "Ancona" },
      { ...base, rowNumber: 4, codiceSocio: "11", nome: "Gianni", cognome: "Sparrow", tipo: "Socio", adultoGiovane: "Giovane", dataNascita: "2013-02-02", luogoNascita: "Ancona" },
    ];
    const store = new MockSheetStore(rows);
    const gianni = { nome: "Gianni", cognome: "Sparrow", dataNascita: "02/02/2013", luogoNascita: "Ancona" };
    const prev = await previewUnregister(store, gianni);
    expect(prev.status).toBe("ok");
    if (prev.status === "ok") {
      expect(prev.cascadeRemoved).toEqual([
        {
          nome: "Pippo",
          cognome: "Sparrow",
          dataNascita: "01/01/1971",
          luogoNascita: "Ancona",
          tipo: "Socio / Tutore",
          presente: true,
          partialOnly: true,
        },
      ]);
      expect(prev.rowNumbers).toEqual([3, 4]);
    }
    await unregister(store, gianni);
    const after = await store.getRows();
    expect(after.find((r) => r.rowNumber === 2)?.presente).toBe(true);
    expect(after.find((r) => r.rowNumber === 3)?.presente).toBe(false);
    expect(after.find((r) => r.rowNumber === 4)?.presente).toBe(false);
  });
});

describe("blocco cancellazione a registrazioni chiuse", () => {
  it("previewUnregister e unregister restituiscono closed senza modificare i dati", async () => {
    const store = new MockSheetStore();
    const paolo = { nome: "Paolo", cognome: "Verdi", dataNascita: "30/11/1980", luogoNascita: "Monza" };
    await store.setRegistrationsClosed(true);
    expect(await previewUnregister(store, paolo)).toEqual({ status: "closed" });
    expect(await unregister(store, paolo)).toEqual({ status: "closed" });
    expect((await store.getRows()).find((r) => r.nome === "Paolo")?.presente).toBe(true);
  });
});
