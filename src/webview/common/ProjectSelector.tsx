/**
 * ProjectSelector Component
 *
 * Dropdown for selecting the active Beads project
 */

import React from "react";
import { BeadsProject } from "../types";

interface ProjectSelectorProps {
  projects: BeadsProject[];
  activeProject: BeadsProject | null;
  onSelectProject: (projectId: string) => void;
}

export function ProjectSelector({
  projects,
  activeProject,
  onSelectProject,
}: ProjectSelectorProps): React.ReactElement {
  if (projects.length === 0) {
    return (
      <div className="project-selector empty">
        <span>No projects</span>
      </div>
    );
  }

  if (projects.length === 1) {
    return (
      <div className="project-selector single">
        <span className="project-name">{activeProject?.name || projects[0].name}</span>
        <DaemonBadge status={activeProject?.daemonStatus || "unknown"} />
      </div>
    );
  }

  return (
    <div className="project-selector">
      <select
        value={activeProject?.id || ""}
        onChange={(e) => onSelectProject(e.target.value)}
        className="project-select"
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <DaemonBadge status={activeProject?.daemonStatus || "unknown"} />
    </div>
  );
}

interface DaemonBadgeProps {
  status: "running" | "stopped" | "unknown";
}

function DaemonBadge({ status }: DaemonBadgeProps): React.ReactElement {
  const statusClass = `daemon-badge daemon-${status}`;
  const statusText =
    status === "running" ? "●" : status === "stopped" ? "○" : "?";

  return (
    <span className={statusClass} title={`Daemon: ${status}`}>
      {statusText}
    </span>
  );
}
