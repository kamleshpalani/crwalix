import Link from "next/link";

const RANGES = ["7d", "30d", "90d", "365d"] as const;

export default function RangePicker({
  base,
  current,
}: Readonly<{ base: string; current: string }>) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-ink-200 bg-white px-1 py-0.5 text-xs">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`${base}?range=${r}`}
          className={`rounded-full px-3 py-1 ${
            current === r ? "bg-ink-900 text-white" : "text-ink-600"
          }`}
        >
          {r}
        </Link>
      ))}
    </div>
  );
}
