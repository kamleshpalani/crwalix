import Link from 'next/link';

export function Pagination({
  page,
  pageSize,
  total,
  baseHref
}: {
  page: number;
  pageSize: number;
  total: number;
  /** URL with current query string excluding `page`. Must end with ? or &. */
  baseHref: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);

  const linkClass =
    'rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-white/70';
  const disabledClass =
    'cursor-not-allowed rounded border border-white/60 bg-white/40 px-3 py-1.5 text-sm text-ink-400';

  return (
    <nav className="mt-4 flex items-center justify-between text-sm text-ink-600">
      <span>
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={`${baseHref}page=${prev}`} className={linkClass} prefetch={false}>
            ← Prev
          </Link>
        ) : (
          <span className={disabledClass}>← Prev</span>
        )}
        {page < totalPages ? (
          <Link href={`${baseHref}page=${next}`} className={linkClass} prefetch={false}>
            Next →
          </Link>
        ) : (
          <span className={disabledClass}>Next →</span>
        )}
      </div>
    </nav>
  );
}
