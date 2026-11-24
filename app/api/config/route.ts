import { NextRequest, NextResponse } from "next/server";
import { validateAssemblyInfo } from "@/lib/config";
import { adminGranted, getStore, rateLimited } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(`config-public:${ip}`, 60)) return NextResponse.json({ error: "Troppe richieste." }, { status: 429 });
  try {
    const cfg = await getStore().getAppConfig();
    return NextResponse.json(
      { assemblyName: cfg.assemblyName, assemblyDate: cfg.assemblyDate },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : "errore");
    return NextResponse.json({ error: "Servizio temporaneamente non disponibile." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(`config:${ip}`, 20)) return NextResponse.json({ error: "Troppe richieste." }, { status: 429 });
  const body = await req.json().catch(() => null);
  if (!adminGranted(body?.accessCode)) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });

  const hasClosed = typeof body?.registrationsClosed === "boolean";
  const hasAssembly = body && typeof body === "object" && ("assemblyName" in body || "assemblyDate" in body);
  if (!hasClosed && !hasAssembly) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  try {
    const store = getStore();
    if (hasAssembly) {
      const parsed = validateAssemblyInfo(body);
      if (!parsed.ok) {
        return NextResponse.json(
          { status: "invalid", error: "Dati non validi.", errors: parsed.errors },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      await store.setAssemblyInfo(parsed.data);
      return NextResponse.json(
        { ok: true, assemblyName: parsed.data.assemblyName, assemblyDate: parsed.data.assemblyDate },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    await store.setRegistrationsClosed(body.registrationsClosed);
    return NextResponse.json(
      { ok: true, registrationsClosed: body.registrationsClosed },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : "errore");
    return NextResponse.json({ error: "Servizio temporaneamente non disponibile." }, { status: 500 });
  }
}
