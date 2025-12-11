/**
 * SVG Icon imports
 *
 * Icons from Font Awesome Free (CC BY 4.0)
 * https://fontawesome.com
 */

// Issue type icons
import bugSvg from "./bug.svg";
import lightbulbSvg from "./lightbulb.svg";
import squareCheckSvg from "./square-check.svg";
import boltSvg from "./bolt.svg";
import wrenchSvg from "./wrench.svg";

// UI icons
import userSvg from "./user.svg";
import tagSvg from "./tag.svg";

export const icons = {
  // Issue types
  bug: bugSvg,
  feature: lightbulbSvg,
  task: squareCheckSvg,
  epic: boltSvg,
  chore: wrenchSvg,
  // UI
  user: userSvg,
  tag: tagSvg,
} as const;

export type IconName = keyof typeof icons;
