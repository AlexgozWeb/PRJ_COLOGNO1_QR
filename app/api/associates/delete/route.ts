import { NextRequest, NextResponse } from "next/server";
import { deleteAssociate, parseRowRef } from "@/lib/associates";
import { adminGranted, getStore, rateLimited } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(`associates-delete:${ip}`, 30)) return NextResponse.json({ error: "Troppe richieste." }, { status: 429 });
  const body = await req.json().catch(() => null);
  if (!adminGranted(body?.accessCode)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  const ref = parseRowRef(body);
  if (!ref) return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  try {
    const res = await deleteAssociate(getStore(), ref.rowNumber, ref.fingerprint);
    if (res.status === "not_found") {
      return NextResponse.json({ error: "Nominativo non trovato." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (res.status === "conflict") {
      return NextResponse.json(
        { status: "conflict", error: "Elenco aggiornato nel frattempo, riprova." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e instanceof Error ? e.message : "errore");
    return NextResponse.json({ error: "Servizio temporaneamente non disponibile." }, { status: 500 });
  }
}
