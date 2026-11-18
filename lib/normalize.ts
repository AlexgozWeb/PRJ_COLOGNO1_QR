export function normalizeText(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`´\-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Restituisce YYYY-MM-DD oppure null. Accetta GG/MM/AAAA, AAAA-MM-GG e seriali Google/Excel. */
export function toIsoDate(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  let y: number, m: number, d: number;
  let mt = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (mt) {
    d = +mt[1];
    m = +mt[2];
    y = +mt[3];
  } else if ((mt = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    y = +mt[1];
    m = +mt[2];
    d = +mt[3];
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function isoToItalian(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
