import { generateId, romeTimestamp } from "./id";
import { isoToItalian, normalizeText, toIsoDate } from "./normalize";
import type { SheetRow, SheetStore } from "./types";

export interface PersonInput {
  nome: string;
  cognome: string;
  dataNascita: string; // GG/MM/AAAA o ISO
  luogoNascita: string;
}

export interface PersonView {
  nome: string;
  cognome: string;
  dataNascita: string; // GG/MM/AAAA
  luogoNascita: string;
  email: string;
}

export interface Kid {
  nome: string;
  cognome: string;
  dataNascita: string;
  registered: boolean;
}

export type LookupResult =
  | { status: "not_found" }
  | { status: "found"; person: PersonView; kids: Kid[]; coTutors: Kid[] }
  | { status: "already"; person: PersonView; timestamp: string };

export type RegisterResult =
  | { status: "ok"; person: PersonView; id: string; timestamp: string; kids: Kid[]; coTutors: Kid[] }
  | { status: "already"; person: PersonView; timestamp: string }
  | { status: "not_found" };

function matches(rows: SheetRow[], p: PersonInput): SheetRow[] {
  const iso = toIsoDate(p.dataNascita);
  if (!iso) return [];
  const n = normalizeText(p.nome), c = normalizeText(p.cognome), l = normalizeText(p.luogoNascita);
  return rows.filter(
    (r) =>
      r.dataNascita === iso &&
      normalizeText(r.nome) === n &&
      normalizeText(r.cognome) === c &&
      normalizeText(r.luogoNascita) === l,
  );
}

function view(r: SheetRow, rows: SheetRow[]): PersonView {
  const email = rows.find((x) => x.email)?.email ?? "";
  return {
    nome: r.nome,
    cognome: r.cognome,
    dataNascita: r.dataNascita ? isoToItalian(r.dataNascita) : "",
    luogoNascita: r.luogoNascita,
    email,
  };
}

interface Related {
  rows: SheetRow[];
  kids: Kid[];
  coTutors: Kid[];
}

/** Se la persona è tutore: righe con lo stesso Codice Socio (ragazzi = Socio, altri tutori = Tutore). */
function relatedOf(all: SheetRow[], mine: SheetRow[]): Related {
  const out: Related = { rows: [], kids: [], coTutors: [] };
  if (!mine.some((r) => normalizeText(r.tipo) === "TUTORE")) return out;
  const codes = new Set(mine.map((r) => r.codiceSocio));
  const mineRows = new Set(mine.map((r) => r.rowNumber));
  const seen = new Map<string, Kid>();
  for (const r of all) {
    if (!codes.has(r.codiceSocio) || mineRows.has(r.rowNumber)) continue;
    const tipo = normalizeText(r.tipo);
    if (tipo !== "SOCIO" && tipo !== "TUTORE") continue;
    out.rows.push(r);
    const key = `${tipo}|${normalizeText(r.nome)}|${normalizeText(r.cognome)}|${r.dataNascita}`;
    const known = seen.get(key);
    if (known) {
      known.registered ||= r.presente;
      continue;
    }
    const k: Kid = { nome: r.nome, cognome: r.cognome, dataNascita: r.dataNascita ? isoToItalian(r.dataNascita) : "", registered: r.presente };
    seen.set(key, k);
    (tipo === "SOCIO" ? out.kids : out.coTutors).push(k);
  }
  return out;
}

export async function lookup(store: SheetStore, p: PersonInput, _ip = ""): Promise<LookupResult> {
  const all = await store.getRows();
  const mine = matches(all, p);
  if (!mine.length) return { status: "not_found" };
  const person = view(mine[0], mine);
  const done = mine.find((r) => r.presente);
  if (done) return { status: "already", person, timestamp: done.timestamp };
  const { kids, coTutors } = relatedOf(all, mine);
  return { status: "found", person, kids, coTutors };
}

export async function register(store: SheetStore, p: PersonInput, ip = ""): Promise<RegisterResult> {
  const all = await store.getRows(); // rilettura prima di scrivere
  const mine = matches(all, p);
  if (!mine.length) return { status: "not_found" };
  const person = view(mine[0], mine);
  const done = mine.find((r) => r.presente);
  if (done) return { status: "already", person, timestamp: done.timestamp };
  const rel = relatedOf(all, mine);
  const id = generateId(new Set(all.map((r) => r.id).filter(Boolean)));
  const timestamp = romeTimestamp();
  // le righe correlate già registrate non vengono sovrascritte
  const rowNumbers = [...mine, ...rel.rows.filter((r) => !r.presente)].map((r) => r.rowNumber);
  await store.writeRegistration({ rowNumbers, id, ip, timestamp });
  return { status: "ok", person, id, timestamp, kids: rel.kids, coTutors: rel.coTutors };
}
