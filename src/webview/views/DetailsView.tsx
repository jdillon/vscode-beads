/**
 * DetailsView
 *
 * Full view/edit of a single issue with:
 * - Editable fields
 * - Dependency management
 * - Metadata display
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  Bead,
  BeadComment,
  BeadStatus,
  BeadPriority,
  STATUS_LABELS,
  PRIORITY_LABELS,
} from "../types";
import { StatusBadge } from "../common/StatusBadge";
import { PriorityBadge } from "../common/PriorityBadge";
import { LabelBadge } from "../common/LabelBadge";
import { Markdown } from "../common/Markdown";
import { useToast } from "../common/Toast";

interface DetailsViewProps {
  bead: Bead | null;
  loading: boolean;
  renderMarkdown?: boolean;
  onUpdateBead: (beadId: string, updates: Partial<Bead>) => void;
  onAddDependency: (beadId: string, dependsOnId: string) => void;
  onRemoveDependency: (beadId: string, dependsOnId: string) => void;
  onAddComment?: (beadId: string, text: string) => void;
  onViewInGraph: (beadId: string) => void;
  onSelectBead?: (beadId: string) => void;
  onCopyId?: (beadId: string) => void;
}

// Helper to render text content - markdown or plain
function TextContent({ content, renderMarkdown }: { content: string; renderMarkdown: boolean }) {
  if (renderMarkdown) {
    return <Markdown content={content} className="description-text" />;
  }
  return <p className="description-text">{content}</p>;
}

export function DetailsView({
  bead,
  loading,
  renderMarkdown = true,
  onUpdateBead,
  onAddDependency,
  onRemoveDependency,
  onAddComment,
  onViewInGraph,
  onSelectBead,
  onCopyId,
}: DetailsViewProps): React.ReactElement {
  // Toast kept for potential future use; currently using VS Code status bar for copy feedback
  const { showToast: _showToast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [editedBead, setEditedBead] = useState<Partial<Bead>>({});
  const [newLabel, setNewLabel] = useState("");
  const [newDependency, setNewDependency] = useState("");
  const [newComment, setNewComment] = useState("");

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
    return <div className="details-loading">Loading...</div>;
  }

  if (!bead) {
    return (
      <div className="details-empty">
        <p>Select a bead to view details</p>
      </div>
    );
  }

  const displayBead = { ...bead, ...editedBead };

  return (
    <div className="bead-details">
      {/* Header with ID and actions */}
      <div className="details-header">
        <span
          className="bead-id-badge clickable"
          onClick={() => {
            if (onCopyId) {
              onCopyId(bead.id);
            } else {
              // Fallback: copy directly without feedback
              navigator.clipboard.writeText(bead.id);
            }
          }}
          title="Click to copy ID"
        >
          {bead.id}
        </span>
        <div className="header-actions">
          {editMode ? (
            <>
              <button className="btn btn-primary btn-sm" onClick={handleSave}>
                Save
              </button>
              <button className="btn btn-sm" onClick={handleCancel}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn btn-sm" onClick={() => setEditMode(true)}>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Title - full width */}
      <div className="details-title">
        {editMode ? (
          <input
            type="text"
            value={displayBead.title}
            onChange={(e) => handleFieldChange("title", e.target.value)}
            className="title-input"
          />
        ) : (
          <h2>{displayBead.title}</h2>
        )}
      </div>

      {/* Type/Status/Priority chiclets */}
      <div className="details-badges">
        {editMode ? (
          <>
            <select
              value={displayBead.type || "task"}
              onChange={(e) => handleFieldChange("type", e.target.value)}
              className="badge-select"
            >
              {["bug", "feature", "task", "epic", "chore"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={displayBead.status}
              onChange={(e) =>
                handleFieldChange("status", e.target.value as BeadStatus)
              }
              className="badge-select"
            >
              {(Object.keys(STATUS_LABELS) as BeadStatus[]).map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <select
              value={displayBead.priority ?? 4}
              onChange={(e) =>
                handleFieldChange("priority", parseInt(e.target.value) as BeadPriority)
              }
              className="badge-select"
            >
              {([0, 1, 2, 3, 4] as BeadPriority[]).map((priority) => (
                <option key={priority} value={priority}>
                  P{priority}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            {displayBead.type && (
              <span className={`type-chip type-${displayBead.type}`}>{displayBead.type}</span>
            )}
            <StatusBadge status={displayBead.status} size="small" />
            {displayBead.priority !== undefined && (
              <PriorityBadge priority={displayBead.priority} size="small" />
            )}
          </>
        )}
      </div>

      {/* Assignee */}
      {(displayBead.assignee || editMode) && (
        <div className="details-assignee">
          <span className="label">Assignee:</span>
          {editMode ? (
            <input
              type="text"
              value={displayBead.assignee || ""}
              onChange={(e) => handleFieldChange("assignee", e.target.value)}
              className="inline-input"
              placeholder="unassigned"
            />
          ) : (
            <span className="value">{displayBead.assignee || "unassigned"}</span>
          )}
        </div>
      )}

      {/* Description */}
      <div className="details-section">
        <h4>Description</h4>
        {editMode ? (
          <textarea
            value={displayBead.description || ""}
            onChange={(e) => handleFieldChange("description", e.target.value)}
            className="description-input"
            rows={4}
            placeholder="No description"
          />
        ) : displayBead.description ? (
          <TextContent content={displayBead.description} renderMarkdown={renderMarkdown} />
        ) : (
          <p className="description-text muted">No description</p>
        )}
      </div>

      {/* Labels - hide when empty in view mode */}
      {(editMode || (displayBead.labels && displayBead.labels.length > 0)) && (
        <div className="details-section">
          <h4>Labels</h4>
          <div className="labels-row">
            {(displayBead.labels || []).map((label) => (
              <LabelBadge
                key={label}
                label={label}
                onRemove={editMode ? () => handleRemoveLabel(label) : undefined}
              />
            ))}
            {editMode && (
              <div className="add-inline">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="+ label"
                  onKeyDown={(e) => e.key === "Enter" && handleAddLabel()}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* External Reference & Estimate row */}
      {(displayBead.externalRef || displayBead.estimatedMinutes || editMode) && (
        <div className="details-row">
          <div className="details-field">
            <span className="label">External Ref:</span>
            {editMode ? (
              <input
                type="text"
                value={displayBead.externalRef || ""}
                onChange={(e) => handleFieldChange("externalRef", e.target.value)}
                className="inline-input"
                placeholder="e.g., gh-123, jira-ABC"
              />
            ) : (
              <span className="value">{displayBead.externalRef || "-"}</span>
            )}
          </div>
          <div className="details-field">
            <span className="label">Estimate:</span>
            {editMode ? (
              <input
                type="number"
                value={displayBead.estimatedMinutes || ""}
                onChange={(e) => handleFieldChange("estimatedMinutes", e.target.value ? parseInt(e.target.value) : undefined)}
                className="inline-input short"
                placeholder="mins"
              />
            ) : (
              <span className="value">
                {displayBead.estimatedMinutes
                  ? `${Math.floor(displayBead.estimatedMinutes / 60)}h ${displayBead.estimatedMinutes % 60}m`
                  : "-"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Design */}
      {(displayBead.design || editMode) && (
        <div className="details-section">
          <h4>Design Notes</h4>
          {editMode ? (
            <textarea
              value={displayBead.design || ""}
              onChange={(e) => handleFieldChange("design", e.target.value)}
              className="description-input"
              rows={3}
              placeholder="Design considerations, architecture notes..."
            />
          ) : (
            <TextContent content={displayBead.design!} renderMarkdown={renderMarkdown} />
          )}
        </div>
      )}

      {/* Acceptance Criteria */}
      {(displayBead.acceptanceCriteria || editMode) && (
        <div className="details-section">
          <h4>Acceptance Criteria</h4>
          {editMode ? (
            <textarea
              value={displayBead.acceptanceCriteria || ""}
              onChange={(e) => handleFieldChange("acceptanceCriteria", e.target.value)}
              className="description-input"
              rows={3}
              placeholder="Definition of done..."
            />
          ) : (
            <TextContent content={displayBead.acceptanceCriteria!} renderMarkdown={renderMarkdown} />
          )}
        </div>
      )}

      {/* Working Notes */}
      {(displayBead.notes || editMode) && (
        <div className="details-section">
          <h4>Working Notes</h4>
          {editMode ? (
            <textarea
              value={displayBead.notes || ""}
              onChange={(e) => handleFieldChange("notes", e.target.value)}
              className="description-input"
              rows={3}
              placeholder="Progress notes, findings..."
            />
          ) : (
            <TextContent content={displayBead.notes!} renderMarkdown={renderMarkdown} />
          )}
        </div>
      )}

      {/* Dependencies - hide when empty in view mode */}
      {(editMode || (displayBead.dependsOn && displayBead.dependsOn.length > 0)) && (
        <div className="details-section">
          <h4>Depends On</h4>
          <div className="deps-list">
            {(displayBead.dependsOn || []).map((depId) => (
              <span
                key={depId}
                className={`dep-badge ${onSelectBead && !editMode ? "clickable" : ""}`}
                onClick={() => !editMode && onSelectBead?.(depId)}
              >
                {depId}
                {editMode && (
                  <button
                    className="dep-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveDependency(bead.id, depId);
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {editMode && (
              <div className="add-inline">
                <input
                  type="text"
                  value={newDependency}
                  onChange={(e) => setNewDependency(e.target.value)}
                  placeholder="+ dependency"
                  onKeyDown={(e) => e.key === "Enter" && handleAddDependency()}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Comments */}
      <div className="details-section">
        <h4>Comments ({(displayBead.comments || []).length})</h4>
        <div className="comments-list">
          {(displayBead.comments || []).map((comment) => (
            <div key={comment.id} className="comment">
              <div className="comment-header">
                <span className="comment-author">{comment.author}</span>
                <span className="comment-date">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="comment-text">{comment.text}</div>
            </div>
          ))}
          {(displayBead.comments || []).length === 0 && (
            <span className="muted">No comments</span>
          )}
        </div>
        {/* Comment input - always shown if callback provided */}
        {onAddComment && (
          <div className="add-comment">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
            />
            <button
              className="btn btn-sm"
              onClick={() => {
                if (newComment.trim() && bead) {
                  onAddComment(bead.id, newComment.trim());
                  setNewComment("");
                }
              }}
              disabled={!newComment.trim()}
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Metadata footer */}
      <div className="details-meta">
        <span>Created: {displayBead.createdAt ? new Date(displayBead.createdAt).toLocaleDateString() : "-"}</span>
        <span>Updated: {displayBead.updatedAt ? new Date(displayBead.updatedAt).toLocaleDateString() : "-"}</span>
        {displayBead.closedAt && (
          <span>Closed: {new Date(displayBead.closedAt).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}
