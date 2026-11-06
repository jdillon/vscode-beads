import React, { useEffect, useMemo, useState } from "react";
import { Bead, BUILT_IN_STATUSES, STATUS_LABELS, TYPE_LABELS } from "../types";
import { BoardColumn, BoardColumnsConfig, BeadFilter } from "../../shared/board-columns";
import { Dropdown, DropdownItem } from "../common/Dropdown";
import { defaultBoardColumns } from "./board-defaults";

interface Props {
  beads: Bead[];
  config: BoardColumnsConfig | null;
  onSave: (config: BoardColumnsConfig | null) => void;
  onClose: () => void;
}

const COLORS = ["#3b82f6", "#f59e0b", "#ef4444", "#6b7280", "#a855f7", "#14b8a6", "#22c55e"];
const unique = (values: (string | undefined)[]) => [...new Set(values.filter((value): value is string => !!value))].sort();

interface MultiValueProps {
  title: string;
  values: string[];
  options: string[];
  label?: (value: string) => string;
  onChange: (values: string[]) => void;
}

function MultiValue({ title, values, options, label = (value) => value, onChange }: MultiValueProps): React.ReactElement {
  return <Dropdown trigger={`${title}: ${values.length ? values.map(label).join(", ") : "Any"}`} className="board-rule-dropdown">
    {options.map((value) => <DropdownItem key={value} active={values.includes(value)} onClick={() =>
      onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
    }>{values.includes(value) ? "✓ " : ""}{label(value)}</DropdownItem>)}
  </Dropdown>;
}

