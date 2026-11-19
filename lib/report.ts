import type { SheetStore } from "./types";

export interface ReportRow {
  codiceSocio: string;
  nome: string;
  cognome: string;
  dataNascita: string; // GG/MM/AAAA
  tipo: string;
  presente: boolean;
}

function fmtDate(iso: string | null): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Solo i campi del report di dettaglio (nessun ID, IP, email, ecc.). */
export async function getReport(store: SheetStore): Promise<{ rows: ReportRow[]; aggiornato: string }> {
  const rows = (await store.getRows()).map((r) => ({
    codiceSocio: r.codiceSocio,
    nome: r.nome,
    cognome: r.cognome,
    dataNascita: fmtDate(r.dataNascita),
    tipo: r.tipo,
    presente: r.presente,
  }));
  return { rows, aggiornato: new Date().toISOString() };
}
