/**
 * Timestamp Component and utilities
 *
 * Handles timezone-aware display and sorting of ISO 8601 timestamps.
 */

import React, { useRef, useState, useEffect } from "react";

interface TimestampProps {
  value: string | undefined | null;
  /**
   * Format options:
   * - "date": Date only (default)
   * - "datetime": Date and time
   * - "relative": Relative time (e.g., "2h ago")
   * - "auto": Adapts based on container width (date → datetime when wide enough)
   */
  format?: "date" | "datetime" | "relative" | "auto";
}

// Width threshold for showing datetime in auto mode (pixels)
const AUTO_DATETIME_WIDTH = 120;

/**
 * Displays a timestamp in the user's local timezone.
 * Accepts ISO 8601 strings with any timezone offset.
 */
export function Timestamp({
  value,
  format = "date",
}: TimestampProps): React.ReactElement {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Track container width for auto format
  useEffect(() => {
    if (format !== "auto") return;

    const element = spanRef.current?.parentElement;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    // Initial measurement
    setContainerWidth(element.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, [format]);

  if (!value) {
    return <span className="timestamp timestamp-empty" ref={spanRef}>-</span>;
  }

  const date = new Date(value);

  // Determine effective format for auto mode
  const effectiveFormat: "date" | "datetime" | "relative" =
    format === "auto"
      ? (containerWidth >= AUTO_DATETIME_WIDTH ? "datetime" : "date")
      : format;

  const formatted = formatTimestamp(date, effectiveFormat);
  const fullDateTime = date.toLocaleString();

  return (
    <span className="timestamp" title={fullDateTime} ref={spanRef}>
      {formatted}
    </span>
  );
}

/**
 * Format a Date object for display.
 */
function formatTimestamp(
  date: Date,
  format: "date" | "datetime" | "relative"
): string {
  switch (format) {
    case "datetime":
      // Format without comma: "12/5/2025 12:22 AM"
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
    case "relative":
      return getRelativeTime(date);
    case "date":
    default:
      return date.toLocaleDateString();
  }
}

/**
 * Get relative time string (e.g., "2 hours ago", "yesterday").
 */
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

/**
 * Compare two ISO 8601 timestamp strings by UTC time.
 * Use this for sorting timestamps across different timezones.
 *
 * Returns negative if a < b, positive if a > b, 0 if equal.
 * Null/undefined values sort last.
 */
export function compareTimestamps(
  a: string | undefined | null,
  b: string | undefined | null
): number {
  if (!a && !b) return 0;
  if (!a) return 1; // nulls last
  if (!b) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}

/**
 * TanStack Table sorting function for timestamp columns.
 * Use as the `sortingFn` option on timestamp accessor columns.
 */
export function timestampSortingFn(
  rowA: { getValue: (columnId: string) => unknown },
  rowB: { getValue: (columnId: string) => unknown },
  columnId: string
): number {
  const a = rowA.getValue(columnId) as string | undefined;
  const b = rowB.getValue(columnId) as string | undefined;
  return compareTimestamps(a, b);
}
