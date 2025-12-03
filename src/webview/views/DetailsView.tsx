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
  BeadStatus,
  BeadPriority,
  BeadDependency,
  DependencyType,
  BeadType,
  STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_TEXT_COLORS,
  STATUS_COLORS,
  TYPE_COLORS,
  TYPE_LABELS,
  sortLabels,
} from "../types";

// Labels for dependency sections based on array (direction) and type
const DEPENDENCY_LABELS: Record<"dependsOn" | "blocks", Record<DependencyType, string>> = {
  dependsOn: {
    "blocks": "Blocked By",
    "parent-child": "Parent",
    "discovered-from": "Discovered From",
    "related": "Related To",
  },
  blocks: {
    "blocks": "Blocks",
    "parent-child": "Children",
    "discovered-from": "Spawned",
    "related": "Related From",
  },
};

// Group dependencies by their relationship type
function groupDependenciesByType(deps: BeadDependency[]): Record<DependencyType, BeadDependency[]> {
  const groups: Record<DependencyType, BeadDependency[]> = {
    "blocks": [],
    "parent-child": [],
    "discovered-from": [],
    "related": [],
  };
  for (const dep of deps) {
    const depType = dep.dependencyType || "blocks"; // fallback to blocks if unknown
    groups[depType].push(dep);
  }
  return groups;
}

// Sort order for dependency status: blocked first, closed last
const STATUS_SORT_ORDER: Record<BeadStatus, number> = {
  blocked: 0,
  in_progress: 1,
  open: 2,
  closed: 3,
};

function sortDependencies(deps: BeadDependency[]): BeadDependency[] {
  return [...deps].sort((a, b) => {
    // Primary: status (blocked first, closed last)
    const aStatusOrder = a.status ? STATUS_SORT_ORDER[a.status] : 4;
    const bStatusOrder = b.status ? STATUS_SORT_ORDER[b.status] : 4;
    if (aStatusOrder !== bStatusOrder) {
      return aStatusOrder - bStatusOrder;
    }
    // Secondary: priority (P0 first, P4 last)
    const aPriority = a.priority ?? 4;
    const bPriority = b.priority ?? 4;
    return aPriority - bPriority;
  });
}
import { LabelBadge } from "../common/LabelBadge";
import { StatusBadge } from "../common/StatusBadge";
import { PriorityBadge } from "../common/PriorityBadge";
import { TypeBadge } from "../common/TypeBadge";
import { Markdown } from "../common/Markdown";
import { useToast } from "../common/Toast";
import { ColoredSelect, ColoredSelectOption } from "../common/ColoredSelect";

// Build options for ColoredSelect dropdowns
const TYPE_OPTIONS: ColoredSelectOption<BeadType>[] = (Object.keys(TYPE_LABELS) as BeadType[]).map((t) => ({
  value: t,
  label: TYPE_LABELS[t],
  color: TYPE_COLORS[t],
}));

const STATUS_OPTIONS: ColoredSelectOption<BeadStatus>[] = (Object.keys(STATUS_LABELS) as BeadStatus[]).map((s) => ({
  value: s,
  label: STATUS_LABELS[s],
  color: STATUS_COLORS[s],
}));

