/**
 * GET  /api/v1/projects/[id]/files — list files
 * POST /api/v1/projects/[id]/files — request upload URL OR confirm upload
 *
 * POST has two modes (set via `action` field):
 *   { action: "request-upload", filename: "..." } → returns signed PUT URL
 *   { action: "confirm-upload", storagePath, filename, mimeType, sizeBytes } → DB row
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireOrg,
  isResponse,
  isAuthError,
  hasProjectAccess,
  requireRole,
} from "@/lib/auth";
import { fileService } from "@/server/services/file.service";

const RequestUploadSchema = z.object({
  action: z.literal("request-upload"),
  filename: z.string().min(1).max(255),
});

const ConfirmUploadSchema = z.object({
  action: z.literal("confirm-upload"),
  storagePath: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z
    .number()
    .int()
    .min(0)
    .max(100 * 1024 * 1024), // 100MB cap
  contentHash: z.string().optional(),
});

const PostSchema = z.discriminatedUnion("action", [
  RequestUploadSchema,
  ConfirmUploadSchema,
]);

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const items = await fileService.list(ctx.orgId, params.id);
  return NextResponse.json({ items });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const denied = requireRole(ctx, hasProjectAccess);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", issues: parsed.error.issues } },
      { status: 400 },
    );
  }

  if (parsed.data.action === "request-upload") {
    const intent = await fileService.createUploadIntent(
      ctx.orgId,
      params.id,
      parsed.data.filename,
    );
    if (!intent)
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    return NextResponse.json({ intent });
  }

  // confirm-upload
  const file = await fileService.confirmUpload(ctx.orgId, ctx.userId, {
    projectId: params.id,
    storagePath: parsed.data.storagePath,
    filename: parsed.data.filename,
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.sizeBytes,
    contentHash: parsed.data.contentHash,
  });

  return NextResponse.json({ file }, { status: 201 });
}
