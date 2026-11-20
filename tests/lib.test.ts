import { describe, expect, it } from "vitest";
import { colLetter, isTruthyFlag, locateConfigParam } from "../lib/googleSheet";
import { isoToItalian, normalizeText, toIsoDate } from "../lib/normalize";
import { generateId, romeTimestamp } from "../lib/id";
import { fakeRows, MockSheetStore } from "../lib/mock";
import { isMinor, lookup, register } from "../lib/service";

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
  it("tutore: mostra ragazzi e altri tutori (informativo), e registra solo sé stesso e i ragazzi seguiti", async () => {
    const store = new MockSheetStore();
    const r = await lookup(store, mario);
    expect(r.status).toBe("found");
    if (r.status === "found") {
      expect(r.kids.map((k) => k.nome).sort()).toEqual(["Anna", "Luca"]);
      expect(r.adultKids).toEqual([]);
      expect(r.coTutors.map((k) => k.nome)).toEqual(["Sara"]);
    }
    const reg = await register(store, mario, "203.0.113.7");
    expect(reg.status).toBe("ok");
    if (reg.status === "ok") {
      expect(reg.kids.map((k) => k.nome).sort()).toEqual(["Anna", "Luca"]);
    }
    expect(JSON.stringify(reg)).not.toContain("203.0.113.7");
    const rows = await store.getRows();
    expect(rows.filter((x) => x.presente).map((x) => x.nome).sort()).toEqual(["Anna", "Luca", "Mario", "Paolo"]);
    const marioGroupIds = new Set(rows.filter((x) => x.presente && x.nome !== "Paolo").map((x) => x.id));
    expect(marioGroupIds.size).toBe(1);
    const marioId = [...marioGroupIds][0];

    // Sara non viene registrata da Mario e può registrarsi autonomamente senza sovrascrivere i ragazzi
    const saraRowBefore = rows.find((x) => x.nome === "Sara");
    expect(saraRowBefore?.presente).toBe(false);
    expect(saraRowBefore?.id).toBe("");

    const sara = { nome: "Sara", cognome: "Rossi", dataNascita: "02/05/1978", luogoNascita: "Milano" };
    const saraLookup = await lookup(store, sara);
    expect(saraLookup.status).toBe("found");
    if (saraLookup.status === "found") {
      expect(saraLookup.kids.every((k) => k.registered)).toBe(true);
      expect(saraLookup.coTutors).toEqual([{ nome: "Mario", cognome: "Rossi", dataNascita: "12/03/1975", registered: true }]);
    }

    const saraReg = await register(store, sara, "203.0.113.11");
    expect(saraReg.status).toBe("ok");
    if (saraReg.status === "ok") {
      expect(saraReg.kids).toEqual([]);
      expect(saraReg.id).not.toBe(marioId);
    }
    const rowsAfterSara = await store.getRows();
    expect(rowsAfterSara.find((x) => x.nome === "Luca")?.id).toBe(marioId);
    expect(rowsAfterSara.find((x) => x.nome === "Anna")?.id).toBe(marioId);
    expect(rowsAfterSara.find((x) => x.nome === "Sara")?.presente).toBe(true);
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
  it("chiusura e riapertura registrazioni bloccano e sbloccano lookup e register", async () => {
    const store = new MockSheetStore();
    await store.setRegistrationsClosed(true);
    expect(await lookup(store, mario)).toEqual({ status: "closed" });
    expect(await register(store, mario, "203.0.113.8")).toEqual({ status: "closed" });
    const rowsClosed = await store.getRows();
    expect(rowsClosed.filter((r) => r.presente).map((r) => r.nome)).toEqual(["Paolo"]);

    await store.setRegistrationsClosed(false);
    expect((await lookup(store, mario)).status).toBe("found");
    expect((await register(store, mario)).status).toBe("ok");
  });
  it("minorenne non registrato con tutori: blocca registrazione e mostra tutori con stato", async () => {
    const store = new MockSheetStore();
    const luca = { nome: "Luca", cognome: "Rossi", dataNascita: "01/06/2012", luogoNascita: "Monza" };
    const lk = await lookup(store, luca);
    expect(lk.status).toBe("minor");
    if (lk.status === "minor") {
      expect(lk.tutors.map((t) => `${t.nome}:${t.registered}`)).toEqual(["Mario:false", "Sara:false"]);
      expect(JSON.stringify(lk.tutors)).not.toContain("@");
    }
    const regMinor = await register(store, luca, "203.0.113.10");
    expect(regMinor.status).toBe("minor");
    expect((await store.getRows()).find((r) => r.nome === "Luca")?.presente).toBe(false);

    // simulando selezione rapida del tutore Mario -> lookup + register
    expect((await lookup(store, mario)).status).toBe("found");
    expect((await register(store, mario, "203.0.113.10")).status).toBe("ok");
    const rows = await store.getRows();
    const regGroup = rows.filter((r) => r.codiceSocio === "1" && r.presente);
    expect(regGroup.map((r) => r.nome).sort()).toEqual(["Anna", "Luca", "Mario"]);
    expect(new Set(regGroup.map((r) => r.id)).size).toBe(1);
    const saraRow = rows.find((r) => r.nome === "Sara");
    expect(saraRow?.presente).toBe(false);
    expect(saraRow?.id).toBe("");
  });
  it("minorenne già registrato: mostra already con timestamp (mai minor)", async () => {
    const store = new MockSheetStore();
    await store.writeRegistration({ rowNumbers: [3], id: "BBBB2222", ip: "", timestamp: "2026-11-27 11:00:00" });
    const luca = { nome: "Luca", cognome: "Rossi", dataNascita: "01/06/2012", luogoNascita: "Monza" };
    expect(await lookup(store, luca)).toMatchObject({ status: "already", timestamp: "2026-11-27 11:00:00" });
    const reg = await register(store, luca);
    expect(reg).toMatchObject({ status: "already", timestamp: "2026-11-27 11:00:00" });
    expect(JSON.stringify(reg)).not.toContain("BBBB2222");
  });
  it("minorenne con un tutore già registrato e uno no", async () => {
    const store = new MockSheetStore();
    await store.writeRegistration({ rowNumbers: [2], id: "CCCC3333", ip: "", timestamp: "2026-11-27 12:00:00" });
    const luca = { nome: "Luca", cognome: "Rossi", dataNascita: "01/06/2012", luogoNascita: "Monza" };
    const lk = await lookup(store, luca);
    expect(lk.status).toBe("minor");
    if (lk.status === "minor") {
      expect(lk.tutors.map((t) => `${t.nome}:${t.registered}`)).toEqual(["Mario:true", "Sara:false"]);
    }
  });
  it("minorenne senza tutori: tutors vuoto", async () => {
    const rows = [
      ...fakeRows(),
      {
        rowNumber: 8,
        codiceSocio: "99",
        cognome: "Neri",
        nome: "Marco",
        tipo: "Socio",
        adultoGiovane: "Giovane",
        dataNascita: "2013-04-10",
        luogoNascita: "Monza",
        email: "",
        presente: false,
        votante: false,
        id: "",
        timestamp: "",
      },
    ];
    const store = new MockSheetStore(rows);
    const marco = { nome: "Marco", cognome: "Neri", dataNascita: "10/04/2013", luogoNascita: "Monza" };
    const lk = await lookup(store, marco);
    expect(lk.status).toBe("minor");
    if (lk.status === "minor") expect(lk.tutors).toEqual([]);
  });
  it("tutore con figlio maggiorenne e minorenne: mostra e registra solo il minorenne", async () => {
    const baseRow = { luogoNascita: "Monza", email: "", presente: false, votante: false, id: "", timestamp: "" };
    const rows = [
      { ...baseRow, rowNumber: 2, codiceSocio: "50", cognome: "Galli", nome: "Elena", tipo: "Tutore", adultoGiovane: "", dataNascita: "1974-01-10" },
      { ...baseRow, rowNumber: 3, codiceSocio: "50", cognome: "Galli", nome: "Diego", tipo: "Socio", adultoGiovane: "Giovane", dataNascita: "2013-05-10" },
      { ...baseRow, rowNumber: 4, codiceSocio: "51", cognome: "Galli", nome: "Elena", tipo: "Tutore", adultoGiovane: "", dataNascita: "1974-01-10" },
      { ...baseRow, rowNumber: 5, codiceSocio: "51", cognome: "Galli", nome: "Matteo", tipo: "Socio", adultoGiovane: "Giovane", dataNascita: "2007-04-10" },
    ];
    const store = new MockSheetStore(rows);
    const elena = { nome: "Elena", cognome: "Galli", dataNascita: "10/01/1974", luogoNascita: "Monza" };
    const lk = await lookup(store, elena);
    expect(lk.status).toBe("found");
    if (lk.status === "found") {
      expect(lk.kids.map((k) => k.nome)).toEqual(["Diego"]);
      expect(lk.adultKids).toEqual([
        { nome: "Matteo", cognome: "Galli", dataNascita: "10/04/2007", registered: false },
      ]);
    }
    const reg = await register(store, elena, "203.0.113.20");
    expect(reg.status).toBe("ok");
    if (reg.status === "ok") {
      expect(reg.kids.map((k) => k.nome)).toEqual(["Diego"]);
    }
    const after = await store.getRows();
    expect(after.find((r) => r.nome === "Diego")?.presente).toBe(true);
    const matteoRow = after.find((r) => r.nome === "Matteo");
    expect(matteoRow?.presente).toBe(false);
    expect(matteoRow?.id).toBe("");

    const matteo = { nome: "Matteo", cognome: "Galli", dataNascita: "10/04/2007", luogoNascita: "Monza" };
    const regMatteo = await register(store, matteo, "203.0.113.21");
    expect(regMatteo.status).toBe("ok");
    if (regMatteo.status === "ok" && reg.status === "ok") {
      expect(regMatteo.id).not.toBe(reg.id);
    }
  });
});

