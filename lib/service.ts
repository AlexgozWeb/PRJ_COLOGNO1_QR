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

export interface MinorTutor {
  nome: string;
  cognome: string;
  dataNascita: string; // GG/MM/AAAA
  luogoNascita: string;
  registered: boolean;
}

export type LookupResult =
  | { status: "closed" }
  | { status: "not_found" }
  | { status: "minor"; person: PersonView; tutors: MinorTutor[] }
  | { status: "found"; person: PersonView; kids: Kid[]; coTutors: Kid[] }
  | { status: "already"; person: PersonView; timestamp: string };

export type RegisterResult =
  | { status: "closed" }
  | { status: "minor"; person: PersonView; tutors: MinorTutor[] }
  | { status: "ok"; person: PersonView; id: string; timestamp: string; kids: Kid[] }
  | { status: "already"; person: PersonView; timestamp: string }
  | { status: "not_found" };

export function isMinor(birthIso: string | null, refIso = romeTimestamp().slice(0, 10)): boolean {
  const b = birthIso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const r = refIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!b || !r) return false;
  const eighteenth = Date.UTC(+b[1] + 18, +b[2] - 1, +b[3]);
  const ref = Date.UTC(+r[1], +r[2] - 1, +r[3]);
  return ref < eighteenth;
}

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

/** Se la persona è tutore: righe con lo stesso Codice Socio (ragazzi = Socio da registrare, altri tutori = Tutore solo informativo). */
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
    if (tipo === "SOCIO") out.rows.push(r);
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

/** Tutori associati allo stesso Codice Socio di una persona (usato per soci minorenni). */
function tutorsOf(all: SheetRow[], mine: SheetRow[]): MinorTutor[] {
  const codes = new Set(mine.map((r) => r.codiceSocio).filter(Boolean));
  const mineRows = new Set(mine.map((r) => r.rowNumber));
  const seen = new Map<string, MinorTutor>();
  for (const r of all) {
    if (!codes.has(r.codiceSocio) || mineRows.has(r.rowNumber)) continue;
    if (normalizeText(r.tipo) !== "TUTORE") continue;
    const key = `${normalizeText(r.nome)}|${normalizeText(r.cognome)}|${r.dataNascita}`;
    const known = seen.get(key);
    if (known) {
      known.registered ||= r.presente;
      if (!known.luogoNascita && r.luogoNascita) known.luogoNascita = r.luogoNascita;
      continue;
    }
    const tutor: MinorTutor = {
      nome: r.nome,
      cognome: r.cognome,
      dataNascita: r.dataNascita ? isoToItalian(r.dataNascita) : "",
      luogoNascita: r.luogoNascita,
      registered: r.presente,
    };
    seen.set(key, tutor);
  }
  return [...seen.values()];
}

export async function lookup(store: SheetStore, p: PersonInput, _ip = ""): Promise<LookupResult> {
  if (await store.getRegistrationsClosed()) return { status: "closed" };
  const all = await store.getRows();
  const mine = matches(all, p);
  if (!mine.length) return { status: "not_found" };
  const person = view(mine[0], mine);
  const done = mine.find((r) => r.presente);
  if (done) return { status: "already", person, timestamp: done.timestamp };
  if (isMinor(mine[0].dataNascita)) {
    return { status: "minor", person, tutors: tutorsOf(all, mine) };
  }
  const { kids, coTutors } = relatedOf(all, mine);
  return { status: "found", person, kids, coTutors };
}

export async function register(store: SheetStore, p: PersonInput, ip = ""): Promise<RegisterResult> {
  if (await store.getRegistrationsClosed()) return { status: "closed" };
  const all = await store.getRows(); // rilettura prima di scrivere
  const mine = matches(all, p);
  if (!mine.length) return { status: "not_found" };
  const person = view(mine[0], mine);
  const done = mine.find((r) => r.presente);
  if (done) return { status: "already", person, timestamp: done.timestamp };
  if (isMinor(mine[0].dataNascita)) {
    return { status: "minor", person, tutors: tutorsOf(all, mine) };
  }
  const rel = relatedOf(all, mine);
  const id = generateId(new Set(all.map((r) => r.id).filter(Boolean)));
  const timestamp = romeTimestamp();
  // le righe correlate già registrate non vengono sovrascritte
  const rowNumbers = [...mine, ...rel.rows.filter((r) => !r.presente)].map((r) => r.rowNumber);
  await store.writeRegistration({ rowNumbers, id, ip, timestamp });
  return { status: "ok", person, id, timestamp, kids: rel.kids.filter((k) => !k.registered) };
}
