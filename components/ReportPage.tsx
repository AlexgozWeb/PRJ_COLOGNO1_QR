"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadReceipt } from "@/lib/receipt";
import type { AssemblyInfo } from "@/lib/types";
import { APP_VERSION } from "../lib/version";

type Row = { codiceSocio: string; nome: string; cognome: string; dataNascita: string; luogoNascita: string; tipo: string; presente: boolean };
type Key = keyof Row;
type Sort = { key: Key; dir: 1 | -1 };
type PersonInput = { nome: string; cognome: string; dataNascita: string; luogoNascita: string };
type View = PersonInput & { email: string };
type Kid = { nome: string; cognome: string; dataNascita: string; registered: boolean };
type MinorTutor = PersonInput & { registered: boolean };
type UnregisterPerson = PersonInput & { tipo: string; presente: boolean; partialOnly?: boolean };

type Modal =
  | {
      m: "unregister";
      input: PersonInput;
      target: UnregisterPerson;
      cascadeRemoved: UnregisterPerson[];
      relatedKept: UnregisterPerson[];
    }
  | { m: "minor"; person: View; tutors: MinorTutor[] }
  | { m: "summary"; input: PersonInput; person: View; kids: Kid[]; adultKids: Kid[]; coTutors: Kid[] }
  | { m: "already"; person: View; timestamp: string }
  | { m: "done"; person: View; id: string; timestamp: string; kids: Kid[] }
  | { m: "closed" }
  | { m: "ko"; message: string };

const COLS: { key: Key; label: string }[] = [
  { key: "codiceSocio", label: "Codice socio" },
  { key: "nome", label: "Nome" },
  { key: "cognome", label: "Cognome" },
  { key: "dataNascita", label: "Data di nascita" },
  { key: "luogoNascita", label: "Comune di nascita" },
  { key: "tipo", label: "Titolo" },
  { key: "presente", label: "Presenza" },
];

const collator = new Intl.Collator("it", { numeric: true, sensitivity: "base" });
const dateKey = (d: string) => d.split("/").reverse().join("");

function cmp(a: Row, b: Row, key: Key): number {
  if (key === "presente") return Number(a.presente) - Number(b.presente);
  if (key === "dataNascita") return dateKey(a.dataNascita).localeCompare(dateKey(b.dataNascita));
  return collator.compare(a[key], b[key]);
}

// Ordine di default: codice socio, tipo, cognome, presenza (presenti prima)
const DEFAULT_ORDER: Sort[] = [
  { key: "codiceSocio", dir: 1 },
  { key: "tipo", dir: 1 },
  { key: "cognome", dir: 1 },
  { key: "presente", dir: -1 },
];

