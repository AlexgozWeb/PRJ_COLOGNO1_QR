import { NextRequest, NextResponse } from "next/server";
import { accessGranted, adminGranted, getStore, parseInput, rateLimited } from "@/lib/server";
import { lookup, register, type PersonInput } from "@/lib/service";
import type { SheetStore } from "@/lib/types";

export type PersonAction<T extends { status: string }> = (store: SheetStore, input: PersonInput, ip?: string) => Promise<T>;

export async function parsePersonRequest(
  req: NextRequest,
  opts: { scope: string; max?: number; admin?: boolean },
): Promise<{ ok: true; ip: string; input: PersonInput; body: Record<string, unknown> } | { ok: false; res: NextResponse }> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(`${opts.scope}:${ip}`, opts.max ?? 20)) {
    return { ok: false, res: NextResponse.json({ error: "Troppe richieste, riprova tra un minuto." }, { status: 429 }) };
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: NextResponse.json({ error: "Richiesta non valida." }, { status: 400 }) };
  }
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const granted = opts.admin ? adminGranted(body.accessCode) : accessGranted(body.accessCode);
  if (!granted) {
    return {
      ok: false,
      res: NextResponse.json({ error: opts.admin ? "Non autorizzato." : "Codice di accesso non valido." }, { status: 401 }),
    };
  }
  const input = parseInput(raw);
  if (!input) return { ok: false, res: NextResponse.json({ error: "Dati non validi." }, { status: 400 }) };
  return { ok: true, ip, input, body };
}

export async function handle(req: NextRequest, fn: typeof lookup | typeof register, admin = false, scope = "public") {
  const parsed = await parsePersonRequest(req, { scope, max: admin ? 30 : 20, admin });
  if (!parsed.ok) return parsed.res;
  try {
    const result = await fn(getStore(), parsed.input, parsed.ip);
    if (result.status === "closed") {
      return NextResponse.json(
        { status: "closed", error: "Le registrazioni per l'Assemblea sono chiuse." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (fn === register && result.status === "minor") {
      return NextResponse.json(
        { ...result, error: "Socio minorenne: impossibile registrarsi autonomamente." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e instanceof Error ? e.message : "errore");
    return NextResponse.json({ error: "Servizio temporaneamente non disponibile." }, { status: 500 });
  }
}
