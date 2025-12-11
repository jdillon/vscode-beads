/**
 * TypeIcon Component
 *
 * Displays an SVG icon for bead issue types using FontAwesome Free icons
 */

import React from "react";
import { BeadType, TYPE_COLORS } from "../types";
import { icons } from "../icons";

interface TypeIconProps {
  type: BeadType;
  size?: number;
  colored?: boolean;
}

export function TypeIcon({
  type,
  size = 16,
  colored = true,
}: TypeIconProps): React.ReactElement | null {
  const svgContent = icons[type];
  if (!svgContent) return null;

  const color = colored ? TYPE_COLORS[type] : "currentColor";

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
