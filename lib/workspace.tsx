"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export const COMPARE_LIMIT = 3;

interface WorkspaceState {
  /** sa2_code of the suburb shown in the profile panel, if any. */
  selected: string | null;
  select: (sa2: string | null) => void;
  /** sa2_codes pinned for comparison (max COMPARE_LIMIT). */
  compare: string[];
  toggleCompare: (sa2: string) => void;
  clearCompare: () => void;
  setCompareSet: (codes: string[]) => void;
  /** Active natural-language question (M5 ask flow). askSeq bumps per submit. */
  question: string | null;
  askSeq: number;
  ask: (q: string) => void;
  clearAsk: () => void;
  /** Clear everything — selection, comparison, answer. resetSeq lets the map
   *  re-centre/un-shade in response (the Home button). */
  reset: () => void;
  resetSeq: number;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [askSeq, setAskSeq] = useState(0);
  const [resetSeq, setResetSeq] = useState(0);

  const select = useCallback((sa2: string | null) => setSelected(sa2), []);
  const toggleCompare = useCallback((sa2: string) => {
    setCompare((prev) =>
      prev.includes(sa2)
        ? prev.filter((c) => c !== sa2)
        : prev.length >= COMPARE_LIMIT
          ? prev
          : [...prev, sa2],
    );
  }, []);
  const clearCompare = useCallback(() => setCompare([]), []);
  const setCompareSet = useCallback(
    (codes: string[]) => setCompare(codes.slice(0, COMPARE_LIMIT)),
    [],
  );
  const ask = useCallback((q: string) => {
    setQuestion(q);
    setAskSeq((s) => s + 1);
  }, []);
  const clearAsk = useCallback(() => setQuestion(null), []);
  const reset = useCallback(() => {
    setSelected(null);
    setCompare([]);
    setQuestion(null);
    setResetSeq((s) => s + 1);
  }, []);

  const value = useMemo(
    () => ({
      selected,
      select,
      compare,
      toggleCompare,
      clearCompare,
      setCompareSet,
      question,
      askSeq,
      ask,
      clearAsk,
      reset,
      resetSeq,
    }),
    [selected, select, compare, toggleCompare, clearCompare, setCompareSet, question, askSeq, ask, clearAsk, reset, resetSeq],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace outside WorkspaceProvider");
  return ctx;
}
