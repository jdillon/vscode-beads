/**
 * PriorityBadge Component
 *
 * Displays bead priority as a colored badge
 */

import React from "react";
import { BeadPriority, PRIORITY_LABELS, PRIORITY_COLORS } from "../types";

interface PriorityBadgeProps {
  priority: BeadPriority;
  size?: "small" | "medium" | "large";
}

export function PriorityBadge({
  priority,
  size = "medium",
}: PriorityBadgeProps): React.ReactElement {
  const label = PRIORITY_LABELS[priority] || `P${priority}`;
  const color = PRIORITY_COLORS[priority] || "#888888";

  return (
    <span
      className={`priority-badge priority-badge-${size}`}
      style={{ backgroundColor: color }}
      title={`Priority: ${label}`}
    >
      P{priority}
    </span>
  );
}
