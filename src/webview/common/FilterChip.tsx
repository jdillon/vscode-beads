/**
 * FilterChip Component
 *
 * Displays a removable filter chip with colored left border accent.
 */

import React from "react";

interface FilterChipProps {
  label: string;
  accentColor?: string;
  onRemove?: () => void;
}

export function FilterChip({
  label,
  accentColor,
  onRemove,
}: FilterChipProps): React.ReactElement {
  const style = accentColor
    ? { "--chip-accent-color": accentColor } as React.CSSProperties
    : undefined;

  return (
    <span className="filter-chip" style={style}>
      {label}
      {onRemove && (
        <button onClick={onRemove} title="Remove filter">
          ×
        </button>
      )}
    </span>
  );
}
