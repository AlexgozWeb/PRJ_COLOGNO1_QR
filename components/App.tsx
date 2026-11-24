"use client";

import { useEffect, useState } from "react";
import { downloadReceipt } from "@/lib/receipt";
import { DEFAULT_ASSEMBLY_DATE, DEFAULT_ASSEMBLY_NAME, type AssemblyInfo } from "@/lib/types";
import RegistrationForm, { type Person } from "./RegistrationForm";
import StatsPage from "./StatsPage";
import ReportPage from "./ReportPage";
import AssociatesPage from "./AssociatesPage";

type Kid = { nome: string; cognome: string; dataNascita: string; registered: boolean };
type MinorTutor = { nome: string; cognome: string; dataNascita: string; luogoNascita: string; registered: boolean };
type View = { nome: string; cognome: string; dataNascita: string; luogoNascita: string; email: string };
type Step =
  | { s: "loading" }
  | { s: "landing" }
  | { s: "stats" }
  | { s: "report" }
  | { s: "associates" }
  | { s: "form" }
  | { s: "notfound" }
  | { s: "minor"; person: View; tutors: MinorTutor[] }
  | { s: "summary"; person: View; kids: Kid[]; adultKids: Kid[]; coTutors: Kid[] }
  | { s: "already"; person: View; timestamp: string }
  | { s: "done"; person: View; id: string; timestamp: string; kids: Kid[] }
  | { s: "closed" }
  | { s: "ko"; message: string };

async function post(path: string, body: Person & { accessCode?: string }) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && (data.status === "closed" || data.status === "minor")) return data;
  if (!res.ok) throw new Error(data.error || "Errore di rete");
  return data;
}