describe("isMinor", () => {
  it("calcola correttamente la minore età e gli anni bisestili", () => {
    expect(isMinor("2008-11-28", "2026-11-27")).toBe(true);
    expect(isMinor("2008-11-27", "2026-11-27")).toBe(false);
    expect(isMinor("2008-02-29", "2026-02-28")).toBe(true);
    expect(isMinor("2008-02-29", "2026-03-01")).toBe(false);
    expect(isMinor("2012-06-01", "2026-11-27")).toBe(true);
    expect(isMinor("1990-01-15", "2026-11-27")).toBe(false);
  });
});

describe("config sheet helpers", () => {
  it("locateConfigParam trova parameter e value from ignorando value to", () => {
    const values = [
      ["parameter", "value from", "value to"],
      ["REGISTRATIONS_CLOSED", 1, ""],
    ];
    const loc = locateConfigParam(values, "REGISTRATIONS_CLOSED");
    expect(loc).toEqual({ paramIdx: 0, valueFromIdx: 1, rowNumber: 2, value: 1 });
    expect(isTruthyFlag(loc.value)).toBe(true);
  });

  it("locateConfigParam gestisce foglio vuoto o parametro assente", () => {
    expect(locateConfigParam([], "REGISTRATIONS_CLOSED")).toEqual({
      paramIdx: 0,
      valueFromIdx: 1,
      rowNumber: null,
      value: undefined,
    });
    expect(
      locateConfigParam([["parameter", "value from", "value to"], ["OTHER_PARAM", "abc"]], "REGISTRATIONS_CLOSED"),
    ).toEqual({ paramIdx: 0, valueFromIdx: 1, rowNumber: null, value: undefined });
  });

  it("isTruthyFlag riconosce valori veri e falsi attesi", () => {
    for (const v of [1, "1", true, "TRUE", "SI", "sì"]) expect(isTruthyFlag(v)).toBe(true);
    for (const v of [0, "0", false, "", undefined, null, "NO"]) expect(isTruthyFlag(v)).toBe(false);
  });

  it("colLetter converte indici 0-based in lettere colonna", () => {
    expect(colLetter(0)).toBe("A");
    expect(colLetter(1)).toBe("B");
    expect(colLetter(15)).toBe("P");
    expect(colLetter(26)).toBe("AA");
  });
});
