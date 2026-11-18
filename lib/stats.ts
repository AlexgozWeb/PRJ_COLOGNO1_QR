import { normalizeText } from "./normalize";
import type { SheetRow, SheetStore } from "./types";

export interface Stats {
  soci: number; // persone con almeno una riga Tipo=Socio
  sociVotanti: number; // soci con Votante=TRUE
  registrati: number; // persone registrate (soci e tutori)
  votantiTotali: number; // persone con diritto di voto (quorum = 100%)
  votantiRegistrati: number; // aventi diritto al voto già registrati
  aggiornato: string;
}

/** Conta persone uniche (nome+cognome+data di nascita), anche se compaiono su più righe. */
export function computeStats(rows: SheetRow[]): Stats {
  const people = new Map<string, { socio: boolean; votante: boolean; presente: boolean }>();
  for (const r of rows) {
    const key = `${normalizeText(r.nome)}|${normalizeText(r.cognome)}|${r.dataNascita}`;
    const p = people.get(key) ?? { socio: false, votante: false, presente: false };
    p.socio ||= normalizeText(r.tipo) === "SOCIO";
    p.votante ||= !!r.votante;
    p.presente ||= r.presente;
    people.set(key, p);
  }
  const all = [...people.values()];
  return {
    soci: all.filter((p) => p.socio).length,
    sociVotanti: all.filter((p) => p.socio && p.votante).length,
    registrati: all.filter((p) => p.presente).length,
    votantiTotali: all.filter((p) => p.votante).length,
    votantiRegistrati: all.filter((p) => p.votante && p.presente).length,
    aggiornato: new Date().toISOString(),
  };
}

export async function getStats(store: SheetStore): Promise<Stats> {
  return computeStats(await store.getRows());
}
