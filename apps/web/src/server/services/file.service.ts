/**
 * File service (Phase 3.5).
 *
 * Brokers project file uploads/downloads via Supabase Storage. Pattern:
 *   1. Client requests an upload URL → we return a signed PUT URL + storagePath.
 *   2. Client uploads bytes directly to Supabase (bypasses our server).
 *   3. Client calls confirmUpload() with metadata → we create ProjectFile row.
 *   4. To download: we generate a short-lived signed GET URL.
 *
 * This keeps file bytes off our Vercel functions (which have a 4.5MB body
 * limit) and avoids egress through our infra.
 *
 * Env required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY  (server-only, never exposed to client)
 *   - SUPABASE_STORAGE_BUCKET    (default: "project-files")
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { prisma, withOrg } from "@crawlix/db";

const DEFAULT_BUCKET = "project-files";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour for uploads
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60; // 5 minutes for downloads

let _supabase: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set",
    );
  }
  _supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

function bucketName(): string {
  return process.env.SUPABASE_STORAGE_BUCKET ?? DEFAULT_BUCKET;
}

/**
 * Build the canonical storage path for a project file.
 * Format: <orgId>/<projectId>/<uuid>-<filename>
 */
function buildStoragePath(
  orgId: string,
  projectId: string,
  filename: string,
): string {
  // Sanitize filename: strip path separators and control chars.
  const safe = filename.replace(/[/\\\x00-\x1f]/g, "_").slice(0, 200);
  return `${orgId}/${projectId}/${randomUUID()}-${safe}`;
}

export interface UploadIntent {
  storagePath: string;
  uploadUrl: string;
  /** Token the client must include in the upload Authorization header. */
  token: string;
  expiresAt: Date;
}

export const fileService = {
  /**
   * Generate a signed upload URL. Client uses this to PUT bytes directly
   * to Supabase Storage. After successful upload, client must call
   * confirmUpload() to register the file in our DB.
   */
  async createUploadIntent(
    orgId: string,
    projectId: string,
    filename: string,
  ): Promise<UploadIntent | null> {
    // Verify project exists and belongs to this org.
    const project = await withOrg(orgId, (tx) =>
      tx.project.findFirst({
        where: { id: projectId, organizationId: orgId },
        select: { id: true },
      }),
    );
    if (!project) return null;

    const storagePath = buildStoragePath(orgId, projectId, filename);

    const { data, error } = await supabase()
      .storage.from(bucketName())
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      throw new Error(
        `Failed to create signed upload URL: ${error?.message ?? "unknown"}`,
      );
    }

    return {
      storagePath,
      uploadUrl: data.signedUrl,
      token: data.token,
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000),
    };
  },

  /**
   * Register a file in our DB after the client has uploaded it to Supabase.
   * The client provides metadata it knows from its local File object.
   */
  async confirmUpload(
    orgId: string,
    userId: string,
    input: {
      projectId: string;
      storagePath: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      contentHash?: string;
    },
  ) {
    // Verify the upload actually exists in storage (prevents recording
    // a row for a failed upload).
    const { data: stat, error } = await supabase()
      .storage.from(bucketName())
      .list(
        input.storagePath.substring(0, input.storagePath.lastIndexOf("/")),
        {
          search: input.storagePath.substring(
            input.storagePath.lastIndexOf("/") + 1,
          ),
          limit: 1,
        },
      );

    if (error || !stat || stat.length === 0) {
      throw new Error(
        `Upload not found in storage: ${input.storagePath} (${error?.message ?? "missing"})`,
      );
    }

    return withOrg(orgId, (tx) =>
      tx.projectFile.create({
        data: {
          organizationId: orgId,
          projectId: input.projectId,
          storagePath: input.storagePath,
          filename: input.filename,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          contentHash: input.contentHash ?? null,
          uploadedById: userId,
        },
      }),
    );
  },

  async list(orgId: string, projectId: string) {
    return withOrg(orgId, (tx) =>
      tx.projectFile.findMany({
        where: { organizationId: orgId, projectId },
        orderBy: { createdAt: "desc" },
      }),
    );
  },

  /**
   * Generate a short-lived signed GET URL for downloading a file.
   * Validates org ownership before issuing the URL.
   */
  async createDownloadUrl(
    orgId: string,
    fileId: string,
  ): Promise<{ url: string; expiresAt: Date; filename: string } | null> {
    const file = await prisma.projectFile.findFirst({
      where: { id: fileId, organizationId: orgId },
      select: { storagePath: true, filename: true },
    });
    if (!file) return null;

    const { data, error } = await supabase()
      .storage.from(bucketName())
      .createSignedUrl(file.storagePath, DOWNLOAD_URL_TTL_SECONDS, {
        download: file.filename,
      });

    if (error || !data) {
      throw new Error(
        `Failed to create download URL: ${error?.message ?? "unknown"}`,
      );
    }

    return {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000),
      filename: file.filename,
    };
  },

  /**
   * Delete a file: remove from storage AND from DB.
   * If storage delete fails, we still remove the DB row (orphan in storage
   * is recoverable; orphan DB row pointing to gone file is broken UX).
   */
  async remove(orgId: string, fileId: string): Promise<boolean> {
    const file = await prisma.projectFile.findFirst({
      where: { id: fileId, organizationId: orgId },
      select: { id: true, storagePath: true },
    });
    if (!file) return false;

    // Best-effort storage delete.
    await supabase()
      .storage.from(bucketName())
      .remove([file.storagePath])
      .catch((err) => {
        console.warn(
          `[file] storage delete failed for ${file.storagePath}`,
          err,
        );
      });

    await withOrg(orgId, (tx) =>
      tx.projectFile.delete({ where: { id: file.id } }),
    );
    return true;
  },
};
