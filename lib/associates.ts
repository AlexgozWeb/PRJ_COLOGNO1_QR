import { createHash } from "node:crypto";
import { romeTimestamp } from "./id";
import { isoToItalian, normalizeText, toIsoDate } from "./normalize";
import { isMinor } from "./service";
import type { NewRow, RowUpdate, RowUpdateItem, SheetRow, SheetStore } from "./types";

export interface AssociateListRow {
  rowNumber: number;
  fingerprint: string;
  codiceSocio: string;
  nome: string;
  cognome: string;
  dataNascita: string; // GG/MM/AAAA
  luogoNascita: string;
  tipo: string;
  adultoGiovane: string;
  votante: boolean;
}

export interface LinkedPerson {
  nome: string;
  cognome: string;
}

export interface AssociateDetail {
  rowNumber: number;
  fingerprint: string;
  codiceSocio: string;
  cognome: string;
  nome: string;
  tipo: string;
  adultoGiovane: string;
  codiceFiscale: string;
  dataNascita: string; // GG/MM/AAAA
  luogoNascita: string;
  cellulare: string;
  email: string;
  dataDeliberaAmmissione: string; // GG/MM/AAAA o ""
  votante: boolean;
  presente: boolean;
  linkedTutors: LinkedPerson[];
  linkedKids: LinkedPerson[];
}

export type AssociateDetailResult =
  | { status: "ok"; detail: AssociateDetail }
  | { status: "not_found" }
  | { status: "conflict" };

export interface CascadeTutorInfo {
  rowNumber: number;
  cognome: string;
  nome: string;
  dataNascita: string; // GG/MM/AAAA
  luogoNascita: string;
}

export interface CascadeSamePersonRow {
  rowNumber: number;
  codiceSocio: string;
  tipo: string;
}

export type AssociateUpdateResult =
  | { status: "ok"; detail: AssociateDetail; updatedRowsCount: number }
  | {
      status: "confirm";
      oldCodiceSocio: string;
      newCodiceSocio: string;
      affectedTutors: CascadeTutorInfo[];
      affectedSamePersonRows: CascadeSamePersonRow[];
      propagatedFields: string[];
    }
  | { status: "duplicate"; message: string }
  | { status: "invalid"; errors: Record<string, string> }
  | { status: "not_found" }
  | { status: "conflict" };

export type AssociateDeleteResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "conflict" };

export type AssociateCreateResult =
  | { status: "ok"; createdCount: number }
  | { status: "invalid"; errors: Record<string, string> }
  | { status: "duplicate"; message: string };

