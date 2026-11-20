export interface SheetRow {
  rowNumber: number; // numero riga nel foglio (1-based, intestazione = 1)
  codiceSocio: string;
  cognome: string;
  nome: string;
  tipo: string;
  adultoGiovane: string;
  dataNascita: string | null; // ISO
  luogoNascita: string;
  email: string;
  presente: boolean;
  votante?: boolean; // colonna "Votante" (P)
  id: string;
  ip?: string;
  timestamp: string;
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
  getRegistrationsClosed(): Promise<boolean>;
  setRegistrationsClosed(closed: boolean): Promise<void>;
}
