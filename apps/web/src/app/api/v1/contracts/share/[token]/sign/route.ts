import { NextResponse } from "next/server";
import { z } from "zod";
import { contractService } from "@/server/services/contract.service";
import { auditService } from "@/server/services/audit.service";

export const runtime = "nodejs";

const Body = z.object({
  typedName: z.string().min(2).max(200),
});

export async function POST(
  req: Request,
  { params }: { params: { token: string } },
) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON" } },
      { status: 400 },
    );
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  // Capture forwarded IP and UA for tamper-evidence.
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0]!.trim() : null;
  const userAgent = req.headers.get("user-agent");
  const contract = await contractService.signByShareToken({
    token: params.token,
    typedName: parsed.data.typedName,
    ip,
    userAgent,
  });
  if (!contract) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND_OR_EXPIRED" } },
      { status: 404 },
    );
  }
  await auditService.record({
    orgId: null,
    action: "contract.sign",
    target: contract.id,
    metadata: { number: contract.number, signedName: contract.signedName },
    ip,
    userAgent,
  });
  return NextResponse.json({ contract });
}
