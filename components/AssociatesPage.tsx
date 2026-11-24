"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DatePickerButton from "./DatePickerButton";
import { APP_VERSION } from "../lib/version";

type Row = {
  rowNumber: number;
  fingerprint: string;
  codiceSocio: string;
  nome: string;
  cognome: string;
  dataNascita: string;
  luogoNascita: string;
  tipo: string;
  adultoGiovane: string;
  votante: boolean;
};

type LinkedPerson = { nome: string; cognome: string };

type Detail = {
  rowNumber: number;
  fingerprint: string;
  codiceSocio: string;
  cognome: string;
  nome: string;
  tipo: string;
  adultoGiovane: string;
  codiceFiscale: string;
  dataNascita: string;
  luogoNascita: string;
  cellulare: string;
  email: string;
  dataDeliberaAmmissione: string;
  votante: boolean;
  presente: boolean;
  linkedTutors: LinkedPerson[];
  linkedKids: LinkedPerson[];
};

type PersonFormFields = {
  codiceSocio: string;
  cognome: string;
  nome: string;
  tipo: string;
  adultoGiovane: string;
  codiceFiscale: string;
  dataNascita: string;
  luogoNascita: string;
  cellulare: string;
  email: string;
  dataDeliberaAmmissione: string;
  votante: boolean;
};

type EditFormState = PersonFormFields & {
  rowNumber: number;
  fingerprint: string;
};

type EditConfirmInfo = {
  oldCodiceSocio: string;
  newCodiceSocio: string;
  affectedTutors: { rowNumber: number; cognome: string; nome: string; dataNascita: string; luogoNascita: string }[];
  affectedSamePersonRows: { rowNumber: number; codiceSocio: string; tipo: string }[];
  propagatedFields: string[];
};

type FormMode = "edit" | "createSocio" | "createTutor";
type SortKey = "codiceSocio" | "nome" | "cognome" | "dataNascita" | "luogoNascita" | "tipo" | "votante";
type Sort = { key: SortKey; dir: 1 | -1 };

type Modal =
  | { m: "view"; detail: Detail }
  | { m: "edit"; form: EditFormState; confirm?: EditConfirmInfo | null }
  | { m: "delete"; detail: Detail }
  | { m: "createSocio"; form: PersonFormFields }
  | {
      m: "createTutor";
      search: string;
      selectedRowNumbers: number[];
      adultSearch: string;
      selectedAdultRow: number | null;
      form: PersonFormFields;
    }
  | { m: "ko"; message: string };

const COLS: { key: SortKey; label: string }[] = [
  { key: "codiceSocio", label: "Codice socio" },
  { key: "nome", label: "Nome" },
  { key: "cognome", label: "Cognome" },
  { key: "dataNascita", label: "Data di nascita" },
  { key: "luogoNascita", label: "Comune di nascita" },
  { key: "tipo", label: "Titolo" },
  { key: "votante", label: "Votante" },
];

const emptyForm = (tipo: "Socio" | "Tutore"): PersonFormFields => ({
  codiceSocio: "",
  cognome: "",
  nome: "",
  tipo,
  adultoGiovane: "",
  codiceFiscale: "",
  dataNascita: "",
  luogoNascita: "",
  cellulare: "",
  email: "",
  dataDeliberaAmmissione: "",
  votante: false,
});

const collator = new Intl.Collator("it", { numeric: true, sensitivity: "base" });
const dateKey = (d: string) => d.split("/").reverse().join("");

function cmp(a: Row, b: Row, key: SortKey): number {
  if (key === "votante") return Number(a.votante) - Number(b.votante);
  if (key === "dataNascita") return dateKey(a.dataNascita).localeCompare(dateKey(b.dataNascita));
  return collator.compare(a[key], b[key]);
}

const normKey = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");

/** Estrae l'elenco deduplicato di Soci Adulti e Tutori già presenti per precompilare un nuovo Tutore. */
export function extractExistingAdults(rows: Row[]): { row: Row; roleLabel: string }[] {
  const byPerson = new Map<string, { row: Row; roles: Set<string> }>();
  for (const r of rows) {
    const tipoUp = r.tipo.trim().toUpperCase();
    const agUp = r.adultoGiovane.trim().toUpperCase();
    let role: string | null = null;
    if (tipoUp === "TUTORE") role = "Tutore";
    else if (tipoUp === "SOCIO" && agUp === "ADULTO") role = "Socio Adulto";
    if (!role) continue;

    const key = [normKey(r.cognome), normKey(r.nome), r.dataNascita.trim(), normKey(r.luogoNascita)].join("|");
    const existing = byPerson.get(key);
    if (!existing) {
      byPerson.set(key, { row: r, roles: new Set([role]) });
    } else {
      existing.roles.add(role);
      if (tipoUp === "SOCIO" && existing.row.tipo.trim().toUpperCase() !== "SOCIO") {
        existing.row = r;
      }
    }
  }

  return [...byPerson.values()]
    .map(({ row, roles }) => ({
      row,
      roleLabel: ["Socio Adulto", "Tutore"].filter((x) => roles.has(x)).join(" / "),
    }))
    .sort(
      (a, b) =>
        collator.compare(a.row.cognome, b.row.cognome) ||
        collator.compare(a.row.nome, b.row.nome) ||
        dateKey(a.row.dataNascita).localeCompare(dateKey(b.row.dataNascita)),
    );
}

const DEFAULT_ORDER: Sort[] = [
  { key: "codiceSocio", dir: 1 },
  { key: "tipo", dir: 1 },
  { key: "cognome", dir: 1 },
  { key: "nome", dir: 1 },
];

