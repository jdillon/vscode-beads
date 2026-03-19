import React from "react";
import { BeadsProject } from "../types";

interface ProjectsViewProps {
  projects: BeadsProject[];
  activeProject: BeadsProject | null;
  onSelectProject: (project: BeadsProject) => void;
  onManageProject: (project: BeadsProject) => void;
  onRefresh: () => void;
}

export function ProjectsView({
  projects,
  activeProject,
  onSelectProject,
  onManageProject,
  onRefresh,
}: ProjectsViewProps): React.ReactElement {
  if (projects.length === 0) {
    return (
      <div className="projects-panel empty-state compact">
        <p>No Beads projects found in the workspace.</p>
      </div>
    );
  }

  return (
    <div className="projects-panel">
      <div className="projects-toolbar">
        <div>
          <div className="projects-title">Workspace Projects</div>
          <div className="projects-subtitle">Select a project and inspect its Beads/Dolt status.</div>
        </div>
        <button className="projects-refresh-btn" onClick={onRefresh} title="Refresh projects">
          Refresh
        </button>
      </div>

      <div className="projects-list">
        {projects.map((project) => {
          const isActive = project.id === activeProject?.id;
          return (
            <div key={`${project.id}:${project.rootPath}`} className={`project-card ${isActive ? "active" : ""}`}>
              <div className="project-card-header">
                <div>
                  <div className="project-card-title-row">
                    <span className="project-card-title">{project.name}</span>
                    {isActive && <span className="project-active-badge">Active</span>}
                  </div>
                  <div className="project-card-path" title={project.rootPath}>{project.rootPath}</div>
                </div>
                <span className={`project-status-pill ${project.backendStatus}`}>{project.backendStatus}</span>
              </div>

              <div className="project-meta-grid">
                <div>
                  <span className="project-meta-label">Storage</span>
                  <span className="project-meta-value">{project.storageMode ?? "unknown"}</span>
                </div>
                <div>
                  <span className="project-meta-label">Source</span>
                  <span className="project-meta-value">{project.source ?? "workspace"}</span>
                </div>
              </div>

              <div className="project-beads-dir" title={project.beadsDir}>
                <span className="project-meta-label">Beads Dir</span>
                <code>{project.beadsDir}</code>
              </div>

              <div className="project-card-actions">
                {!isActive ? (
                  <button className="project-primary-btn" onClick={() => onSelectProject(project)}>
                    Use Project
                  </button>
                ) : (
                  <button className="project-secondary-btn" onClick={() => onManageProject(project)}>
                    Manage Status
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
