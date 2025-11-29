/**
 * Label Color Utilities
 *
 * Generates deterministic colors from label names with appropriate text contrast.
 */

/**
 * FNV-1a hash - better distribution for short strings
 */
function hashString(str: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  // Additional mixing for better distribution
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/**
 * Calculate relative luminance per WCAG 2.0
 * https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Determine if text should be light or dark based on background luminance
 */
function shouldUseDarkText(bgR: number, bgG: number, bgB: number): boolean {
  const luminance = getRelativeLuminance(bgR, bgG, bgB);
  // Higher threshold (0.4) for better readability - switch to white text sooner
  // WCAG minimum is 0.179 but blues appear darker than calculated
  return luminance > 0.4;
}

export interface LabelColorStyle {
  backgroundColor: string;
  color: string;
}

/**
 * Generate a deterministic color style for a label name.
 * Returns background color and appropriate text color for readability.
 */
export function getLabelColorStyle(label: string): LabelColorStyle {
  const hash = hashString(label.toLowerCase());

  // Map hash to hue (0-360)
  const hue = hash % 360;

  // Fixed saturation and lightness for consistent, readable colors
  const saturation = 65;
  const lightness = 55;

  const [r, g, b] = hslToRgb(hue, saturation, lightness);
  const useDarkText = shouldUseDarkText(r, g, b);

  return {
    backgroundColor: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    color: useDarkText ? "#1a1a1a" : "#ffffff",
  };
}
