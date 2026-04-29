import { NextResponse } from "next/server";
import { quoteService } from "@/server/services/quote.service";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const quote = await quoteService.declineByShareToken(params.token);
  if (!quote)
    return NextResponse.json(
      { error: { code: "NOT_FOUND_OR_INVALID" } },
      { status: 404 },
    );
  return NextResponse.json({ quote });
}
