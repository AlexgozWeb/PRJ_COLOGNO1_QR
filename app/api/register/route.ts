import { NextRequest } from "next/server";
import { handle } from "@/lib/handler";
import { register } from "@/lib/service";

export const dynamic = "force-dynamic";
export const POST = (req: NextRequest) => handle(req, register);
