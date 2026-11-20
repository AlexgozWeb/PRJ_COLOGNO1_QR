import { NextRequest, NextResponse } from "next/server";
import { parsePersonRequest } from "@/lib/handler";
import { getStore } from "@/lib/server";
import { previewUnregister, unregister } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const parsed = await parsePersonRequest(req, { scope: "report-unregister", max: 30, admin: true });
  if (!parsed.ok) return parsed.res;
  try {
    const store = getStore();
    if (parsed.body.dryRun === true) {
      const preview = await previewUnregister(store, parsed.input);
      if (preview.status === "closed") {
        return NextResponse.json(
          { status: "closed", error: "Le registrazioni per l'Assemblea sono chiuse." },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        );
      }
      if (preview.status === "ok") {
        return NextResponse.json(
          {
            status: "ok",
            target: preview.target,
            cascadeRemoved: preview.cascadeRemoved,
            relatedKept: preview.relatedKept,
            rowCount: preview.rowNumbers.length,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
    }
    const res = await unregister(store, parsed.input);
    if (res.status === "closed") {
      return NextResponse.json(
        { status: "closed", error: "Le registrazioni per l'Assemblea sono chiuse." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e instanceof Error ? e.message : "errore");
    return NextResponse.json({ error: "Servizio temporaneamente non disponibile." }, { status: 500 });
  }
}
