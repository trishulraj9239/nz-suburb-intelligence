"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * Segmented tabs with real tab semantics (TRI-145, Phase A). The panel tabs
 * used to be plain buttons; screen readers announced nothing about selection
 * and arrow keys did nothing. Labels are unchanged ("Answer", "Profile",
 * "Compare (N)", "Results") — the verify scripts now locate them by
 * `getByRole("tab", { name })`.
 *
 * Keyboard: ArrowLeft/ArrowRight wrap, Home/End jump, activation follows
 * focus (automatic activation — the panels are cheap to swap and there is no
 * network cost to selecting a tab).
 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  idPrefix,
  className = "",
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  idPrefix: string;
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (index + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next === null) return;
    e.preventDefault();
    const id = items[next].id;
    onChange(id);
    refs.current[id]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className={`flex gap-1 rounded-control border border-hairline bg-canvas p-0.5 ${className}`}>
      {items.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`min-h-10 flex-1 rounded-[calc(var(--radius-control)-2px)] px-2 text-label font-medium transition-colors ${
              active ? "bg-surface text-ink shadow-card" : "text-ink/60 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idPrefix, id, children, className = "" }: { idPrefix: string; id: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} className={className}>
      {children}
    </div>
  );
}
