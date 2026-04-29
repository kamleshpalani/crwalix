import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const isProtected = createRouteMatcher([
  "/dashboard(.*)",
  "/projects(.*)",
  "/searches(.*)",
  "/leads(.*)",
  "/enrichments(.*)",
  "/exports(.*)",
  "/settings(.*)",
  "/api/v1/projects(.*)",
  "/api/v1/searches(.*)",
  "/api/v1/leads(.*)",
  "/api/v1/exports(.*)",
  "/api/v1/billing(.*)",
  "/api/v1/usage(.*)",
  "/api/v1/api-keys(.*)",
  "/api/v1/outreach/sequences(.*)",
  "/api/v1/outreach/runs(.*)",
]);

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const passthrough = (_req: NextRequest) => NextResponse.next();

export default hasClerk
  ? clerkMiddleware((auth, req) => {
      if (isProtected(req)) {
        const { userId, redirectToSignIn } = auth();
        if (!userId) return redirectToSignIn({ returnBackUrl: req.url });
      }
    })
  : passthrough;

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
