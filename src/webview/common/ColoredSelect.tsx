/**
 * ColoredSelect Component
 *
 * Custom dropdown that displays colored badges/chips for each option.
 * Replaces native <select> for type/status/priority fields.
 * Built on generic Dropdown for consistent behavior.
 */

import React, { useState, useRef, ReactNode } from "react";
import { ChevronIcon } from "./ChevronIcon";
import { useClickOutside } from "../hooks/useClickOutside";

export interface ColoredSelectOption<T extends string | number> {
  value: T;
  label: string;
  color: string;
  textColor?: string;
}

interface ColoredSelectProps<T extends string | number> {
  value: T;
  options: ColoredSelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  /** "filter-chip" shows text with colored border, "badge" shows full colored badge */
  variant?: "filter-chip" | "badge";
  /** Custom render for trigger - use this to render actual badge components */
  renderTrigger?: (option: ColoredSelectOption<T>) => ReactNode;
  /** Custom render for menu options */
  renderOption?: (option: ColoredSelectOption<T>) => ReactNode;
  /** Show chevron dropdown indicator (default: true) */
  showChevron?: boolean;
}

export function ColoredSelect<T extends string | number>({
  value,
  options,
  onChange,
  className = "",
  variant = "filter-chip",
  renderTrigger,
  renderOption,
  showChevron = true,
}: ColoredSelectProps<T>): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  useClickOutside(selectRef, () => setIsOpen(false), isOpen);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  const handleSelect = (optionValue: T) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  // Default trigger rendering
  const defaultTrigger = () => {
    if (variant === "badge") {
      return (
        <span
          className="colored-select-badge"
          style={{
            backgroundColor: selectedOption.color,
            color: selectedOption.textColor || "#ffffff",
          }}
        >
          {selectedOption.label}
        </span>
      );
    }
    return (
      <>
        <span className="colored-select-label">{selectedOption.label}</span>
        {showChevron && <ChevronIcon open={isOpen} size={10} />}
      </>
    );
  };

  // Default option rendering
  const defaultOption = (option: ColoredSelectOption<T>) => (
    <span
      className="colored-select-badge"
      style={{
        backgroundColor: option.color,
        color: option.textColor || "#ffffff",
      }}
    >
      {option.label}
    </span>
  );

  // Use custom trigger if provided, otherwise check variant
  const hasCustomTrigger = renderTrigger || variant === "badge";

  return (
    <div className={`colored-select dropdown ${className}`} ref={selectRef}>
      <button
        type="button"
        className={`colored-select-trigger dropdown-trigger ${hasCustomTrigger ? "colored-select-trigger-custom" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        style={!renderTrigger && variant === "filter-chip" ? {
          "--chip-accent-color": selectedOption.color,
        } as React.CSSProperties : undefined}
      >
        {renderTrigger ? (
          <>
            {renderTrigger(selectedOption)}
            {showChevron && <ChevronIcon open={isOpen} size={10} />}
          </>
        ) : defaultTrigger()}
      </button>

      {isOpen && (
        <div className="colored-select-menu dropdown-menu">
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              className={`colored-select-option dropdown-item ${option.value === value ? "selected" : ""}`}
              onClick={() => handleSelect(option.value)}
            >
              {renderOption ? renderOption(option) : defaultOption(option)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
