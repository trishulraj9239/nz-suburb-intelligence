import type { ReactNode } from "react";

/**
 * TRI-150 — the small shared pieces of the "This property" panel: the
 * epistemic group heading (13 px semibold — never uppercase micro-type), the
 * sub-heading, a label | value fact row on the type scale, and the status
 * lines for loading / unreachable / nothing-there states.
 */
export function GroupHeading({ testId, children, note }: { testId: string; children: ReactNode; note?: ReactNode }) {
  return (
    <h4 data-testid={testId} className="mt-3 border-t border-hairline pt-2 font-display text-label font-semibold text-ink/85">
      {children}
      {note && <span className="ml-1.5 font-mono text-micro font-normal text-ink/50">{note}</span>}
    </h4>
  );
}

export function SubHeading({ children, note, aside }: { children: ReactNode; note?: ReactNode; aside?: ReactNode }) {
  return (
    <h5 className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-micro font-medium text-ink/55">
      <span>
        {children}
        {note && <span className="ml-1.5 font-mono font-normal text-ink/45">{note}</span>}
      </span>
      {aside}
    </h5>
  );
}

export function FactRow({ label, value, testId, className = "" }: { label: ReactNode; value: ReactNode; testId?: string; className?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${className}`}>
      <span className="text-body text-ink/80">{label}</span>
      <span className="shrink-0 font-mono text-body font-medium text-ink" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

/** A quiet one-line state: loading, unreachable, or nothing at this point. */
export function StateLine({ children, testId, muted = false }: { children: ReactNode; testId?: string; muted?: boolean }) {
  return (
    <p className={`py-1 text-label ${muted ? "text-ink/50" : "text-ink/65"}`} data-testid={testId}>
      {children}
    </p>
  );
}

export function Note({ children, testId, className = "" }: { children: ReactNode; testId?: string; className?: string }) {
  return (
    <p className={`mt-1 text-micro leading-snug text-ink/55 ${className}`} data-testid={testId}>
      {children}
    </p>
  );
}

export function ExtLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`font-mono text-accent underline-offset-2 hover:underline ${className}`}>
      {children}
    </a>
  );
}