export default function ReportPage({
  code,
  assembly,
  onBack,
}: {
  code: string;
  assembly?: AssemblyInfo;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [err, setErr] = useState("");
  const [updated, setUpdated] = useState("");
  const [sort, setSort] = useState<Sort | null>(null);
  const [filters, setFilters] = useState<Partial<Record<Key, string>>>({});
  const [modal, setModal] = useState<Modal | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const alive = useRef(true);

  const loadReport = useCallback(async () => {
    const mySeq = ++seq.current;
    try {
      const res = await fetch("/api/report", {
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
    loadReport();
    const t = setInterval(loadReport, 10000);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [loadReport]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const f = COLS.filter((c) => c.key !== "presente" && (filters[c.key] ?? "").trim() !== "");
    const out = rows.filter((r) => {
      if (filters.presente === "1" && !r.presente) return false;
      if (filters.presente === "0" && r.presente) return false;
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

  async function adminPost(path: string, body: Record<string, unknown>) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, accessCode: code }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403 && (data.status === "closed" || data.status === "minor")) return data;
    if (!res.ok) throw new Error(data.error || "Errore di rete");
    return data;
  }

  async function runAdminLookup(input: PersonInput) {
    setBusy(true);
    try {
      const r = await adminPost("/api/report/lookup", input);
      if (r.status === "closed") {
        await loadReport();
        setModal({ m: "closed" });
      } else if (r.status === "not_found") {
        setModal({ m: "ko", message: "Persona non trovata nel foglio." });
      } else if (r.status === "already") {
        await loadReport();
        setModal({ m: "already", person: r.person, timestamp: r.timestamp });
      } else if (r.status === "minor") {
        setModal({ m: "minor", person: r.person, tutors: r.tutors ?? [] });
      } else {
        setModal({ m: "summary", input, person: r.person, kids: r.kids ?? [], adultKids: r.adultKids ?? [], coTutors: r.coTutors ?? [] });
      }
    } catch (e) {
      setModal({ m: "ko", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function onRowClick(r: Row) {
    if (closed || busy || modal) return;
    if (!r.nome || !r.cognome || !r.dataNascita || !r.luogoNascita) {
      setModal({ m: "ko", message: "Dati anagrafici incompleti su questa riga del foglio." });
      return;
    }
    const input: PersonInput = {
      nome: r.nome,
      cognome: r.cognome,
      dataNascita: r.dataNascita,
      luogoNascita: r.luogoNascita,
    };
    if (!r.presente) {
      await runAdminLookup(input);
      return;
    }
    setBusy(true);
    try {
      const d = await adminPost("/api/report/unregister", { ...input, dryRun: true });
      if (d.status === "closed") {
        await loadReport();
        setModal({ m: "closed" });
      } else if (d.status === "not_found") {
        setModal({ m: "ko", message: "Persona non trovata nel foglio." });
      } else if (d.status === "not_registered") {
        await loadReport();
        setModal({ m: "ko", message: "La registrazione di questa persona risulta già annullata." });
      } else {
        setModal({
          m: "unregister",
          input,
          target: d.target,
          cascadeRemoved: d.cascadeRemoved ?? [],
          relatedKept: d.relatedKept ?? [],
        });
      }
    } catch (e) {
      setModal({ m: "ko", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmUnregister(input: PersonInput) {
    setBusy(true);
    try {
      const d = await adminPost("/api/report/unregister", { ...input, dryRun: false });
      if (d.status === "closed") {
        await loadReport();
        setModal({ m: "closed" });
      } else if (d.status === "ok") {
        setModal(null);
        await loadReport();
      } else if (d.status === "not_registered") {
        await loadReport();
        setModal({ m: "ko", message: "La registrazione di questa persona risulta già annullata." });
      } else {
        setModal({ m: "ko", message: "Persona non trovata nel foglio." });
      }
    } catch (e) {
      setModal({ m: "ko", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmRegister(input: PersonInput) {
    setBusy(true);
    try {
      const r = await adminPost("/api/report/register", input);
      if (r.status === "closed") {
        await loadReport();
        setModal({ m: "closed" });
      } else if (r.status === "minor") {
        setModal({ m: "minor", person: r.person, tutors: r.tutors ?? [] });
      } else if (r.status === "ok") {
        await loadReport();
        setModal({ m: "done", person: r.person, id: r.id, timestamp: r.timestamp, kids: r.kids ?? [] });
      } else if (r.status === "already") {
        await loadReport();
        setModal({ m: "already", person: r.person, timestamp: r.timestamp });
      } else {
        setModal({ m: "ko", message: "Persona non trovata nel foglio." });
      }
    } catch (e) {
      setModal({ m: "ko", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function onSelectTutor(t: MinorTutor) {
    if (!t.nome || !t.cognome || !t.dataNascita || !t.luogoNascita) {
      setModal({ m: "ko", message: "Dati anagrafici incompleti per il tutore selezionato." });
      return;
    }
    await runAdminLookup({ nome: t.nome, cognome: t.cognome, dataNascita: t.dataNascita, luogoNascita: t.luogoNascita });
  }

  const toggle = (key: Key, dir: 1 | -1) => setSort((s) => (s && s.key === key && s.dir === dir ? null : { key, dir }));
  const setFilter = (key: Key, v: string) => setFilters((f) => ({ ...f, [key]: v }));

  return (
    <>
      <main className={`report${modal ? " blur" : ""}`}>
        <span className="versionBadge" title="Versione app">{APP_VERSION}</span>
        <h1>Report Presenze</h1>
        <div className="reportBar">
          <p className="sub">
            {rows ? `${shown.length} di ${rows.length} persone` : ""} · aggiornato ogni 10 s{updated ? ` (ore ${updated})` : ""}
            {closed ? " · registrazioni chiuse (sola lettura)" : ""}
          </p>
          <button className="btn btnSmall" onClick={onBack}>Torna alle statistiche</button>
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
                </tr>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key}>
                      {c.key === "presente" ? (
                        <select value={filters.presente ?? ""} onChange={(e) => setFilter("presente", e.target.value)} aria-label="Filtro presenza">
                          <option value="">Tutti</option>
                          <option value="1">Presenti</option>
                          <option value="0">Assenti</option>
                        </select>
                      ) : (
                        <input value={filters[c.key] ?? ""} onChange={(e) => setFilter(c.key, e.target.value)} placeholder="Filtra…" aria-label={`Filtro ${c.label}`} />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={i}>
                    <td>{r.codiceSocio}</td>
                    <td>{r.nome}</td>
                    <td>{r.cognome}</td>
                    <td>{r.dataNascita}</td>
                    <td>{r.luogoNascita}</td>
                    <td>{r.tipo}</td>
                    <td className="presCell">
                      <button
                        type="button"
                        className={`presBtn${r.presente ? " on" : ""}`}
                        disabled={closed || busy || modal !== null}
                        title={closed ? "Registrazioni chiuse" : r.presente ? "Annulla registrazione" : "Registra presenza"}
                        aria-label={r.presente ? `Presente: annulla registrazione di ${r.nome} ${r.cognome}` : `Assente: registra ${r.nome} ${r.cognome}`}
                        onClick={() => onRowClick(r)}
                      >
                        ✔
                      </button>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={COLS.length} className="empty">Nessun risultato</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {modal?.m === "unregister" && (
        <div className="overlay"><div className="card summaryCard">
          <h2>Conferma cancellazione</h2>
          <BasicData p={modal.target} />
          {(modal.cascadeRemoved.length > 0 || modal.relatedKept.length > 0) && (
            <>
              <hr className="divider" />
              <p className="note">
                <strong><em>ATTENZIONE:</em></strong> presenza di altri nominativi legati a {modal.target.nome} {modal.target.cognome}.
              </p>
              {modal.cascadeRemoved.length > 0 && (
                <div className="kids warnBox">
                  <strong>Verrà cancellata anche la presenza di:</strong>
                  <ul className="checks">
                    {modal.cascadeRemoved.map((p, i) => (
                      <li key={i}>
                        <Check on={p.presente} />
                        {p.nome} {p.cognome} — {p.dataNascita} — {p.luogoNascita} — {p.tipo}
                        {p.partialOnly ? " (solo riga tutore collegata)" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {modal.relatedKept.length > 0 && (
                <div className="kids mutedInfo">
                  <strong>Altri nominativi collegati <span className="infoTag">(non modificati)</span></strong>
                  <ul className="checks">
                    {modal.relatedKept.map((p, i) => (
                      <li key={i}>
                        <Check on={p.presente} />
                        {p.nome} {p.cognome} — {p.dataNascita} — {p.luogoNascita} — {p.tipo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <div className="actions">
            <button className="btn danger" disabled={busy} onClick={() => onConfirmUnregister(modal.input)}>
              {busy ? "Cancellazione…" : "Conferma"}
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => setModal(null)}>Annulla</button>
          </div>
        </div></div>
      )}

      {modal?.m === "minor" && (
        <div className="overlay"><div className="card summaryCard">
          <h2>Riepilogo</h2>
          <PersonData p={modal.person} />
          <p className="msg-err minorWarn">Socio minorenne: impossibile registrarsi autonomamente.</p>
          {modal.tutors.length > 0 ? (
            <>
              <div className="kids">
                <strong>Sei un tutore di {modal.person.nome} {modal.person.cognome}?</strong>
                <ul className="checks tutorList">
                  {modal.tutors.map((t, i) => (
                    <li key={i} className="tutorRow">
                      <span className="tutorInfo">
                        <Check on={t.registered} />
                        <span>{t.nome} {t.cognome}{t.dataNascita ? ` — ${t.dataNascita}` : ""}</span>
                      </span>
                      {!t.registered && (
                        <button type="button" className="linkBtn" disabled={busy} onClick={() => onSelectTutor(t)}>
                          Registrati <span aria-hidden="true">→</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="note"><Check on /> già registrato &nbsp; <Check on={false} /> non ancora registrato.</p>
            </>
          ) : (
            <p className="note">Nessun tutore associato risulta in elenco. Contatta l&apos;amministratore.</p>
          )}
          <div className="actions">
            <button className="btn" disabled={busy} onClick={() => setModal(null)}>Chiudi</button>
          </div>
        </div></div>
      )}

      {modal?.m === "summary" && (
        <div className="overlay"><div className="card summaryCard">
          <h2>Riepilogo</h2>
          <PersonData p={modal.person} />
          {modal.kids.length > 0 && (
            <div className="kids">
              <strong>Ragazzi minorenni seguiti</strong>
              <ul className="checks kidsList">
                {modal.kids.map((k, i) => <li key={i}><Check on={k.registered} />{k.nome} {k.cognome} — {k.dataNascita}</li>)}
              </ul>
            </div>
          )}
          {modal.adultKids.length > 0 && (
            <div className="kids mutedInfo">
              <strong>Ragazzi maggiorenni seguiti <span className="infoTag">(solo informativo)</span></strong>
              <ul className="checks">
                {modal.adultKids.map((k, i) => <li key={i}><Check on={k.registered} />{k.nome} {k.cognome} — {k.dataNascita}</li>)}
              </ul>
            </div>
          )}
          {modal.coTutors.length > 0 && (
            <div className="kids mutedInfo">
              <strong>Altri tutori <span className="infoTag">(solo informativo)</span></strong>
              <ul className="checks">
                {modal.coTutors.map((k, i) => <li key={i}><Check on={k.registered} />{k.nome} {k.cognome} — {k.dataNascita}</li>)}
              </ul>
            </div>
          )}
          {(modal.kids.length > 0 || modal.adultKids.length > 0 || modal.coTutors.length > 0) && (
            <>
              <p className="note"><Check on /> già registrato &nbsp; <Check on={false} /> non ancora registrato.</p>
              <hr className="divider" />
              <p className="note">
                <strong><em>ATTENZIONE:</em></strong> La registrazione varrà anche per eventuali ragazzi minorenni seguiti non ancora registrati, ma non sui maggiorenni né sugli altri tutori.
              </p>
            </>
          )}
          <div className="actions">
            <button className="btn" disabled={busy} onClick={() => onConfirmRegister(modal.input)}>
              {busy ? "Registrazione…" : "Registrati"}
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => setModal(null)}>Annulla</button>
          </div>
        </div></div>
      )}

      {modal?.m === "already" && (
        <div className="overlay"><div className="card center">
          <div className="badge ok">✓</div>
          <h2>Utente già registrato</h2>
          <p>{modal.person.nome} {modal.person.cognome}</p>
          <p>Registrazione effettuata il <strong>{modal.timestamp || "—"}</strong></p>
          <div className="actions"><button className="btn" onClick={() => setModal(null)}>Torna al report</button></div>
        </div></div>
      )}

      {modal?.m === "done" && (
        <div className="overlay"><div className="card center">
          <div className="badge ok">✓</div>
          <h2>Registrazione completata</h2>
          <p>{modal.person.nome} {modal.person.cognome}</p>
          <div className="idbox">{modal.id}</div>
          <p>Registrato il {modal.timestamp}</p>
          {modal.kids.length > 0 && (
            <p className="note">Presenza registrata anche per: {modal.kids.map((k) => `${k.nome} ${k.cognome}`).join(", ")}.</p>
          )}
          <div className="actions">
            <button className="btn" onClick={() => downloadReceipt(modal.person, modal.id, modal.timestamp, modal.kids, assembly)}>Salva ricevuta (.txt)</button>
            <button className="btn secondary" onClick={() => setModal(null)}>Torna al report</button>
          </div>
        </div></div>
      )}

      {modal?.m === "closed" && (
        <div className="overlay"><div className="card center">
          <div className="badge ko">!</div>
          <h2>Registrazioni chiuse</h2>
          <p>Le registrazioni per l&apos;Assemblea dei Soci sono attualmente chiuse.</p>
          <div className="actions"><button className="btn" onClick={() => setModal(null)}>Torna al report</button></div>
        </div></div>
      )}

      {modal?.m === "ko" && (
        <div className="overlay"><div className="card center">
          <div className="badge ko">✕</div>
          <h2>Operazione non riuscita</h2>
          <p className="msg-err">{modal.message}</p>
          <div className="actions"><button className="btn" onClick={() => setModal(null)}>Torna al report</button></div>
        </div></div>
      )}
    </>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span className={`tick ${on ? "on" : "off"}`} role="img" aria-label={on ? "già registrato" : "non ancora registrato"}>✓</span>
  );
}

function BasicData({ p }: { p: PersonInput }) {
  return (
    <dl>
      <dt>Nome</dt><dd>{p.nome}</dd>
      <dt>Cognome</dt><dd>{p.cognome}</dd>
      <dt>Data di nascita</dt><dd>{p.dataNascita}</dd>
      <dt>Comune di nascita</dt><dd>{p.luogoNascita}</dd>
    </dl>
  );
}

function PersonData({ p }: { p: View }) {
  return (
    <dl>
      <dt>Nome</dt><dd>{p.nome}</dd>
      <dt>Cognome</dt><dd>{p.cognome}</dd>
      <dt>Data di nascita</dt><dd>{p.dataNascita}</dd>
      <dt>Luogo di nascita</dt><dd>{p.luogoNascita}</dd>
      <dt>Email</dt><dd>{p.email || "—"}</dd>
    </dl>
  );
}
