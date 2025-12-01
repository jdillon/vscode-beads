/**
 * PriorityBadge Component
 *
 * Displays bead priority as a colored badge
 */

import React from "react";
import { BeadPriority, PRIORITY_LABELS, PRIORITY_COLORS, PRIORITY_TEXT_COLORS } from "../types";

interface PriorityBadgeProps {
  priority: BeadPriority;
  size?: "small" | "medium" | "large";
}

export function PriorityBadge({
  priority,
  size = "medium",
}: PriorityBadgeProps): React.ReactElement {
  const label = PRIORITY_LABELS[priority] || `P${priority}`;
  const bgColor = PRIORITY_COLORS[priority] || "#888888";
  const textColor = PRIORITY_TEXT_COLORS[priority] || "#ffffff";

  return (
    <span
      className={`priority-badge priority-badge-${size}`}
      style={{ backgroundColor: bgColor, color: textColor }}
      title={`Priority: ${label}`}
    >
      p{priority}
    </span>
  );
}
