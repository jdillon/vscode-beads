/**
 * TreeExpandIcon - Expand/collapse icon for tree views
 * Uses triangles that point right (collapsed) or down (expanded)
 */

import React from "react";

interface TreeExpandIconProps {
  expanded: boolean;
  size?: number;
  className?: string;
}

export function TreeExpandIcon({
  expanded,
  size = 12,
  className = "",
}: TreeExpandIconProps): React.ReactElement {
  return (
    <svg
      className={`tree-expand-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      {expanded ? (
        // Down-pointing triangle (expanded)
        <path d="M4 6l4 4 4-4H4z" />
      ) : (
        // Right-pointing triangle (collapsed)
        <path d="M6 4l4 4-4 4V4z" />
      )}
    </svg>
  );
}

interface TreeIndentProps {
  depth: number;
  hasChildren: boolean;
  isLast?: boolean;
}

/**
 * TreeIndent - Visual indent with optional tree line connector
 */
export function TreeIndent({
  depth,
  hasChildren,
}: TreeIndentProps): React.ReactElement | null {
  if (depth === 0) return null;

  return (
    <span className="tree-indent" style={{ width: depth * 16 }}>
      {/* Tree connector line */}
      <span className="tree-connector">
        <svg width="16" height="16" viewBox="0 0 16 16">
          {/* Vertical line from top, horizontal line to the right */}
          <path
            d="M8 0 V8 H16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.4"
          />
        </svg>
      </span>
    </span>
  );
}
