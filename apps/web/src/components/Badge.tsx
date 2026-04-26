import type { ReactNode } from 'react';

const TONES = {
  slate: 'bg-white/70 text-ink-700 border-white/60',
  emerald: 'bg-emerald-50/80 text-emerald-700 border-emerald-200/60',
  amber: 'bg-amber-50/80 text-amber-800 border-amber-200/60',
  rose: 'bg-rose-50/80 text-rose-700 border-rose-200/60',
  sky: 'bg-sky-50/80 text-sky-700 border-sky-200/60',
  violet: 'bg-violet-50/80 text-violet-700 border-violet-200/60'
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  children,
  tone = 'slate',
  className = ''
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide backdrop-blur ' +
        TONES[tone] +
        (className ? ' ' + className : '')
      }
    >
      {children}
    </span>
  );
}

export function priorityTone(tier: string | null | undefined): BadgeTone {
  switch (tier) {
    case 'HIGH':
      return 'emerald';
    case 'MEDIUM':
      return 'amber';
    case 'LOW':
      return 'slate';
    default:
      return 'slate';
  }
}

export function statusTone(status: string | null | undefined): BadgeTone {
  switch (status) {
    case 'COMPLETED':
    case 'SUCCEEDED':
    case 'READY':
      return 'emerald';
    case 'FAILED':
      return 'rose';
    case 'RUNNING':
    case 'BUILDING':
      return 'sky';
    case 'CANCELED':
      return 'violet';
    case 'QUEUED':
    case 'NEW':
      return 'amber';
    default:
      return 'slate';
  }
}

export function websiteTone(s: string | null | undefined): BadgeTone {
  switch (s) {
    case 'EXISTS':
      return 'emerald';
    case 'EXISTS_MISSING_IN_SOURCE':
      return 'sky';
    case 'LIKELY_NONE':
      return 'amber';
    case 'HIGH_CONFIDENCE_NONE':
      return 'rose';
    default:
      return 'slate';
  }
}
