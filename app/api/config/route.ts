import { NextRequest, NextResponse } from "next/server";
import { adminGranted, getStore, rateLimited } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(`config:${ip}`, 20)) return NextResponse.json({ error: "Troppe richieste." }, { status: 429 });
  const body = await req.json().catch(() => null);
  if (!adminGranted(body?.accessCode)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  if (typeof body?.registrationsClosed !== "boolean") {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  try {
    await getStore().setRegistrationsClosed(body.registrationsClosed);
    return NextResponse.json(
      { ok: true, registrationsClosed: body.registrationsClosed },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : "errore");
    return NextResponse.json({ error: "Servizio temporaneamente non disponibile." }, { status: 500 });
  }
}
