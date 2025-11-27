/**
 * LabelBadge Component
 *
 * Displays a label as a small badge
 */

import React from "react";

interface LabelBadgeProps {
  label: string;
  onRemove?: () => void;
}

export function LabelBadge({ label, onRemove }: LabelBadgeProps): React.ReactElement {
  return (
    <span className="label-badge">
      {label}
      {onRemove && (
        <button className="label-remove" onClick={onRemove} title="Remove label">
          ×
        </button>
      )}
    </span>
  );
}
