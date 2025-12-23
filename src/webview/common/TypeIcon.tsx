/**
 * TypeIcon Component
 *
 * Displays an SVG icon for bead issue types using FontAwesome Free icons.
 * Shows a notdef (missing glyph) icon for unknown types.
 */

import React from "react";
import { TYPE_COLORS, UNKNOWN_TYPE_COLOR } from "../types";
import { icons } from "../icons";

interface TypeIconProps {
  type: string;
  size?: number;
  colored?: boolean;
}

export function TypeIcon({
  type,
  size = 16,
  colored = true,
}: TypeIconProps): React.ReactElement {
  // Use known icon or fallback to notdef (missing glyph)
  const svgContent = icons[type as keyof typeof icons] || icons.notdef;

  // Use known color or fallback to gray
  const color = colored
    ? (TYPE_COLORS[type as keyof typeof TYPE_COLORS] || UNKNOWN_TYPE_COLOR)
    : "currentColor";

  // Inject fill color into SVG
  const coloredSvg = svgContent
    .replace(/<svg/, `<svg width="${size}" height="${size}" fill="${color}" class="type-icon"`)
    .replace(/<!--[\s\S]*?-->/g, ""); // Remove comments

  return (
    <span
      className="type-icon-wrapper"
      title={type}
      dangerouslySetInnerHTML={{ __html: coloredSvg }}
    />
  );
}
