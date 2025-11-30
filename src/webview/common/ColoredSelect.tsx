/**
 * ColoredSelect Component
 *
 * Custom dropdown that displays colored badges/chips for each option.
 * Replaces native <select> for type/status/priority fields.
 */

import React, { useState, useRef, useEffect } from "react";

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
}

export function ColoredSelect<T extends string | number>({
  value,
  options,
  onChange,
  className = "",
}: ColoredSelectProps<T>): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSelect = (optionValue: T) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div className={`colored-select ${className}`} ref={wrapperRef}>
      <button
        type="button"
        className="colored-select-trigger"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          "--chip-accent-color": selectedOption.color,
        } as React.CSSProperties}
      >
        <span className="colored-select-label">{selectedOption.label}</span>
        <span className="colored-select-arrow">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="colored-select-menu">
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              className={`colored-select-option ${option.value === value ? "selected" : ""}`}
              onClick={() => handleSelect(option.value)}
            >
              <span
                className="colored-select-badge"
                style={{
                  backgroundColor: option.color,
                  color: option.textColor || "#ffffff",
                }}
              >
                {option.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
