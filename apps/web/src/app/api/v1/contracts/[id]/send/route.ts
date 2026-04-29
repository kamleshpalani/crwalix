import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { contractService } from "@/server/services/contract.service";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  try {
    const contract = await contractService.send(ctx.orgId, params.id);
    return NextResponse.json({ contract });
  } catch (e) {
    const code = e instanceof Error ? e.message : "ERROR";
    const status =
      code === "NOT_FOUND" ? 404 : code === "ALREADY_SENT" ? 409 : 500;
    return NextResponse.json({ error: { code } }, { status });
  }
}
