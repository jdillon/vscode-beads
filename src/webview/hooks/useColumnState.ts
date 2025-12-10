import { useState, useEffect, useMemo } from "react";
import { SortingState, VisibilityState, ColumnOrderState } from "@tanstack/react-table";
import { vscode } from "../types";

/**
 * Persisted column state for TanStack Table.
 */
export interface ColumnState {
  sorting: SortingState;
  columnVisibility: VisibilityState;
  columnOrder: ColumnOrderState;
}

interface PersistedState {
  sorting?: SortingState;
  columnVisibility?: VisibilityState;
  columnOrder?: ColumnOrderState;
}

interface UseColumnStateOptions {
  /** Default sorting if none persisted */
  defaultSorting?: SortingState;
  /** Default column visibility if none persisted */
  defaultVisibility?: VisibilityState;
  /** Default column order if none persisted */
  defaultOrder?: ColumnOrderState;
}

interface UseColumnStateReturn {
  sorting: SortingState;
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
  columnVisibility: VisibilityState;
  setColumnVisibility: React.Dispatch<React.SetStateAction<VisibilityState>>;
  columnOrder: ColumnOrderState;
  setColumnOrder: React.Dispatch<React.SetStateAction<ColumnOrderState>>;
  /** Reset visibility to defaults */
  resetVisibility: () => void;
}

/**
 * Hook to manage TanStack Table column state with VS Code webview persistence.
 *
 * - Loads saved state from vscode.getState() on mount
 * - Merges with defaults for new columns
 * - Saves to vscode.setState() on changes
 *
 * @example
 * const {
 *   sorting, setSorting,
 *   columnVisibility, setColumnVisibility,
 *   columnOrder, setColumnOrder,
 *   resetVisibility,
 * } = useColumnState({
 *   defaultSorting: [{ id: "updatedAt", desc: true }],
 *   defaultVisibility: { labels: false, assignee: false },
 * });
 */
export function useColumnState(options: UseColumnStateOptions = {}): UseColumnStateReturn {
  const {
    defaultSorting = [],
    defaultVisibility = {},
    defaultOrder = [],
  } = options;

  // Load persisted state once on mount
  const savedState = useMemo(() => vscode.getState() as PersistedState | undefined, []);

  const [sorting, setSorting] = useState<SortingState>(
    savedState?.sorting ?? defaultSorting
  );

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    savedState?.columnVisibility ?? defaultVisibility
  );

  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(
    savedState?.columnOrder ?? defaultOrder
  );

  // Persist state changes to VS Code
  useEffect(() => {
    vscode.setState({ sorting, columnVisibility, columnOrder });
  }, [sorting, columnVisibility, columnOrder]);

  const resetVisibility = () => {
    setColumnVisibility(defaultVisibility);
  };

  return {
    sorting,
    setSorting,
    columnVisibility,
    setColumnVisibility,
    columnOrder,
    setColumnOrder,
    resetVisibility,
  };
}
