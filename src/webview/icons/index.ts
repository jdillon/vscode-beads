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
import codeMergeSvg from "./code-merge.svg";
import flaskSvg from "./flask.svg";

// UI icons
import userSvg from "./user.svg";
import tagSvg from "./tag.svg";
import externalLinkSvg from "./external-link.svg";
import notdefSvg from "./notdef.svg";

export const icons = {
  // Issue types
  bug: bugSvg,
  feature: lightbulbSvg,
  task: squareCheckSvg,
  epic: boltSvg,
  chore: wrenchSvg,
  "merge-request": codeMergeSvg,
  molecule: flaskSvg,
  // UI
  user: userSvg,
  tag: tagSvg,
  "external-link": externalLinkSvg,
  notdef: notdefSvg,
} as const;

export type IconName = keyof typeof icons;