const CTRL_RE = /[\x00-\x1F\x7F]/;
const LETTERS_RE = /^[\p{L}\s'’\-]+$/u;
const HAS_LETTER_RE = /\p{L}/u;
const IT_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fmtDate(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function normalizeNumericCode(code: string): string {
  const s = code.trim();
  return /^\d{1,15}$/.test(s) ? String(Number(s)) : s;
}

function sameNumericCode(a: string, b: string): boolean {
  return normalizeNumericCode(a) === normalizeNumericCode(b);
}

function samePersonIdentity(a: SheetRow, b: SheetRow): boolean {
  const n = normalizeText(a.nome);
  const c = normalizeText(a.cognome);
  const l = normalizeText(a.luogoNascita);
  return Boolean(
    n &&
      c &&
      a.dataNascita &&
      l &&
      n === normalizeText(b.nome) &&
      c === normalizeText(b.cognome) &&
      a.dataNascita === b.dataNascita &&
      l === normalizeText(b.luogoNascita),
  );
}

function rowToUpdate(r: SheetRow): RowUpdate {
  return {
    codiceSocio: r.codiceSocio,
    cognome: r.cognome,
    nome: r.nome,
    adultoGiovane: r.adultoGiovane,
    codiceFiscale: r.codiceFiscale ?? "",
    dataNascita: fmtDate(r.dataNascita),
    luogoNascita: r.luogoNascita,
    cellulare: r.cellulare ?? "",
    email: r.email,
    dataDeliberaAmmissione: fmtDate(r.dataDeliberaAmmissione),
    votante: !!r.votante,
  };
}

type PropagatableField = {
  label: string;
  changed: (base: RowUpdate, next: RowUpdate) => boolean;
  apply: (dest: RowUpdate, next: RowUpdate) => void;
};

const PROPAGATABLE_FIELDS: PropagatableField[] = [
  { label: "Cognome", changed: (b, n) => b.cognome !== n.cognome, apply: (d, n) => { d.cognome = n.cognome; } },
  { label: "Nome", changed: (b, n) => b.nome !== n.nome, apply: (d, n) => { d.nome = n.nome; } },
  { label: "Codice Fiscale", changed: (b, n) => b.codiceFiscale !== n.codiceFiscale, apply: (d, n) => { d.codiceFiscale = n.codiceFiscale; } },
  { label: "Data Nascita", changed: (b, n) => toIsoDate(b.dataNascita) !== toIsoDate(n.dataNascita), apply: (d, n) => { d.dataNascita = n.dataNascita; } },
  { label: "Comune Nascita", changed: (b, n) => b.luogoNascita !== n.luogoNascita, apply: (d, n) => { d.luogoNascita = n.luogoNascita; } },
  { label: "Cellulare", changed: (b, n) => b.cellulare !== n.cellulare, apply: (d, n) => { d.cellulare = n.cellulare; } },
  { label: "Email", changed: (b, n) => b.email !== n.email, apply: (d, n) => { d.email = n.email; } },
  {
    label: "Data Delibera Ammissione",
    changed: (b, n) => toIsoDate(b.dataDeliberaAmmissione) !== toIsoDate(n.dataDeliberaAmmissione),
    apply: (d, n) => { d.dataDeliberaAmmissione = n.dataDeliberaAmmissione; },
  },
  { label: "Votante", changed: (b, n) => b.votante !== n.votante, apply: (d, n) => { d.votante = n.votante; } },
];

/** Impronta dei campi anagrafici della riga per rilevare shift o modifiche concorrenti senza bloccarsi sulle spunte presenza. */
export function rowFingerprint(r: SheetRow): string {
  const payload = [
    r.codiceSocio,
    r.cognome,
    r.nome,
    r.tipo,
    r.adultoGiovane,
    r.codiceFiscale ?? "",
    r.dataNascita ?? "",
    r.luogoNascita,
    r.cellulare ?? "",
    r.email,
    r.dataDeliberaAmmissione ?? "",
    r.votante ? "1" : "0",
  ].join("\x1f");
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function uniqueLinked(rows: SheetRow[], target: SheetRow, wantedTipo: "TUTORE" | "SOCIO"): LinkedPerson[] {
  if (!target.codiceSocio) return [];
  const seen = new Set<string>();
  const out: LinkedPerson[] = [];
  for (const r of rows) {
    if (r.rowNumber === target.rowNumber) continue;
    if (r.codiceSocio !== target.codiceSocio) continue;
    if (normalizeText(r.tipo) !== wantedTipo) continue;
    const key = `${normalizeText(r.nome)}|${normalizeText(r.cognome)}|${r.dataNascita ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ nome: r.nome, cognome: r.cognome });
  }
  return out;
}

function toDetail(all: SheetRow[], r: SheetRow): AssociateDetail {
  const tipoNorm = normalizeText(r.tipo);
  return {
    rowNumber: r.rowNumber,
    fingerprint: rowFingerprint(r),
    codiceSocio: r.codiceSocio,
    cognome: r.cognome,
    nome: r.nome,
    tipo: r.tipo,
    adultoGiovane: r.adultoGiovane,
    codiceFiscale: r.codiceFiscale ?? "",
    dataNascita: fmtDate(r.dataNascita),
    luogoNascita: r.luogoNascita,
    cellulare: r.cellulare ?? "",
    email: r.email,
    dataDeliberaAmmissione: fmtDate(r.dataDeliberaAmmissione),
    votante: !!r.votante,
    presente: r.presente,
    linkedTutors: tipoNorm === "SOCIO" ? uniqueLinked(all, r, "TUTORE") : [],
    linkedKids: tipoNorm === "TUTORE" ? uniqueLinked(all, r, "SOCIO") : [],
  };
}

function validateLettersName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const s = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!s || s.length > 100 || !LETTERS_RE.test(s) || !HAS_LETTER_RE.test(s)) {
    return { ok: false, error: "Solo lettere (campo obbligatorio)." };
  }
  return { ok: true, value: s.toUpperCase() };
}

function validateItalianDate(
  raw: unknown,
  opts: { required: boolean; maxIso?: string },
): { ok: true; value: string } | { ok: false; error: string } {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) {
    return opts.required ? { ok: false, error: "Data obbligatoria (GG/MM/AAAA)." } : { ok: true, value: "" };
  }
  if (!IT_DATE_RE.test(s)) return { ok: false, error: "Usa il formato GG/MM/AAAA." };
  const iso = toIsoDate(s);
  if (!iso) return { ok: false, error: "Data non valida." };
  if (opts.maxIso && iso > opts.maxIso) return { ok: false, error: "La data non può essere futura." };
  return { ok: true, value: isoToItalian(iso) };
}

interface CommonFieldOpts {
  requireCodice: boolean;
  existingCodiceSocio?: string;
  existingTipo: string;
  existingAdultoGiovane?: string;
  forceTutorDefaults?: boolean;
  requireAdult?: boolean;
  uppercaseAllTexts?: boolean;
}

function validateCommonFields(
  raw: unknown,
  opts: CommonFieldOpts,
): { ok: true; data: RowUpdate } | { ok: false; errors: Record<string, string> } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const errors: Record<string, string> = {};
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");

  const codiceSocio = opts.requireCodice ? str("codiceSocio") : (opts.existingCodiceSocio ?? "");
  if (opts.requireCodice && !/^\d{1,15}$/.test(codiceSocio)) {
    errors.codiceSocio = "Solo cifre numeriche (max 15).";
  }

  const cognomeRes = validateLettersName(b.cognome);
  if (!cognomeRes.ok) errors.cognome = cognomeRes.error;

  const nomeRes = validateLettersName(b.nome);
  if (!nomeRes.ok) errors.nome = nomeRes.error;

  let adultoGiovane = "";
  if (!opts.forceTutorDefaults) {
    const isSocio = normalizeText(opts.existingTipo) === "SOCIO";
    if (!isSocio) {
      // Su Tutore (o righe non Socio) Adulto-Giovane non è modificabile
      adultoGiovane = opts.existingAdultoGiovane ?? "";
    } else {
      const agRaw = str("adultoGiovane");
      if (agRaw === "Adulto" || agRaw === "Giovane") {
        adultoGiovane = agRaw;
      } else {
        errors.adultoGiovane = "Seleziona Adulto o Giovane.";
      }
    }
  }

  const codiceFiscale = str("codiceFiscale").toUpperCase();
  if (codiceFiscale.length > 32 || CTRL_RE.test(codiceFiscale)) {
    errors.codiceFiscale = "Codice fiscale non valido (max 32 caratteri).";
  }

  const todayIso = romeTimestamp().slice(0, 10);
  const dnRes = validateItalianDate(b.dataNascita, { required: true, maxIso: todayIso });
  if (!dnRes.ok) {
    errors.dataNascita = dnRes.error;
  } else if (opts.requireAdult && isMinor(toIsoDate(dnRes.value), todayIso)) {
    errors.dataNascita = "Il tutore deve essere maggiorenne (almeno 18 anni).";
  }

  const rawLuogo = str("luogoNascita");
  const luogoNascita = opts.uppercaseAllTexts ? rawLuogo.toUpperCase() : rawLuogo;
  if (!luogoNascita || luogoNascita.length > 50 || CTRL_RE.test(luogoNascita)) {
    errors.luogoNascita = "Campo obbligatorio (max 50 caratteri).";
  }

  const rawCell = str("cellulare");
  const cellulare = opts.uppercaseAllTexts ? rawCell.toUpperCase() : rawCell;
  if (cellulare.length > 30 || CTRL_RE.test(cellulare)) {
    errors.cellulare = "Cellulare non valido (max 30 caratteri).";
  }

  const rawEmail = str("email");
  if (rawEmail && (rawEmail.length > 120 || CTRL_RE.test(rawEmail) || !EMAIL_RE.test(rawEmail))) {
    errors.email = "Email non valida.";
  }
  const email = opts.uppercaseAllTexts ? rawEmail.toUpperCase() : rawEmail;

  const delibRes = validateItalianDate(b.dataDeliberaAmmissione, { required: false });
  if (!delibRes.ok) errors.dataDeliberaAmmissione = delibRes.error;

  const votante = opts.forceTutorDefaults ? false : b.votante;
  if (!opts.forceTutorDefaults && typeof votante !== "boolean") {
    errors.votante = "Seleziona Sì o No.";
  }

  if (Object.keys(errors).length > 0 || !cognomeRes.ok || !nomeRes.ok || !dnRes.ok || !delibRes.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      codiceSocio,
      cognome: cognomeRes.value,
      nome: nomeRes.value,
      adultoGiovane,
      codiceFiscale,
      dataNascita: dnRes.value,
      luogoNascita,
      cellulare,
      email,
      dataDeliberaAmmissione: delibRes.value,
      votante: votante as boolean,
    },
  };
}

/** Valida e normalizza tutti i campi editabili dell'associato; preserva Tipo (e Codice Socio / Adulto-Giovane sui non Soci). */
export function validateAssociateUpdate(
  raw: unknown,
  existingTipo: string,
  existingAdultoGiovane = "",
  existingCodiceSocio = "",
): { ok: true; data: RowUpdate } | { ok: false; errors: Record<string, string> } {
  const isSocio = normalizeText(existingTipo) === "SOCIO";
  return validateCommonFields(raw, {
    requireCodice: isSocio,
    existingCodiceSocio,
    existingTipo,
    existingAdultoGiovane,
    uppercaseAllTexts: false,
  });
}

/** Valida e normalizza i campi per la creazione di un nuovo Socio (testi salvati in MAIUSCOLO). */
export function validateCreateSocio(
  raw: unknown,
): { ok: true; data: NewRow } | { ok: false; errors: Record<string, string> } {
  const res = validateCommonFields(raw, {
    requireCodice: true,
    existingTipo: "Socio",
    uppercaseAllTexts: true,
  });
  if (!res.ok) return res;
  return { ok: true, data: { ...res.data, tipo: "Socio" } };
}

/** Valida e normalizza i campi per la creazione di un nuovo Tutore (maggiorenne, Adulto-Giovane vuoto, Votante No). */
export function validateCreateTutor(
  raw: unknown,
): { ok: true; data: Omit<NewRow, "codiceSocio"> } | { ok: false; errors: Record<string, string> } {
  const res = validateCommonFields(raw, {
    requireCodice: false,
    existingTipo: "Tutore",
    forceTutorDefaults: true,
    requireAdult: true,
    uppercaseAllTexts: true,
  });
  if (!res.ok) return res;
  return {
    ok: true,
    data: {
      cognome: res.data.cognome,
      nome: res.data.nome,
      tipo: "Tutore",
      adultoGiovane: "",
      codiceFiscale: res.data.codiceFiscale,
      dataNascita: res.data.dataNascita,
      luogoNascita: res.data.luogoNascita,
      cellulare: res.data.cellulare,
      email: res.data.email,
      dataDeliberaAmmissione: res.data.dataDeliberaAmmissione,
      votante: false,
    },
  };
}

export function parseRowRef(raw: unknown): { rowNumber: number; fingerprint: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const rowNumber = typeof b.rowNumber === "number" ? b.rowNumber : NaN;
  const fingerprint = typeof b.fingerprint === "string" ? b.fingerprint.trim() : "";
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || !fingerprint || fingerprint.length > 64) return null;
  return { rowNumber, fingerprint };
}

/** Elenco base per la tabella Gestisci Associati (senza CF, cellulare, email, delibera, ID, IP). */
export async function listAssociates(
  store: SheetStore,
): Promise<{ rows: AssociateListRow[]; aggiornato: string; registrationsClosed: boolean }> {
  const [sheetRows, registrationsClosed] = await Promise.all([store.getRows(), store.getRegistrationsClosed()]);
  const rows: AssociateListRow[] = sheetRows.map((r) => ({
    rowNumber: r.rowNumber,
    fingerprint: rowFingerprint(r),
    codiceSocio: r.codiceSocio,
    nome: r.nome,
    cognome: r.cognome,
    dataNascita: fmtDate(r.dataNascita),
    luogoNascita: r.luogoNascita,
    tipo: r.tipo,
    adultoGiovane: r.adultoGiovane,
    votante: !!r.votante,
  }));
  return { rows, aggiornato: new Date().toISOString(), registrationsClosed };
}

export async function getAssociateDetail(
  store: SheetStore,
  rowNumber: number,
  fingerprint: string,
): Promise<AssociateDetailResult> {
  const all = await store.getRows();
  const target = all.find((r) => r.rowNumber === rowNumber);
  if (!target) return { status: "not_found" };
  if (rowFingerprint(target) !== fingerprint) return { status: "conflict" };
  return { status: "ok", detail: toDetail(all, target) };
}

export async function updateAssociate(
  store: SheetStore,
  rowNumber: number,
  fingerprint: string,
  rawData: unknown,
  confirmCascade = false,
): Promise<AssociateUpdateResult> {
  const all = await store.getRows();
  const target = all.find((r) => r.rowNumber === rowNumber);
  if (!target) return { status: "not_found" };
  if (rowFingerprint(target) !== fingerprint) return { status: "conflict" };

  const parsed = validateAssociateUpdate(rawData, target.tipo, target.adultoGiovane, target.codiceSocio);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors };

  const newCode = normalizeNumericCode(parsed.data.codiceSocio);
  const oldCode = normalizeNumericCode(target.codiceSocio);
  const codeChanged = !sameNumericCode(oldCode, newCode);
  const targetTipoNorm = normalizeText(target.tipo);

  if (codeChanged) {
    if (targetTipoNorm === "SOCIO") {
      const dupSocio = all.some(
        (r) =>
          r.rowNumber !== target.rowNumber &&
          normalizeText(r.tipo) === "SOCIO" &&
          sameNumericCode(r.codiceSocio, newCode),
      );
      if (dupSocio) {
        return { status: "duplicate", message: `Esiste già un Socio con Codice Socio ${newCode}.` };
      }
    } else if (targetTipoNorm === "TUTORE") {
      const newIso = toIsoDate(parsed.data.dataNascita);
      const newNomeNorm = normalizeText(parsed.data.nome);
      const newCognomeNorm = normalizeText(parsed.data.cognome);
      const newLuogoNorm = normalizeText(parsed.data.luogoNascita);
      const dupTutor = all.some(
        (r) =>
          r.rowNumber !== target.rowNumber &&
          normalizeText(r.tipo) === "TUTORE" &&
          sameNumericCode(r.codiceSocio, newCode) &&
          r.dataNascita === newIso &&
          normalizeText(r.nome) === newNomeNorm &&
          normalizeText(r.cognome) === newCognomeNorm &&
          normalizeText(r.luogoNascita) === newLuogoNorm,
      );
      if (dupTutor) {
        return { status: "duplicate", message: `Questo tutore risulta già associato al Codice Socio ${newCode}.` };
      }
    }
  }

  const linkedTutorRows =
    targetTipoNorm === "SOCIO" && codeChanged && oldCode
      ? all.filter(
          (r) =>
            r.rowNumber !== target.rowNumber &&
            normalizeText(r.tipo) === "TUTORE" &&
            sameNumericCode(r.codiceSocio, oldCode),
        )
      : [];

  const affectedTutors: CascadeTutorInfo[] = linkedTutorRows.map((r) => ({
    rowNumber: r.rowNumber,
    cognome: r.cognome,
    nome: r.nome,
    dataNascita: fmtDate(r.dataNascita),
    luogoNascita: r.luogoNascita,
  }));

  const nextTarget: RowUpdate = { ...parsed.data, codiceSocio: newCode };
  const baseTarget = rowToUpdate(target);
  const changedFields = PROPAGATABLE_FIELDS.filter((f) => f.changed(baseTarget, nextTarget));
  const samePersonRows =
    changedFields.length > 0 ? all.filter((r) => r.rowNumber !== target.rowNumber && samePersonIdentity(r, target)) : [];
  const affectedSamePersonRows: CascadeSamePersonRow[] =
    samePersonRows.length > 0
      ? samePersonRows.map((r) => ({ rowNumber: r.rowNumber, codiceSocio: r.codiceSocio, tipo: r.tipo }))
      : [];
  const propagatedFields = samePersonRows.length > 0 ? changedFields.map((f) => f.label) : [];

  if (!confirmCascade && (affectedTutors.length > 0 || affectedSamePersonRows.length > 0)) {
    return {
      status: "confirm",
      oldCodiceSocio: oldCode,
      newCodiceSocio: newCode,
      affectedTutors,
      affectedSamePersonRows,
      propagatedFields,
    };
  }

  const updatesMap = new Map<number, RowUpdate>();
  const ensureEntry = (r: SheetRow): RowUpdate => {
    let entry = updatesMap.get(r.rowNumber);
    if (!entry) {
      entry = rowToUpdate(r);
      updatesMap.set(r.rowNumber, entry);
    }
    return entry;
  };

  updatesMap.set(target.rowNumber, nextTarget);
  for (const t of linkedTutorRows) {
    ensureEntry(t).codiceSocio = newCode;
  }
  for (const s of samePersonRows) {
    const entry = ensureEntry(s);
    for (const f of changedFields) f.apply(entry, nextTarget);
  }

  const updatesList: RowUpdateItem[] = [...updatesMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rn, data]) => ({ rowNumber: rn, data }));

  await store.updateRows(updatesList);
  const refreshed = await store.getRows();
  const updated = refreshed.find((r) => r.rowNumber === rowNumber);
  if (!updated) return { status: "not_found" };
  return { status: "ok", detail: toDetail(refreshed, updated), updatedRowsCount: updatesList.length };
}

export async function deleteAssociate(
  store: SheetStore,
  rowNumber: number,
  fingerprint: string,
): Promise<AssociateDeleteResult> {
  const all = await store.getRows();
  const target = all.find((r) => r.rowNumber === rowNumber);
  if (!target) return { status: "not_found" };
  if (rowFingerprint(target) !== fingerprint) return { status: "conflict" };

  await store.deleteRow(rowNumber);
  return { status: "ok" };
}

export async function createSocio(store: SheetStore, rawData: unknown): Promise<AssociateCreateResult> {
  const parsed = validateCreateSocio(rawData);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors };

  const all = await store.getRows();
  const exists = all.some(
    (r) => normalizeText(r.tipo) === "SOCIO" && sameNumericCode(r.codiceSocio, parsed.data.codiceSocio),
  );
  if (exists) {
    return {
      status: "duplicate",
      message: `Esiste già un Socio con Codice Socio ${normalizeNumericCode(parsed.data.codiceSocio)}.`,
    };
  }

  await store.appendRows([parsed.data]);
  return { status: "ok", createdCount: 1 };
}

function parseCodiciSocio(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const s = item.trim();
    if (!/^\d{1,15}$/.test(s)) return null;
    out.add(s);
  }
  return out.size > 0 ? [...out] : null;
}

export async function createTutor(
  store: SheetStore,
  rawCodici: unknown,
  rawData: unknown,
): Promise<AssociateCreateResult> {
  const codiciSocio = parseCodiciSocio(rawCodici);
  const parsed = validateCreateTutor(rawData);

  if (!codiciSocio || !parsed.ok) {
    const errors: Record<string, string> = parsed.ok ? {} : { ...parsed.errors };
    if (!codiciSocio) errors.codiciSocio = "Seleziona almeno un ragazzo seguito.";
    return { status: "invalid", errors };
  }

  const all = await store.getRows();
  const validYouthCodes = new Set(
    all
      .filter((r) => normalizeText(r.tipo) === "SOCIO" && normalizeText(r.adultoGiovane) === "GIOVANE")
      .map((r) => r.codiceSocio.trim())
      .filter(Boolean),
  );
  if (codiciSocio.some((c) => !validYouthCodes.has(c))) {
    return { status: "invalid", errors: { codiciSocio: "Uno o più ragazzi selezionati non risultano più validi in elenco." } };
  }

  const tutorIso = toIsoDate(parsed.data.dataNascita);
  const nomeNorm = normalizeText(parsed.data.nome);
  const cognomeNorm = normalizeText(parsed.data.cognome);
  const luogoNorm = normalizeText(parsed.data.luogoNascita);
  const dupCodes = codiciSocio.filter((code) =>
    all.some(
      (r) =>
        r.codiceSocio.trim() === code &&
        normalizeText(r.tipo) === "TUTORE" &&
        normalizeText(r.nome) === nomeNorm &&
        normalizeText(r.cognome) === cognomeNorm &&
        r.dataNascita === tutorIso &&
        normalizeText(r.luogoNascita) === luogoNorm,
    ),
  );
  if (dupCodes.length > 0) {
    return {
      status: "duplicate",
      message: `Questo tutore risulta già associato al Codice Socio ${dupCodes.join(", ")}.`,
    };
  }

  const newRows: NewRow[] = codiciSocio.map((codiceSocio) => ({ ...parsed.data, codiceSocio }));
  await store.appendRows(newRows);
  return { status: "ok", createdCount: newRows.length };
}
