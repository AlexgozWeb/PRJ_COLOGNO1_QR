export interface SheetRow {
  rowNumber: number; // numero riga nel foglio (1-based, intestazione = 1)
  codiceSocio: string;
  cognome: string;
  nome: string;
  tipo: string;
  adultoGiovane: string;
  codiceFiscale?: string;
  dataNascita: string | null; // ISO
  luogoNascita: string;
  cellulare?: string;
  email: string;
  dataDeliberaAmmissione?: string | null; // ISO
  presente: boolean;
  votante?: boolean; // colonna "Votante" (P)
  id: string;
  ip?: string;
  timestamp: string;
}

export interface RowUpdate {
  codiceSocio: string;
  cognome: string;
  nome: string;
  adultoGiovane: string;
  codiceFiscale: string;
  dataNascita: string; // GG/MM/AAAA
  luogoNascita: string;
  cellulare: string;
  email: string;
  dataDeliberaAmmissione: string; // GG/MM/AAAA o ""
  votante: boolean;
}

export interface NewRow extends RowUpdate {
  tipo: "Socio" | "Tutore";
}

export interface RowUpdateItem {
  rowNumber: number;
  data: RowUpdate;
}

export interface Registration {
  rowNumbers: number[];
  id: string;
  ip: string;
  timestamp: string;
}

export interface SheetStore {
  getRows(): Promise<SheetRow[]>;
  writeRegistration(r: Registration): Promise<void>;
  clearRegistration(rowNumbers: number[]): Promise<void>;
  updateRow(rowNumber: number, data: RowUpdate): Promise<void>;
  updateRows(updates: RowUpdateItem[]): Promise<void>;
  deleteRow(rowNumber: number): Promise<void>;
  appendRows(rows: NewRow[]): Promise<void>;
  getRegistrationsClosed(): Promise<boolean>;
  setRegistrationsClosed(closed: boolean): Promise<void>;
}
