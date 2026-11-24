import { GoogleAuth } from "google-auth-library";
import { toIsoDate } from "./normalize";
import type { NewRow, Registration, RowUpdate, RowUpdateItem, SheetRow, SheetStore } from "./types";

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

export function toSheetSocioCode(codiceSocio: string): number | string {
  const s = codiceSocio.trim();
  return /^\d{1,15}$/.test(s) ? Number(s) : s;
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

const OPTIONAL_HEADERS = {
  codiceFiscale: "codice fiscale",
  cellulare: "cellulare",
  dataDeliberaAmmissione: "data delibera ammissione",
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
  private numericSheetId?: number;

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

  private resolveHeaderColumns(headerRow: unknown[]) {
    const header = headerRow.map((h) => String(h ?? "").trim().toLowerCase());
    const idx = Object.fromEntries(
      Object.entries(HEADERS).map(([k, h]) => [k, header.indexOf(h)]),
    ) as Record<keyof typeof HEADERS, number>;
    for (const [k, i] of Object.entries(idx)) if (i < 0) throw new Error(`Intestazione mancante: ${k}`);
    const optIdx = Object.fromEntries(
      Object.entries(OPTIONAL_HEADERS).map(([k, h]) => [k, header.indexOf(h)]),
    ) as Record<keyof typeof OPTIONAL_HEADERS, number>;
    const hv = header.indexOf("votante");
    const P = hv >= 0 ? hv : colIndex(process.env.COL_VOTANTE || "P");
    return { idx, optIdx, P };
  }

  private async getNumericSheetId(): Promise<number> {
    if (this.numericSheetId !== undefined) return this.numericSheetId;
    const meta = await this.api(`?fields=sheets.properties(sheetId,title)`);
    const sheets = (meta?.sheets ?? []) as { properties?: { sheetId?: number; title?: string } }[];
    const match = sheets.find((s) => s.properties?.title === this.sheet);
    if (match?.properties?.sheetId === undefined) throw new Error(`Foglio non trovato: ${this.sheet}`);
    this.numericSheetId = match.properties.sheetId;
    return this.numericSheetId;
  }

  async getRows(): Promise<SheetRow[]> {
    const range = encodeURIComponent(`'${this.sheet}'!A1:Z`);
    const data = await this.api(`/values/${range}?valueRenderOption=UNFORMATTED_VALUE`);
    const values: unknown[][] = data.values ?? [];
    if (!values.length) return [];
    const { idx, optIdx, P } = this.resolveHeaderColumns(values[0]);
    const L = colIndex(this.colL), M = colIndex(this.colM), O = colIndex(this.colO);
    const s = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
    return values.slice(1).map((r, i) => ({
      rowNumber: i + 2,
      codiceSocio: s(r, idx.codiceSocio),
      cognome: s(r, idx.cognome),
      nome: s(r, idx.nome),
      tipo: s(r, idx.tipo),
      adultoGiovane: s(r, idx.adultoGiovane),
      codiceFiscale: s(r, optIdx.codiceFiscale),
      dataNascita: toIsoDate(r[idx.dataNascita]),
      luogoNascita: s(r, idx.luogoNascita),
      cellulare: s(r, optIdx.cellulare),
      email: s(r, idx.email),
      dataDeliberaAmmissione: optIdx.dataDeliberaAmmissione >= 0 ? toIsoDate(r[optIdx.dataDeliberaAmmissione]) : null,
      presente: r[L] === true || String(r[L]).toUpperCase() === "TRUE",
      votante: isTruthyFlag(r[P]),
      id: s(r, M),
      timestamp: s(r, O),
    }));
  }

  private async setPresenceRows(rowNumbers: number[], l: boolean, m: string, n: string, o: string): Promise<void> {
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
    await this.setPresenceRows(reg.rowNumbers, true, reg.id, reg.ip, reg.timestamp);
  }

  async clearRegistration(rowNumbers: number[]): Promise<void> {
    await this.setPresenceRows(rowNumbers, false, "", "", "");
  }

  private async readHeaderColumns() {
    const headerRange = encodeURIComponent(`'${this.sheet}'!1:1`);
    const headerRes = await this.api(`/values/${headerRange}?valueRenderOption=UNFORMATTED_VALUE`);
    const headerRow = (headerRes.values?.[0] ?? []) as unknown[];
    return this.resolveHeaderColumns(headerRow);
  }

  async updateRows(items: RowUpdateItem[]): Promise<void> {
    if (!items.length) return;
    for (const item of items) {
      if (!Number.isInteger(item.rowNumber) || item.rowNumber < 2) throw new Error("Riga non valida");
    }
    const { idx, optIdx, P } = await this.readHeaderColumns();

    // Mappa delle sole colonne modificabili; Tipo e colonne L-O non vengono mai toccati.
    const data = items.flatMap(({ rowNumber, data: regData }) => {
      const cells: Array<[number, unknown]> = [
        [idx.codiceSocio, toSheetSocioCode(regData.codiceSocio)],
        [idx.cognome, regData.cognome],
        [idx.nome, regData.nome],
        [idx.adultoGiovane, regData.adultoGiovane],
        [idx.dataNascita, regData.dataNascita],
        [idx.luogoNascita, regData.luogoNascita],
        [idx.email, regData.email],
        [P, regData.votante ? "SI" : "NO"],
      ];
      if (optIdx.codiceFiscale >= 0) cells.push([optIdx.codiceFiscale, regData.codiceFiscale]);
      if (optIdx.cellulare >= 0) cells.push([optIdx.cellulare, regData.cellulare]);
      if (optIdx.dataDeliberaAmmissione >= 0) cells.push([optIdx.dataDeliberaAmmissione, regData.dataDeliberaAmmissione]);
      return cells.map(([colIdx, val]) => ({
        range: `'${this.sheet}'!${colLetter(colIdx)}${rowNumber}`,
        values: [[val]],
      }));
    });
    await this.api(`/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    });
  }

  async updateRow(rowNumber: number, regData: RowUpdate): Promise<void> {
    await this.updateRows([{ rowNumber, data: regData }]);
  }

  async appendRows(newRows: NewRow[]): Promise<void> {
    if (!newRows.length) return;
    const { idx, optIdx, P } = await this.readHeaderColumns();
    const L = colIndex(this.colL);
    const M = colIndex(this.colM);
    const N = colIndex(this.colN);
    const O = colIndex(this.colO);
    const maxCol = Math.max(
      ...Object.values(idx),
      ...Object.values(optIdx).filter((i) => i >= 0),
      L,
      M,
      N,
      O,
      P,
    );
    const values = newRows.map((r) => {
      const row: unknown[] = Array(maxCol + 1).fill("");
      row[idx.codiceSocio] = toSheetSocioCode(r.codiceSocio);
      row[idx.cognome] = r.cognome;
      row[idx.nome] = r.nome;
      row[idx.tipo] = r.tipo;
      row[idx.adultoGiovane] = r.adultoGiovane;
      if (optIdx.codiceFiscale >= 0) row[optIdx.codiceFiscale] = r.codiceFiscale;
      row[idx.dataNascita] = r.dataNascita;
      row[idx.luogoNascita] = r.luogoNascita;
      if (optIdx.cellulare >= 0) row[optIdx.cellulare] = r.cellulare;
      row[idx.email] = r.email;
      if (optIdx.dataDeliberaAmmissione >= 0) row[optIdx.dataDeliberaAmmissione] = r.dataDeliberaAmmissione;
      row[L] = false;
      row[M] = "";
      row[N] = "";
      row[O] = "";
      row[P] = r.votante ? "SI" : "NO";
      return row;
    });
    const appendRange = encodeURIComponent(`'${this.sheet}'!A1`);
    await this.api(`/values/${appendRange}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ values }),
    });
  }

  async deleteRow(rowNumber: number): Promise<void> {
    if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error("Riga non valida");
    const sheetId = await this.getNumericSheetId();
    await this.api(`:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowNumber - 1,
                endIndex: rowNumber,
              },
            },
          },
        ],
      }),
    });
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
