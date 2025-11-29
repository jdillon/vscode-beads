/**
 * LabelBadge Component
 *
 * Displays a label as a small badge with auto-generated colors
 */

import React, { useMemo } from "react";
import { getLabelColorStyle } from "../utils/label-colors";

interface LabelBadgeProps {
  label: string;
  onRemove?: () => void;
}

export function LabelBadge({ label, onRemove }: LabelBadgeProps): React.ReactElement {
  const colorStyle = useMemo(() => getLabelColorStyle(label), [label]);

  return (
    <span className="label-badge" style={colorStyle}>
      {label}
      {onRemove && (
        <button className="label-remove" onClick={onRemove} title="Remove label">
          ×
        </button>
      )}
    </span>
  );
}
