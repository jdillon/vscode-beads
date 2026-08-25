/**
 * Validation and field mapping for bead edits arriving from a webview.
 *
 * Webview messages cross a process boundary and are only typed at compile
 * time, so they are untrusted at runtime. Updates are rebuilt field by field
 * from an explicit allowlist rather than spread wholesale: an unexpected `id`
 * cannot retarget the edit, and no field the UI does not offer can reach the
 * backend.
 */

import { UpdateIssueArgs } from "../backend/BeadsBackend";

type FieldKind = "string" | "priority" | "minutes" | "labels";

/** Editable webview field -> backend argument name and expected runtime type. */
const EDITABLE_FIELDS: Record<string, { arg: keyof UpdateIssueArgs; kind: FieldKind }> = {
  title: { arg: "title", kind: "string" },
  description: { arg: "description", kind: "string" },
  design: { arg: "design", kind: "string" },
  acceptanceCriteria: { arg: "acceptance_criteria", kind: "string" },
  notes: { arg: "notes", kind: "string" },
  status: { arg: "status", kind: "string" },
  assignee: { arg: "assignee", kind: "string" },
  externalRef: { arg: "external_ref", kind: "string" },
  // The CLI prefers issue_type and rejects a conflicting type/issue_type pair
  type: { arg: "issue_type", kind: "string" },
  priority: { arg: "priority", kind: "priority" },
  estimatedMinutes: { arg: "estimated_minutes", kind: "minutes" },
  // The CLI replaces the label set rather than merging it
  labels: { arg: "set_labels", kind: "labels" },
};

export type UpdateArgsResult =
  | { args: UpdateIssueArgs; dropped: string[] }
  | { error: string };

function isValid(value: unknown, kind: FieldKind): boolean {
  switch (kind) {
    case "string":
      return typeof value === "string";
    case "priority":
      return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
    case "minutes":
      return typeof value === "number" && Number.isFinite(value) && value >= 0;
    case "labels":
      return Array.isArray(value) && value.every((label) => typeof label === "string");
  }
}

/**
 * Builds backend update arguments from a webview edit, or explains why the
 * message is unusable. Fields that are unknown or of the wrong type are
 * reported in `dropped` rather than forwarded.
 */
export function buildUpdateArgs(beadId: unknown, updates: unknown): UpdateArgsResult {
  if (typeof beadId !== "string" || beadId.length === 0) {
    return { error: "missing bead id" };
  }
  if (typeof updates !== "object" || updates === null || Array.isArray(updates)) {
    return { error: "updates must be an object" };
  }

  const args: Record<string, unknown> = { id: beadId };
  const dropped: string[] = [];
  let applied = 0;

  for (const [key, value] of Object.entries(updates as Record<string, unknown>)) {
    if (value === undefined) {
      continue;
    }

    const field = EDITABLE_FIELDS[key];
    if (!field || !isValid(value, field.kind)) {
      dropped.push(key);
      continue;
    }

    // The allowlist guarantees the value matches the argument it is assigned to
    args[field.arg] = value;
    applied++;
  }

  if (applied === 0) {
    return { error: dropped.length > 0 ? `no editable fields (dropped: ${dropped.join(", ")})` : "no editable fields" };
  }

  return { args: args as unknown as UpdateIssueArgs, dropped };
}
