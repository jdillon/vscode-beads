/**
 * buildTree - Transform flat bead list into hierarchical tree structure
 *
 * Uses parent-child dependency relationships to build the tree.
 * Items with no parent appear at root level.
 */

import { Bead } from "../types";

export interface TreeBead extends Bead {
  subRows?: TreeBead[];
  depth?: number;
}

/**
 * Build a tree structure from flat beads using parent-child dependencies.
 *
 * A bead's parent is determined by looking at its dependsOn array for
 * a dependency with dependencyType === "parent-child".
 */
export function buildTree(beads: Bead[]): TreeBead[] {
  // Create map of id -> TreeBead with empty subRows
  const beadMap = new Map<string, TreeBead>();
  for (const bead of beads) {
    beadMap.set(bead.id, { ...bead, subRows: [], depth: 0 });
  }

  const roots: TreeBead[] = [];

  // Build parent-child relationships
  for (const bead of beads) {
    const treeBead = beadMap.get(bead.id)!;

    // Find parent via dependsOn with parent-child type
    const parentDep = bead.dependsOn?.find(
      (d) => d.dependencyType === "parent-child"
    );

    if (parentDep && beadMap.has(parentDep.id)) {
      // Has a parent that exists in our data set
      const parent = beadMap.get(parentDep.id)!;
      parent.subRows!.push(treeBead);
      treeBead.depth = (parent.depth ?? 0) + 1;
    } else {
      // No parent or parent not in data set - this is a root
      roots.push(treeBead);
    }
  }

  // Recursively set depths for children
  function setDepths(items: TreeBead[], depth: number) {
    for (const item of items) {
      item.depth = depth;
      if (item.subRows && item.subRows.length > 0) {
        setDepths(item.subRows, depth + 1);
      }
    }
  }
  setDepths(roots, 0);

  return roots;
}

/**
 * Check if a bead has children (is a parent in tree view)
 */
export function hasChildren(bead: Bead, allBeads: Bead[]): boolean {
  return allBeads.some((other) =>
    other.dependsOn?.some(
      (dep) => dep.dependencyType === "parent-child" && dep.id === bead.id
    )
  );
}
