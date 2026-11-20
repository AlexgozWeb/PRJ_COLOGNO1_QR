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
  | { status: "found"; person: PersonView; kids: Kid[]; adultKids: Kid[]; coTutors: Kid[] }
  | { status: "already"; person: PersonView; timestamp: string };

export type RegisterResult =
  | { status: "closed" }
  | { status: "minor"; person: PersonView; tutors: MinorTutor[] }
  | { status: "ok"; person: PersonView; id: string; timestamp: string; kids: Kid[] }
  | { status: "already"; person: PersonView; timestamp: string }
  | { status: "not_found" };

export interface UnregisterPersonInfo {
  nome: string;
  cognome: string;
  dataNascita: string; // GG/MM/AAAA
  luogoNascita: string;
  tipo: string;
  presente: boolean;
  partialOnly?: boolean;
}

export type UnregisterPreviewResult =
  | { status: "closed" }
  | { status: "not_found" }
  | { status: "not_registered" }
  | {
      status: "ok";
      target: UnregisterPersonInfo;
      cascadeRemoved: UnregisterPersonInfo[];
      relatedKept: UnregisterPersonInfo[];
      rowNumbers: number[];
    };

export type UnregisterResult =
  | { status: "closed" }
  | { status: "not_found" }
  | { status: "not_registered" }
  | { status: "ok"; clearedRows: number };

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
  adultKids: Kid[];
  coTutors: Kid[];
}

