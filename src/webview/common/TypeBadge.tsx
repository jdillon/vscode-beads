/**
 * TypeBadge Component
 *
 * Displays bead type as a colored badge
 */

import React from "react";
import { BeadType, TYPE_LABELS, TYPE_COLORS, TYPE_TEXT_COLORS } from "../types";

interface TypeBadgeProps {
  type: BeadType;
  size?: "small" | "medium" | "large";
}

export function TypeBadge({
  type,
  size = "medium",
}: TypeBadgeProps): React.ReactElement {
  const label = TYPE_LABELS[type] || type;
  const bgColor = TYPE_COLORS[type] || "#888888";
  const textColor = TYPE_TEXT_COLORS[type] || "#ffffff";

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
