import { DEFAULT_ASSEMBLY_DATE, DEFAULT_ASSEMBLY_NAME, type AssemblyInfo } from "./types";

export interface ReceiptPerson {
  nome: string;
  cognome: string;
  dataNascita: string;
  luogoNascita: string;
}

export interface ReceiptKid {
  nome: string;
  cognome: string;
  dataNascita: string;
}

export function downloadReceipt(
  p: ReceiptPerson,
  id: string,
  ts: string,
  kids: ReceiptKid[],
  assembly?: AssemblyInfo,
) {
  const name = assembly?.assemblyName?.trim() || DEFAULT_ASSEMBLY_NAME;
  const date = assembly?.assemblyDate?.trim() || DEFAULT_ASSEMBLY_DATE;
  const headerLine = `${name}${date ? ` ${date}` : ""} - Gruppo Scout Cologno Monzese 1`;
  const list = kids.length
    ? ["", "Registrati insieme a te (ragazzi):", ...kids.map((k) => `- ${k.cognome} ${k.nome} (${k.dataNascita})`)]
    : [];
  const text = [
    headerLine,
    "RICEVUTA DI REGISTRAZIONE PRESENZA",
    "",
    `Cognome: ${p.cognome}`,
    `Nome: ${p.nome}`,
    `Data di nascita: ${p.dataNascita}`,
    `Luogo di nascita: ${p.luogoNascita}`,
    `ID_UNIQUE: ${id}`,
    `Registrato il: ${ts}`,
    ...list,
    "",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `registrazione-assemblea-${id}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
