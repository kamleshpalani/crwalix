import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtected = createRouteMatcher([
  '/dashboard(.*)',
  '/projects(.*)',
  '/searches(.*)',
  '/leads(.*)',
  '/enrichments(.*)',
  '/exports(.*)',
  '/settings(.*)',
  '/api/v1/(?!webhooks|health)(.*)'
]);

export default clerkMiddleware((auth, req) => {
  if (isProtected(req)) auth().protect();
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)']
};
