import { NextRequest, NextResponse } from "next/server";
import { adminGranted, getStore, rateLimited } from "@/lib/server";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(`stats:${ip}`, 30)) return NextResponse.json({ error: "Troppe richieste." }, { status: 429 });
  const body = await req.json().catch(() => null);
  if (!adminGranted(body?.accessCode)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  try {
    return NextResponse.json(await getStats(getStore()), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e instanceof Error ? e.message : "errore");
    return NextResponse.json({ error: "Servizio temporaneamente non disponibile." }, { status: 500 });
  }
}
