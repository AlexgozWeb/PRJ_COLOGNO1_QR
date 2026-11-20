import { GoogleAuth } from "google-auth-library";
import { toIsoDate } from "./normalize";
import type { Registration, SheetRow, SheetStore } from "./types";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

class SheetsError extends Error {
  constructor(public status: number) {
    super(`Sheets API ${status}`);
  }
}

function colIndex(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function colLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function isTruthyFlag(v: unknown): boolean {
  return (
    v === true ||
    v === 1 ||
    ["TRUE", "SI", "SÌ", "S", "X", "1", "VERO", "YES"].includes(String(v ?? "").trim().toUpperCase())
  );
}

export function locateConfigParam(
  values: unknown[][],
  paramName: string,
): { paramIdx: number; valueFromIdx: number; rowNumber: number | null; value: unknown } {
  if (!values.length) return { paramIdx: 0, valueFromIdx: 1, rowNumber: null, value: undefined };
  const header = values[0].map((h) => String(h ?? "").trim().toLowerCase());
  const pIdx = header.indexOf("parameter");
  const vIdx = header.indexOf("value from");
  const paramIdx = pIdx >= 0 ? pIdx : 0;
  const valueFromIdx = vIdx >= 0 ? vIdx : 1;
  const target = paramName.trim().toUpperCase();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][paramIdx] ?? "").trim().toUpperCase() === target) {
      return { paramIdx, valueFromIdx, rowNumber: i + 1, value: values[i][valueFromIdx] };
    }
  }
  return { paramIdx, valueFromIdx, rowNumber: null, value: undefined };
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
  private configSheet = process.env.CONFIG_SHEET_NAME || "Config";
  private static readonly CLOSED_PARAM = "REGISTRATIONS_CLOSED";
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
    if (!res.ok) throw new SheetsError(res.status);
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
    const hv = header.indexOf("votante");
    const P = hv >= 0 ? hv : colIndex(process.env.COL_VOTANTE || "P");
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
      votante: isTruthyFlag(r[P]),
      id: s(r, M),
      timestamp: s(r, O),
    }));
  }

  private async updateRows(rowNumbers: number[], l: boolean, m: string, n: string, o: string): Promise<void> {
    if (!rowNumbers.length) return;
    const data = rowNumbers.flatMap((row) => [
      { range: `'${this.sheet}'!${this.colL}${row}`, values: [[l]] },
      { range: `'${this.sheet}'!${this.colM}${row}`, values: [[m]] },
      { range: `'${this.sheet}'!${this.colN}${row}`, values: [[n]] },
      { range: `'${this.sheet}'!${this.colO}${row}`, values: [[o]] },
    ]);
    await this.api(`/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    });
  }

  async writeRegistration(reg: Registration): Promise<void> {
    await this.updateRows(reg.rowNumbers, true, reg.id, reg.ip, reg.timestamp);
  }

  async clearRegistration(rowNumbers: number[]): Promise<void> {
    await this.updateRows(rowNumbers, false, "", "", "");
  }

  async getRegistrationsClosed(): Promise<boolean> {
    const range = encodeURIComponent(`'${this.configSheet}'!A1:C`);
    let values: unknown[][];
    try {
      const data = await this.api(`/values/${range}?valueRenderOption=UNFORMATTED_VALUE`);
      values = data.values ?? [];
    } catch (e) {
      if (e instanceof SheetsError && e.status === 400) return false;
      throw e;
    }
    const loc = locateConfigParam(values, GoogleSheetStore.CLOSED_PARAM);
    return loc.rowNumber !== null ? isTruthyFlag(loc.value) : false;
  }

  async setRegistrationsClosed(closed: boolean): Promise<void> {
    const val = closed ? 1 : 0;
    const range = encodeURIComponent(`'${this.configSheet}'!A1:C`);
    let values: unknown[][] | null = null;
    try {
      const data = await this.api(`/values/${range}?valueRenderOption=UNFORMATTED_VALUE`);
      values = data.values ?? [];
    } catch (e) {
      if (!(e instanceof SheetsError && e.status === 400)) throw e;
      await this.api(`:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: this.configSheet } } }] }),
      });
    }

    if (!values || values.length === 0) {
      await this.api(`/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: [
            {
              range: `'${this.configSheet}'!A1:C2`,
              values: [
                ["parameter", "value from", "value to"],
                [GoogleSheetStore.CLOSED_PARAM, val, ""],
              ],
            },
          ],
        }),
      });
      return;
    }

    const loc = locateConfigParam(values, GoogleSheetStore.CLOSED_PARAM);
    const data =
      loc.rowNumber !== null
        ? [{ range: `'${this.configSheet}'!${colLetter(loc.valueFromIdx)}${loc.rowNumber}`, values: [[val]] }]
        : [
            { range: `'${this.configSheet}'!${colLetter(loc.paramIdx)}${values.length + 1}`, values: [[GoogleSheetStore.CLOSED_PARAM]] },
            { range: `'${this.configSheet}'!${colLetter(loc.valueFromIdx)}${values.length + 1}`, values: [[val]] },
          ];
    await this.api(`/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    });
  }
}
