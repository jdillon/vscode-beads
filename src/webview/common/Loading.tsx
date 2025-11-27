/**
 * Loading Component
 *
 * Displayed while data is being loaded
 */

import React from "react";

export function Loading(): React.ReactElement {
  return (
    <div className="loading">
      <div className="loading-spinner"></div>
      <p>Loading...</p>
    </div>
  );
}
