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
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);

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

  const value = useMemo(
    () => ({ selected, select, compare, toggleCompare, clearCompare }),
    [selected, select, compare, toggleCompare, clearCompare],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace outside WorkspaceProvider");
  return ctx;
}
