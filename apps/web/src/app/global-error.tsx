'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-ink-50 px-6">
        <div className="rounded-3xl border border-white/60 bg-white/70 p-10 text-center shadow-2xl backdrop-blur-xl">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-500">
            500
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            An unexpected error occurred. Try again, or head back to the
            dashboard.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center rounded-xl border border-white/60 bg-white/60 px-4 py-2 text-sm font-medium text-ink-800 backdrop-blur hover:bg-white/80"
            >
              Try again
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-lg"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
