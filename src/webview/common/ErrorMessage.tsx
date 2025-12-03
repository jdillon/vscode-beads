/**
 * ErrorMessage Component
 *
 * Displays error messages with optional retry and start daemon buttons
 */

import React from "react";

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  onStartDaemon?: () => void;
}

export function ErrorMessage({
  message,
  onRetry,
  onStartDaemon,
}: ErrorMessageProps): React.ReactElement {
  return (
    <div className="error-message">
      <div className="error-icon">⚠️</div>
      <p className="error-text">{message}</p>
      <div className="error-actions">
        {onStartDaemon && (
          <button className="start-daemon-button" onClick={onStartDaemon}>
            Start Daemon
          </button>
        )}
        {onRetry && (
          <button className="retry-button" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
