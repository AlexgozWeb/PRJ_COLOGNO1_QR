"use client";

import { useEffect, useState } from "react";
import RegistrationForm, { type Person } from "./RegistrationForm";

type Kid = { nome: string; cognome: string; dataNascita: string; registered: boolean };
type View = { nome: string; cognome: string; dataNascita: string; luogoNascita: string; email: string };
type Step =
  | { s: "loading" }
  | { s: "landing" }
  | { s: "form" }
  | { s: "notfound" }
  | { s: "summary"; person: View; kids: Kid[]; coTutors: Kid[] }
  | { s: "already"; person: View; timestamp: string }
  | { s: "done"; person: View; id: string; timestamp: string; kids: Kid[]; coTutors: Kid[] }
  | { s: "ko"; message: string };

async function post(path: string, body: Person & { accessCode?: string }) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Errore di rete");
  return data;
}

function downloadReceipt(p: View, id: string, ts: string, kids: Kid[], coTutors: Kid[]) {
  const list = (title: string, l: Kid[]) =>
    l.length ? ["", title, ...l.map((k) => `- ${k.cognome} ${k.nome} (${k.dataNascita})`)] : [];
  const text = [
    "Assemblea dei Soci 27/11/2026 - Gruppo Scout Cologno Monzese 1",
    "RICEVUTA DI REGISTRAZIONE PRESENZA",
    "",
    `Cognome: ${p.cognome}`,
    `Nome: ${p.nome}`,
    `Data di nascita: ${p.dataNascita}`,
    `Luogo di nascita: ${p.luogoNascita}`,
    `ID_UNIQUE: ${id}`,
    `Registrato il: ${ts}`,
    ...list("Registrati insieme a te (ragazzi):", kids),
    ...list("Registrati insieme a te (altri tutori):", coTutors),
    "",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `registrazione-assemblea-${id}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [step, setStep] = useState<Step>({ s: "loading" });
  const [input, setInput] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [consent, setConsent] = useState(false);

  async function onAccess(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setCodeErr("");
    try {
      const res = await fetch("/api/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessCode: code }) });
      if (res.ok) setStep({ s: "form" });
      else setCodeErr((await res.json().catch(() => ({}))).error || "Codice errato.");
    } catch {
      setCodeErr("Errore di rete, riprova.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setStep({ s: "landing" }), 1800);
    return () => clearTimeout(t);
  }, []);

  async function onSubmit(p: Person) {
    setBusy(true);
    try {
      setInput(p);
      setConsent(false);
      const r = await post("/api/lookup", { ...p, accessCode: code });
      if (r.status === "not_found") setStep({ s: "notfound" });
      else if (r.status === "already") setStep({ s: "already", person: r.person, timestamp: r.timestamp });
      else setStep({ s: "summary", person: r.person, kids: r.kids, coTutors: r.coTutors });
    } catch (e) {
      setStep({ s: "ko", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function onRegister() {
    if (!input) return;
    setBusy(true);
    try {
      const r = await post("/api/register", { ...input, accessCode: code });
      if (r.status === "ok") setStep({ s: "done", person: r.person, id: r.id, timestamp: r.timestamp, kids: r.kids, coTutors: r.coTutors });
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
  return (
    <>
      <main className={`screen${overlay ? " blur" : ""}`}>
        <img className="logo" src="/logo.png" alt="Gruppo Scout Cologno Monzese 1" />
        <h1>Registrazione<br />Assemblea dei Soci<br />27/11/2026</h1>
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

      {step.s === "summary" && (
        <div className="overlay"><div className="card">
          <h2>Riepilogo</h2>
          <PersonData p={step.person} />
          {step.kids.length > 0 && (
            <div className="kids">
              <strong>Ragazzi seguiti</strong>
              <ul className="checks">{step.kids.map((k, i) => <li key={i}><Check on={k.registered} />{k.nome} {k.cognome} — {k.dataNascita}</li>)}</ul>
            </div>
          )}
          {step.coTutors.length > 0 && (
            <div className="kids">
              <strong>Altri tutori</strong>
              <ul className="checks">{step.coTutors.map((k, i) => <li key={i}><Check on={k.registered} />{k.nome} {k.cognome} — {k.dataNascita}</li>)}</ul>
            </div>
          )}
          {(step.kids.length > 0 || step.coTutors.length > 0) && (
            <p className="note">
              <Check on /> già registrato &nbsp; <Check on={false} /> non ancora registrato.<br />
              La registrazione varrà anche per le persone elencate qui sopra.
            </p>
          )}
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              Dichiaro di aver preso visione dell'informativa e acconsento al trattamento dei miei dati personali, da parte del Gruppo Scout Cologno Monzese 1,
              al solo fine di registrare la mia presenza all'Assemblea dei Soci del 27/11/2026. I dati sono già in possesso del Gruppo in
              quanto forniti all'atto dell'ammissione a socio; oltre a questi vengono registrati la data e l'ora della presenza e l'indirizzo IP del
              dispositivo, per finalità di sicurezza e verifica. Il trattamento è senza scopo di lucro, i dati non sono diffusi né ceduti a terzi
              e sono conservati per il tempo necessario agli adempimenti dell'Assemblea (Reg. UE 2016/679, GDPR). Per esercitare i tuoi diritti
              contatta l'amministratore del Gruppo. Se mi registro come tutore, dichiaro di farlo anche per conto dei ragazzi e degli altri tutori elencati nel riepilogo.
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
          {(step.kids.length > 0 || step.coTutors.length > 0) && (
            <p className="note">Presenza registrata anche per: {[...step.kids, ...step.coTutors].map((k) => `${k.nome} ${k.cognome}`).join(", ")}.</p>
          )}
          <div className="actions">
            <button className="btn" onClick={() => downloadReceipt(step.person, step.id, step.timestamp, step.kids, step.coTutors)}>Salva ricevuta (.txt)</button>
            <button className="btn secondary" onClick={goHome}>Torna alla home</button>
          </div>
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
