"use client";

import { useState } from "react";
import DatePickerButton from "./DatePickerButton";

export interface Person {
  nome: string;
  cognome: string;
  dataNascita: string;
  luogoNascita: string;
}

function validDate(s: string): boolean {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const [d, mo, y] = [+m[1], +m[2], +m[3]];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d && dt <= new Date();
}

function maskDate(v: string): string {
  const digits = v.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
}

export default function RegistrationForm({
  busy,
  initial,
  onSubmit,
}: {
  busy: boolean;
  initial: Person | null;
  onSubmit: (p: Person) => void;
}) {
  const [v, setV] = useState<Person>(initial ?? { nome: "", cognome: "", dataNascita: "", luogoNascita: "" });
  const [touched, setTouched] = useState(false);
  const set = (k: keyof Person) => (val: string) => setV((o) => ({ ...o, [k]: val }));

  const errors: Partial<Record<keyof Person, string>> = {};
  if (!v.nome.trim()) errors.nome = "Campo obbligatorio";
  if (!v.cognome.trim()) errors.cognome = "Campo obbligatorio";
  if (!v.luogoNascita.trim()) errors.luogoNascita = "Campo obbligatorio";
  if (!v.dataNascita) errors.dataNascita = "Campo obbligatorio";
  else if (!validDate(v.dataNascita)) errors.dataNascita = "Usa il formato GG/MM/AAAA";

  const isoForPicker = validDate(v.dataNascita) ? v.dataNascita.split("/").reverse().join("-") : "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length) return;
    onSubmit({ nome: v.nome.trim(), cognome: v.cognome.trim(), dataNascita: v.dataNascita, luogoNascita: v.luogoNascita.trim() });
  }

  const text = (k: "nome" | "cognome" | "luogoNascita", label: string, auto: string) => (
    <label className="field">
      <span>{label} *</span>
      <input className={touched && errors[k] ? "bad" : ""} value={v[k]} autoComplete={auto} maxLength={100} onChange={(e) => set(k)(e.target.value)} />
      {touched && errors[k] && <small>{errors[k]}</small>}
    </label>
  );

  return (
    <form onSubmit={submit} noValidate>
      <h2>I tuoi dati</h2>
      {text("nome", "Nome", "given-name")}
      {text("cognome", "Cognome", "family-name")}
      <label className="field">
        <span>Data di nascita (GG/MM/AAAA) *</span>
        <div className="dateRow">
          <input
            className={touched && errors.dataNascita ? "bad" : ""}
            inputMode="numeric"
            placeholder="GG/MM/AAAA"
            autoComplete="bday"
            value={v.dataNascita}
            onChange={(e) => set("dataNascita")(maskDate(e.target.value))}
          />
          <DatePickerButton
            ariaLabel="Selettore data"
            value={isoForPicker}
            max={new Date().toISOString().slice(0, 10)}
            onPick={(d) => set("dataNascita")(d)}
          />
        </div>
        {touched && errors.dataNascita && <small>{errors.dataNascita}</small>}
      </label>
      {text("luogoNascita", "Luogo di nascita", "off")}
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Ricerca…" : "Prosegui"}</button>
      </div>
    </form>
  );
}
