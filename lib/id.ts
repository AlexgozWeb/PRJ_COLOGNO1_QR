import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateId(taken: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let id = "";
    for (let i = 0; i < 8; i++) id += ALPHABET[randomInt(ALPHABET.length)];
    if (!taken.has(id)) return id;
  }
  throw new Error("Impossibile generare un ID univoco");
}

/** Timestamp nel fuso Europe/Rome: YYYY-MM-DD HH:mm:ss */
export function romeTimestamp(now = new Date()): string {
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  return p;
}
