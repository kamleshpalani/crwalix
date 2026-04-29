"use client";

import { useMemo } from "react";

interface Bucket {
  start: string;
  end: string;
  p10Cents: number;
  p50Cents: number;
  p90Cents: number;
  meanCents: number;
}

interface Props {
  buckets: Bucket[];
}

/**
 * Lightweight inline SVG fan chart. P10/P90 form a shaded band, P50 is a
 * solid line. Avoids pulling in a charting dep for this single use case.
 */
export default function ForecastChart({ buckets }: Props) {
  const { width, height, padX, padY, p50Path, bandPath, max, ticks } =
    useMemo(() => {
      const width = 720;
      const height = 240;
      const padX = 40;
      const padY = 24;
      const innerW = width - padX * 2;
      const innerH = height - padY * 2;

      const max = Math.max(1, ...buckets.map((b) => b.p90Cents));

      const x = (i: number) =>
        buckets.length === 1
          ? padX + innerW / 2
          : padX + (i / (buckets.length - 1)) * innerW;
      const y = (v: number) => padY + innerH - (v / max) * innerH;

      const p50Path = buckets
        .map((b, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(b.p50Cents)}`)
        .join(" ");

      const upper = buckets
        .map((b, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(b.p90Cents)}`)
        .join(" ");
      const lower = [...buckets]
        .reverse()
        .map((b, idx) => {
          const i = buckets.length - 1 - idx;
          return `L ${x(i)} ${y(b.p10Cents)}`;
        })
        .join(" ");
      const bandPath = `${upper} ${lower} Z`;

      const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
        y: padY + innerH - t * innerH,
        v: Math.round(max * t),
      }));

      return { width, height, padX, padY, p50Path, bandPath, max, ticks };
    }, [buckets]);

  if (buckets.length === 0) return null;

  const fmt = (c: number) =>
    `$${Math.round(c / 100).toLocaleString()}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full max-w-full text-ink-500"
      role="img"
      aria-label="Pipeline forecast P10/P50/P90 over 30-day buckets"
    >
      {/* Grid + axis ticks */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={padX}
            x2={width - padX}
            y1={t.y}
            y2={t.y}
            stroke="currentColor"
            strokeOpacity={0.1}
          />
          <text
            x={padX - 6}
            y={t.y}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={10}
            fill="currentColor"
          >
            {fmt(t.v)}
          </text>
        </g>
      ))}

      {/* P10–P90 band */}
      <path d={bandPath} fill="rgb(16 185 129)" fillOpacity={0.18} />

      {/* P50 line */}
      <path
        d={p50Path}
        fill="none"
        stroke="rgb(16 185 129)"
        strokeWidth={2.5}
      />

      {/* Bucket markers + x labels */}
      {buckets.map((b, i) => {
        const x =
          buckets.length === 1
            ? padX + (width - padX * 2) / 2
            : padX + (i / (buckets.length - 1)) * (width - padX * 2);
        const innerH = height - padY * 2;
        const y = padY + innerH - (b.p50Cents / max) * innerH;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={3} fill="rgb(5 150 105)" />
            <text
              x={x}
              y={height - 6}
              textAnchor="middle"
              fontSize={10}
              fill="currentColor"
            >
              {b.start.slice(5)} – {b.end.slice(5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
