"use client";

import { useRef, useState } from "react";
import { setRentBudget, useRentBudget } from "@/lib/preferences";
import { Popover } from "./popover";

/** Weekly rent budget control — top bar on desktop, inside the You menu on phones. */
export function BudgetControl() {
  const budget = useRentBudget();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setDraft(budget ? String(budget) : "");
          setOpen((o) => !o);
        }}
        title="Set your weekly rent budget"
        className={`inline-flex h-10 items-center gap-1.5 rounded-control border px-3 text-label font-medium transition-colors ${
          budget ? "border-harbour/60 bg-harbour/10 text-ink" : "border-hairline bg-surface text-ink hover:border-harbour"
        }`}
      >
        Budget
        {budget && <span className="font-mono">${budget}/wk</span>}
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} label="Weekly rent budget" width="w-64">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(draft);
            setRentBudget(Number.isFinite(n) && n > 0 ? n : null);
            setOpen(false);
            anchorRef.current?.focus();
          }}
        >
          <label className="text-label font-medium text-ink/80" htmlFor="rent-budget">
            Weekly rent budget (NZ$)
          </label>
          <input
            id="rent-budget"
            type="number"
            inputMode="numeric"
            min={50}
            max={5000}
            step={10}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. 650"
            className="mt-1.5 h-10 w-full rounded-control border border-hairline bg-canvas px-2 font-mono text-body text-ink focus:border-harbour focus:outline-none"
          />
          <div className="mt-2 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setRentBudget(null);
                setOpen(false);
                anchorRef.current?.focus();
              }}
              className="min-h-10 px-1 text-label text-ink/60 hover:text-ink"
            >
              Clear
            </button>
            <button type="submit" className="min-h-10 rounded-control bg-harbour px-3 text-label font-medium text-surface hover:opacity-90">
              Save
            </button>
          </div>
          <p className="mt-2 text-micro leading-snug text-ink/55">Suburbs get an under / on / over chip against their median rent.</p>
        </form>
      </Popover>
    </div>
  );
}
