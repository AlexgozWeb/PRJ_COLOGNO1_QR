import { GoogleAuth } from "google-auth-library";
import { toIsoDate } from "./normalize";
import type { Registration, SheetRow, SheetStore } from "./types";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function colIndex(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variabile d'ambiente mancante: ${name}`);
  return v;
}

const HEADERS = {
  codiceSocio: "codice socio",
  cognome: "cognome",
  nome: "nome",
  tipo: "tipo",
  adultoGiovane: "adulto-giovane",
  dataNascita: "data nascita",
  luogoNascita: "comune nascita",
  email: "email",
} as const;

export class GoogleSheetStore implements SheetStore {
  private auth = new GoogleAuth({
    credentials: {
      client_email: need("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      private_key: need("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    },
    scopes: [SCOPE],
  });
  private sheetId = need("GOOGLE_SHEET_ID");
  private sheet = process.env.SHEET_NAME || "Presenze";
  private colL = (process.env.COL_PRESENZA || "L").toUpperCase();
  private colM = (process.env.COL_ID || "M").toUpperCase();
  private colN = (process.env.COL_IP || "N").toUpperCase();
  private colO = (process.env.COL_TIMESTAMP || "O").toUpperCase();

  private async api(path: string, init?: RequestInit): Promise<any> {
    const client = await this.auth.getClient();
    const { token } = await client.getAccessToken();
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Sheets API ${res.status}`);
    return res.json();
  }

  async getRows(): Promise<SheetRow[]> {
    const range = encodeURIComponent(`'${this.sheet}'!A1:Z`);
    const data = await this.api(`/values/${range}?valueRenderOption=UNFORMATTED_VALUE`);
    const values: unknown[][] = data.values ?? [];
    if (!values.length) return [];
    const header = values[0].map((h) => String(h ?? "").trim().toLowerCase());
    const idx = Object.fromEntries(
      Object.entries(HEADERS).map(([k, h]) => [k, header.indexOf(h)]),
    ) as Record<keyof typeof HEADERS, number>;
    for (const [k, i] of Object.entries(idx)) if (i < 0) throw new Error(`Intestazione mancante: ${k}`);
    const L = colIndex(this.colL), M = colIndex(this.colM), O = colIndex(this.colO);
    const s = (r: unknown[], i: number) => String(r[i] ?? "").trim();
    return values.slice(1).map((r, i) => ({
      rowNumber: i + 2,
      codiceSocio: s(r, idx.codiceSocio),
      cognome: s(r, idx.cognome),
      nome: s(r, idx.nome),
      tipo: s(r, idx.tipo),
      adultoGiovane: s(r, idx.adultoGiovane),
      dataNascita: toIsoDate(r[idx.dataNascita]),
      luogoNascita: s(r, idx.luogoNascita),
      email: s(r, idx.email),
      presente: r[L] === true || String(r[L]).toUpperCase() === "TRUE",
      id: s(r, M),
      timestamp: s(r, O),
    }));
  }

  async writeRegistration(reg: Registration): Promise<void> {
    const data = reg.rowNumbers.flatMap((n) => [
      { range: `'${this.sheet}'!${this.colL}${n}`, values: [[true]] },
      { range: `'${this.sheet}'!${this.colM}${n}`, values: [[reg.id]] },
      { range: `'${this.sheet}'!${this.colN}${n}`, values: [[reg.ip]] },
      { range: `'${this.sheet}'!${this.colO}${n}`, values: [[reg.timestamp]] },
    ]);
    await this.api(`/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    });
  }
}
