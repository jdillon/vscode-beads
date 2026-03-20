/**
 * Dropdown - Generic dropdown with click-outside handling
 *
 * Provides consistent dropdown behavior:
 * - Trigger button with optional chevron
 * - Click outside to close
 * - Close on window blur (webview loses focus)
 * - Auto-close on item click (via context)
 */

import React, { useState, useRef, useEffect, ReactNode, createContext, useContext, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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
  /** Menu placement relative to trigger */
  menuPlacement?: "bottom-start" | "bottom-end";
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
  menuPlacement = "bottom-start",
}: DropdownProps): React.ReactElement {
  const [internalOpen, setInternalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; minWidth: number }>({
    top: 0,
    left: 0,
    minWidth: 0,
  });

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

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  // Close on blur (click outside webview)
  useEffect(() => {
    const handleBlur = () => setIsOpen(false);
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const triggerEl = triggerRef.current;
      const menuEl = menuRef.current;
      if (!triggerEl || !menuEl) return;

      const rect = triggerEl.getBoundingClientRect();
      const menuWidth = menuEl.offsetWidth || rect.width;
      const menuHeight = menuEl.offsetHeight || 0;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = menuPlacement === "bottom-end" ? rect.right - menuWidth : rect.left;
      left = Math.max(8, Math.min(left, viewportWidth - menuWidth - 8));

      let top = rect.bottom + 2;
      if (top + menuHeight > viewportHeight - 8) {
        top = Math.max(8, rect.top - menuHeight - 2);
      }

      setMenuPosition({ top, left, minWidth: rect.width });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, menuPlacement]);

  const menu = isOpen ? createPortal(
    <div
      ref={menuRef}
      className={`dropdown-menu ${menuClassName}`}
      style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left, minWidth: menuPosition.minWidth }}
    >
      {children}
    </div>,
    document.body
  ) : null;

  return (
    <DropdownContext.Provider value={{ close }}>
      <div className={`dropdown ${className}`} ref={dropdownRef}>
        <button
          ref={triggerRef}
          className={`dropdown-trigger ${triggerClassName}`}
          onClick={() => setIsOpen(!isOpen)}
          title={title}
        >
          {trigger}
          {showChevron && <ChevronIcon open={isOpen} />}
        </button>
      </div>
      {menu}
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
