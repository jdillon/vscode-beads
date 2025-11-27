/**
 * StatusBadge Component
 *
 * Displays bead status as a colored badge
 */

import React from "react";
import { BeadStatus, STATUS_LABELS, STATUS_COLORS } from "../types";

interface StatusBadgeProps {
  status: BeadStatus;
  size?: "small" | "medium" | "large";
}

export function StatusBadge({
  status,
  size = "medium",
}: StatusBadgeProps): React.ReactElement {
  const label = STATUS_LABELS[status] || status;
  const color = STATUS_COLORS[status] || "#888888";

  return (
    <span
      className={`status-badge status-badge-${size}`}
      style={{ backgroundColor: color }}
      title={label}
    >
      {label}
    </span>
  );
}
