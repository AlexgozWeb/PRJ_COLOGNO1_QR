import { NextRequest, NextResponse } from "next/server";
import { getStore, parseInput, rateLimited } from "@/lib/server";
import { lookup, register } from "@/lib/service";

export async function handle(req: NextRequest, fn: typeof lookup | typeof register) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "Troppe richieste, riprova tra un minuto." }, { status: 429 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  const input = parseInput(body);
  if (!input) return NextResponse.json({ error: "Dati non validi." }, { status: 400 });
  try {
    return NextResponse.json(await fn(getStore(), input, ip), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e instanceof Error ? e.message : "errore");
    return NextResponse.json({ error: "Servizio temporaneamente non disponibile." }, { status: 500 });
  }
}
