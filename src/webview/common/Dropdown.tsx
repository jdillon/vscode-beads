/**
 * Dropdown - Generic dropdown with click-outside handling
 *
 * Provides consistent dropdown behavior:
 * - Trigger button with optional chevron
 * - Click outside to close
 * - Close on window blur (webview loses focus)
 * - Auto-close on item click (via context)
 */

import React, { useState, useRef, useEffect, ReactNode, createContext, useContext } from "react";
import { ChevronIcon } from "./ChevronIcon";

// Context to allow DropdownItem to close the dropdown
const DropdownContext = createContext<{ close: () => void } | null>(null);

interface DropdownProps {
  /** Content displayed in the trigger button */
  trigger: ReactNode;
  /** Menu items rendered when open */
  children: ReactNode;
  /** Additional class for the wrapper div */
  className?: string;
  /** Additional class for the trigger button */
  triggerClassName?: string;
  /** Additional class for the menu container */
  menuClassName?: string;
  /** Button title/tooltip */
  title?: string;
  /** Show chevron icon (default: true) */
  showChevron?: boolean;
  /** Controlled: external open state */
  open?: boolean;
  /** Controlled: callback when open state changes */
  onOpenChange?: (open: boolean) => void;
}

export function Dropdown({
  trigger,
  children,
  className = "",
  triggerClassName = "",
  menuClassName = "",
  title,
  showChevron = true,
  open: controlledOpen,
  onOpenChange,
}: DropdownProps): React.ReactElement {
  const [internalOpen, setInternalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Support both controlled and uncontrolled modes
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = (value: boolean) => {
    if (!isControlled) {
      setInternalOpen(value);
    }
    onOpenChange?.(value);
  };

  const close = () => setIsOpen(false);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on blur (click outside webview)
  useEffect(() => {
    const handleBlur = () => setIsOpen(false);
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  return (
    <DropdownContext.Provider value={{ close }}>
      <div className={`dropdown ${className}`} ref={dropdownRef}>
        <button
          className={`dropdown-trigger ${triggerClassName}`}
          onClick={() => setIsOpen(!isOpen)}
          title={title}
        >
          {trigger}
          {showChevron && <ChevronIcon open={isOpen} />}
        </button>

        {isOpen && (
          <div className={`dropdown-menu ${menuClassName}`}>
            {children}
          </div>
        )}
      </div>
    </DropdownContext.Provider>
  );
}

interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  title?: string;
}

export function DropdownItem({
  children,
  onClick,
  active = false,
  className = "",
  title,
}: DropdownItemProps): React.ReactElement {
  const context = useContext(DropdownContext);

  const handleClick = () => {
    onClick?.();
    context?.close();
  };

  return (
    <button
      className={`dropdown-item ${active ? "active" : ""} ${className}`}
      onClick={handleClick}
      title={title}
    >
      {children}
    </button>
  );
}
