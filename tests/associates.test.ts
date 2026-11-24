import { describe, expect, it } from "vitest";
import { extractExistingAdults } from "../components/AssociatesPage";
import {
  createSocio,
  createTutor,
  deleteAssociate,
  getAssociateDetail,
  listAssociates,
  parseRowRef,
  updateAssociate,
} from "../lib/associates";
import { toSheetSocioCode } from "../lib/googleSheet";
import { fakeRows, MockSheetStore } from "../lib/mock";
import { getStats } from "../lib/stats";

describe("gestione associati", () => {
  it("listAssociates espone solo i campi ammessi ed esclude CF, cellulare, email, delibera, ID e IP", async () => {
    const store = new MockSheetStore();
    await store.writeRegistration({ rowNumbers: [2], id: "SECRET99", ip: "203.0.113.9", timestamp: "2026-11-27 18:00:00" });

    const res = await listAssociates(store);
    expect(res.rows.length).toBe(6);
    for (const r of res.rows) {
      expect(Object.keys(r).sort()).toEqual([
        "adultoGiovane",
        "codiceSocio",
        "cognome",
        "dataNascita",
        "fingerprint",
        "luogoNascita",
        "nome",
        "rowNumber",
        "tipo",
        "votante",
      ]);
    }
    const raw = JSON.stringify(res);
    expect(raw).not.toContain("RSSMRA75C12F205X");
    expect(raw).not.toContain("3331110001");
    expect(raw).not.toContain("mario.rossi@example.com");
    expect(raw).not.toContain("2023-10-01");
    expect(raw).not.toContain("ZZZZ1111");
    expect(raw).not.toContain("SECRET99");
    expect(raw).not.toContain("203.0.113.9");
  });

  it("getAssociateDetail restituisce dettaglio completo senza ID/IP e calcola tutor/ragazzi collegati", async () => {
    const store = new MockSheetStore();
    const list = await listAssociates(store);

    const marioRow = list.rows.find((r) => r.nome === "Mario")!;
    const marioDet = await getAssociateDetail(store, marioRow.rowNumber, marioRow.fingerprint);
    expect(marioDet.status).toBe("ok");
    if (marioDet.status === "ok") {
      expect(marioDet.detail).toMatchObject({
        codiceSocio: "1",
        nome: "Mario",
        cognome: "Rossi",
        tipo: "Tutore",
        codiceFiscale: "RSSMRA75C12F205X",
        cellulare: "3331110001",
        email: "mario.rossi@example.com",
        dataDeliberaAmmissione: "01/10/2023",
        votante: true,
      });
      expect(marioDet.detail.linkedKids.map((k) => k.nome).sort()).toEqual(["Anna", "Luca"]);
      expect(marioDet.detail.linkedTutors).toEqual([]);
      expect(JSON.stringify(marioDet.detail)).not.toContain("203.0.113");
    }

    const lucaRow = list.rows.find((r) => r.nome === "Luca")!;
    const lucaDet = await getAssociateDetail(store, lucaRow.rowNumber, lucaRow.fingerprint);
    expect(lucaDet.status).toBe("ok");
    if (lucaDet.status === "ok") {
      expect(lucaDet.detail.linkedTutors.map((t) => t.nome).sort()).toEqual(["Mario", "Sara"]);
      expect(lucaDet.detail.linkedKids).toEqual([]);
    }

    expect(await getAssociateDetail(store, 999, marioRow.fingerprint)).toEqual({ status: "not_found" });
    expect(await getAssociateDetail(store, marioRow.rowNumber, "stale-fp")).toEqual({ status: "conflict" });
  });

  it("updateAssociate converte nome/cognome in maiuscolo, preserva Tipo e L/M/N/O e aggiorna Votante anche a registrazioni chiuse", async () => {
    const store = new MockSheetStore();
    await store.setRegistrationsClosed(true);

    const list = await listAssociates(store);
    const paoloRow = list.rows.find((r) => r.nome === "Paolo")!;
    const statsBefore = await getStats(store);

    const res = await updateAssociate(store, paoloRow.rowNumber, paoloRow.fingerprint, {
      codiceSocio: "000123",
      cognome: "  Verdi-Bianchi ",
      nome: "  Paolo   Marco ",
      tipo: "Tutore", // deve essere ignorato lato server
      adultoGiovane: "Adulto",
      codiceFiscale: " vrdplm80s30f704j ",
      dataNascita: "30/11/1980",
      luogoNascita: "Cologno Monzese",
      cellulare: "3339998877",
      email: "paolo.verdi@example.com",
      dataDeliberaAmmissione: "15/11/2024",
      votante: false,
    });

    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.detail.nome).toBe("PAOLO MARCO");
      expect(res.detail.cognome).toBe("VERDI-BIANCHI");
      expect(res.detail.tipo).toBe("Socio"); // invariato
      expect(res.detail.codiceSocio).toBe("123");
      expect(res.detail.codiceFiscale).toBe("VRDPLM80S30F704J");
      expect(res.detail.votante).toBe(false);
      expect(res.detail.dataDeliberaAmmissione).toBe("15/11/2024");
    }

    // Verifica integrità colonne presenza e statistiche votanti
    const paoloStored = (await store.getRows()).find((r) => r.rowNumber === paoloRow.rowNumber)!;
    expect(paoloStored).toMatchObject({
      tipo: "Socio",
      presente: true,
      id: "ZZZZ1111",
      timestamp: "2026-11-27 15:02:10",
      votante: false,
    });
    const statsAfter = await getStats(store);
    expect(statsAfter.votantiTotali).toBe(statsBefore.votantiTotali - 1);
    expect(statsAfter.votantiRegistrati).toBe(statsBefore.votantiRegistrati - 1);
  });

  it("updateAssociate rifiuta dati non validi e gestisce conflitti", async () => {
    const store = new MockSheetStore();
    const list = await listAssociates(store);
    const giuliaRow = list.rows.find((r) => r.nome === "Giulia")!;

    const bad = await updateAssociate(store, giuliaRow.rowNumber, giuliaRow.fingerprint, {
      codiceSocio: "ABC12",
      cognome: "Bianchi2",
      nome: "",
      adultoGiovane: "",
      codiceFiscale: "CF",
      dataNascita: "31/02/2000",
      luogoNascita: "A".repeat(51),
      cellulare: "333",
      email: "non-valida",
      dataDeliberaAmmissione: "2024-01-01",
      votante: true,
    });
    expect(bad.status).toBe("invalid");
    if (bad.status === "invalid") {
      expect(Object.keys(bad.errors).sort()).toEqual([
        "adultoGiovane",
        "codiceSocio",
        "cognome",
        "dataDeliberaAmmissione",
        "dataNascita",
        "email",
        "luogoNascita",
        "nome",
      ]);
    }

    // Su Tutore Codice Socio e Adulto-Giovane non sono modificabili (anche se inviati dal client restano preservati)
    const marioRow = list.rows.find((r) => r.nome === "Mario")!;
    const okTutor = await updateAssociate(store, marioRow.rowNumber, marioRow.fingerprint, {
      codiceSocio: "999",
      cognome: "Rossi",
      nome: "Mario",
      adultoGiovane: "Adulto",
      codiceFiscale: "",
      dataNascita: "12/03/1975",
      luogoNascita: "Milano",
      cellulare: "",
      email: "",
      dataDeliberaAmmissione: "",
      votante: true,
    });
    expect(okTutor.status).toBe("ok");
    if (okTutor.status === "ok") {
      expect(okTutor.detail.codiceSocio).toBe("1");
      expect(okTutor.detail.adultoGiovane).toBe("");
    }

    // Su Socio Adulto-Giovane è invece modificabile tra Adulto e Giovane
    const updatedGiulia = await updateAssociate(store, giuliaRow.rowNumber, giuliaRow.fingerprint, {
      codiceSocio: "2",
      cognome: "Bianchi",
      nome: "Giulia",
      adultoGiovane: "Giovane",
      codiceFiscale: "BNCGLI90A55C855K",
      dataNascita: "15/01/1990",
      luogoNascita: "Cologno Monzese",
      cellulare: "3331110005",
      email: "giulia.bianchi@example.com",
      dataDeliberaAmmissione: "01/10/2023",
      votante: true,
    });
    expect(updatedGiulia.status).toBe("ok");
    if (updatedGiulia.status === "ok") expect(updatedGiulia.detail.adultoGiovane).toBe("Giovane");

    // Vecchio fingerprint non più valido dopo la modifica
    const conflict = await updateAssociate(store, marioRow.rowNumber, marioRow.fingerprint, {
      codiceSocio: "1",
      cognome: "ROSSI",
      nome: "MARIO",
      adultoGiovane: "",
      codiceFiscale: "",
      dataNascita: "12/03/1975",
      luogoNascita: "Milano",
      cellulare: "",
      email: "",
      dataDeliberaAmmissione: "",
      votante: false,
    });
    expect(conflict).toEqual({ status: "conflict" });
  });

  it("deleteAssociate elimina la riga anche se presente o a registrazioni chiuse e rileva spostamenti riga", async () => {
    const store = new MockSheetStore();
    await store.setRegistrationsClosed(true);

    const before = await listAssociates(store);
    const paoloRow = before.rows.find((r) => r.nome === "Paolo")!; // rowNumber 6, presente=true
    const saraRow = before.rows.find((r) => r.nome === "Sara")!; // rowNumber 7

    expect(await deleteAssociate(store, paoloRow.rowNumber, "wrong-fp")).toEqual({ status: "conflict" });
    expect(await deleteAssociate(store, paoloRow.rowNumber, paoloRow.fingerprint)).toEqual({ status: "ok" });

    const after = await store.getRows();
    expect(after.some((r) => r.nome === "Paolo")).toBe(false);
    const saraAfter = after.find((r) => r.nome === "Sara")!;
    expect(saraAfter.rowNumber).toBe(saraRow.rowNumber - 1);

    // Richiesta con il vecchio rowNumber/fingerprint di Sara ora va in conflitto o not_found
    expect(await deleteAssociate(store, saraRow.rowNumber, saraRow.fingerprint)).toEqual({ status: "not_found" });
  });

  it("parseRowRef valida rowNumber e fingerprint", () => {
    expect(parseRowRef({ rowNumber: 2, fingerprint: "abc123" })).toEqual({ rowNumber: 2, fingerprint: "abc123" });
    expect(parseRowRef({ rowNumber: 1, fingerprint: "abc" })).toBeNull();
    expect(parseRowRef({ rowNumber: 2.5, fingerprint: "abc" })).toBeNull();
    expect(parseRowRef({ rowNumber: 2, fingerprint: "" })).toBeNull();
    expect(parseRowRef(null)).toBeNull();
  });

  it("createSocio inserisce un nuovo Socio con testi in maiuscolo, L=false e blocca duplicati anche a registrazioni chiuse", async () => {
    const store = new MockSheetStore();
    await store.setRegistrationsClosed(true);

    const res = await createSocio(store, {
      codiceSocio: "9001",
      cognome: "  neri ",
      nome: " marco ",
      adultoGiovane: "Adulto",
      codiceFiscale: " nremrc85a01f205q ",
      dataNascita: "01/01/1985",
      luogoNascita: "Cologno Monzese",
      cellulare: "333-445566",
      email: "marco.neri@example.com",
      dataDeliberaAmmissione: "10/10/2024",
      votante: true,
    });
    expect(res).toEqual({ status: "ok", createdCount: 1 });

    const rows = await store.getRows();
    const added = rows.find((r) => r.codiceSocio === "9001")!;
    expect(added).toMatchObject({
      codiceSocio: "9001",
      cognome: "NERI",
      nome: "MARCO",
      tipo: "Socio",
      adultoGiovane: "Adulto",
      codiceFiscale: "NREMRC85A01F205Q",
      dataNascita: "1985-01-01",
      luogoNascita: "COLOGNO MONZESE",
      cellulare: "333-445566",
      email: "MARCO.NERI@EXAMPLE.COM",
      dataDeliberaAmmissione: "2024-10-10",
      presente: false,
      votante: true,
      id: "",
      timestamp: "",
    });

    // Duplicato su stesso Codice Socio bloccato
    const dup = await createSocio(store, {
      codiceSocio: "9001",
      cognome: "ALTRO",
      nome: "NOME",
      adultoGiovane: "Giovane",
      codiceFiscale: "",
      dataNascita: "01/01/2014",
      luogoNascita: "MILANO",
      cellulare: "",
      email: "",
      dataDeliberaAmmissione: "",
      votante: false,
    });
    expect(dup.status).toBe("duplicate");

    // Campi non validi rifiutati
    const bad = await createSocio(store, {
      codiceSocio: "ABC",
      cognome: "Neri2",
      nome: "",
      adultoGiovane: "",
      codiceFiscale: "",
      dataNascita: "31/02/2010",
      luogoNascita: "X".repeat(51),
      cellulare: "",
      email: "errata",
      dataDeliberaAmmissione: "2024-01-01",
      votante: false,
    });
    expect(bad.status).toBe("invalid");
  });

  it("createTutor inserisce righe Tutore per uno o più Soci Giovani, forza Votante=No e Adulto-Giovane vuoto", async () => {
    const store = new MockSheetStore([
      ...fakeRows(),
      {
        rowNumber: 8,
        codiceSocio: "8",
        cognome: "Bianchi",
        nome: "Leo",
        tipo: "Socio",
        adultoGiovane: "Giovane",
        codiceFiscale: "",
        dataNascita: "2013-07-15",
        luogoNascita: "Monza",
        cellulare: "",
        email: "",
        dataDeliberaAmmissione: null,
        presente: false,
        votante: false,
        id: "",
        timestamp: "",
      },
    ]);
    await store.setRegistrationsClosed(true);

    // Multi-selezione con duplicato nello stesso array ("1", "8", "1") -> crea esattamente 2 righe
    const res = await createTutor(store, ["1", "8", "1"], {
      cognome: "bianchi",
      nome: "clara",
      tipo: "Socio", // ignorato lato server
      adultoGiovane: "Adulto", // ignorato lato server
      codiceFiscale: "bncclr79c50f205y",
      dataNascita: "10/03/1979",
      luogoNascita: "Milano",
      cellulare: "3338887766",
      email: "clara.bianchi@example.com",
      dataDeliberaAmmissione: "01/11/2024",
      votante: true, // ignorato lato server -> sempre false
    });
    expect(res).toEqual({ status: "ok", createdCount: 2 });

    const created = (await store.getRows()).filter((r) => r.nome === "CLARA" && r.cognome === "BIANCHI");
    expect(created.map((r) => r.codiceSocio).sort()).toEqual(["1", "8"]);
    for (const r of created) {
      expect(r).toMatchObject({
        tipo: "Tutore",
        adultoGiovane: "",
        votante: false,
        presente: false,
        luogoNascita: "MILANO",
        email: "CLARA.BIANCHI@EXAMPLE.COM",
        codiceFiscale: "BNCCLR79C50F205Y",
        id: "",
        timestamp: "",
      });
    }

    // Duplicato se si riprova su almeno un codice già coperto (es. "8" e un nuovo "1" -> blocca senza scritture parziali)
    const countBefore = (await store.getRows()).length;
    const dup = await createTutor(store, ["8"], {
      cognome: "BIANCHI",
      nome: "Clara",
      codiceFiscale: "",
      dataNascita: "10/03/1979",
      luogoNascita: "milano",
      cellulare: "",
      email: "",
      dataDeliberaAmmissione: "",
    });
    expect(dup.status).toBe("duplicate");
    expect((await store.getRows()).length).toBe(countBefore);
  });

  it("createTutor rifiuta selezione vuota, codici non di Soci Giovani e tutori minorenni", async () => {
    const store = new MockSheetStore();
    const validTutor = {
      cognome: "Verdi",
      nome: "Elisa",
      codiceFiscale: "",
      dataNascita: "10/05/1982",
      luogoNascita: "Milano",
      cellulare: "",
      email: "",
      dataDeliberaAmmissione: "",
    };

    expect((await createTutor(store, [], validTutor)).status).toBe("invalid");
    // Codice "2" è Giulia Bianchi (Socio Adulto), non Socio Giovane
    expect((await createTutor(store, ["2"], validTutor)).status).toBe("invalid");
    // Codice inesistente
    expect((await createTutor(store, ["9999"], validTutor)).status).toBe("invalid");
    // Tutore minorenne
    const minorTutor = await createTutor(store, ["1"], { ...validTutor, dataNascita: "15/06/2015" });
    expect(minorTutor.status).toBe("invalid");
    if (minorTutor.status === "invalid") {
      expect(minorTutor.errors.dataNascita).toContain("maggiorenne");
    }
  });

  it("extractExistingAdults include solo Soci Adulti e Tutori deduplicati con ruoli combinati", async () => {
    const store = new MockSheetStore([
      ...fakeRows(),
      {
        rowNumber: 8,
        codiceSocio: "10",
        cognome: "Verdi",
        nome: "Paolo",
        tipo: "Tutore",
        adultoGiovane: "",
        codiceFiscale: "",
        dataNascita: "1980-11-30",
        luogoNascita: "Monza",
        cellulare: "",
        email: "",
        dataDeliberaAmmissione: null,
        presente: false,
        votante: false,
        id: "",
        timestamp: "",
      },
      {
        rowNumber: 9,
        codiceSocio: "11",
        cognome: "Rossi",
        nome: "Mario",
        tipo: "Tutore",
        adultoGiovane: "",
        codiceFiscale: "",
        dataNascita: "1975-03-12",
        luogoNascita: "Milano",
        cellulare: "",
        email: "",
        dataDeliberaAmmissione: null,
        presente: false,
        votante: false,
        id: "",
        timestamp: "",
      },
    ]);
    const listed = await listAssociates(store);
    const adults = extractExistingAdults(listed.rows);

    // Esclude i Soci Giovani (Luca e Anna)
    expect(adults.some((a) => a.row.nome === "Luca" || a.row.nome === "Anna")).toBe(false);
    // Mario (presente 2 volte come Tutore) appare 1 volta sola
    const marios = adults.filter((a) => a.row.nome === "Mario");
    expect(marios).toHaveLength(1);
    expect(marios[0].roleLabel).toBe("Tutore");
    // Paolo (sia Socio Adulto che Tutore) appare 1 volta sola con ruolo combinato
    const paolo = adults.find((a) => a.row.nome === "Paolo")!;
    expect(paolo.roleLabel).toBe("Socio Adulto / Tutore");
    expect(paolo.row.tipo).toBe("Socio");
    // Giulia (solo Socio Adulto)
    const giulia = adults.find((a) => a.row.nome === "Giulia")!;
    expect(giulia.roleLabel).toBe("Socio Adulto");
  });

  it("toSheetSocioCode converte i codici numerici in Number per Google Sheets", () => {
    expect(toSheetSocioCode("1444301")).toBe(1444301);
    expect(toSheetSocioCode("000123")).toBe(123);
    expect(typeof toSheetSocioCode("1")).toBe("number");
  });

  it("updateAssociate blocca Codice Socio duplicato tra Soci e chiede conferma per aggiornare i tutori collegati", async () => {
    const store = new MockSheetStore();
    const list = await listAssociates(store);

    // Tentativo di assegnare a Giulia (codice 2) il Codice Socio 3 già di Paolo -> duplicate
    const giuliaRow = list.rows.find((r) => r.nome === "Giulia")!;
    const dupRes = await updateAssociate(store, giuliaRow.rowNumber, giuliaRow.fingerprint, {
      codiceSocio: "003",
      cognome: "Bianchi",
      nome: "Giulia",
      adultoGiovane: "Adulto",
      codiceFiscale: "BNCGLI90A55C855K",
      dataNascita: "15/01/1990",
      luogoNascita: "Cologno Monzese",
      cellulare: "3331110005",
      email: "giulia.bianchi@example.com",
      dataDeliberaAmmissione: "01/10/2023",
      votante: true,
    });
    expect(dupRes.status).toBe("duplicate");
    expect((await store.getRows()).find((r) => r.nome === "Giulia")?.codiceSocio).toBe("2");

    // Modifica Codice Socio di Luca (Socio codice 1) a 777 -> chiede conferma per i tutori Mario e Sara
    const lucaRow = list.rows.find((r) => r.nome === "Luca")!;
    const payload = {
      codiceSocio: "777",
      cognome: "Rossi",
      nome: "Luca",
      adultoGiovane: "Giovane",
      codiceFiscale: "RSSLCU12H01F704Y",
      dataNascita: "01/06/2012",
      luogoNascita: "Monza",
      cellulare: "3331110002",
      email: "",
      dataDeliberaAmmissione: "01/10/2023",
      votante: false,
    };
    const preview = await updateAssociate(store, lucaRow.rowNumber, lucaRow.fingerprint, payload, false);
    expect(preview.status).toBe("confirm");
    if (preview.status === "confirm") {
      expect(preview.oldCodiceSocio).toBe("1");
      expect(preview.newCodiceSocio).toBe("777");
      expect(preview.affectedTutors).toEqual([
        { rowNumber: 2, cognome: "Rossi", nome: "Mario", dataNascita: "12/03/1975", luogoNascita: "Milano" },
        { rowNumber: 7, cognome: "Rossi", nome: "Sara", dataNascita: "02/05/1978", luogoNascita: "Milano" },
      ]);
      expect(preview.affectedSamePersonRows).toEqual([]);
    }
    // Senza conferma non deve ancora aver scritto nulla
    expect((await store.getRows()).find((r) => r.nome === "Mario")?.codiceSocio).toBe("1");

    // Con confirmCascade = true aggiorna Luca + entrambi i tutori Mario e Sara preservando i dati di questi ultimi
    const confirmed = await updateAssociate(store, lucaRow.rowNumber, lucaRow.fingerprint, payload, true);
    expect(confirmed.status).toBe("ok");
    if (confirmed.status === "ok") expect(confirmed.updatedRowsCount).toBe(3);

    const rowsAfter = await store.getRows();
    expect(rowsAfter.find((r) => r.nome === "LUCA")?.codiceSocio).toBe("777");
    expect(rowsAfter.find((r) => r.nome === "Mario")).toMatchObject({ codiceSocio: "777", tipo: "Tutore", votante: true });
    expect(rowsAfter.find((r) => r.nome === "Sara")).toMatchObject({ codiceSocio: "777", tipo: "Tutore", votante: false });
    // Anna resta invariata sul vecchio codice 1 perché ha una propria riga distinta
    expect(rowsAfter.find((r) => r.nome === "Anna")?.codiceSocio).toBe("1");
  });

  it("updateAssociate propaga le modifiche (anche Votante) alle altre righe dello stesso nominativo preservando Tipo, Adulto-Giovane e Codice Socio", async () => {
    const baseExtra = {
      cognome: "Verdi",
      nome: "Paolo",
      adultoGiovane: "",
      codiceFiscale: "VRDPLA80S30F704J",
      dataNascita: "1980-11-30",
      luogoNascita: "Monza",
      cellulare: "3331110006",
      email: "",
      dataDeliberaAmmissione: "2023-10-01",
      presente: false,
      votante: false,
      id: "",
      timestamp: "",
    };
    const store = new MockSheetStore([
      ...fakeRows(),
      { ...baseExtra, rowNumber: 8, codiceSocio: "10", tipo: "Tutore" },
      { ...baseExtra, rowNumber: 9, codiceSocio: "11", tipo: "Tutore" },
    ]);
    const list = await listAssociates(store);
    const paoloSocio = list.rows.find((r) => r.nome === "Paolo" && r.tipo === "Socio")!;

    const editPayload = {
      codiceSocio: "3",
      cognome: "Verdi-Bianchi",
      nome: "Paolo",
      adultoGiovane: "Adulto",
      codiceFiscale: "VRDPLA80S30F704J",
      dataNascita: "30/11/1980",
      luogoNascita: "Monza",
      cellulare: "3337776655",
      email: "nuova.paolo@example.com",
      dataDeliberaAmmissione: "01/10/2023",
      votante: false,
    };

    const preview = await updateAssociate(store, paoloSocio.rowNumber, paoloSocio.fingerprint, editPayload, false);
    expect(preview.status).toBe("confirm");
    if (preview.status === "confirm") {
      expect(preview.affectedTutors).toEqual([]);
      expect(preview.affectedSamePersonRows).toEqual([
        { rowNumber: 8, codiceSocio: "10", tipo: "Tutore" },
        { rowNumber: 9, codiceSocio: "11", tipo: "Tutore" },
      ]);
      expect(preview.propagatedFields.sort()).toEqual(["Cellulare", "Cognome", "Email", "Nome", "Votante"].sort());
    }

    const done = await updateAssociate(store, paoloSocio.rowNumber, paoloSocio.fingerprint, editPayload, true);
    expect(done.status).toBe("ok");
    if (done.status === "ok") expect(done.updatedRowsCount).toBe(3);

    const rowsAfter = await store.getRows();
    const socioAfter = rowsAfter.find((r) => r.rowNumber === paoloSocio.rowNumber)!;
    const t1After = rowsAfter.find((r) => r.rowNumber === 8)!;
    const t2After = rowsAfter.find((r) => r.rowNumber === 9)!;

    expect(socioAfter).toMatchObject({
      codiceSocio: "3",
      tipo: "Socio",
      adultoGiovane: "Adulto",
      cognome: "VERDI-BIANCHI",
      nome: "PAOLO",
      cellulare: "3337776655",
      email: "nuova.paolo@example.com",
      votante: false,
    });
    expect(t1After).toMatchObject({
      codiceSocio: "10",
      tipo: "Tutore",
      adultoGiovane: "",
      cognome: "VERDI-BIANCHI",
      nome: "PAOLO",
      cellulare: "3337776655",
      email: "nuova.paolo@example.com",
      votante: false,
    });
    expect(t2After).toMatchObject({
      codiceSocio: "11",
      tipo: "Tutore",
      adultoGiovane: "",
      cognome: "VERDI-BIANCHI",
      nome: "PAOLO",
      cellulare: "3337776655",
      email: "nuova.paolo@example.com",
      votante: false,
    });
  });
});
