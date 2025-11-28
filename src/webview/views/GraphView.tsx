/**
 * GraphView
 *
 * Visual graph of issue dependencies with:
 * - Nodes colored by status/priority
 * - Pan and zoom
 * - Click to view details
 * - Simple force-directed layout
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  DependencyGraph,
  GraphNode,
  GraphEdge,
  STATUS_COLORS,
  PRIORITY_COLORS,
} from "../types";

interface GraphViewProps {
  graph: DependencyGraph | null;
  loading: boolean;
  onSelectBead: (beadId: string) => void;
}

interface NodePosition {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function GraphView({
  graph,
  loading,
  onSelectBead,
}: GraphViewProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Map<string, NodePosition>>(new Map());
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState<{ type: "pan" | "node"; nodeId?: string; startX: number; startY: number } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Initialize positions with a simple layout
  useEffect(() => {
    if (!graph || graph.nodes.length === 0) return;

    const newPositions = new Map<string, NodePosition>();
    const nodeCount = graph.nodes.length;
    const radius = Math.max(150, nodeCount * 15);
    const centerX = 400;
    const centerY = 300;

    graph.nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodeCount;
      newPositions.set(node.id, {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
      });
    });

    setPositions(newPositions);

    // Simple force simulation
    let animationFrame: number;
    let iteration = 0;
    const maxIterations = 100;

    const simulate = () => {
      if (iteration >= maxIterations) return;

      const updated = new Map(newPositions);

      // Apply forces
      graph.nodes.forEach((node) => {
        const pos = updated.get(node.id);
        if (!pos) return;

        // Repulsion between all nodes
        graph.nodes.forEach((other) => {
          if (other.id === node.id) return;
          const otherPos = updated.get(other.id);
          if (!otherPos) return;

          const dx = pos.x - otherPos.x;
          const dy = pos.y - otherPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 5000 / (dist * dist);

          pos.vx += (dx / dist) * force;
          pos.vy += (dy / dist) * force;
        });

        // Attraction along edges
        graph.edges.forEach((edge) => {
          if (edge.source !== node.id && edge.target !== node.id) return;
          const otherId = edge.source === node.id ? edge.target : edge.source;
          const otherPos = updated.get(otherId);
          if (!otherPos) return;

          const dx = otherPos.x - pos.x;
          const dy = otherPos.y - pos.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = dist * 0.02;

          pos.vx += (dx / dist) * force;
          pos.vy += (dy / dist) * force;
        });

        // Center gravity
        pos.vx += (centerX - pos.x) * 0.001;
        pos.vy += (centerY - pos.y) * 0.001;

        // Apply velocity with damping
        pos.x += pos.vx * 0.1;
        pos.y += pos.vy * 0.1;
        pos.vx *= 0.9;
        pos.vy *= 0.9;
      });

      setPositions(new Map(updated));
      iteration++;
      animationFrame = requestAnimationFrame(simulate);
    };

    simulate();

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [graph]);

  // Draw the graph
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !graph) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Clear canvas
    ctx.fillStyle = "var(--vscode-editor-background, #1e1e1e)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply transform
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    // Draw edges
    ctx.strokeStyle = "#555555";
    ctx.lineWidth = 1;
    graph.edges.forEach((edge) => {
      const sourcePos = positions.get(edge.source);
      const targetPos = positions.get(edge.target);
      if (!sourcePos || !targetPos) return;

      ctx.beginPath();
      ctx.moveTo(sourcePos.x, sourcePos.y);
      ctx.lineTo(targetPos.x, targetPos.y);
      ctx.stroke();

      // Draw arrow
      const angle = Math.atan2(targetPos.y - sourcePos.y, targetPos.x - sourcePos.x);
      const arrowSize = 8;
      const endX = targetPos.x - 25 * Math.cos(angle);
      const endY = targetPos.y - 25 * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowSize * Math.cos(angle - Math.PI / 6),
        endY - arrowSize * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        endX - arrowSize * Math.cos(angle + Math.PI / 6),
        endY - arrowSize * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fillStyle = "#555555";
      ctx.fill();
    });

    // Draw nodes
    const nodeRadius = 20;
    graph.nodes.forEach((node) => {
      const pos = positions.get(node.id);
      if (!pos) return;

      const isHovered = hoveredNode === node.id;
      const matchesSearch =
        searchQuery &&
        (node.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          node.title.toLowerCase().includes(searchQuery.toLowerCase()));

      // Node circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, nodeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = STATUS_COLORS[node.status] || "#888888";
      ctx.fill();

      if (isHovered || matchesSearch) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Priority indicator
      if (node.priority !== undefined && node.priority < 3) {
        ctx.beginPath();
        ctx.arc(pos.x + nodeRadius - 5, pos.y - nodeRadius + 5, 6, 0, 2 * Math.PI);
        ctx.fillStyle = PRIORITY_COLORS[node.priority];
        ctx.fill();
      }

      // Node label
      ctx.fillStyle = "#ffffff";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Truncate title
      const maxWidth = 80;
      let title = node.title;
      while (ctx.measureText(title).width > maxWidth && title.length > 3) {
        title = title.slice(0, -4) + "...";
      }

      ctx.fillText(title, pos.x, pos.y + nodeRadius + 15);
      ctx.fillText(node.id, pos.x, pos.y);
    });

    ctx.restore();
  }, [graph, positions, transform, hoveredNode, searchQuery]);

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - transform.x) / transform.scale;
      const y = (e.clientY - rect.top - transform.y) / transform.scale;

      // Check if clicked on a node
      let clickedNode: string | undefined;
      positions.forEach((pos, id) => {
        const dx = pos.x - x;
        const dy = pos.y - y;
        if (dx * dx + dy * dy < 400) {
          clickedNode = id;
        }
      });

      if (clickedNode) {
        setDragging({ type: "node", nodeId: clickedNode, startX: e.clientX, startY: e.clientY });
      } else {
        setDragging({ type: "pan", startX: e.clientX, startY: e.clientY });
      }
    },
    [positions, transform]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - transform.x) / transform.scale;
      const y = (e.clientY - rect.top - transform.y) / transform.scale;

      // Check for hover
      let foundNode: string | null = null;
      positions.forEach((pos, id) => {
        const dx = pos.x - x;
        const dy = pos.y - y;
        if (dx * dx + dy * dy < 400) {
          foundNode = id;
        }
      });
      setHoveredNode(foundNode);

      if (dragging) {
        const dx = e.clientX - dragging.startX;
        const dy = e.clientY - dragging.startY;

        if (dragging.type === "pan") {
          setTransform((prev) => ({
            ...prev,
            x: prev.x + dx,
            y: prev.y + dy,
          }));
          setDragging({ ...dragging, startX: e.clientX, startY: e.clientY });
        } else if (dragging.type === "node" && dragging.nodeId) {
          setPositions((prev) => {
            const updated = new Map(prev);
            const pos = updated.get(dragging.nodeId!);
            if (pos) {
              updated.set(dragging.nodeId!, {
                ...pos,
                x: pos.x + dx / transform.scale,
                y: pos.y + dy / transform.scale,
              });
            }
            return updated;
          });
          setDragging({ ...dragging, startX: e.clientX, startY: e.clientY });
        }
      }
    },
    [dragging, positions, transform]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || dragging) return;

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - transform.x) / transform.scale;
      const y = (e.clientY - rect.top - transform.y) / transform.scale;

      positions.forEach((pos, id) => {
        const dx = pos.x - x;
        const dy = pos.y - y;
        if (dx * dx + dy * dy < 400) {
          onSelectBead(id);
        }
      });
    },
    [positions, transform, dragging, onSelectBead]
  );

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(0.1, Math.min(3, prev.scale * delta)),
    }));
  }, []);

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="graph-empty">
        <div className="empty-state-icon">🔗</div>
        <h3>No Dependencies</h3>
        <p>Beads with dependencies will appear here.</p>
      </div>
    );
  }

  return (
    <div className="dependency-graph" ref={containerRef}>
      <div className="graph-toolbar">
        <input
          type="text"
          className="graph-search"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button
          className="graph-reset"
          onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
        >
          Reset View
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
      />
      <div className="graph-legend">
        <span className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: STATUS_COLORS.open }}></span>
          Open
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: STATUS_COLORS.in_progress }}></span>
          In Progress
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: STATUS_COLORS.blocked }}></span>
          Blocked
        </span>
      </div>
    </div>
  );
}
