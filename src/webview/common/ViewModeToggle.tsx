/**
 * ViewModeMenu - Dropdown menu for selecting view mode (list, tree, etc.)
 */

import React, { useState, useRef } from "react";
import { useClickOutside } from "../hooks/useClickOutside";
import { Icon } from "./Icon";

export type ViewMode = "list" | "tree";

interface ViewModeOption {
  value: ViewMode;
  label: string;
  iconName: "list" | "sitemap";
}

const VIEW_MODE_OPTIONS: ViewModeOption[] = [
  { value: "list", label: "List", iconName: "list" },
  { value: "tree", label: "Tree", iconName: "sitemap" },
];

interface ViewModeMenuProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({
  value,
  onChange,
}: ViewModeMenuProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setIsOpen(false), isOpen);

  return (
    <div className="view-mode-menu" ref={menuRef}>
      <button
        className="view-mode-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="View options"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>
      {isOpen && (
        <div className="view-mode-menu-dropdown">
          {VIEW_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`view-mode-menu-item ${value === option.value ? "active" : ""}`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              <span className="view-mode-menu-icon">
                <Icon name={option.iconName} size={14} />
              </span>
              <span className="view-mode-menu-label">{option.label}</span>
              {value === option.value && (
                <span className="view-mode-menu-check">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
