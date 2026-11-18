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
}

export type LookupResult =
  | { status: "not_found" }
  | { status: "found"; person: PersonView; kids: Kid[] }
  | { status: "already"; person: PersonView; timestamp: string };

export type RegisterResult =
  | { status: "ok"; person: PersonView; id: string; timestamp: string }
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

function kidsOf(all: SheetRow[], mine: SheetRow[]): Kid[] {
  if (!mine.some((r) => normalizeText(r.tipo) === "TUTORE")) return [];
  const codes = new Set(mine.map((r) => r.codiceSocio));
  const seen = new Set<string>();
  const out: Kid[] = [];
  for (const r of all) {
    if (!codes.has(r.codiceSocio) || normalizeText(r.tipo) !== "SOCIO") continue;
    if (mine.some((m) => m.rowNumber === r.rowNumber)) continue;
    const k = { nome: r.nome, cognome: r.cognome, dataNascita: r.dataNascita ? isoToItalian(r.dataNascita) : "" };
    const key = `${k.nome}|${k.cognome}|${k.dataNascita}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(k);
    }
  }
  return out;
}

export async function lookup(store: SheetStore, p: PersonInput): Promise<LookupResult> {
  const all = await store.getRows();
  const mine = matches(all, p);
  if (!mine.length) return { status: "not_found" };
  const person = view(mine[0], mine);
  const done = mine.find((r) => r.presente);
  if (done) return { status: "already", person, timestamp: done.timestamp };
  return { status: "found", person, kids: kidsOf(all, mine) };
}

export async function register(store: SheetStore, p: PersonInput): Promise<RegisterResult> {
  const all = await store.getRows(); // rilettura prima di scrivere
  const mine = matches(all, p);
  if (!mine.length) return { status: "not_found" };
  const person = view(mine[0], mine);
  const done = mine.find((r) => r.presente);
  if (done) return { status: "already", person, timestamp: done.timestamp };
  const id = generateId(new Set(all.map((r) => r.id).filter(Boolean)));
  const timestamp = romeTimestamp();
  await store.writeRegistration({ rowNumbers: mine.map((r) => r.rowNumber), id, timestamp });
  return { status: "ok", person, id, timestamp };
}
