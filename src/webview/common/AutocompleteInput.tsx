/**
 * AutocompleteInput - Text input with searchable dropdown
 *
 * Use cases:
 * - Filter by label (select from existing labels)
 * - Add label to issue (select existing or create new)
 * - Any searchable dropdown with many options
 */

import React, { useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { useClickOutside } from "../hooks/useClickOutside";

export interface AutocompleteOption {
  /** Unique value for this option */
  value: string;
  /** Display label (defaults to value if not provided) */
  label?: string;
  /** Optional count to show (e.g., facet count) */
  count?: number;
  /** Custom render for the option */
  render?: () => ReactNode;
}

interface AutocompleteInputProps {
  /** Placeholder text for input */
  placeholder?: string;
  /** Available options to filter/select from */
  options: AutocompleteOption[];
  /** Called when an option is selected */
  onSelect: (value: string) => void;
  /** Allow creating new values not in options (default: false) */
  allowCreate?: boolean;
  /** Called when creating a new value (only if allowCreate=true) */
  onCreate?: (value: string) => void;
  /** Custom render for the "create new" option */
  renderCreateOption?: (inputValue: string) => ReactNode;
  /** Minimum characters before showing dropdown (default: 0) */
  minChars?: number;
  /** Auto-focus input when mounted */
  autoFocus?: boolean;
  /** Additional class for the wrapper */
  className?: string;
  /** Show dropdown even with empty input */
  showAllOnFocus?: boolean;
  /** Use fixed positioning to escape overflow:hidden containers */
  useFixedPositioning?: boolean;
}

export function AutocompleteInput({
  placeholder = "Type to search...",
  options,
  onSelect,
  allowCreate = false,
  onCreate,
  renderCreateOption,
  minChars = 0,
  autoFocus = false,
  className = "",
  showAllOnFocus = true,
  useFixedPositioning = false,
}: AutocompleteInputProps): React.ReactElement {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useClickOutside(wrapperRef, () => setIsOpen(false), isOpen);

  // Filter options based on input
  const filteredOptions = options.filter((opt) => {
    const label = opt.label || opt.value;
    return label.toLowerCase().includes(inputValue.toLowerCase());
  });

  // Check if input matches any existing option exactly
  const exactMatch = options.some(
    (opt) => (opt.label || opt.value).toLowerCase() === inputValue.toLowerCase()
  );

  // Show "create new" option if allowed and no exact match
  const showCreateOption = allowCreate && inputValue.trim() && !exactMatch;

  // Total items (filtered + optional create)
  const totalItems = filteredOptions.length + (showCreateOption ? 1 : 0);

  // Reset highlight when filtered options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [inputValue]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlighted = listRef.current.querySelector(".highlighted");
      if (highlighted) {
        highlighted.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Calculate fixed position when dropdown opens
  useEffect(() => {
    if (isOpen && useFixedPositioning && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 2,
        left: rect.left,
        minWidth: Math.max(150, rect.width),
      });
    }
  }, [isOpen, useFixedPositioning]);

  const handleSelect = useCallback((value: string) => {
    onSelect(value);
    setInputValue("");
    setIsOpen(false);
  }, [onSelect]);

  const handleCreate = useCallback(() => {
    if (onCreate && inputValue.trim()) {
      onCreate(inputValue.trim());
      setInputValue("");
      setIsOpen(false);
    }
  }, [onCreate, inputValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % totalItems);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + totalItems) % totalItems);
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex < filteredOptions.length) {
          handleSelect(filteredOptions[highlightedIndex].value);
        } else if (showCreateOption) {
          handleCreate();
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    if (e.target.value.length >= minChars || showAllOnFocus) {
      setIsOpen(true);
    }
  };

  const handleFocus = () => {
    if (showAllOnFocus || inputValue.length >= minChars) {
      setIsOpen(true);
    }
  };

  const shouldShowDropdown = isOpen && (inputValue.length >= minChars || showAllOnFocus) && totalItems > 0;

  return (
    <div className={`autocomplete-input ${className}`} ref={wrapperRef}>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="autocomplete-text-input"
      />
      {shouldShowDropdown && (
        <div
          className={`autocomplete-dropdown ${useFixedPositioning ? "fixed" : ""}`}
          ref={listRef}
          style={useFixedPositioning ? dropdownStyle : undefined}
        >
          {filteredOptions.map((option, index) => (
            <button
              key={option.value}
              className={`autocomplete-option ${index === highlightedIndex ? "highlighted" : ""}`}
              onClick={() => handleSelect(option.value)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              {option.render ? (
                option.render()
              ) : (
                <>
                  <span className="autocomplete-option-label">{option.label || option.value}</span>
                  {option.count !== undefined && (
                    <span className="autocomplete-option-count">({option.count})</span>
                  )}
                </>
              )}
            </button>
          ))}
          {showCreateOption && (
            <button
              className={`autocomplete-option autocomplete-create ${highlightedIndex === filteredOptions.length ? "highlighted" : ""}`}
              onClick={handleCreate}
              onMouseEnter={() => setHighlightedIndex(filteredOptions.length)}
            >
              {renderCreateOption ? (
                renderCreateOption(inputValue)
              ) : (
                <span className="autocomplete-create-label">Create "{inputValue}"</span>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
