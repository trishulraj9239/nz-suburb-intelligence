import type { ReactNode } from "react";
import type { SectionKey } from "@/lib/tokens";

/**
 * One of the six profile cards (TRI-147): Housing, Planning, Hazards, People,
 * Getting Around, Schools. A one-hue accent is used ONLY on the header icon;
 * the data inside stays semantic. A one-line headline fact, an optional
 * hoisted source chip (when every row shares source and vintage), then the
 * rows, then a visually hidden table for assistive tech.
 */
export function SectionCard({
  id,
  title,
  icon,
  accent,
  headline,
  chip,
  explainer,
  srTable,
  children,
  className = "",
}: {
  id: string;
  title: string;
  icon: ReactNode;
  accent: SectionKey;
  headline?: ReactNode;
  chip?: ReactNode;
  explainer?: ReactNode;
  srTable?: { head: string[]; rows: string[][] };
  children: ReactNode;
  className?: string;
}) {
  const hid = `${id}-title`;
  return (
    <section aria-labelledby={hid} data-testid={`card-${id}`} className={`rounded-card border border-hairline bg-surface p-3 shadow-card ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-hairline pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="inline-flex h-6 w-6 shrink-0 items-center justify-center" style={{ color: `var(--section-${accent})` }}>
            {icon}
          </span>
          <h3 id={hid} className="font-display text-h3 font-semibold text-ink">
            {title}
            {explainer}
          </h3>
        </div>
        {chip && <div className="ml-auto shrink-0">{chip}</div>}
        {headline && <p className="basis-full text-body text-ink/75">{headline}</p>}
      </header>
      <div className="divide-y divide-hairline/60">{children}</div>
      {srTable && (
        <table className="sr-only-table" data-testid="sr-table">
          <caption>{title}</caption>
          <thead>
            <tr>
              {srTable.head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {srTable.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
