import { toIsoDate } from "./normalize";
import {
  DEFAULT_ASSEMBLY_DATE,
  DEFAULT_ASSEMBLY_NAME,
  type AppConfig,
  type AssemblyInfo,
  type NewRow,
  type Registration,
  type RowUpdate,
  type RowUpdateItem,
  type SheetRow,
  type SheetStore,
} from "./types";

const normMockCode = (code: string) => {
  const s = code.trim();
  return /^\d{1,15}$/.test(s) ? String(Number(s)) : s;
};

const base = {
  luogoNascita: "Monza",
  cellulare: "3330000000",
  email: "",
  dataDeliberaAmmissione: "2023-10-01",
  presente: false,
  votante: false,
  id: "",
  timestamp: "",
};

/** Dati interamente fittizi, solo per sviluppo locale (MOCK_SHEET=1) e test. */
export function fakeRows(): SheetRow[] {
  return [
    { ...base, rowNumber: 2, codiceSocio: "1", cognome: "Rossi", nome: "Mario", tipo: "Tutore", adultoGiovane: "", codiceFiscale: "RSSMRA75C12F205X", dataNascita: "1975-03-12", luogoNascita: "Milano", cellulare: "3331110001", email: "mario.rossi@example.com", votante: true },
    { ...base, rowNumber: 3, codiceSocio: "1", cognome: "Rossi", nome: "Luca", tipo: "Socio", adultoGiovane: "Giovane", codiceFiscale: "RSSLCU12H01F704Y", dataNascita: "2012-06-01", cellulare: "3331110002" },
    { ...base, rowNumber: 4, codiceSocio: "1", cognome: "Rossi", nome: "Anna", tipo: "Socio", adultoGiovane: "Giovane", codiceFiscale: "RSSNNA14P60F704Z", dataNascita: "2014-09-20", cellulare: "3331110003" },
    { ...base, rowNumber: 7, codiceSocio: "1", cognome: "Rossi", nome: "Sara", tipo: "Tutore", adultoGiovane: "", codiceFiscale: "RSSSRA78E42F205W", dataNascita: "1978-05-02", luogoNascita: "Milano", cellulare: "3331110004" },
    { ...base, rowNumber: 5, codiceSocio: "2", cognome: "Bianchi", nome: "Giulia", tipo: "Socio", adultoGiovane: "Adulto", codiceFiscale: "BNCGLI90A55C855K", dataNascita: "1990-01-15", luogoNascita: "Cologno Monzese", cellulare: "3331110005", email: "giulia.bianchi@example.com", votante: true },
    { ...base, rowNumber: 6, codiceSocio: "3", cognome: "Verdi", nome: "Paolo", tipo: "Socio", adultoGiovane: "Adulto", codiceFiscale: "VRDPLA80S30F704J", dataNascita: "1980-11-30", cellulare: "3331110006", presente: true, votante: true, id: "ZZZZ1111", timestamp: "2026-11-27 15:02:10" },
  ];
}

export class MockSheetStore implements SheetStore {
  constructor(
    private rows: SheetRow[] = fakeRows(),
    private closed = false,
    private assemblyName = DEFAULT_ASSEMBLY_NAME,
    private assemblyDate = DEFAULT_ASSEMBLY_DATE,
  ) {}
  async getRows() {
    return this.rows.map((r) => ({ ...r }));
  }
  async writeRegistration(reg: Registration) {
    for (const r of this.rows)
      if (reg.rowNumbers.includes(r.rowNumber)) Object.assign(r, { presente: true, id: reg.id, ip: reg.ip, timestamp: reg.timestamp });
  }
  async clearRegistration(rowNumbers: number[]) {
    for (const r of this.rows)
      if (rowNumbers.includes(r.rowNumber)) Object.assign(r, { presente: false, id: "", ip: "", timestamp: "" });
  }
  async updateRows(updates: RowUpdateItem[]) {
    for (const { rowNumber, data } of updates) {
      const row = this.rows.find((r) => r.rowNumber === rowNumber);
      if (!row) throw new Error("Riga non trovata");
      Object.assign(row, {
        codiceSocio: normMockCode(data.codiceSocio),
        cognome: data.cognome,
        nome: data.nome,
        adultoGiovane: data.adultoGiovane,
        codiceFiscale: data.codiceFiscale,
        dataNascita: toIsoDate(data.dataNascita),
        luogoNascita: data.luogoNascita,
        cellulare: data.cellulare,
        email: data.email,
        dataDeliberaAmmissione: data.dataDeliberaAmmissione ? toIsoDate(data.dataDeliberaAmmissione) : null,
        votante: data.votante,
      });
    }
  }
  async updateRow(rowNumber: number, data: RowUpdate) {
    await this.updateRows([{ rowNumber, data }]);
  }
  async deleteRow(rowNumber: number) {
    const idx = this.rows.findIndex((r) => r.rowNumber === rowNumber);
    if (idx < 0) throw new Error("Riga non trovata");
    this.rows.splice(idx, 1);
    for (const r of this.rows) {
      if (r.rowNumber > rowNumber) r.rowNumber -= 1;
    }
  }
  async appendRows(newRows: NewRow[]) {
    let nextRow = this.rows.reduce((max, r) => Math.max(max, r.rowNumber), 1) + 1;
    for (const r of newRows) {
      this.rows.push({
        rowNumber: nextRow++,
        codiceSocio: normMockCode(r.codiceSocio),
        cognome: r.cognome,
        nome: r.nome,
        tipo: r.tipo,
        adultoGiovane: r.adultoGiovane,
        codiceFiscale: r.codiceFiscale,
        dataNascita: toIsoDate(r.dataNascita),
        luogoNascita: r.luogoNascita,
        cellulare: r.cellulare,
        email: r.email,
        dataDeliberaAmmissione: r.dataDeliberaAmmissione ? toIsoDate(r.dataDeliberaAmmissione) : null,
        presente: false,
        votante: r.votante,
        id: "",
        ip: "",
        timestamp: "",
      });
    }
  }
  async getAppConfig(): Promise<AppConfig> {
    return {
      registrationsClosed: this.closed,
      assemblyName: this.assemblyName,
      assemblyDate: this.assemblyDate,
    };
  }
  async getRegistrationsClosed() {
    return this.closed;
  }
  async setRegistrationsClosed(closed: boolean) {
    this.closed = closed;
  }
  async setAssemblyInfo(info: AssemblyInfo) {
    this.assemblyName = info.assemblyName;
    this.assemblyDate = info.assemblyDate;
  }
}
