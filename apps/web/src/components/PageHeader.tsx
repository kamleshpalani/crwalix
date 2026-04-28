import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Short uppercase eyebrow shown above the title. */
  eyebrow?: string;
  title: string;
  /** Optional accent color for the gradient on the title. Defaults to brand → fuchsia. */
  description?: ReactNode;
  /** SVG path-d for an optional decorative icon. */
  icon?: string;
  /** Action buttons / links shown on the right. */
  actions?: ReactNode;
  /** Optional small chips (badges, counts, filters) shown under the description. */
  chips?: ReactNode;
}

/**
 * Consistent hero-style header for app pages. Uses the global glass-lg surface
 * with floating gradient orbs, a gradient icon tile, eyebrow, big title and
 * inline action buttons.
 */
export default function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
  chips
}: PageHeaderProps) {
  return (
    <div className="glass-lg relative overflow-hidden p-6 md:p-8">
      <div className="orb -right-12 -top-12 h-44 w-44 bg-brand-300/55" />
      <div className="orb -bottom-16 right-32 h-32 w-32 bg-fuchsia-300/45" />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {icon && (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-brand text-white shadow-glow">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                <path
                  d={icon}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <span className="label">{eyebrow}</span>}
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink-900 md:text-4xl">
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-2xl text-sm text-ink-600">{description}</p>
            )}
            {chips && <div className="mt-3 flex flex-wrap items-center gap-2">{chips}</div>}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