export default function App() {
  const [step, setStep] = useState<Step>({ s: "loading" });
  const [input, setInput] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [consent, setConsent] = useState(false);
  const [assembly, setAssembly] = useState<AssemblyInfo>({
    assemblyName: DEFAULT_ASSEMBLY_NAME,
    assemblyDate: DEFAULT_ASSEMBLY_DATE,
  });

  useEffect(() => {
    let active = true;
    fetch("/api/config", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (active && d?.assemblyName && d?.assemblyDate) {
          setAssembly({ assemblyName: String(d.assemblyName), assemblyDate: String(d.assemblyDate) });
        }
      })
      .catch(() => {});
    const t = setTimeout(() => setStep({ s: "landing" }), 1800);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    document.title = `${assembly.assemblyName}${assembly.assemblyDate ? ` ${assembly.assemblyDate}` : ""}`;
  }, [assembly]);

  async function onAccess(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setCodeErr("");
    try {
      const res = await fetch("/api/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessCode: code }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setStep(d.admin ? { s: "stats" } : { s: "form" });
      } else if (res.status === 403 && d.status === "closed") {
        setStep({ s: "closed" });
      } else {
        setCodeErr(d.error || "Codice errato.");
      }
    } catch {
      setCodeErr("Errore di rete, riprova.");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(p: Person) {
    setBusy(true);
    try {
      setInput(p);
      setConsent(false);
      const r = await post("/api/lookup", { ...p, accessCode: code });
      if (r.status === "closed") setStep({ s: "closed" });
      else if (r.status === "not_found") setStep({ s: "notfound" });
      else if (r.status === "already") setStep({ s: "already", person: r.person, timestamp: r.timestamp });
      else if (r.status === "minor") setStep({ s: "minor", person: r.person, tutors: r.tutors ?? [] });
      else setStep({ s: "summary", person: r.person, kids: r.kids ?? [], adultKids: r.adultKids ?? [], coTutors: r.coTutors ?? [] });
    } catch (e) {
      setStep({ s: "ko", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function onSelectTutor(t: MinorTutor) {
    if (t.nome && t.cognome && t.dataNascita && t.luogoNascita) {
      await onSubmit({ nome: t.nome, cognome: t.cognome, dataNascita: t.dataNascita, luogoNascita: t.luogoNascita });
    } else {
      setInput({ nome: t.nome, cognome: t.cognome, dataNascita: t.dataNascita, luogoNascita: t.luogoNascita });
      setStep({ s: "form" });
    }
  }

  async function onRegister() {
    if (!input) return;
    setBusy(true);
    try {
      const r = await post("/api/register", { ...input, accessCode: code });
      if (r.status === "closed") setStep({ s: "closed" });
      else if (r.status === "minor") setStep({ s: "minor", person: r.person, tutors: r.tutors ?? [] });
      else if (r.status === "ok") setStep({ s: "done", person: r.person, id: r.id, timestamp: r.timestamp, kids: r.kids ?? [] });
      else if (r.status === "already") setStep({ s: "already", person: r.person, timestamp: r.timestamp });
      else setStep({ s: "notfound" });
    } catch (e) {
      setStep({ s: "ko", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (step.s === "loading")
    return (
      <main className="screen">
        <img className="logo pulse" src="/logo.png" alt="Gruppo Scout Cologno Monzese 1" />
        <div className="spinner" role="status" aria-label="Caricamento" />
      </main>
    );

  const overlay = step.s !== "landing";
  const goHome = () => {
    setInput(null);
    setConsent(false);
    setCode("");
    setCodeErr("");
    setStep({ s: "landing" });
  };
  if (step.s === "stats")
    return (
      <StatsPage
        code={code}
        onExit={goHome}
        onReport={() => setStep({ s: "report" })}
        onAssociates={() => setStep({ s: "associates" })}
        onAssemblyChange={setAssembly}
      />
    );
  if (step.s === "report") return <ReportPage code={code} assembly={assembly} onBack={() => setStep({ s: "stats" })} />;
  if (step.s === "associates") return <AssociatesPage code={code} onBack={() => setStep({ s: "stats" })} />;
  return (
    <>
      <main className={`screen${overlay ? " blur" : ""}`}>
        <img className="logo" src="/logo.png" alt="Gruppo Scout Cologno Monzese 1" />
        <h1>
          {assembly.assemblyName}
          {assembly.assemblyDate && (
            <>
              <br />
              {assembly.assemblyDate}
            </>
          )}
        </h1>
        <p className="sub">Gruppo Scout Cologno Monzese 1 — registra qui la tua presenza all'Assemblea.</p>
        <form className="accessForm" onSubmit={onAccess}>
          <label className="field">
            <span>Codice di accesso</span>
            <input type="password" autoComplete="off" value={code} maxLength={200} onChange={(e) => setCode(e.target.value)} className={codeErr ? "bad" : ""} />
            {codeErr && <small>{codeErr}</small>}
          </label>
          <button className="btn" type="submit" disabled={busy || !code.trim()}>{busy ? "Verifica…" : "Registra la tua presenza"}</button>
        </form>
      </main>

      {step.s === "form" && (
        <div className="overlay"><div className="card">
          <RegistrationForm busy={busy} initial={input} onSubmit={onSubmit} />
        </div></div>
      )}

      {step.s === "notfound" && (
        <div className="overlay"><div className="card center">
          <div className="badge ko">!</div>
          <h2>Persona non trovata</h2>
          <p className="msg-err">Non risulta nessuna persona con i dati inseriti.</p>
          <p>Controlla i dati oppure contatta l'amministratore.</p>
          <div className="actions"><button className="btn" onClick={() => setStep({ s: "form" })}>Modifica i dati</button></div>
        </div></div>
      )}

      {step.s === "minor" && (
        <div className="overlay"><div className="card summaryCard">
          <h2>Riepilogo</h2>
          <PersonData p={step.person} />
          <p className="msg-err minorWarn">Socio minorenne: impossibile registrarsi autonomamente.</p>
          {step.tutors.length > 0 ? (
            <>
              <div className="kids">
                <strong>Sei un tutore di {step.person.nome} {step.person.cognome}?</strong>
                <ul className="checks tutorList">
                  {step.tutors.map((t, i) => (
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
              <p className="note">
                <Check on /> già registrato &nbsp; <Check on={false} /> non ancora registrato.
              </p>
              <div className="actions">
                <button className="btn secondary" disabled={busy} onClick={() => setStep({ s: "form" })}>Indietro</button>
                <button className="btn" disabled={busy} onClick={goHome}>Esci</button>
              </div>
            </>
          ) : (
            <>
              <p className="note">Nessun tutore associato risulta in elenco. Contatta l&apos;amministratore.</p>
              <div className="actions">
                <button className="btn" disabled={busy} onClick={goHome}>Esci</button>
              </div>
            </>
          )}
        </div></div>
      )}

      {step.s === "summary" && (
        <div className="overlay"><div className="card summaryCard">
          <h2>Riepilogo</h2>
          <PersonData p={step.person} />
          {step.kids.length > 0 && (
            <div className="kids">
              <strong>Ragazzi minorenni seguiti</strong>
              <ul className="checks kidsList">{step.kids.map((k, i) => <li key={i}><Check on={k.registered} />{k.nome} {k.cognome} — {k.dataNascita}</li>)}</ul>
            </div>
          )}
          {step.adultKids.length > 0 && (
            <div className="kids mutedInfo">
              <strong>Ragazzi maggiorenni seguiti <span className="infoTag">(solo informativo)</span></strong>
              <ul className="checks">{step.adultKids.map((k, i) => <li key={i}><Check on={k.registered} />{k.nome} {k.cognome} — {k.dataNascita}</li>)}</ul>
            </div>
          )}
          {step.coTutors.length > 0 && (
            <div className="kids mutedInfo">
              <strong>Altri tutori <span className="infoTag">(solo informativo)</span></strong>
              <ul className="checks">{step.coTutors.map((k, i) => <li key={i}><Check on={k.registered} />{k.nome} {k.cognome} — {k.dataNascita}</li>)}</ul>
            </div>
          )}
          {(step.kids.length > 0 || step.adultKids.length > 0 || step.coTutors.length > 0) && (
            <>
              <p className="note">
                <Check on /> già registrato &nbsp; <Check on={false} /> non ancora registrato.
              </p>
              <hr className="divider" />
              <p className="note">
                <strong><em>ATTENZIONE:</em></strong> La registrazione varrà anche per eventuali ragazzi minorenni seguiti non ancora registrati, ma non sui maggiorenni né sugli altri tutori.
              </p>
            </>
          )}
          <hr className="divider" />
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              Acconsento a comunicare i miei dati al Gruppo Scout Cologno Monzese 1 esclusivamente per la gestione delle presenze
              all&apos;evento &quot;{assembly.assemblyName}&quot;{assembly.assemblyDate ? ` del ${assembly.assemblyDate}` : ""}. Se sono tutore, la registrazione vale anche per eventuali ragazzi minorenni seguiti non ancora registrati.
            </span>
          </label>
          <div className="actions">
            <button className="btn" disabled={busy || !consent} onClick={onRegister}>{busy ? "Registrazione…" : "Registrati"}</button>
            <button className="btn secondary" disabled={busy} onClick={() => setStep({ s: "form" })}>Indietro</button>
          </div>
        </div></div>
      )}

      {step.s === "already" && (
        <div className="overlay"><div className="card center">
          <div className="badge ok">✓</div>
          <h2>Utente già registrato</h2>
          <p>{step.person.nome} {step.person.cognome}</p>
          <p>Registrazione effettuata il <strong>{step.timestamp || "—"}</strong></p>
          <div className="actions"><button className="btn" onClick={goHome}>Torna alla home</button></div>
        </div></div>
      )}

      {step.s === "done" && (
        <div className="overlay"><div className="card center">
          <div className="badge ok">✓</div>
          <h2>Registrazione completata</h2>
          <p>{step.person.nome} {step.person.cognome}</p>
          <div className="idbox">{step.id}</div>
          <p>Registrato il {step.timestamp}</p>
          {step.kids.length > 0 && (
            <p className="note">Presenza registrata anche per: {step.kids.map((k) => `${k.nome} ${k.cognome}`).join(", ")}.</p>
          )}
          <div className="actions">
            <button className="btn" onClick={() => downloadReceipt(step.person, step.id, step.timestamp, step.kids, assembly)}>Salva ricevuta (.txt)</button>
            <button className="btn secondary" onClick={goHome}>Torna alla home</button>
          </div>
        </div></div>
      )}

      {step.s === "closed" && (
        <div className="overlay"><div className="card center">
          <div className="badge ko">!</div>
          <h2>Registrazioni chiuse</h2>
          <p>Le registrazioni per l&apos;Assemblea dei Soci sono attualmente chiuse.</p>
          <p className="note">Per assistenza contatta l&apos;amministratore.</p>
          <div className="actions"><button className="btn" onClick={goHome}>Torna alla home</button></div>
        </div></div>
      )}

      {step.s === "ko" && (
        <div className="overlay"><div className="card center">
          <div className="badge ko">✕</div>
          <h2>Registrazione non riuscita</h2>
          <p className="msg-err">{step.message}</p>
          <p>Riprova o contatta l'amministratore.</p>
          <div className="actions">
            <button className="btn" onClick={() => setStep({ s: "form" })}>Riprova</button>
            <button className="btn secondary" onClick={goHome}>Torna alla home</button>
          </div>
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
