"use client";

import { useEffect, useRef, useState } from "react";
import { APP_VERSION } from "../lib/version";

type Stats = {
  soci: number;
  sociVotanti: number;
  registrati: number;
  votantiTotali: number;
  votantiRegistrati: number;
  aggiornato: string;
  registrationsClosed: boolean;
};

/** Colore in base alla % di aventi diritto presenti; verde solo con maggioranza (> 50%). */
export function quorumColor(reg: number, tot: number): string {
  if (tot > 0 && reg * 2 > tot) return "#16a34a";
  const pct = tot > 0 ? (reg / tot) * 100 : 0;
  if (pct <= 15) return "#dc2626";
  if (pct <= 35) return "#eab308";
  return "#fde68a";
}

function Gauge({ reg, tot }: { reg: number; tot: number }) {
  const pct = tot > 0 ? Math.min(100, (reg / tot) * 100) : 0;
  const color = quorumColor(reg, tot);
  const arc = "M 15 100 A 85 85 0 0 1 185 100";
  return (
    <svg viewBox="0 0 200 115" className="gauge" role="img" aria-label={`Quorum ${pct.toFixed(0)}%`}>
      <path d={arc} fill="none" stroke="#334155" strokeWidth="22" pathLength={100} />
      <path d={arc} fill="none" stroke={color} strokeWidth="22" pathLength={100} strokeDasharray={`${pct} 100`} style={{ transition: "stroke-dasharray .6s, stroke .6s" }} />
      <line x1="100" y1="3" x2="100" y2="26" stroke="#fff" strokeWidth="2" />
      <text x="100" y="82" textAnchor="middle" fontSize="30" fontWeight="800" fill="#fff">{reg}</text>
      <text x="100" y="100" textAnchor="middle" fontSize="11" fill="#cbd5e1">su {tot} aventi diritto ({pct.toFixed(0)}%)</text>
      <text x="15" y="113" textAnchor="middle" fontSize="9" fill="#94a3b8">0</text>
      <text x="185" y="113" textAnchor="middle" fontSize="9" fill="#94a3b8">{tot}</text>
    </svg>
  );
}

export default function StatsPage({ code, onExit, onReport }: { code: string; onExit: () => void; onReport: () => void }) {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [toggling, setToggling] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    let stop = false;
    async function load() {
      const mySeq = seq.current;
      try {
        const res = await fetch("/api/stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessCode: code }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Errore");
        if (!stop && mySeq === seq.current) { setS(data); setErr(""); }
      } catch (e) {
        if (!stop && mySeq === seq.current) setErr((e as Error).message);
      }
    }
    load();
    const t = setInterval(load, 10000);
    return () => { stop = true; clearInterval(t); };
  }, [code]);

  async function onToggle() {
    if (!s) return;
    seq.current += 1;
    setToggling(true);
    setErr("");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code, registrationsClosed: !s.registrationsClosed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Errore");
      setS((prev) => (prev ? { ...prev, registrationsClosed: data.registrationsClosed } : prev));
      setConfirmToggle(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setToggling(false);
    }
  }

  const quorum = s ? Math.floor(s.votantiTotali / 2) + 1 : 0;
  return (
    <main className="screen stats">
      <span className="versionBadge" title="Versione app">{APP_VERSION}</span>
      <h1>Statistiche Assemblea</h1>
      {s && (
        <span className={`statusPill ${s.registrationsClosed ? "closed" : "open"}`}>
          {s.registrationsClosed ? "Registrazioni CHIUSE" : "Registrazioni APERTE"}
        </span>
      )}
      {err && <p className="sub" style={{ color: "#fca5a5" }}>{err}</p>}
      {!s && !err && <div className="spinner" role="status" aria-label="Caricamento" />}
      {s && (
        <>
          <div className="statGrid">
            <div className="stat"><b>{s.soci}</b><span>Soci (esclusi tutori)</span></div>
            <div className="stat"><b>{s.sociVotanti}</b><span>Soci aventi diritto al voto</span></div>
            <div className="stat"><b>{s.registrati}</b>            <span>Persone registrate (Soci + Tutori)</span></div>
                        <div className="stat"><b>{s.votantiRegistrati}</b><span>Soci aventi diritto al voto registrati</span></div>
          </div>
          <h2>Quorum</h2>
          <Gauge reg={s.votantiRegistrati} tot={s.votantiTotali} />
          <p className="sub">Quorum raggiunto con {quorum} presenti (50% + 1) · aggiornato ogni 10 s</p>
        </>
      )}
      {s && confirmToggle && (
        <div className="confirmBox">
          <p>
            {s.registrationsClosed
              ? "Confermi di voler riaprire le registrazioni per i soci?"
              : "Confermi di voler chiudere le registrazioni? I soci non potranno più registrarsi."}
          </p>
          <div className="confirmActions">
            <button className={`btn btnSmall ${s.registrationsClosed ? "okBtn" : "danger"}`} disabled={toggling} onClick={onToggle}>
              {toggling ? "Salvataggio…" : "Conferma"}
            </button>
            <button className="btn btnSmall cancel" disabled={toggling} onClick={() => setConfirmToggle(false)}>
              Annulla
            </button>
          </div>
        </div>
      )}
      <div className="statsActions">
        {s && (
          <button
            className={`btn btnSmall ${s.registrationsClosed ? "okBtn" : "danger"}`}
            disabled={toggling || confirmToggle}
            onClick={() => setConfirmToggle(true)}
          >
            {s.registrationsClosed ? "Riapri registrazioni" : "Chiudi registrazioni"}
          </button>
        )}
        <button className="btn btnSmall" onClick={onReport}>Report di dettaglio</button>
        <button className="btn btnSmall" onClick={onExit}>Esci</button>
      </div>
    </main>
  );
}
