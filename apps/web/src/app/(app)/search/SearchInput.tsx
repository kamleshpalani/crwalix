"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  initial: string;
}

/**
 * Plain-English search box. Submitting navigates to /search?q=… so the
 * server can render results — keeps things crawlable and refresh-friendly.
 */
export default function SearchInput({ initial }: Props) {
  const [value, setValue] = useState(initial);
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (q.length === 0) return;
        router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
      className="flex flex-col gap-3 sm:flex-row"
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. 'hot leads in Texas with no website added this month'"
        className="flex-1 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
      />
      <button
        type="submit"
        className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        disabled={value.trim().length === 0}
      >
        Search
      </button>
    </form>
  );
}