export function BoardColumnEditor({ beads, config, onSave, onClose }: Props): React.ReactElement {
  const defaults = useMemo(() => defaultBoardColumns(beads), [beads]);
  const [columns, setColumns] = useState<BoardColumn[]>(() => structuredClone(config?.columns ?? defaults));
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => {
    setColumns(structuredClone(config?.columns ?? defaults));
    setSelectedIndex(0);
  }, [config]);

  const statuses = unique([...BUILT_IN_STATUSES, ...beads.map((bead) => bead.status), ...columns.flatMap((column) => column.filter.status ?? []), ...columns.map((column) => column.dropStatus)]);
  const types = unique([...Object.keys(TYPE_LABELS), ...beads.map((bead) => bead.type), ...columns.flatMap((column) => column.filter.type ?? [])]);
  const assignees = unique(["__unassigned__", ...beads.map((bead) => bead.assignee), ...columns.flatMap((column) => column.filter.assignee ?? [])]);
  const labels = unique(["__unlabeled__", ...beads.flatMap((bead) => bead.labels ?? []), ...columns.flatMap((column) => column.filter.labels ?? [])]);

  const change = (index: number, patch: Partial<BoardColumn>) => setColumns((old) =>
    old.map((column, at) => at === index ? { ...column, ...patch } : column));
  const changeFilter = (index: number, patch: Partial<BeadFilter>) => change(index, { filter: { ...columns[index].filter, ...patch } });
  const move = (index: number, delta: number) => {
    setColumns((old) => {
      const next = [...old];
      const [column] = next.splice(index, 1);
      next.splice(index + delta, 0, column);
      return next;
    });
    setSelectedIndex(index + delta);
  };
  const add = () => {
    setSelectedIndex(columns.length);
    setColumns((old) => [...old, {
      id: `column_${Math.random().toString(36).slice(2, 10)}`,
      title: "New column",
      color: COLORS[0],
      filter: {},
    }]);
  };
  const remove = (index: number) => {
    setColumns((old) => old.filter((_, at) => at !== index));
    setSelectedIndex((old) => Math.max(0, Math.min(old, columns.length - 2)));
  };
  const save = () => {
    const trimmed = columns.map((column) => ({ ...column, title: column.title.trim() }));
    if (trimmed.length === 0 || trimmed.some((column) => !column.title || Object.values(column.filter).every((value) =>
      value === undefined || value === "" || (Array.isArray(value) && value.length === 0)))) return;
    onSave({ version: 1, columns: trimmed });
    onClose();
  };

  return <div className="board-editor">
    <div className="board-editor-heading"><strong>Board columns</strong><button onClick={onClose} title="Close">×</button></div>
    <p>Issues go in the first matching column. Choose values within a field to match any; fields combine together. Unmatched issues go to Other.</p>
    <div className="board-editor-tabs" aria-label="Column order">
      {columns.map((column, index) => <button key={column.id} className={selectedIndex === index ? "active" : ""} onClick={() => setSelectedIndex(index)}>{column.title || "Untitled"}</button>)}
    </div>
    {columns.slice(selectedIndex, selectedIndex + 1).map((column) => {
      const index = selectedIndex;
      return <div className="board-editor-column" key={column.id}>
      <div className="board-editor-row">
        <input aria-label="Column title" value={column.title} maxLength={80} onChange={(event) => change(index, { title: event.target.value })} />
        <button disabled={index === 0} onClick={() => move(index, -1)} title="Move left">←</button>
        <button disabled={index === columns.length - 1} onClick={() => move(index, 1)} title="Move right">→</button>
        <button onClick={() => remove(index)} title="Remove column">×</button>
      </div>
      <div className="board-editor-fields">
        <MultiValue title="Status" values={column.filter.status ?? []} options={statuses} label={(value) => STATUS_LABELS[value] ?? value} onChange={(values) => changeFilter(index, { status: values })} />
        <MultiValue title="Priority" values={(column.filter.priority ?? []).map(String)} options={["0", "1", "2", "3", "4"]} label={(value) => `P${value}`} onChange={(values) => changeFilter(index, { priority: values.map(Number) })} />
        <MultiValue title="Type" values={column.filter.type ?? []} options={types} onChange={(values) => changeFilter(index, { type: values })} />
        <MultiValue title="Assignee" values={column.filter.assignee ?? []} options={assignees} label={(value) => value === "__unassigned__" ? "Unassigned" : value} onChange={(values) => changeFilter(index, { assignee: values })} />
        <MultiValue title="Label" values={column.filter.labels ?? []} options={labels} label={(value) => value === "__unlabeled__" ? "Unlabeled" : value} onChange={(values) => changeFilter(index, { labels: values })} />
        <Dropdown trigger={`Ready: ${column.filter.isReady === undefined ? "Any" : column.filter.isReady ? "Yes" : "No"}`}>
          <DropdownItem onClick={() => changeFilter(index, { isReady: undefined })}>Any</DropdownItem>
          <DropdownItem onClick={() => changeFilter(index, { isReady: true })}>Yes</DropdownItem>
          <DropdownItem onClick={() => changeFilter(index, { isReady: false })}>No</DropdownItem>
        </Dropdown>
        <Dropdown trigger={`Blockers: ${column.filter.hasBlockers === undefined ? "Any" : column.filter.hasBlockers ? "Has blockers" : "No blockers"}`}>
          <DropdownItem onClick={() => changeFilter(index, { hasBlockers: undefined })}>Any</DropdownItem>
          <DropdownItem onClick={() => changeFilter(index, { hasBlockers: true })}>Has blockers</DropdownItem>
          <DropdownItem onClick={() => changeFilter(index, { hasBlockers: false })}>No blockers</DropdownItem>
        </Dropdown>
        <input aria-label="Search text" placeholder="Text contains…" value={column.filter.query ?? ""} maxLength={200} onChange={(event) => changeFilter(index, { query: event.target.value })} />
      </div>
      <div className="board-editor-row">
        <Dropdown trigger={<><span className="board-color-swatch" style={{ background: column.color }} /> Color</>}>
          {[...new Set([column.color, ...COLORS])].map((color) => <DropdownItem key={color} onClick={() => change(index, { color })}><span className="board-color-swatch" style={{ background: color }} /> {color}</DropdownItem>)}
        </Dropdown>
        <Dropdown trigger={`Drop: ${column.dropStatus ? `Set ${STATUS_LABELS[column.dropStatus] ?? column.dropStatus}` : "Disabled"}`}>
          <DropdownItem onClick={() => change(index, { dropStatus: undefined })}>Disabled</DropdownItem>
          {statuses.map((status) => <DropdownItem key={status} onClick={() => change(index, { dropStatus: status })}>Set {STATUS_LABELS[status] ?? status}</DropdownItem>)}
        </Dropdown>
      </div>
    </div>; })}
    <div className="board-editor-actions">
      <button onClick={add} disabled={columns.length >= 24}>+ Column</button>
      <button onClick={() => { onSave(null); onClose(); }}>Reset to status board</button>
      <button onClick={save} disabled={columns.length === 0 || columns.some((column) => !column.title.trim() || Object.values(column.filter).every((value) =>
        value === undefined || value === "" || (Array.isArray(value) && value.length === 0)))}>Save columns</button>
    </div>
  </div>;
}
