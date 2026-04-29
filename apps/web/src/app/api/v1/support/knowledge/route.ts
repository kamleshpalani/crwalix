import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { supportService } from "@/server/services/support.service";

const Body = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(32000),
  sourceUrl: z.string().url().optional().nullable(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
});

export async function GET() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const articles = await supportService.listArticles(ctx.orgId);
  return NextResponse.json({ articles });
}

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

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
  const article = await supportService.ingestArticle({
    orgId: ctx.orgId,
    title: parsed.data.title,
    content: parsed.data.content,
    sourceUrl: parsed.data.sourceUrl ?? null,
    tags: parsed.data.tags,
  });
  return NextResponse.json({ article });
}
