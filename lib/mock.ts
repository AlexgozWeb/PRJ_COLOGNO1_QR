import type { Registration, SheetRow, SheetStore } from "./types";

const base = { luogoNascita: "Monza", email: "", presente: false, id: "", timestamp: "" };

/** Dati interamente fittizi, solo per sviluppo locale (MOCK_SHEET=1) e test. */
export function fakeRows(): SheetRow[] {
  return [
    { ...base, rowNumber: 2, codiceSocio: "1", cognome: "Rossi", nome: "Mario", tipo: "Tutore", adultoGiovane: "", dataNascita: "1975-03-12", luogoNascita: "Milano", email: "mario.rossi@example.com" },
    { ...base, rowNumber: 3, codiceSocio: "1", cognome: "Rossi", nome: "Luca", tipo: "Socio", adultoGiovane: "Giovane", dataNascita: "2012-06-01" },
    { ...base, rowNumber: 4, codiceSocio: "1", cognome: "Rossi", nome: "Anna", tipo: "Socio", adultoGiovane: "Giovane", dataNascita: "2014-09-20" },
    { ...base, rowNumber: 5, codiceSocio: "2", cognome: "Bianchi", nome: "Giulia", tipo: "Socio", adultoGiovane: "Adulto", dataNascita: "1990-01-15", luogoNascita: "Cologno Monzese", email: "giulia.bianchi@example.com" },
    { ...base, rowNumber: 6, codiceSocio: "3", cognome: "Verdi", nome: "Paolo", tipo: "Socio", adultoGiovane: "Adulto", dataNascita: "1980-11-30", presente: true, id: "ZZZZ1111", timestamp: "2026-11-27 15:02:10" },
  ];
}

export class MockSheetStore implements SheetStore {
  constructor(private rows: SheetRow[] = fakeRows()) {}
  async getRows() {
    return this.rows.map((r) => ({ ...r }));
  }
  async writeRegistration(reg: Registration) {
    for (const r of this.rows)
      if (reg.rowNumbers.includes(r.rowNumber)) Object.assign(r, { presente: true, id: reg.id, ip: reg.ip, timestamp: reg.timestamp });
  }
}
