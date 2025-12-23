/**
 * TypeBadge Component
 *
 * Displays bead type as a colored badge.
 * Shows raw type name with gray background for unknown types.
 */

import React from "react";
import {
  TYPE_LABELS,
  TYPE_COLORS,
  TYPE_TEXT_COLORS,
  UNKNOWN_TYPE_COLOR,
  UNKNOWN_TYPE_TEXT_COLOR,
} from "../types";

interface TypeBadgeProps {
  type: string;
  size?: "small" | "medium" | "large";
}

export function TypeBadge({
  type,
  size = "medium",
}: TypeBadgeProps): React.ReactElement {
  const label = TYPE_LABELS[type as keyof typeof TYPE_LABELS] || type;
  const bgColor = TYPE_COLORS[type as keyof typeof TYPE_COLORS] || UNKNOWN_TYPE_COLOR;
  const textColor = TYPE_TEXT_COLORS[type as keyof typeof TYPE_TEXT_COLORS] || UNKNOWN_TYPE_TEXT_COLOR;

  return (
    <span
      className={`type-badge type-badge-${size}`}
      style={{ backgroundColor: bgColor, color: textColor }}
      title={`Type: ${label}`}
    >
      {label}
    </span>
  );
}
