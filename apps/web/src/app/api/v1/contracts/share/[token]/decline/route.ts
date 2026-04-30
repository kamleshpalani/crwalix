import { NextResponse } from "next/server";
import { contractService } from "@/server/services/contract.service";
import { auditService } from "@/server/services/audit.service";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const contract = await contractService.declineByShareToken(params.token);
  if (!contract) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND_OR_INVALID" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ contract });
}
