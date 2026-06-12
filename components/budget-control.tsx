"use client";

import { useEffect, useRef, useState } from "react";
import { setRentBudget, useRentBudget } from "@/lib/preferences";

/** Top-bar preferences control — v1 holds the weekly rent budget. */
export function BudgetControl() {
  const budget = useRentBudget();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setDraft(budget ? String(budget) : "");
          setOpen((o) => !o);
        }}
        title="Set your weekly rent budget"
        className={`inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors ${
          budget
            ? "border-harbour/60 bg-harbour/10 text-ink"
            : "border-hairline bg-surface text-ink hover:border-harbour"
        }`}
      >
        Budget
        {budget && <span className="font-mono">${budget}/wk</span>}
      </button>

      {open && (
        <form
          className="absolute right-0 top-10 z-30 w-56 rounded-lg border border-hairline bg-surface p-3 shadow-lg"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(draft);
            setRentBudget(Number.isFinite(n) && n > 0 ? n : null);
            setOpen(false);
          }}
        >
          <label className="text-xs font-medium text-ink/75" htmlFor="rent-budget">
            Weekly rent budget (NZ$)
          </label>
          <input
            id="rent-budget"
            type="number"
            min={50}
            max={5000}
            step={10}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. 650"
            autoFocus
            className="mt-1.5 h-9 w-full rounded-md border border-hairline bg-canvas px-2 font-mono text-sm text-ink focus:border-harbour focus:outline-none"
          />
          <div className="mt-2 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setRentBudget(null);
                setOpen(false);
              }}
              className="text-xs text-ink/50 hover:text-ink"
            >
              Clear
            </button>
            <button
              type="submit"
              className="rounded-md bg-harbour px-3 py-1 text-xs font-medium text-surface hover:opacity-90"
            >
              Save
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-ink/45">
            Suburbs get an under / on / over chip against their median rent.
          </p>
        </form>
      )}
    </div>
  );
}