const PRIORITY_OPTIONS: ColoredSelectOption<BeadPriority>[] = ([0, 1, 2, 3, 4] as BeadPriority[]).map((p) => ({
  value: p,
  label: `P${p}`,
  color: PRIORITY_COLORS[p],
  textColor: p === 2 ? "#1a1a1a" : "#ffffff", // dark text on yellow
}));

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
  onViewInGraph: _onViewInGraph,
  onSelectBead,
  onCopyId,
}: DetailsViewProps): React.ReactElement {
  // Toast and onViewInGraph kept for potential future use
  const { showToast: _showToast } = useToast();
  void _onViewInGraph;
  void _showToast;
  const [editMode, setEditMode] = useState(false);
  const [editedBead, setEditedBead] = useState<Partial<Bead>>({});
  const [newLabel, setNewLabel] = useState("");
  const [newDependency, setNewDependency] = useState("");
  const [newComment, setNewComment] = useState("");

  // Reset edit state when bead ID changes
  useEffect(() => {
    setEditMode(false);
    setEditedBead({});
  }, [bead?.id]);

  // Clear pending edits when bead data updates (e.g., after save + mutation)
  useEffect(() => {
    if (!editMode && Object.keys(editedBead).length > 0) {
      setEditedBead({});
    }
  }, [bead?.updatedAt]);

  const handleSave = useCallback(() => {
    if (bead && Object.keys(editedBead).length > 0) {
      onUpdateBead(bead.id, editedBead);
      setEditMode(false);
      // Don't clear editedBead here - keep showing edited values until
      // mutation event updates the bead prop, which triggers the useEffect below
    }
  }, [bead, editedBead, onUpdateBead]);

  // Inline update - saves immediately without entering edit mode
  const handleInlineUpdate = useCallback(
    (field: keyof Bead, value: unknown) => {
      if (bead) {
        onUpdateBead(bead.id, { [field]: value });
      }
    },
    [bead, onUpdateBead]
  );

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
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSave}
                disabled={Object.keys(editedBead).length === 0}
              >
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
            <ColoredSelect
              value={(displayBead.type || "task") as BeadType}
              options={TYPE_OPTIONS}
              onChange={(v) => handleFieldChange("type", v)}
            />
            <ColoredSelect
              value={displayBead.status}
              options={STATUS_OPTIONS}
              onChange={(v) => handleFieldChange("status", v)}
            />
            <ColoredSelect
              value={displayBead.priority ?? 4}
              options={PRIORITY_OPTIONS}
              onChange={(v) => handleFieldChange("priority", v)}
            />
          </>
        ) : (
          <>
            <ColoredSelect
              value={(displayBead.type || "task") as BeadType}
              options={TYPE_OPTIONS}
              onChange={(v) => handleInlineUpdate("type", v)}
              renderTrigger={() => <TypeBadge type={(displayBead.type || "task") as BeadType} size="small" />}
              renderOption={(opt) => <TypeBadge type={opt.value as BeadType} size="small" />}
              showChevron={false}
            />
            <ColoredSelect
              value={displayBead.status}
              options={STATUS_OPTIONS}
              onChange={(v) => handleInlineUpdate("status", v)}
              renderTrigger={() => <StatusBadge status={displayBead.status} size="small" />}
              renderOption={(opt) => <StatusBadge status={opt.value as BeadStatus} size="small" />}
              showChevron={false}
            />
            <ColoredSelect
              value={displayBead.priority ?? 4}
              options={PRIORITY_OPTIONS}
              onChange={(v) => handleInlineUpdate("priority", v)}
              renderTrigger={() => <PriorityBadge priority={displayBead.priority ?? 4} size="small" />}
              renderOption={(opt) => <PriorityBadge priority={opt.value as BeadPriority} size="small" />}
              showChevron={false}
            />
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
            {sortLabels(displayBead.labels).map((label) => (
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

      {/* Dependencies grouped by relationship type */}
      {(() => {
        const dependsOnGroups = groupDependenciesByType(displayBead.dependsOn || []);
        const blocksGroups = groupDependenciesByType(displayBead.blocks || []);
        const hasDependsOn = (displayBead.dependsOn?.length || 0) > 0;
        const hasBlocks = (displayBead.blocks?.length || 0) > 0;

        // Define rendering order: hierarchy first, then workflow, then provenance, then related
        const typeOrder: DependencyType[] = ["parent-child", "blocks", "discovered-from", "related"];

        // Helper to render a dependency item
        const renderDepItem = (dep: BeadDependency, direction: "dependsOn" | "blocks", allowRemove: boolean) => (
          <div
            key={dep.id}
            className={`dep-item dep-type-${dep.type || "task"} ${onSelectBead && !editMode ? "clickable" : ""}`}
            onClick={() => !editMode && onSelectBead?.(dep.id)}
          >
            <span className="dep-id">{dep.id}</span>
            {dep.title && <span className="dep-title">{dep.title}</span>}
            <span className="dep-indicators">
              {dep.status && (
                <span
                  className="dep-status"
                  style={{ backgroundColor: STATUS_COLORS[dep.status] }}
                >
                  {STATUS_LABELS[dep.status]}
                </span>
              )}
              {dep.priority !== undefined && (
                <span
                  className="dep-priority"
                  style={{
                    backgroundColor: PRIORITY_COLORS[dep.priority],
                    color: PRIORITY_TEXT_COLORS[dep.priority]
                  }}
                >
                  p{dep.priority}
                </span>
              )}
            </span>
            {allowRemove && editMode && (
              <button
                className="dep-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveDependency(bead.id, dep.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        );

        if (!editMode && !hasDependsOn && !hasBlocks) {
          return null;
        }

        return (
          <>
            {/* Render dependsOn groups (outgoing edges) */}
            {typeOrder.map((depType) => {
              const deps = dependsOnGroups[depType];
              if (deps.length === 0) return null;
              return (
                <div key={`dependsOn-${depType}`} className="details-section">
                  <h4>{DEPENDENCY_LABELS.dependsOn[depType]}</h4>
                  <div className="deps-list">
                    {sortDependencies(deps).map((dep) => renderDepItem(dep, "dependsOn", true))}
                  </div>
                </div>
              );
            })}

            {/* Render blocks groups (incoming edges) */}
            {typeOrder.map((depType) => {
              const deps = blocksGroups[depType];
              if (deps.length === 0) return null;
              return (
                <div key={`blocks-${depType}`} className="details-section">
                  <h4>{DEPENDENCY_LABELS.blocks[depType]}</h4>
                  <div className="deps-list">
                    {sortDependencies(deps).map((dep) => renderDepItem(dep, "blocks", false))}
                  </div>
                </div>
              );
            })}

            {/* Add dependency input in edit mode */}
            {editMode && (
              <div className="details-section">
                <h4>Add Dependency</h4>
                <div className="add-inline">
                  <input
                    type="text"
                    value={newDependency}
                    onChange={(e) => setNewDependency(e.target.value)}
                    placeholder="+ issue ID"
                    onKeyDown={(e) => e.key === "Enter" && handleAddDependency()}
                  />
                </div>
              </div>
            )}
          </>
        );
      })()}

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
              <div className="comment-text">
                <TextContent content={comment.text} renderMarkdown={renderMarkdown} />
              </div>
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