/** Se la persona è tutore: righe con lo stesso Codice Socio (minorenni da registrare; maggiorenni e altri tutori solo informativi). */
function relatedOf(all: SheetRow[], mine: SheetRow[], refIso = romeTimestamp().slice(0, 10)): Related {
  const out: Related = { rows: [], kids: [], adultKids: [], coTutors: [] };
  if (!mine.some((r) => normalizeText(r.tipo) === "TUTORE")) return out;
  const codes = new Set(mine.map((r) => r.codiceSocio));
  const mineRows = new Set(mine.map((r) => r.rowNumber));
  const seen = new Map<string, Kid>();
  for (const r of all) {
    if (!codes.has(r.codiceSocio) || mineRows.has(r.rowNumber)) continue;
    const tipo = normalizeText(r.tipo);
    if (tipo !== "SOCIO" && tipo !== "TUTORE") continue;
    const minor = tipo === "SOCIO" && isMinor(r.dataNascita, refIso);
    if (minor) out.rows.push(r);
    const bucket = tipo === "SOCIO" ? (minor ? "M" : "A") : "T";
    const key = `${tipo}|${bucket}|${normalizeText(r.nome)}|${normalizeText(r.cognome)}|${r.dataNascita}`;
    const known = seen.get(key);
    if (known) {
      known.registered ||= r.presente;
      continue;
    }
    const k: Kid = { nome: r.nome, cognome: r.cognome, dataNascita: r.dataNascita ? isoToItalian(r.dataNascita) : "", registered: r.presente };
    seen.set(key, k);
    if (tipo === "SOCIO") (minor ? out.kids : out.adultKids).push(k);
    else out.coTutors.push(k);
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
  const { kids, adultKids, coTutors } = relatedOf(all, mine);
  return { status: "found", person, kids, adultKids, coTutors };
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

function personKey(r: SheetRow): string {
  return `${normalizeText(r.nome)}|${normalizeText(r.cognome)}|${r.dataNascita ?? ""}|${normalizeText(r.luogoNascita)}`;
}

function summarizePerson(rows: SheetRow[], partialOnly = false): UnregisterPersonInfo {
  const r = rows[0];
  const tipos = [...new Set(rows.map((x) => x.tipo.trim()).filter(Boolean))].sort();
  return {
    nome: r.nome,
    cognome: r.cognome,
    dataNascita: r.dataNascita ? isoToItalian(r.dataNascita) : "",
    luogoNascita: r.luogoNascita,
    tipo: tipos.join(" / "),
    presente: rows.some((x) => x.presente),
    ...(partialOnly ? { partialOnly: true } : {}),
  };
}

function planAdultUnregister(
  all: SheetRow[],
  byPerson: Map<string, SheetRow[]>,
  targetKey: string,
  mine: SheetRow[],
  rowsToClear: Set<number>,
  refIso: string,
): void {
  const stillPresent = (r: SheetRow) => r.presente && !rowsToClear.has(r.rowNumber);
  const tutorCodes = new Set(
    mine.filter((r) => normalizeText(r.tipo) === "TUTORE").map((r) => r.codiceSocio).filter(Boolean),
  );
  const kidKeys = new Set<string>();
  for (const r of all) {
    if (!tutorCodes.has(r.codiceSocio) || normalizeText(r.tipo) !== "SOCIO") continue;
    const k = personKey(r);
    if (k !== targetKey && isMinor(r.dataNascita, refIso) && stillPresent(r)) kidKeys.add(k);
  }
  for (const kidKey of kidKeys) {
    const kidRows = byPerson.get(kidKey) ?? [];
    const kidCodes = new Set(
      kidRows.filter((r) => normalizeText(r.tipo) === "SOCIO").map((r) => r.codiceSocio).filter(Boolean),
    );
    const hasTutor = all.some(
      (r) => kidCodes.has(r.codiceSocio) && normalizeText(r.tipo) === "TUTORE" && stillPresent(r),
    );
    if (!hasTutor) {
      for (const r of kidRows) if (stillPresent(r)) rowsToClear.add(r.rowNumber);
    }
  }
}

function planMinorUnregister(
  all: SheetRow[],
  byPerson: Map<string, SheetRow[]>,
  targetKey: string,
  mine: SheetRow[],
  rowsToClear: Set<number>,
): void {
  const stillPresent = (r: SheetRow) => r.presente && !rowsToClear.has(r.rowNumber);
  const minorCodes = new Set(mine.map((r) => r.codiceSocio).filter(Boolean));
  const tutorKeys = new Set<string>();
  for (const r of all) {
    if (!minorCodes.has(r.codiceSocio) || normalizeText(r.tipo) !== "TUTORE") continue;
    const k = personKey(r);
    if (k !== targetKey && stillPresent(r)) tutorKeys.add(k);
  }
  for (const tKey of tutorKeys) {
    const tRows = byPerson.get(tKey) ?? [];
    const hasAdultSocio = tRows.some((r) => normalizeText(r.tipo) === "SOCIO" && stillPresent(r));
    const tTutorCodes = new Set(
      tRows.filter((r) => normalizeText(r.tipo) === "TUTORE").map((r) => r.codiceSocio).filter(Boolean),
    );
    const hasOtherPresentKid = all.some(
      (r) =>
        tTutorCodes.has(r.codiceSocio) &&
        normalizeText(r.tipo) === "SOCIO" &&
        personKey(r) !== targetKey &&
        stillPresent(r),
    );
    if (!hasAdultSocio && !hasOtherPresentKid) {
      for (const r of tRows) if (stillPresent(r)) rowsToClear.add(r.rowNumber);
    } else {
      for (const r of tRows) {
        if (!minorCodes.has(r.codiceSocio) || normalizeText(r.tipo) !== "TUTORE" || !stillPresent(r)) continue;
        const hasKidOnCode = all.some(
          (k) =>
            k.codiceSocio === r.codiceSocio &&
            normalizeText(k.tipo) === "SOCIO" &&
            personKey(k) !== targetKey &&
            stillPresent(k),
        );
        if (!hasKidOnCode) rowsToClear.add(r.rowNumber);
      }
    }
  }
}

/** Calcola l'impatto della cancellazione presenza (Regola A per adulti/tutori, Opzione B2 per minorenni). */
export function planUnregister(
  all: SheetRow[],
  p: PersonInput,
  refIso = romeTimestamp().slice(0, 10),
): Exclude<UnregisterPreviewResult, { status: "closed" }> {
  const mine = matches(all, p);
  if (!mine.length) return { status: "not_found" };
  if (!mine.some((r) => r.presente)) return { status: "not_registered" };

  const byPerson = new Map<string, SheetRow[]>();
  for (const r of all) {
    const k = personKey(r);
    const list = byPerson.get(k);
    if (list) list.push(r);
    else byPerson.set(k, [r]);
  }

  const targetKey = personKey(mine[0]);
  const rowsToClear = new Set<number>(mine.filter((r) => r.presente).map((r) => r.rowNumber));

  if (isMinor(mine[0].dataNascita, refIso)) {
    planMinorUnregister(all, byPerson, targetKey, mine, rowsToClear);
  } else {
    planAdultUnregister(all, byPerson, targetKey, mine, rowsToClear, refIso);
  }

  const stillPresent = (r: SheetRow) => r.presente && !rowsToClear.has(r.rowNumber);
  const removedKeys = new Set<string>();
  for (const r of all) {
    if (!rowsToClear.has(r.rowNumber)) continue;
    const k = personKey(r);
    if (k !== targetKey) removedKeys.add(k);
  }

  const cascadeRemoved: UnregisterPersonInfo[] = [];
  for (const k of removedKeys) {
    const kRows = byPerson.get(k) ?? [];
    cascadeRemoved.push(summarizePerson(kRows, kRows.some(stillPresent)));
  }

  const allTargetCodes = new Set(mine.map((r) => r.codiceSocio).filter(Boolean));
  const keptKeys = new Set<string>();
  for (const r of all) {
    if (!allTargetCodes.has(r.codiceSocio)) continue;
    const tipo = normalizeText(r.tipo);
    if (tipo !== "SOCIO" && tipo !== "TUTORE") continue;
    const k = personKey(r);
    if (k !== targetKey && !removedKeys.has(k)) keptKeys.add(k);
  }

  const relatedKept: UnregisterPersonInfo[] = [];
  for (const k of keptKeys) {
    relatedKept.push(summarizePerson(byPerson.get(k) ?? [], false));
  }

  return {
    status: "ok",
    target: summarizePerson(mine, false),
    cascadeRemoved,
    relatedKept,
    rowNumbers: [...rowsToClear].sort((a, b) => a - b),
  };
}

export async function previewUnregister(store: SheetStore, p: PersonInput): Promise<UnregisterPreviewResult> {
  if (await store.getRegistrationsClosed()) return { status: "closed" };
  return planUnregister(await store.getRows(), p);
}

export async function unregister(store: SheetStore, p: PersonInput): Promise<UnregisterResult> {
  if (await store.getRegistrationsClosed()) return { status: "closed" };
  const all = await store.getRows(); // rilettura prima di scrivere
  const plan = planUnregister(all, p);
  if (plan.status !== "ok") return { status: plan.status };
  await store.clearRegistration(plan.rowNumbers);
  return { status: "ok", clearedRows: plan.rowNumbers.length };
}