const LETTERS_RE = /^[\p{L}\s'’\-]+$/u;
const HAS_LETTER_RE = /\p{L}/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validItDate(s: string, noFuture = false): boolean {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const [d, mo, y] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return false;
  if (!noFuture) return true;
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return dt.getTime() <= todayUtc;
}

function isMinorIt(birthIt: string): boolean {
  const m = birthIt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const [d, mo, y] = [+m[1], +m[2], +m[3]];
  const now = new Date();
  const eighteenth = Date.UTC(y + 18, mo - 1, d);
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return todayUtc < eighteenth;
}

function maskDate(v: string): string {
  const digits = v.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
}

function toPickerIso(d: string): string {
  return validItDate(d, false) ? d.split("/").reverse().join("-") : "";
}

function validateFormClient(
  f: PersonFormFields,
  opts: { requireCodice: boolean; requireAdult: boolean },
): Record<string, string> {
  const errors: Record<string, string> = {};
  const isSocio = f.tipo.trim().toUpperCase() === "SOCIO";
  if (opts.requireCodice && isSocio && !/^\d{1,15}$/.test(f.codiceSocio.trim())) {
    errors.codiceSocio = "Solo cifre numeriche (max 15).";
  }

  const cognome = f.cognome.trim().replace(/\s+/g, " ");
  if (!cognome || cognome.length > 100 || !LETTERS_RE.test(cognome) || !HAS_LETTER_RE.test(cognome)) {
    errors.cognome = "Solo lettere (campo obbligatorio).";
  }

  const nome = f.nome.trim().replace(/\s+/g, " ");
  if (!nome || nome.length > 100 || !LETTERS_RE.test(nome) || !HAS_LETTER_RE.test(nome)) {
    errors.nome = "Solo lettere (campo obbligatorio).";
  }

  if (isSocio && f.adultoGiovane !== "Adulto" && f.adultoGiovane !== "Giovane") {
    errors.adultoGiovane = "Seleziona Adulto o Giovane.";
  }

  const dn = f.dataNascita.trim();
  if (!dn) errors.dataNascita = "Data obbligatoria (GG/MM/AAAA).";
  else if (!validItDate(dn, true)) errors.dataNascita = "Data non valida o futura (GG/MM/AAAA).";
  else if (opts.requireAdult && isMinorIt(dn)) errors.dataNascita = "Il tutore deve essere maggiorenne (almeno 18 anni).";

  const luogo = f.luogoNascita.trim();
  if (!luogo || luogo.length > 50) errors.luogoNascita = "Campo obbligatorio (max 50 caratteri).";

  const email = f.email.trim();
  if (email && !EMAIL_RE.test(email)) errors.email = "Email non valida.";

  const delib = f.dataDeliberaAmmissione.trim();
  if (delib && !validItDate(delib, false)) errors.dataDeliberaAmmissione = "Usa il formato GG/MM/AAAA.";

  return errors;
}

function buildPayload(f: PersonFormFields, uppercaseAll: boolean) {
  const norm = (s: string) => (uppercaseAll ? s.trim().toUpperCase() : s.trim());
  return {
    codiceSocio: f.codiceSocio.trim(),
    cognome: f.cognome.trim().replace(/\s+/g, " ").toUpperCase(),
    nome: f.nome.trim().replace(/\s+/g, " ").toUpperCase(),
    adultoGiovane: f.adultoGiovane,
    codiceFiscale: f.codiceFiscale.trim().toUpperCase(),
    dataNascita: f.dataNascita.trim(),
    luogoNascita: norm(f.luogoNascita),
    cellulare: norm(f.cellulare),
    email: norm(f.email),
    dataDeliberaAmmissione: f.dataDeliberaAmmissione.trim(),
    votante: f.votante,
  };
}

export default function AssociatesPage({ code, onBack }: { code: string; onBack: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [err, setErr] = useState("");
  const [updated, setUpdated] = useState("");
  const [sort, setSort] = useState<Sort | null>(null);
  const [filters, setFilters] = useState<Partial<Record<SortKey, string>>>({});
  const [modal, setModal] = useState<Modal | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitErr, setSubmitErr] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const alive = useRef(true);

  const loadAssociates = useCallback(async () => {
    const mySeq = ++seq.current;
    try {
      const res = await fetch("/api/associates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Errore");
      if (alive.current && mySeq === seq.current) {
        setRows(data.rows);
        setClosed(!!data.registrationsClosed);
        setUpdated(new Date(data.aggiornato).toLocaleTimeString("it-IT"));
        setErr("");
      }
    } catch (e) {
      if (alive.current && mySeq === seq.current) setErr((e as Error).message);
    }
  }, [code]);

  useEffect(() => {
    alive.current = true;
    loadAssociates();
    const t = setInterval(loadAssociates, 10000);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [loadAssociates]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const f = COLS.filter((c) => c.key !== "votante" && (filters[c.key] ?? "").trim() !== "");
    const out = rows.filter((r) => {
      if (filters.votante === "1" && !r.votante) return false;
      if (filters.votante === "0" && r.votante) return false;
      return f.every((c) => String(r[c.key]).toLowerCase().includes((filters[c.key] ?? "").trim().toLowerCase()));
    });
    const order = sort ? [sort] : DEFAULT_ORDER;
    return out.sort((a, b) => {
      for (const o of order) {
        const c = cmp(a, b, o.key) * o.dir;
        if (c) return c;
      }
      return 0;
    });
  }, [rows, filters, sort]);

  const youngSoci = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((r) => r.tipo.trim().toUpperCase() === "SOCIO" && r.adultoGiovane.trim().toUpperCase() === "GIOVANE")
      .sort(
        (a, b) =>
          collator.compare(a.cognome, b.cognome) ||
          collator.compare(a.nome, b.nome) ||
          collator.compare(a.codiceSocio, b.codiceSocio),
      );
  }, [rows]);

  const selectedYouthCodes = useMemo(() => {
    if (modal?.m !== "createTutor") return [];
    const selectedSet = new Set(modal.selectedRowNumbers);
    return [...new Set(youngSoci.filter((y) => selectedSet.has(y.rowNumber)).map((y) => y.codiceSocio).filter(Boolean))];
  }, [modal, youngSoci]);

  const filteredYouth = useMemo(() => {
    if (modal?.m !== "createTutor") return [];
    const q = modal.search.trim().toLowerCase();
    if (!q) return youngSoci;
    return youngSoci.filter((y) =>
      `${y.codiceSocio} ${y.cognome} ${y.nome} ${y.dataNascita}`.toLowerCase().includes(q),
    );
  }, [modal, youngSoci]);

  const existingAdults = useMemo(() => extractExistingAdults(rows ?? []), [rows]);

  const filteredAdults = useMemo(() => {
    if (modal?.m !== "createTutor") return [];
    const q = modal.adultSearch.trim().toLowerCase();
    if (!q) return existingAdults;
    return existingAdults.filter(({ row: r }) =>
      `${r.codiceSocio} ${r.cognome} ${r.nome} ${r.dataNascita}`.toLowerCase().includes(q),
    );
  }, [modal, existingAdults]);

  const selectedAdultItem = useMemo(() => {
    if (modal?.m !== "createTutor" || modal.selectedAdultRow === null) return null;
    return existingAdults.find((a) => a.row.rowNumber === modal.selectedAdultRow) ?? null;
  }, [modal, existingAdults]);

  async function adminPost(path: string, body: Record<string, unknown>) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, accessCode: code }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  function resetFormUi() {
    setFieldErrors({});
    setSubmitErr("");
    setTouched(false);
  }

  async function openAction(r: Row, action: "view" | "edit" | "delete") {
    if (busy || modal) return;
    setBusy(true);
    try {
      const res = await adminPost("/api/associates/detail", { rowNumber: r.rowNumber, fingerprint: r.fingerprint });
      if (!res.ok) {
        if (res.status === 409 || res.status === 404) await loadAssociates();
        setModal({ m: "ko", message: res.data.error || "Operazione non riuscita." });
        return;
      }
      const d = res.data.detail as Detail;
      if (action === "view") {
        setModal({ m: "view", detail: d });
      } else if (action === "delete") {
        setModal({ m: "delete", detail: d });
      } else {
        resetFormUi();
        setModal({
          m: "edit",
          form: {
            rowNumber: d.rowNumber,
            fingerprint: d.fingerprint,
            codiceSocio: d.codiceSocio,
            cognome: d.cognome,
            nome: d.nome,
            tipo: d.tipo,
            adultoGiovane: d.adultoGiovane,
            codiceFiscale: d.codiceFiscale,
            dataNascita: d.dataNascita,
            luogoNascita: d.luogoNascita,
            cellulare: d.cellulare,
            email: d.email,
            dataDeliberaAmmissione: d.dataDeliberaAmmissione,
            votante: d.votante,
          },
        });
      }
    } catch (e) {
      setModal({ m: "ko", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(confirmCascade: boolean) {
    if (modal?.m !== "edit" || busy) return;
    const f = modal.form;
    setTouched(true);
    setSubmitErr("");
    const localErrors = validateFormClient(f, { requireCodice: true, requireAdult: false });
    setFieldErrors(localErrors);
    if (Object.keys(localErrors).length > 0) return;

    setBusy(true);
    try {
      const res = await adminPost("/api/associates/update", {
        rowNumber: f.rowNumber,
        fingerprint: f.fingerprint,
        data: buildPayload(f, false),
        confirmCascade,
      });
      if (!res.ok) {
        if (res.status === 400 && res.data.errors) {
          setFieldErrors(res.data.errors);
          setModal((m) => (m?.m === "edit" ? { ...m, confirm: null } : m));
          return;
        }
        if (res.status === 409 && res.data.status === "duplicate") {
          setSubmitErr(res.data.error || "Codice Socio già esistente.");
          setModal((m) => (m?.m === "edit" ? { ...m, confirm: null } : m));
          return;
        }
        if (res.status === 409 || res.status === 404) await loadAssociates();
        setModal({ m: "ko", message: res.data.error || "Errore durante il salvataggio." });
        return;
      }
      if (res.data.status === "confirm") {
        setModal((m) => (m?.m === "edit" ? { ...m, confirm: res.data as EditConfirmInfo } : m));
        return;
      }
      setModal(null);
      await loadAssociates();
    } catch (err2) {
      setModal({ m: "ko", message: (err2 as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    await submitEdit(false);
  }

  async function onSaveCreateSocio(e: React.FormEvent) {
    e.preventDefault();
    if (modal?.m !== "createSocio" || busy) return;
    setTouched(true);
    setSubmitErr("");
    const localErrors = validateFormClient(modal.form, { requireCodice: true, requireAdult: false });
    setFieldErrors(localErrors);
    if (Object.keys(localErrors).length > 0) return;

    setBusy(true);
    try {
      const res = await adminPost("/api/associates/create", {
        kind: "socio",
        data: buildPayload(modal.form, true),
      });
      if (!res.ok) {
        if (res.status === 400 && res.data.errors) {
          setFieldErrors(res.data.errors);
          return;
        }
        setSubmitErr(res.data.error || "Errore durante l'inserimento.");
        return;
      }
      setModal(null);
      await loadAssociates();
    } catch (err2) {
      setSubmitErr((err2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveCreateTutor(e: React.FormEvent) {
    e.preventDefault();
    if (modal?.m !== "createTutor" || busy) return;
    setTouched(true);
    setSubmitErr("");
    const localErrors = validateFormClient(modal.form, { requireCodice: false, requireAdult: true });
    if (selectedYouthCodes.length === 0) localErrors.codiciSocio = "Seleziona almeno un ragazzo seguito.";
    setFieldErrors(localErrors);
    if (Object.keys(localErrors).length > 0) return;

    setBusy(true);
    try {
      const res = await adminPost("/api/associates/create", {
        kind: "tutor",
        codiciSocio: selectedYouthCodes,
        data: buildPayload(modal.form, true),
      });
      if (!res.ok) {
        if (res.status === 400 && res.data.errors) {
          setFieldErrors(res.data.errors);
          return;
        }
        setSubmitErr(res.data.error || "Errore durante l'inserimento.");
        return;
      }
      setModal(null);
      await loadAssociates();
    } catch (err2) {
      setSubmitErr((err2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmDelete(detail: Detail) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await adminPost("/api/associates/delete", {
        rowNumber: detail.rowNumber,
        fingerprint: detail.fingerprint,
      });
      if (!res.ok) {
        if (res.status === 409 || res.status === 404) await loadAssociates();
        setModal({ m: "ko", message: res.data.error || "Errore durante l'eliminazione." });
        return;
      }
      setModal(null);
      await loadAssociates();
    } catch (e) {
      setModal({ m: "ko", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const updateFormField = <K extends keyof PersonFormFields>(key: K, val: PersonFormFields[K]) => {
    setModal((m) => {
      if (!m) return m;
      switch (m.m) {
        case "edit":
          return { ...m, form: { ...m.form, [key]: val } };
        case "createSocio":
          return { ...m, form: { ...m.form, [key]: val } };
        case "createTutor":
          return { ...m, form: { ...m.form, [key]: val } };
        default:
          return m;
      }
    });
    setSubmitErr("");
    setFieldErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  function toggleYouthRow(rowNumber: number) {
    setModal((m) => {
      if (m?.m !== "createTutor") return m;
      const exists = m.selectedRowNumbers.includes(rowNumber);
      const next = exists ? m.selectedRowNumbers.filter((x) => x !== rowNumber) : [...m.selectedRowNumbers, rowNumber];
      return { ...m, selectedRowNumbers: next };
    });
    setSubmitErr("");
    setFieldErrors((prev) => {
      if (!prev.codiciSocio) return prev;
      const next = { ...prev };
      delete next.codiciSocio;
      return next;
    });
  }

  function clearAdultPrefillFeedback() {
    setSubmitErr("");
    setFieldErrors((prev): Record<string, string> => (prev.codiciSocio ? { codiciSocio: prev.codiciSocio } : {}));
    setTouched(false);
  }

  async function onSelectExistingAdult(row: Row) {
    if (modal?.m !== "createTutor" || busy) return;
    clearAdultPrefillFeedback();
    setModal((m) => (m?.m === "createTutor" ? { ...m, selectedAdultRow: row.rowNumber } : m));
    setBusy(true);
    try {
      const res = await adminPost("/api/associates/detail", { rowNumber: row.rowNumber, fingerprint: row.fingerprint });
      if (!res.ok) {
        if (res.status === 409 || res.status === 404) await loadAssociates();
        setSubmitErr(res.data.error || "Impossibile caricare i dati del nominativo.");
        setModal((m) => (m?.m === "createTutor" ? { ...m, selectedAdultRow: null } : m));
        return;
      }
      const d = res.data.detail as Detail;
      setModal((m) =>
        m?.m === "createTutor"
          ? {
              ...m,
              selectedAdultRow: row.rowNumber,
              form: {
                ...emptyForm("Tutore"),
                cognome: d.cognome,
                nome: d.nome,
                codiceFiscale: d.codiceFiscale,
                dataNascita: d.dataNascita,
                luogoNascita: d.luogoNascita,
                cellulare: d.cellulare,
                email: d.email,
                dataDeliberaAmmissione: d.dataDeliberaAmmissione,
              },
            }
          : m,
      );
    } catch (e) {
      setSubmitErr((e as Error).message);
      setModal((m) => (m?.m === "createTutor" ? { ...m, selectedAdultRow: null } : m));
    } finally {
      setBusy(false);
    }
  }

  function onClearExistingAdult() {
    clearAdultPrefillFeedback();
    setModal((m) => (m?.m === "createTutor" ? { ...m, selectedAdultRow: null, form: emptyForm("Tutore") } : m));
  }

  const toggle = (key: SortKey, dir: 1 | -1) => setSort((s) => (s && s.key === key && s.dir === dir ? null : { key, dir }));
  const setFilter = (key: SortKey, v: string) => setFilters((f) => ({ ...f, [key]: v }));

  const activeErrors = useMemo(() => {
    if (!modal || (modal.m !== "edit" && modal.m !== "createSocio" && modal.m !== "createTutor") || !touched) {
      return fieldErrors;
    }
    const local = validateFormClient(modal.form, {
      requireCodice: modal.m !== "createTutor",
      requireAdult: modal.m === "createTutor",
    });
    if (modal.m === "createTutor" && selectedYouthCodes.length === 0) {
      local.codiciSocio = "Seleziona almeno un ragazzo seguito.";
    }
    return { ...local, ...fieldErrors };
  }, [modal, touched, fieldErrors, selectedYouthCodes.length]);

  return (
    <>
      <main className={`report${modal ? " blur" : ""}`}>
        <span className="versionBadge" title="Versione app">{APP_VERSION}</span>
        <h1>Gestisci Associati</h1>
        <div className="reportBar">
          <p className="sub">
            {rows ? `${shown.length} di ${rows.length} associati` : ""} · aggiornato ogni 10 s{updated ? ` (ore ${updated})` : ""}
            {closed ? " · registrazioni chiuse" : ""}
          </p>
          <button className="btn btnSmall" onClick={onBack}>Torna alle statistiche</button>
        </div>
        <div className="assocToolbar">
          <button
            type="button"
            className="btn btnSmall okBtn"
            disabled={busy || modal !== null || !rows}
            onClick={() => {
              resetFormUi();
              setModal({ m: "createSocio", form: emptyForm("Socio") });
            }}
          >
            Aggiungi Socio
          </button>
          <button
            type="button"
            className="btn btnSmall okBtn"
            disabled={busy || modal !== null || !rows}
            onClick={() => {
              resetFormUi();
              setModal({
                m: "createTutor",
                search: "",
                selectedRowNumbers: [],
                adultSearch: "",
                selectedAdultRow: null,
                form: emptyForm("Tutore"),
              });
            }}
          >
            Aggiungi Tutore
          </button>
        </div>
        {err && <p className="sub" style={{ color: "#fca5a5" }}>{err}</p>}
        {!rows && !err && <div className="spinner" role="status" aria-label="Caricamento" />}
        {rows && (
          <div className="tableWrap">
            <table className="reportTable">
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key}>
                      <div className="th">
                        <span>{c.label}</span>
                        <span className="arrows">
                          <button type="button" aria-label={`${c.label} crescente`} className={sort?.key === c.key && sort.dir === 1 ? "on" : ""} onClick={() => toggle(c.key, 1)}>▲</button>
                          <button type="button" aria-label={`${c.label} decrescente`} className={sort?.key === c.key && sort.dir === -1 ? "on" : ""} onClick={() => toggle(c.key, -1)}>▼</button>
                        </span>
                      </div>
                    </th>
                  ))}
                  <th><div className="th"><span>Azioni</span></div></th>
                </tr>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key}>
                      {c.key === "votante" ? (
                        <select value={filters.votante ?? ""} onChange={(e) => setFilter("votante", e.target.value)} aria-label="Filtro votante">
                          <option value="">Tutti</option>
                          <option value="1">Sì</option>
                          <option value="0">No</option>
                        </select>
                      ) : (
                        <input value={filters[c.key] ?? ""} onChange={(e) => setFilter(c.key, e.target.value)} placeholder="Filtra…" aria-label={`Filtro ${c.label}`} />
                      )}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={`${r.rowNumber}-${r.fingerprint}`}>
                    <td>{r.codiceSocio}</td>
                    <td>{r.nome}</td>
                    <td>{r.cognome}</td>
                    <td>{r.dataNascita}</td>
                    <td>{r.luogoNascita}</td>
                    <td>{r.tipo}</td>
                    <td>{r.votante ? "Sì" : "No"}</td>
                    <td className="actionsCell">
                      <span className="actionsWrap">
                        <button
                          type="button"
                          className="iconBtn view"
                          disabled={busy || modal !== null}
                          title="Visualizza dettaglio"
                          aria-label={`Visualizza ${r.nome} ${r.cognome}`}
                          onClick={() => openAction(r, "view")}
                        >
                          <ViewIcon />
                        </button>
                        <button
                          type="button"
                          className="iconBtn edit"
                          disabled={busy || modal !== null}
                          title="Modifica nominativo"
                          aria-label={`Modifica ${r.nome} ${r.cognome}`}
                          onClick={() => openAction(r, "edit")}
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          className="iconBtn del"
                          disabled={busy || modal !== null}
                          title="Elimina nominativo"
                          aria-label={`Elimina ${r.nome} ${r.cognome}`}
                          onClick={() => openAction(r, "delete")}
                        >
                          <TrashIcon />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={COLS.length + 1} className="empty">Nessun risultato</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {modal?.m === "view" && (
        <div className="overlay"><div className="card summaryCard">
          <h2>Dettaglio Associato</h2>
          <dl>
            <dt>Codice Socio</dt><dd>{modal.detail.codiceSocio || "—"}</dd>
            <dt>Cognome</dt><dd>{modal.detail.cognome || "—"}</dd>
            <dt>Nome</dt><dd>{modal.detail.nome || "—"}</dd>
            <dt>Tipo</dt><dd>{modal.detail.tipo || "—"}</dd>
            <dt>Adulto-Giovane</dt><dd>{modal.detail.adultoGiovane || "—"}</dd>
            <dt>Codice Fiscale</dt><dd>{modal.detail.codiceFiscale || "—"}</dd>
            <dt>Data Nascita</dt><dd>{modal.detail.dataNascita || "—"}</dd>
            <dt>Comune Nascita</dt><dd>{modal.detail.luogoNascita || "—"}</dd>
            <dt>Cellulare</dt><dd>{modal.detail.cellulare || "—"}</dd>
            <dt>Email</dt><dd>{modal.detail.email || "—"}</dd>
            <dt>Data Delibera Ammissione</dt><dd>{modal.detail.dataDeliberaAmmissione || "—"}</dd>
            <dt>Votante</dt><dd>{modal.detail.votante ? "Sì" : "No"}</dd>
          </dl>
          <div className="actions">
            <button className="btn" onClick={() => setModal(null)}>Chiudi</button>
          </div>
        </div></div>
      )}

      {modal?.m === "edit" && (
        modal.confirm ? (
          <div className="overlay"><div className="card summaryCard">
            <h2>Conferma aggiornamento collegato</h2>
            {modal.confirm.affectedTutors.length > 0 && (
              <div className="kids warnBox">
                <strong>ATTENZIONE:</strong> cambiando il Codice Socio da{" "}
                <strong>{modal.confirm.oldCodiceSocio}</strong> a <strong>{modal.confirm.newCodiceSocio}</strong>, verrà
                modificato anche il Codice Socio dei seguenti tutori:
                <ul>
                  {modal.confirm.affectedTutors.map((t) => (
                    <li key={t.rowNumber}>
                      {t.cognome} {t.nome} — {t.dataNascita} — {t.luogoNascita}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {modal.confirm.affectedSamePersonRows.length > 0 && (
              <div className="kids warnBox">
                <strong>ATTENZIONE:</strong> questo nominativo compare{" "}
                {modal.confirm.affectedSamePersonRows.length === 1 ? (
                  <>su <strong>un&apos;altra riga</strong></>
                ) : (
                  <>su altre <strong>{modal.confirm.affectedSamePersonRows.length}</strong> righe</>
                )}{" "}
                in elenco. Le modifiche ai campi (<strong>{modal.confirm.propagatedFields.join(", ")}</strong>) verranno
                applicate automaticamente anche a:
                <ul>
                  {modal.confirm.affectedSamePersonRows.map((r) => (
                    <li key={r.rowNumber}>
                      Codice Socio {r.codiceSocio} — {r.tipo}
                    </li>
                  ))}
                </ul>
                <p className="note">Tipo, Adulto-Giovane e Codice Socio di queste righe restano invariati.</p>
              </div>
            )}
            <div className="actions">
              <button className="btn" type="button" disabled={busy} onClick={() => submitEdit(true)}>
                {busy ? "Salvataggio…" : "Conferma e salva"}
              </button>
              <button
                className="btn secondary"
                type="button"
                disabled={busy}
                onClick={() => setModal((m) => (m?.m === "edit" ? { ...m, confirm: null } : m))}
              >
                Torna alla modifica
              </button>
            </div>
          </div></div>
        ) : (
          <div className="overlay"><div className="card summaryCard editCard">
            <h2>Modifica Associato</h2>
            {submitErr && <p className="formAlert">{submitErr}</p>}
            <form onSubmit={onSaveEdit} noValidate>
              <PersonFormGrid
                mode="edit"
                form={modal.form}
                errors={activeErrors}
                onChange={updateFormField}
              />
              <div className="actions">
                <button className="btn" type="submit" disabled={busy}>
                  {busy ? "Salvataggio…" : "Salva modifiche"}
                </button>
                <button className="btn secondary" type="button" disabled={busy} onClick={() => setModal(null)}>
                  Annulla
                </button>
              </div>
            </form>
          </div></div>
        )
      )}

      {modal?.m === "createSocio" && (
        <div className="overlay"><div className="card summaryCard editCard">
          <h2>Aggiungi Socio</h2>
          {submitErr && <p className="formAlert">{submitErr}</p>}
          <form onSubmit={onSaveCreateSocio} noValidate>
            <PersonFormGrid
              mode="createSocio"
              form={modal.form}
              errors={activeErrors}
              onChange={updateFormField}
            />
            <div className="actions">
              <button className="btn okBtn" type="submit" disabled={busy}>
                {busy ? "Salvataggio…" : "Salva Socio"}
              </button>
              <button className="btn secondary" type="button" disabled={busy} onClick={() => setModal(null)}>
                Annulla
              </button>
            </div>
          </form>
        </div></div>
      )}

      {modal?.m === "createTutor" && (
        <div className="overlay"><div className="card summaryCard editCard">
          <h2>Aggiungi Tutore</h2>
          {submitErr && <p className="formAlert">{submitErr}</p>}
          <div className="youthBox">
            <span className="youthTitle">Ragazzi seguiti (Soci Giovani) *</span>
            <input
              className="youthSearch"
              placeholder="Filtra ragazzo per codice, cognome, nome o data…"
              value={modal.search}
              disabled={busy}
              onChange={(e) => setModal((m) => (m?.m === "createTutor" ? { ...m, search: e.target.value } : m))}
            />
            <div className="youthList">
              {filteredYouth.length > 0 ? (
                filteredYouth.map((y) => (
                  <label key={y.rowNumber} className="youthItem">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={modal.selectedRowNumbers.includes(y.rowNumber)}
                      onChange={() => toggleYouthRow(y.rowNumber)}
                    />
                    <span>
                      {y.codiceSocio} — {y.cognome} {y.nome}{y.dataNascita ? ` — ${y.dataNascita}` : ""}
                    </span>
                  </label>
                ))
              ) : (
                <p className="youthEmpty">Nessun Socio Giovane disponibile</p>
              )}
            </div>
            {selectedYouthCodes.length === 0 ? (
              <p className={`youthStatus${activeErrors.codiciSocio ? " warn" : ""}`}>
                {activeErrors.codiciSocio || "Seleziona almeno un ragazzo seguito per abilitare i campi del tutore."}
              </p>
            ) : (
              <p className="youthStatus">
                Selezionati: {modal.selectedRowNumbers.length} {modal.selectedRowNumbers.length === 1 ? "ragazzo" : "ragazzi"} · Codice Socio:{" "}
                <strong>{selectedYouthCodes.join(", ")}</strong>
              </p>
            )}
          </div>
          <form onSubmit={onSaveCreateTutor} noValidate>
            <fieldset className="tutorFieldset" disabled={selectedYouthCodes.length === 0 || busy}>
              <div className="youthBox">
                <div className="youthHeader">
                  <span className="youthTitle">Precompila da Socio Adulto o Tutore già presente (facoltativo)</span>
                  {modal.selectedAdultRow !== null && (
                    <button type="button" className="linkBtn" disabled={busy || selectedYouthCodes.length === 0} onClick={onClearExistingAdult}>
                      Svuota selezione
                    </button>
                  )}
                </div>
                <input
                  className="youthSearch"
                  placeholder="Filtra per codice, cognome, nome o data…"
                  value={modal.adultSearch}
                  onChange={(e) => setModal((m) => (m?.m === "createTutor" ? { ...m, adultSearch: e.target.value } : m))}
                />
                <div className="youthList">
                  {filteredAdults.length > 0 ? (
                    filteredAdults.map((a) => (
                      <label key={a.row.rowNumber} className="youthItem">
                        <input
                          type="radio"
                          name="existingAdultPrefill"
                          checked={modal.selectedAdultRow === a.row.rowNumber}
                          onChange={() => onSelectExistingAdult(a.row)}
                        />
                        <span>
                          {a.row.codiceSocio} — {a.row.cognome} {a.row.nome}
                          {a.row.dataNascita ? ` — ${a.row.dataNascita}` : ""}
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="youthEmpty">Nessun Socio Adulto o Tutore trovato</p>
                  )}
                </div>
                {selectedAdultItem ? (
                  <p className="youthStatus">
                    Campi precompilati da: <strong>{selectedAdultItem.row.cognome} {selectedAdultItem.row.nome}</strong>{" "}
                    (modificabili prima del salvataggio; il Codice Socio resta quello dei ragazzi selezionati).
                  </p>
                ) : (
                  <p className="youthStatus">Facoltativo: seleziona un nominativo per precompilare i campi sottostanti.</p>
                )}
              </div>
              <PersonFormGrid
                mode="createTutor"
                form={{ ...modal.form, codiceSocio: selectedYouthCodes.join(", ") }}
                errors={activeErrors}
                onChange={updateFormField}
              />
            </fieldset>
            <div className="actions">
              <button className="btn okBtn" type="submit" disabled={busy || selectedYouthCodes.length === 0}>
                {busy ? "Salvataggio…" : "Salva Tutore"}
              </button>
              <button className="btn secondary" type="button" disabled={busy} onClick={() => setModal(null)}>
                Annulla
              </button>
            </div>
          </form>
        </div></div>
      )}

      {modal?.m === "delete" && (
        <div className="overlay"><div className="card summaryCard">
          <h2>Conferma eliminazione</h2>
          <dl>
            <dt>Codice Socio</dt><dd>{modal.detail.codiceSocio || "—"}</dd>
            <dt>Nome</dt><dd>{modal.detail.nome || "—"}</dd>
            <dt>Cognome</dt><dd>{modal.detail.cognome || "—"}</dd>
            <dt>Data di nascita</dt><dd>{modal.detail.dataNascita || "—"}</dd>
            <dt>Comune di nascita</dt><dd>{modal.detail.luogoNascita || "—"}</dd>
            <dt>Titolo</dt><dd>{modal.detail.tipo || "—"}</dd>
            <dt>Votante</dt><dd>{modal.detail.votante ? "Sì" : "No"}</dd>
          </dl>
          {modal.detail.linkedTutors.length > 0 && (
            <div className="kids warnBox">
              <strong>ATTENZIONE:</strong> risultano associati i seguenti tutori per questo codice socio:{" "}
              {modal.detail.linkedTutors.map((t) => `${t.nome} ${t.cognome}`).join(", ")}. Le loro righe resteranno in elenco.
            </div>
          )}
          {modal.detail.linkedKids.length > 0 && (
            <div className="kids warnBox">
              <strong>ATTENZIONE:</strong> questo tutore è associato ai seguenti soci:{" "}
              {modal.detail.linkedKids.map((k) => `${k.nome} ${k.cognome}`).join(", ")}.
            </div>
          )}
          {modal.detail.presente && (
            <div className="kids warnBox">
              <strong>ATTENZIONE:</strong> questa persona risulta attualmente registrata come PRESENTE.
            </div>
          )}
          <div className="actions">
            <button className="btn danger" disabled={busy} onClick={() => onConfirmDelete(modal.detail)}>
              {busy ? "Eliminazione…" : "Elimina"}
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => setModal(null)}>Annulla</button>
          </div>
        </div></div>
      )}

      {modal?.m === "ko" && (
        <div className="overlay"><div className="card center">
          <div className="badge ko">✕</div>
          <h2>Operazione non riuscita</h2>
          <p className="msg-err">{modal.message}</p>
          <div className="actions"><button className="btn" onClick={() => setModal(null)}>Chiudi</button></div>
        </div></div>
      )}
    </>
  );
}

function PersonFormGrid({
  mode,
  form,
  errors,
  onChange,
}: {
  mode: FormMode;
  form: PersonFormFields;
  errors: Record<string, string>;
  onChange: <K extends keyof PersonFormFields>(key: K, val: PersonFormFields[K]) => void;
}) {
  const isTutorCreate = mode === "createTutor";
  const uppercaseAll = mode !== "edit";
  const isSocio = form.tipo.trim().toUpperCase() === "SOCIO";
  const lockCodice = isTutorCreate || (mode === "edit" && !isSocio);

  return (
    <div className="editGrid">
      <label className="field">
        <span>Codice Socio{lockCodice ? "" : " *"}</span>
        {lockCodice ? (
          <input value={form.codiceSocio} placeholder={isTutorCreate ? "Seleziona ragazzo sopra" : "—"} disabled readOnly />
        ) : (
          <input
            className={errors.codiceSocio ? "bad" : ""}
            inputMode="numeric"
            maxLength={15}
            value={form.codiceSocio}
            onChange={(e) => onChange("codiceSocio", e.target.value.replace(/\D/g, "").slice(0, 15))}
          />
        )}
        {errors.codiceSocio && <small>{errors.codiceSocio}</small>}
      </label>
      <label className="field">
        <span>Tipo</span>
        <input value={form.tipo} disabled readOnly />
      </label>
      <label className="field">
        <span>Cognome *</span>
        <input
          className={errors.cognome ? "bad" : ""}
          style={{ textTransform: "uppercase" }}
          maxLength={100}
          value={form.cognome}
          onChange={(e) => onChange("cognome", e.target.value)}
        />
        {errors.cognome && <small>{errors.cognome}</small>}
      </label>
      <label className="field">
        <span>Nome *</span>
        <input
          className={errors.nome ? "bad" : ""}
          style={{ textTransform: "uppercase" }}
          maxLength={100}
          value={form.nome}
          onChange={(e) => onChange("nome", e.target.value)}
        />
        {errors.nome && <small>{errors.nome}</small>}
      </label>
      {!isTutorCreate && (
        <label className="field">
          <span>Adulto-Giovane{isSocio ? " *" : ""}</span>
          {isSocio ? (
            <>
              <select
                className={errors.adultoGiovane ? "bad" : ""}
                value={form.adultoGiovane}
                onChange={(e) => onChange("adultoGiovane", e.target.value)}
              >
                {mode === "createSocio" && <option value="">Seleziona…</option>}
                <option value="Adulto">Adulto</option>
                <option value="Giovane">Giovane</option>
              </select>
              {errors.adultoGiovane && <small>{errors.adultoGiovane}</small>}
            </>
          ) : (
            <input value={form.adultoGiovane} placeholder="—" disabled readOnly />
          )}
        </label>
      )}
      <label className="field">
        <span>Votante{isTutorCreate ? "" : " *"}</span>
        <select
          disabled={isTutorCreate}
          value={isTutorCreate ? "false" : form.votante ? "true" : "false"}
          onChange={(e) => onChange("votante", e.target.value === "true")}
        >
          {!isTutorCreate && <option value="true">Sì</option>}
          <option value="false">No</option>
        </select>
      </label>
      <label className="field">
        <span>Data Nascita (GG/MM/AAAA) *</span>
        <div className="dateRow">
          <input
            className={errors.dataNascita ? "bad" : ""}
            inputMode="numeric"
            placeholder="GG/MM/AAAA"
            value={form.dataNascita}
            onChange={(e) => onChange("dataNascita", maskDate(e.target.value))}
          />
          <DatePickerButton
            ariaLabel="Selettore data nascita"
            value={toPickerIso(form.dataNascita)}
            max={new Date().toISOString().slice(0, 10)}
            onPick={(d) => onChange("dataNascita", d)}
          />
        </div>
        {errors.dataNascita && <small>{errors.dataNascita}</small>}
      </label>
      <label className="field">
        <span>Comune Nascita *</span>
        <input
          className={errors.luogoNascita ? "bad" : ""}
          style={uppercaseAll ? { textTransform: "uppercase" } : undefined}
          maxLength={50}
          value={form.luogoNascita}
          onChange={(e) => onChange("luogoNascita", e.target.value)}
        />
        {errors.luogoNascita && <small>{errors.luogoNascita}</small>}
      </label>
      <label className="field">
        <span>Codice Fiscale</span>
        <input
          className={errors.codiceFiscale ? "bad" : ""}
          style={{ textTransform: "uppercase" }}
          maxLength={32}
          value={form.codiceFiscale}
          onChange={(e) => onChange("codiceFiscale", e.target.value)}
        />
        {errors.codiceFiscale && <small>{errors.codiceFiscale}</small>}
      </label>
      <label className="field">
        <span>Cellulare</span>
        <input
          className={errors.cellulare ? "bad" : ""}
          style={uppercaseAll ? { textTransform: "uppercase" } : undefined}
          type="tel"
          inputMode="tel"
          maxLength={30}
          value={form.cellulare}
          onChange={(e) => onChange("cellulare", e.target.value)}
        />
        {errors.cellulare && <small>{errors.cellulare}</small>}
      </label>
      <label className="field">
        <span>Email</span>
        <input
          className={errors.email ? "bad" : ""}
          style={uppercaseAll ? { textTransform: "uppercase" } : undefined}
          type="email"
          maxLength={120}
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
        />
        {errors.email && <small>{errors.email}</small>}
      </label>
      <label className="field">
        <span>Data Delibera Ammissione</span>
        <div className="dateRow">
          <input
            className={errors.dataDeliberaAmmissione ? "bad" : ""}
            inputMode="numeric"
            placeholder="GG/MM/AAAA"
            value={form.dataDeliberaAmmissione}
            onChange={(e) => onChange("dataDeliberaAmmissione", maskDate(e.target.value))}
          />
          <DatePickerButton
            ariaLabel="Selettore data delibera"
            value={toPickerIso(form.dataDeliberaAmmissione)}
            onPick={(d) => onChange("dataDeliberaAmmissione", d)}
          />
        </div>
        {errors.dataDeliberaAmmissione && <small>{errors.dataDeliberaAmmissione}</small>}
      </label>
    </div>
  );
}

function ViewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="10" y2="9" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
