import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Project Portal",
};

/**
 * Portal-only layout — completely separate from the main app shell.
 * No Clerk providers, no nav, no app chrome.
 */
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="text-sm font-semibold tracking-wide text-slate-700">
            Project Portal
          </div>
          <div className="text-xs text-slate-500">Powered by Crawlix</div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
