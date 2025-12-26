/**
 * BeadsQueryProvider - TanStack Query integration for beads data
 *
 * Uses TanStack Query to cache bead data pushed from the extension.
 * The extension still fetches data from the daemon; we cache it here
 * for efficient access and derived queries (list, tree, etc.).
 */

import React, { createContext, useContext, useCallback, useMemo } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bead } from "../types";
import { buildTree, TreeBead } from "../utils/build-tree";

// Query keys
export const QUERY_KEYS = {
  beads: ["beads"] as const,
  beadsList: ["beads", "list"] as const,
  beadsTree: ["beads", "tree"] as const,
} as const;

// Create a stable QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is pushed from extension, so we never need to refetch automatically
      staleTime: Infinity,
      // Keep data in cache indefinitely (until explicitly invalidated)
      gcTime: Infinity,
      // Don't refetch on window focus (extension handles updates)
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect
      refetchOnReconnect: false,
      // Don't retry failed queries (extension handles errors)
      retry: false,
    },
  },
});

// Context for the store actions
interface BeadsStoreContextValue {
  setBeads: (beads: Bead[]) => void;
  invalidate: () => void;
}

const BeadsStoreContext = createContext<BeadsStoreContextValue | null>(null);

/**
 * Provider component that wraps the app with QueryClient
 */
export function BeadsQueryProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const setBeads = useCallback((beads: Bead[]) => {
    // Update the raw beads data
    queryClient.setQueryData(QUERY_KEYS.beads, beads);
  }, []);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.beads });
  }, []);

  const contextValue = useMemo(() => ({ setBeads, invalidate }), [setBeads, invalidate]);

  return (
    <QueryClientProvider client={queryClient}>
      <BeadsStoreContext.Provider value={contextValue}>
        {children}
      </BeadsStoreContext.Provider>
    </QueryClientProvider>
  );
}

/**
 * Hook to access the beads store actions
 */
export function useBeadsStore(): BeadsStoreContextValue {
  const context = useContext(BeadsStoreContext);
  if (!context) {
    throw new Error("useBeadsStore must be used within BeadsQueryProvider");
  }
  return context;
}

/**
 * Hook to get all beads as a flat list
 */
export function useBeadsList(): Bead[] {
  const { data } = useQuery({
    queryKey: QUERY_KEYS.beads,
    queryFn: () => [] as Bead[], // Dummy fn, data is set via setQueryData
    initialData: [],
  });
  return data;
}

/**
 * Hook to get beads as a tree structure (for tree view)
 */
export function useBeadsTree(): TreeBead[] {
  const beads = useBeadsList();
  return useMemo(() => buildTree(beads), [beads]);
}

/**
 * Hook to get a single bead by ID
 */
export function useBeadById(id: string | null): Bead | undefined {
  const beads = useBeadsList();
  return useMemo(() => {
    if (!id) return undefined;
    return beads.find((b) => b.id === id);
  }, [beads, id]);
}

/**
 * Hook to check if beads have dependency data (needed for tree view)
 */
export function useHasDependencyData(): boolean {
  const beads = useBeadsList();
  return useMemo(() => {
    // Check if any bead has dependsOn data
    return beads.some((b) => b.dependsOn && b.dependsOn.length > 0);
  }, [beads]);
}

/**
 * Hook to get the QueryClient for direct cache manipulation
 */
export function useBeadsQueryClient(): QueryClient {
  return useQueryClient();
}
