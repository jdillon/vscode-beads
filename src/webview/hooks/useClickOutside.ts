import { RefObject, useEffect } from "react";

/**
 * Hook to detect clicks outside a referenced element.
 * Useful for closing menus, dropdowns, modals, etc.
 *
 * @param ref - React ref to the element to monitor
 * @param handler - Callback when click occurs outside the element
 * @param enabled - Optional flag to enable/disable the listener (default: true)
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T>,
  handler: () => void,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ref, handler, enabled]);
}
