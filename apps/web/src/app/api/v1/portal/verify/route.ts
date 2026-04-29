/**
 * GET /api/v1/portal/verify?t=<secret>
 *
 * Consumes a magic-link secret, sets the portal session cookie, redirects
 * the client to /portal/<projectId>. On failure redirects to /portal/login
 * with a generic error.
 */

import { NextResponse } from "next/server";
import {
  portalService,
  PORTAL_COOKIE_NAME,
  isPortalConfigured,
} from "@/server/services/portal.service";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!isPortalConfigured()) {
    return NextResponse.redirect(new URL("/portal/login?e=unconfigured", url));
  }
  const secret = url.searchParams.get("t");
  if (!secret) {
    return NextResponse.redirect(new URL("/portal/login?e=invalid", url));
  }

  const result = await portalService
    .verifyAndCreateSession(secret)
    .catch(() => null);

  if (!result) {
    return NextResponse.redirect(new URL("/portal/login?e=expired", url));
  }

  const dest = new URL(`/portal/${result.session.projectId}`, url);
  const res = NextResponse.redirect(dest);
  res.cookies.set(PORTAL_COOKIE_NAME, result.cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/portal",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
  return res;
}
