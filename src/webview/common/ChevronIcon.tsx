/**
 * ChevronIcon - Reusable dropdown chevron SVG
 */

import React from "react";

interface ChevronIconProps {
  open?: boolean;
  size?: number;
  className?: string;
}

export function ChevronIcon({
  open = false,
  size = 12,
  className = "",
}: ChevronIconProps): React.ReactElement {
  return (
    <svg
      className={`chevron-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ transform: open ? "rotate(180deg)" : "none" }}
    >
      <path fill="currentColor" d="M4.5 5.5L8 9l3.5-3.5L13 7l-5 5-5-5z" />
    </svg>
  );
}
