import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="glass-lg p-10 text-center">
        <p className="label">404</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          The page you’re looking for doesn’t exist or has moved.
        </p>
        <Link href="/dashboard" className="btn-primary mt-6 inline-flex">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
