/**
 * SegmentedControl Component
 *
 * A row of mutually exclusive options styled as a VS Code themed tab strip.
 * Used to switch sections without leaving the current panel.
 */

import React from "react";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  /** Optional count rendered beside the label. */
  count?: number;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: SegmentedControlProps<T>): React.ReactElement {
  return (
    <div className="segmented-control" role="tablist" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={selected}
            className={selected ? "segment active" : "segment"}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="segment-count">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
