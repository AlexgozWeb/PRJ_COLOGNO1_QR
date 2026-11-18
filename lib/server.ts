import { GoogleSheetStore } from "./googleSheet";
import { MockSheetStore } from "./mock";
import type { SheetStore } from "./types";
import { toIsoDate } from "./normalize";
import type { PersonInput } from "./service";

const g = globalThis as unknown as { __store?: SheetStore; __hits?: Map<string, number[]> };

export function getStore(): SheetStore {
  if (!g.__store) g.__store = process.env.MOCK_SHEET === "1" ? new MockSheetStore() : new GoogleSheetStore();
  return g.__store;
}

/** Rate limit in memoria (best effort per istanza serverless). */
export function rateLimited(ip: string, max = 20, windowMs = 60_000): boolean {
  const hits = (g.__hits ??= new Map<string, number[]>());
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}

export function parseInput(body: unknown): PersonInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const f = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
  const p = { nome: f("nome"), cognome: f("cognome"), dataNascita: f("dataNascita"), luogoNascita: f("luogoNascita") };
  if (Object.values(p).some((v) => !v || v.length > 100)) return null;
  if (!toIsoDate(p.dataNascita)) return null;
  return p;
}
