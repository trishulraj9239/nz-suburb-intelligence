"use client";

import { budgetVerdict, useRentBudget } from "@/lib/preferences";

const STYLE: Record<string, string> = {
  under: "border-harbour/60 bg-harbour/10 text-ink",
  on: "border-hairline bg-canvas text-ink/75",
  over: "border-ink/30 bg-ink/5 text-ink/75",
};
const LABEL: Record<string, string> = {
  under: "under budget",
  on: "on budget",
  over: "over budget",
};

/** Affordability vs the user's own stated rent budget — only renders when set. */
export function BudgetChip({ rent }: { rent: number }) {
  const budget = useRentBudget();
  if (budget === null) return null;
  const v = budgetVerdict(rent, budget);
  return (
    <span
      title={`Your budget: $${budget}/wk · this suburb's median rent: $${Math.round(rent)}/wk`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STYLE[v]}`}
    >
      {LABEL[v]}
    </span>
  );
}
