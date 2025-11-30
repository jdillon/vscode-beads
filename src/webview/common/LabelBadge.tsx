/**
 * LabelBadge Component
 *
 * Displays a label as a pill badge with auto-generated colors based on label name.
 */

import React, { useMemo } from "react";
import { getLabelColorStyle } from "../utils/label-colors";

interface LabelBadgeProps {
  label: string;
  size?: "small" | "medium" | "large";
  onRemove?: () => void;
}

export function LabelBadge({
  label,
  size = "small",
  onRemove,
}: LabelBadgeProps): React.ReactElement {
  const colorStyle = useMemo(() => getLabelColorStyle(label), [label]);

  return (
    <span className={`label-badge label-badge-${size}`} style={colorStyle}>
      {label}
      {onRemove && (
        <button className="label-remove" onClick={onRemove} title="Remove label">
          ×
        </button>
      )}
    </span>
  );
}
