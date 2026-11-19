"use client";

import { useEffect, useMemo, useState } from "react";

type Row = { codiceSocio: string; nome: string; cognome: string; dataNascita: string; tipo: string; presente: boolean };
type Key = keyof Row;
type Sort = { key: Key; dir: 1 | -1 };

const COLS: { key: Key; label: string }[] = [
  { key: "codiceSocio", label: "Codice socio" },
  { key: "nome", label: "Nome" },
  { key: "cognome", label: "Cognome" },
  { key: "dataNascita", label: "Data di nascita" },
  { key: "tipo", label: "Tipo" },
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

export default function ReportPage({ code, onBack }: { code: string; onBack: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [updated, setUpdated] = useState("");
  const [sort, setSort] = useState<Sort | null>(null);
  const [filters, setFilters] = useState<Partial<Record<Key, string>>>({});

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const res = await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessCode: code }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Errore");
        if (!stop) { setRows(data.rows); setUpdated(new Date(data.aggiornato).toLocaleTimeString("it-IT")); setErr(""); }
      } catch (e) {
        if (!stop) setErr((e as Error).message);
      }
    }
    load();
    const t = setInterval(load, 10000);
    return () => { stop = true; clearInterval(t); };
  }, [code]);

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

  const toggle = (key: Key, dir: 1 | -1) => setSort((s) => (s && s.key === key && s.dir === dir ? null : { key, dir }));
  const setFilter = (key: Key, v: string) => setFilters((f) => ({ ...f, [key]: v }));

  return (
    <main className="report">
      <h1>Report Presenze</h1>
      <div className="reportBar">
        <p className="sub">
          {rows ? `${shown.length} di ${rows.length} persone` : ""} · aggiornato ogni 10 s{updated ? ` (ore ${updated})` : ""}
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
                  <td>{r.tipo}</td>
                  <td className={r.presente ? "pres on" : "pres"} aria-label={r.presente ? "Presente" : "Assente"}>✔</td>
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
  );
}
