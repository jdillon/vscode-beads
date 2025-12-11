/**
 * Icon Component
 *
 * Renders SVG icons from the icons folder (FontAwesome Free)
 */

import React from "react";
import { icons, IconName } from "../icons";

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
  title?: string;
}

export function Icon({
  name,
  size = 14,
  color = "currentColor",
  className = "",
  title,
}: IconProps): React.ReactElement | null {
  const svgContent = icons[name];
  if (!svgContent) return null;

  // Inject size, color, and class into SVG
  const styledSvg = svgContent
    .replace(/<svg/, `<svg width="${size}" height="${size}" fill="${color}" class="icon ${className}"`)
    .replace(/<!--[\s\S]*?-->/g, ""); // Remove comments

  return (
    <span
      className="icon-wrapper"
      title={title}
      dangerouslySetInnerHTML={{ __html: styledSvg }}
    />
  );
}
