import { RefObject, useEffect } from "react";

/**
 * Hook to detect clicks outside a referenced element.
 * Useful for closing menus, dropdowns, modals, etc.
 *
 * Also handles window blur events to close menus when clicking
 * outside the webview entirely (e.g., other VS Code panels).
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

    // Close when webview loses focus (clicking outside to other VS Code panels)
    const handleBlur = () => {
      handler();
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("blur", handleBlur);
    };
  }, [ref, handler, enabled]);
}
