import { NextRequest, NextResponse } from "next/server";
import { accessGranted, adminGranted, rateLimited } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(`access:${ip}`, 10)) return NextResponse.json({ error: "Troppi tentativi, riprova tra un minuto." }, { status: 429 });
  const body = await req.json().catch(() => null);
  if (adminGranted(body?.accessCode)) return NextResponse.json({ ok: true, admin: true }, { headers: { "Cache-Control": "no-store" } });
  if (!accessGranted(body?.accessCode)) return NextResponse.json({ error: "Codice di accesso errato." }, { status: 401 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
