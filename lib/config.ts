import { isoToItalian, toIsoDate } from "./normalize";
import type { AssemblyInfo } from "./types";

const CTRL_RE = /[\x00-\x1F\x7F]/;
const IT_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Valida Nome Assemblea (1-120 caratteri) e Data Assemblea (GG/MM/AAAA, anche futura). */
export function validateAssemblyInfo(
  raw: unknown,
): { ok: true; data: AssemblyInfo } | { ok: false; errors: Record<string, string> } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const errors: Record<string, string> = {};

  const assemblyName = typeof b.assemblyName === "string" ? b.assemblyName.trim() : "";
  if (!assemblyName || assemblyName.length > 120 || CTRL_RE.test(assemblyName)) {
    errors.assemblyName = "Campo obbligatorio (max 120 caratteri).";
  }

  const rawDate = typeof b.assemblyDate === "string" ? b.assemblyDate.trim() : "";
  const iso = rawDate && IT_DATE_RE.test(rawDate) ? toIsoDate(rawDate) : null;
  if (!rawDate) {
    errors.assemblyDate = "Data obbligatoria (GG/MM/AAAA).";
  } else if (!iso) {
    errors.assemblyDate = "Usa una data valida nel formato GG/MM/AAAA.";
  }

  if (Object.keys(errors).length > 0 || !iso) return { ok: false, errors };
  return { ok: true, data: { assemblyName, assemblyDate: isoToItalian(iso) } };
}
