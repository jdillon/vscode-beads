/**
 * Toast Component
 *
 * Transient feedback popup that appears near an action and auto-dismisses.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

export interface ToastMessage {
  id: number;
  text: string;
  x: number;
  y: number;
  below?: boolean;
}

interface ToastContextValue {
  showToast: (text: string, event: React.MouseEvent) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((text: string, event: React.MouseEvent) => {
    const id = ++toastId;
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    // Show below if near top of viewport, otherwise above
    const showBelow = rect.top < 40;
    setToasts((prev) => [
      ...prev,
      {
        id,
        text,
        x: rect.left + rect.width / 2,
        y: showBelow ? rect.bottom + 8 : rect.top - 8,
        below: showBelow,
      },
    ]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((msg) => (
          <ToastItem key={msg.id} message={msg} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  message,
  onDismiss,
  duration = 1500,
}: {
  message: ToastMessage;
  onDismiss: (id: number) => void;
  duration?: number;
}): React.ReactElement {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setVisible(false), duration - 200);
    const dismissTimer = setTimeout(() => onDismiss(message.id), duration);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(dismissTimer);
    };
  }, [message.id, duration, onDismiss]);

  return (
    <div
      className={`toast ${visible ? "visible" : "fading"} ${message.below ? "below" : ""}`}
      style={{
        left: message.x,
        top: message.y,
      }}
    >
      {message.text}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
