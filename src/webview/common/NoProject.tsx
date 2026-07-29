/**
 * NoProject Component
 *
 * Shown when no Beads project could be discovered, with recovery hints.
 */

import React from "react";

export function NoProject(): React.ReactElement {
  return (
    <div className="empty-state">
      <h3>No Beads project found</h3>
      <p>
        Run <code>bd init</code> in your project, or add the project root to the{" "}
        <code>beads.projects</code> setting.
      </p>
      <p>
        If <code>bd</code> is not on your PATH, set <code>beads.pathToBd</code> to its
        full path. See Output &gt; Beads for details.
      </p>
    </div>
  );
}
