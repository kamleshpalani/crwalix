import { NextResponse } from "next/server";
import { quoteService } from "@/server/services/quote.service";

export const runtime = "nodejs";

/**
 * Public — no auth. Customer accepts the quote via the share link.
 */
export async function POST(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const quote = await quoteService.acceptByShareToken(params.token);
  if (!quote)
    return NextResponse.json(
      { error: { code: "NOT_FOUND_OR_EXPIRED" } },
      { status: 404 },
    );
  return NextResponse.json({ quote });
}
