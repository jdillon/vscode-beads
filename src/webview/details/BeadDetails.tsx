/**
 * BeadDetails Component
 *
 * Full view/edit of a single bead with:
 * - Editable fields
 * - Dependency management
 * - Metadata display
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  Bead,
  BeadStatus,
  BeadPriority,
  STATUS_LABELS,
  PRIORITY_LABELS,
} from "../types";
import { StatusBadge } from "../common/StatusBadge";
import { PriorityBadge } from "../common/PriorityBadge";
import { LabelBadge } from "../common/LabelBadge";

interface BeadDetailsProps {
  bead: Bead | null;
  loading: boolean;
  onUpdateBead: (beadId: string, updates: Partial<Bead>) => void;
  onAddDependency: (beadId: string, dependsOnId: string) => void;
  onRemoveDependency: (beadId: string, dependsOnId: string) => void;
  onViewInGraph: (beadId: string) => void;
}

export function BeadDetails({
  bead,
  loading,
  onUpdateBead,
  onAddDependency,
  onRemoveDependency,
  onViewInGraph,
}: BeadDetailsProps): React.ReactElement {
  const [editMode, setEditMode] = useState(false);
  const [editedBead, setEditedBead] = useState<Partial<Bead>>({});
  const [newLabel, setNewLabel] = useState("");
  const [newDependency, setNewDependency] = useState("");

  // Reset edit state when bead changes
  useEffect(() => {
    setEditMode(false);
    setEditedBead({});
  }, [bead?.id]);

  const handleSave = useCallback(() => {
    if (bead && Object.keys(editedBead).length > 0) {
      onUpdateBead(bead.id, editedBead);
      setEditMode(false);
      setEditedBead({});
    }
  }, [bead, editedBead, onUpdateBead]);

  const handleCancel = useCallback(() => {
    setEditMode(false);
    setEditedBead({});
  }, []);

  const handleFieldChange = useCallback(
    (field: keyof Bead, value: unknown) => {
      setEditedBead((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleAddLabel = useCallback(() => {
    if (newLabel.trim() && bead) {
      const currentLabels = editedBead.labels || bead.labels || [];
      if (!currentLabels.includes(newLabel.trim())) {
        handleFieldChange("labels", [...currentLabels, newLabel.trim()]);
      }
      setNewLabel("");
    }
  }, [newLabel, bead, editedBead.labels, handleFieldChange]);

  const handleRemoveLabel = useCallback(
    (label: string) => {
      if (bead) {
        const currentLabels = editedBead.labels || bead.labels || [];
        handleFieldChange(
          "labels",
          currentLabels.filter((l) => l !== label)
        );
      }
    },
    [bead, editedBead.labels, handleFieldChange]
  );

  const handleAddDependency = useCallback(() => {
    if (newDependency.trim() && bead) {
      onAddDependency(bead.id, newDependency.trim());
      setNewDependency("");
    }
  }, [newDependency, bead, onAddDependency]);

  if (loading && !bead) {
    return <div className="details-loading">Loading bead details...</div>;
  }

  if (!bead) {
    return (
      <div className="details-empty">
        <div className="empty-state-icon">📋</div>
        <h3>No Bead Selected</h3>
        <p>Select a bead from the panel or Kanban board to view details.</p>
      </div>
    );
  }

  const displayBead = { ...bead, ...editedBead };

  return (
    <div className="bead-details">
      <div className="details-header">
        <div className="header-id">{bead.id}</div>
        <div className="header-actions">
          <button
            className="action-button"
            onClick={() => onViewInGraph(bead.id)}
            title="View in graph"
          >
            🔗
          </button>
          {editMode ? (
            <>
              <button className="action-button save" onClick={handleSave}>
                Save
              </button>
              <button className="action-button cancel" onClick={handleCancel}>
                Cancel
              </button>
            </>
          ) : (
            <button
              className="action-button edit"
              onClick={() => setEditMode(true)}
            >
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="details-content">
        {/* Title */}
        <div className="detail-field">
          <label>Title</label>
          {editMode ? (
            <input
              type="text"
              value={displayBead.title}
              onChange={(e) => handleFieldChange("title", e.target.value)}
              className="field-input"
            />
          ) : (
            <div className="field-value title">{displayBead.title}</div>
          )}
        </div>

        {/* Status */}
        <div className="detail-field">
          <label>Status</label>
          {editMode ? (
            <select
              value={displayBead.status}
              onChange={(e) =>
                handleFieldChange("status", e.target.value as BeadStatus)
              }
              className="field-select"
            >
              {(Object.keys(STATUS_LABELS) as BeadStatus[]).map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          ) : (
            <StatusBadge status={displayBead.status} />
          )}
        </div>

        {/* Priority */}
        <div className="detail-field">
          <label>Priority</label>
          {editMode ? (
            <select
              value={displayBead.priority ?? 4}
              onChange={(e) =>
                handleFieldChange("priority", parseInt(e.target.value) as BeadPriority)
              }
              className="field-select"
            >
              {([0, 1, 2, 3, 4] as BeadPriority[]).map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]} (P{priority})
                </option>
              ))}
            </select>
          ) : displayBead.priority !== undefined ? (
            <PriorityBadge priority={displayBead.priority} />
          ) : (
            <span className="field-empty">Not set</span>
          )}
        </div>

        {/* Type */}
        <div className="detail-field">
          <label>Type</label>
          {editMode ? (
            <input
              type="text"
              value={displayBead.type || ""}
              onChange={(e) => handleFieldChange("type", e.target.value)}
              className="field-input"
              placeholder="bug, feature, task..."
            />
          ) : (
            <div className="field-value">{displayBead.type || "-"}</div>
          )}
        </div>

        {/* Assignee */}
        <div className="detail-field">
          <label>Assignee</label>
          {editMode ? (
            <input
              type="text"
              value={displayBead.assignee || ""}
              onChange={(e) => handleFieldChange("assignee", e.target.value)}
              className="field-input"
              placeholder="username"
            />
          ) : (
            <div className="field-value">{displayBead.assignee || "-"}</div>
          )}
        </div>

        {/* Description */}
        <div className="detail-field full-width">
          <label>Description</label>
          {editMode ? (
            <textarea
              value={displayBead.description || ""}
              onChange={(e) => handleFieldChange("description", e.target.value)}
              className="field-textarea"
              rows={4}
              placeholder="Describe the bead..."
            />
          ) : (
            <div className="field-value description">
              {displayBead.description || "No description"}
            </div>
          )}
        </div>

        {/* Labels */}
        <div className="detail-field full-width">
          <label>Labels</label>
          <div className="labels-container">
            {(displayBead.labels || []).map((label) => (
              <LabelBadge
                key={label}
                label={label}
                onRemove={editMode ? () => handleRemoveLabel(label) : undefined}
              />
            ))}
            {editMode && (
              <div className="add-label">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Add label..."
                  onKeyDown={(e) => e.key === "Enter" && handleAddLabel()}
                />
                <button onClick={handleAddLabel}>+</button>
              </div>
            )}
          </div>
        </div>

        {/* Dependencies */}
        <div className="detail-field full-width">
          <label>Depends On</label>
          <div className="dependencies-list">
            {(displayBead.dependsOn || []).length === 0 ? (
              <span className="field-empty">No dependencies</span>
            ) : (
              displayBead.dependsOn?.map((depId) => (
                <div key={depId} className="dependency-item">
                  <span className="dep-id">{depId}</span>
                  {editMode && (
                    <button
                      className="dep-remove"
                      onClick={() => onRemoveDependency(bead.id, depId)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))
            )}
            {editMode && (
              <div className="add-dependency">
                <input
                  type="text"
                  value={newDependency}
                  onChange={(e) => setNewDependency(e.target.value)}
                  placeholder="Add dependency ID..."
                  onKeyDown={(e) => e.key === "Enter" && handleAddDependency()}
                />
                <button onClick={handleAddDependency}>+</button>
              </div>
            )}
          </div>
        </div>

        {/* Blocks */}
        {displayBead.blocks && displayBead.blocks.length > 0 && (
          <div className="detail-field full-width">
            <label>Blocks</label>
            <div className="dependencies-list">
              {displayBead.blocks.map((blockId) => (
                <div key={blockId} className="dependency-item">
                  <span className="dep-id">{blockId}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="detail-field full-width metadata">
          <label>Metadata</label>
          <div className="metadata-grid">
            <div className="metadata-item">
              <span className="meta-label">Created:</span>
              <span className="meta-value">
                {displayBead.createdAt
                  ? new Date(displayBead.createdAt).toLocaleString()
                  : "-"}
              </span>
            </div>
            <div className="metadata-item">
              <span className="meta-label">Updated:</span>
              <span className="meta-value">
                {displayBead.updatedAt
                  ? new Date(displayBead.updatedAt).toLocaleString()
                  : "-"}
              </span>
            </div>
            {displayBead.closedAt && (
              <div className="metadata-item">
                <span className="meta-label">Closed:</span>
                <span className="meta-value">
                  {new Date(displayBead.closedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
