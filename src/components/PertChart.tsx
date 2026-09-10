import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Task } from '../core/types';
import { formatDateRangeForDisplay, formatDays, getParentBadgeLabel } from '../core/cpmEngine';
import dagre from 'dagre';
import { TaskContextMenu } from './TaskContextMenu';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  SquareDashed,
  RefreshCw,
  Trash2,
  Indent,
  ChevronUp,
  ChevronDown,
  Anchor,
} from 'lucide-react';

export interface NodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PertChartProps {
  tasks: Task[];
  criticalPathDuration: number;
  criticalPathTaskIds: string[];
  criticalEdges: Array<{ from: string; to: string }>;
  selectedTaskIds?: Set<string>;
  onSelectTaskIds?: (taskIds: Set<string>) => void;
  onSelectTask: (task: Task) => void;
  onAddDependency?: (fromId: string, toId: string) => void;
  onRemoveDependency?: (fromId: string, toId: string) => void;
  onCreateTaskAt?: (pos: { x: number; y: number }, predecessorId?: string) => void;
  onUpdateTaskPosition?: (taskId: string, x: number, y: number) => void;
  onUpdateTaskPositions?: (updates: Array<{ id: string; x: number; y: number }>) => void;
  onPositionsChange?: (positions: Map<string, NodePosition>) => void;
  onTransformChange?: (transform: { x: number; y: number; scale: number }) => void;
  initialTransform?: { x: number; y: number; scale: number };
  onIndentTask?: (task: Task) => void;
  onOutdentTask?: (task: Task) => void;
  onDeleteTask?: (taskId: string) => void;
  onUpdateTaskDuration?: (taskId: string, duration: number) => void;
}

const NODE_WIDTH = 190;
const NODE_HEIGHT = 80;

export const PertChart: React.FC<PertChartProps> = ({
  tasks,
  criticalPathDuration,
  criticalPathTaskIds,
  criticalEdges,
  selectedTaskIds,
  onSelectTaskIds,
  onSelectTask,
  onAddDependency,
  onRemoveDependency,
  onCreateTaskAt,
  onUpdateTaskPosition,
  onUpdateTaskPositions,
  onPositionsChange,
  onTransformChange,
  initialTransform,
  onIndentTask,
  onOutdentTask,
  onDeleteTask,
  onUpdateTaskDuration,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Map<string, NodePosition>>(new Map());
  const [transform, setTransform] = useState<{ x: number; y: number; scale: number }>(() =>
    initialTransform || { x: 80, y: 80, scale: 0.85 }
  );

  useEffect(() => {
    if (initialTransform) {
      setTransform(prev => {
        if (
          prev.x === initialTransform.x &&
          prev.y === initialTransform.y &&
          prev.scale === initialTransform.scale
        ) {
          return prev;
        }
        return initialTransform;
      });
    }
  }, [initialTransform]);

  useEffect(() => {
    onTransformChange?.(transform);
  }, [transform, onTransformChange]);
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showDetailedBox, setShowDetailedBox] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    task: Task;
    x: number;
    y: number;
  } | null>(null);

  // Modal state for confirming deletion of predecessor dependency edge
  const [deleteEdgeModal, setDeleteEdgeModal] = useState<{
    fromId: string;
    toId: string;
  } | null>(null);

  // Synchronized refs for latency-free window mouse tracking
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const dragOffsetRef = useRef(dragOffset);
  dragOffsetRef.current = dragOffset;
  const draggingTaskIdRef = useRef(draggingTaskId);
  draggingTaskIdRef.current = draggingTaskId;

  // Drag-to-draw state
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  // Multi-node dragging state
  const draggedTasksRef = useRef<Array<{ id: string; initialX: number; initialY: number }>>([]);
  const dragStartMouseCanvasRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragMovedRef = useRef<boolean>(false);
  const canvasMouseDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasCanvasPannedRef = useRef<boolean>(false);

  // Find which tasks are covered by the current drawing / marquee box
  const coveredTaskIds = useMemo(() => {
    if (!drawStart || !drawCurrent || !containerRef.current) return [];
    const rect = containerRef.current.getBoundingClientRect();
    const screenMinX = Math.min(drawStart.x, drawCurrent.x);
    const screenMaxX = Math.max(drawStart.x, drawCurrent.x);
    const screenMinY = Math.min(drawStart.y, drawCurrent.y);
    const screenMaxY = Math.max(drawStart.y, drawCurrent.y);

    const dragDist = Math.hypot(drawCurrent.x - drawStart.x, drawCurrent.y - drawStart.y);
    if (dragDist < 10) return [];

    const boxMinX = (screenMinX - rect.left - transform.x) / transform.scale;
    const boxMaxX = (screenMaxX - rect.left - transform.x) / transform.scale;
    const boxMinY = (screenMinY - rect.top - transform.y) / transform.scale;
    const boxMaxY = (screenMaxY - rect.top - transform.y) / transform.scale;

    const covered: string[] = [];
    positions.forEach((pos, taskId) => {
      const taskMinX = pos.x;
      const taskMaxX = pos.x + pos.width;
      const taskMinY = pos.y;
      const taskMaxY = pos.y + pos.height;

      // Check intersection with task box
      if (taskMinX < boxMaxX && taskMaxX > boxMinX && taskMinY < boxMaxY && taskMaxY > boxMinY) {
        covered.push(taskId);
      }
    });

    return covered;
  }, [drawStart, drawCurrent, transform, positions]);

  // Fast lookups
  const taskMap = useMemo(() => {
    const map = new Map<string, Task>();
    tasks.forEach(t => map.set(t.id, t));
    return map;
  }, [tasks]);

  const criticalSet = useMemo(() => new Set(criticalPathTaskIds), [criticalPathTaskIds]);

  const criticalEdgeSet = useMemo(() => {
    const set = new Set<string>();
    criticalEdges.forEach(e => set.add(`${e.from}->${e.to}`));
    return set;
  }, [criticalEdges]);

  // Identify all subtasks belonging to any currently selected parent tasks
  const selectedParentSubtaskIds = useMemo(() => {
    const subIds = new Set<string>();
    if (!selectedTaskIds || selectedTaskIds.size === 0) return subIds;

    tasks.forEach(t => {
      if (selectedTaskIds.has(t.id) && t.isSummary) {
        (t.childrenIds || []).forEach(cId => subIds.add(cId));
        (t.subtaskIds || []).forEach(dId => subIds.add(dId));
      }
    });

    return subIds;
  }, [selectedTaskIds, tasks]);

  // MS Project Center-drag connection state
  const [connectionDrag, setConnectionDrag] = useState<{
    fromId: string;
    toX: number;
    toY: number;
  } | null>(null);
  const [targetHoverId, setTargetHoverId] = useState<string | null>(null);
  const centerPressRef = useRef<{
    fromId: string;
    startX: number;
    startY: number;
    hasMoved: boolean;
  } | null>(null);

  // Compute automatic hierarchical Dagre layout (Left-to-Right)
  const computeAutoLayout = (forceAll = false) => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'LR',
      align: 'UL',
      nodesep: 50,
      ranksep: 90,
      marginx: 40,
      marginy: 40,
    });
    g.setDefaultEdgeLabel(() => ({}));

    tasks.forEach(task => {
      g.setNode(task.id, {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });

    tasks.forEach(task => {
      task.predecessors.forEach(predId => {
        if (taskMap.has(predId)) {
          g.setEdge(predId, task.id);
        }
      });
    });

    dagre.layout(g);

    setPositions(prev => {
      const currentTaskIds = new Set(tasks.map(t => t.id));
      const newPos = new Map<string, NodePosition>();
      g.nodes().forEach(nodeId => {
        const node = g.node(nodeId);
        const task = taskMap.get(nodeId);
        if (!forceAll && task && task.x !== undefined && task.y !== undefined) {
          newPos.set(nodeId, {
            x: task.x,
            y: task.y,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          });
        } else if (!forceAll && currentTaskIds.has(nodeId) && prev.has(nodeId)) {
          newPos.set(nodeId, prev.get(nodeId)!);
        } else if (node) {
          newPos.set(nodeId, {
            x: Math.round(node.x - NODE_WIDTH / 2),
            y: Math.round(node.y - NODE_HEIGHT / 2),
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          });
        }
      });
      onPositionsChange?.(newPos);
      return newPos;
    });
  };

  // Sync positions when tasks change, preserving existing layout
  useEffect(() => {
    computeAutoLayout(false);
  }, [tasks]);

  // Global Escape key listener to clear task selection and cancel drawing mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedTaskIds && selectedTaskIds.size > 0) {
          onSelectTaskIds?.(new Set());
        }
        if (isDrawingMode) {
          setIsDrawingMode(false);
        }
        if (drawStart) {
          setDrawStart(null);
          setDrawCurrent(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTaskIds, isDrawingMode, drawStart, onSelectTaskIds]);

  // Handle canvas mouse down
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || draggingTaskId || centerPressRef.current) return;

    // Never trigger drawing or panning if clicked on toolbar or buttons
    if ((e.target as HTMLElement).closest('button, input, [data-toolbar]')) {
      return;
    }

    // Check if drawing mode active or Shift key held down
    if (isDrawingMode || e.shiftKey) {
      setDrawStart({ x: e.clientX, y: e.clientY });
      setDrawCurrent({ x: e.clientX, y: e.clientY });
      return;
    }

    canvasMouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    hasCanvasPannedRef.current = false;

    // Otherwise pan canvas
    setIsPanning(true);
    setStartPan({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  // Handle center mouse down (MS Project: Drag to connect, click to edit)
  const handleCenterMouseDown = (e: React.MouseEvent, taskId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    centerPressRef.current = {
      fromId: taskId,
      startX: e.clientX,
      startY: e.clientY,
      hasMoved: false,
    };
  };

  // Handle border mouse down (MS Project: Drag perimeter to move node, Click to select)
  const handleBorderMouseDown = (e: React.MouseEvent, taskId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const isAlreadySelected = !!selectedTaskIds?.has(taskId);

    // Select the task immediately upon clicking/pressing border
    if (onSelectTaskIds) {
      if (e.ctrlKey || e.metaKey) {
        const next = new Set(selectedTaskIds || []);
        if (next.has(taskId)) {
          next.delete(taskId);
        } else {
          next.add(taskId);
        }
        onSelectTaskIds(next);
      } else if (!isAlreadySelected) {
        onSelectTaskIds(new Set([taskId]));
      }
    }

    const pos = positions.get(taskId);
    if (pos) {
      setDraggingTaskId(taskId);
      draggingTaskIdRef.current = taskId;
      dragMovedRef.current = false;

      const rect = containerRef.current?.getBoundingClientRect();
      const containerLeft = rect ? rect.left : 0;
      const containerTop = rect ? rect.top : 0;
      const mouseCanvasX = (e.clientX - containerLeft - transform.x) / transform.scale;
      const mouseCanvasY = (e.clientY - containerTop - transform.y) / transform.scale;

      dragStartMouseCanvasRef.current = { x: mouseCanvasX, y: mouseCanvasY };

      // If this task was part of a multi-selection, drag ALL selected tasks together!
      const tasksToDrag = (isAlreadySelected && selectedTaskIds && selectedTaskIds.size > 1)
        ? Array.from(selectedTaskIds)
        : [taskId];

      draggedTasksRef.current = tasksToDrag.map(id => {
        const p = positions.get(id);
        return { id, initialX: p?.x ?? 0, initialY: p?.y ?? 0 };
      });

      const offset = {
        x: mouseCanvasX - pos.x,
        y: mouseCanvasY - pos.y,
      };
      setDragOffset(offset);
      dragOffsetRef.current = offset;
    }
  };

  // High-performance window-level mouse move & up listeners while dragging task node(s)
  useEffect(() => {
    if (!draggingTaskId) return;

    let rafId: number | null = null;

    const onWindowMouseMove = (e: MouseEvent) => {
      if (!draggingTaskIdRef.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouseCanvasX = (e.clientX - rect.left - transformRef.current.x) / transformRef.current.scale;
      const mouseCanvasY = (e.clientY - rect.top - transformRef.current.y) / transformRef.current.scale;

      const deltaX = Math.round(mouseCanvasX - dragStartMouseCanvasRef.current.x);
      const deltaY = Math.round(mouseCanvasY - dragStartMouseCanvasRef.current.y);

      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        dragMovedRef.current = true;
      }

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        setPositions(prev => {
          const next = new Map(prev);
          let hasDiff = false;
          for (const item of draggedTasksRef.current) {
            const currentPos = prev.get(item.id);
            if (!currentPos) continue;
            const newX = item.initialX + deltaX;
            const newY = item.initialY + deltaY;
            if (currentPos.x !== newX || currentPos.y !== newY) {
              next.set(item.id, { ...currentPos, x: newX, y: newY });
              hasDiff = true;
            }
          }
          return hasDiff ? next : prev;
        });
      });
    };

    const onWindowMouseUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (draggingTaskIdRef.current) {
        const updates: Array<{ id: string; x: number; y: number }> = [];
        for (const item of draggedTasksRef.current) {
          const finalPos = positionsRef.current.get(item.id);
          if (finalPos) {
            updates.push({ id: item.id, x: finalPos.x, y: finalPos.y });
            onUpdateTaskPosition?.(item.id, finalPos.x, finalPos.y);
          }
        }
        if (updates.length > 0 && onUpdateTaskPositions) {
          onUpdateTaskPositions(updates);
        }
        onPositionsChange?.(positionsRef.current);
      }
      setDraggingTaskId(null);
      draggingTaskIdRef.current = null;
      draggedTasksRef.current = [];
    };

    window.addEventListener('mousemove', onWindowMouseMove, { passive: true });
    window.addEventListener('mouseup', onWindowMouseUp);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [draggingTaskId, onUpdateTaskPosition, onUpdateTaskPositions, onPositionsChange]);

  const handleMouseMove = (e: React.MouseEvent) => {
    // 1. If dragging connection line from center
    if (centerPressRef.current) {
      const dx = e.clientX - centerPressRef.current.startX;
      const dy = e.clientY - centerPressRef.current.startY;
      if (Math.hypot(dx, dy) > 4) {
        centerPressRef.current.hasMoved = true;
        const rect = containerRef.current?.getBoundingClientRect();
        const containerLeft = rect ? rect.left : 0;
        const containerTop = rect ? rect.top : 0;
        const canvasX = (e.clientX - containerLeft - transform.x) / transform.scale;
        const canvasY = (e.clientY - containerTop - transform.y) / transform.scale;
        setConnectionDrag({
          fromId: centerPressRef.current.fromId,
          toX: canvasX,
          toY: canvasY,
        });
      }
      return;
    }

    // 2. If drawing new task box
    if (drawStart) {
      setDrawCurrent({ x: e.clientX, y: e.clientY });
    } else if (isPanning) {
      // 3. If panning canvas
      const dist = Math.hypot(
        e.clientX - canvasMouseDownPosRef.current.x,
        e.clientY - canvasMouseDownPosRef.current.y
      );
      if (dist > 5) {
        hasCanvasPannedRef.current = true;
      }
      setTransform(prev => ({
        ...prev,
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      }));
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // 1. Connection drag release
    if (centerPressRef.current) {
      const pressInfo = centerPressRef.current;
      centerPressRef.current = null;

      if (pressInfo.hasMoved) {
        if (targetHoverId && targetHoverId !== pressInfo.fromId) {
          // Connected to an existing task!
          if (onAddDependency) {
            onAddDependency(pressInfo.fromId, targetHoverId);
          }
        } else if (!targetHoverId) {
          // Dragged to empty space: CREATE A NEW SUCCESSOR TASK at this position!
          // Only trigger if dragged a meaningful distance (> 35px) to prevent twitch/jitter clicks
          const dragDist = Math.hypot(
            e.clientX - pressInfo.startX,
            e.clientY - pressInfo.startY
          );
          if (dragDist > 35) {
            const rect = containerRef.current?.getBoundingClientRect();
            const containerLeft = rect ? rect.left : 0;
            const containerTop = rect ? rect.top : 0;
            const canvasX = Math.round((e.clientX - containerLeft - transform.x) / transform.scale);
            const canvasY = Math.round((e.clientY - containerTop - transform.y) / transform.scale);
            if (onCreateTaskAt) {
              onCreateTaskAt({ x: canvasX, y: canvasY }, pressInfo.fromId);
            }
          }
        }
      } else {
        // Was a simple click on the center! Open edit modal and update selection
        const task = taskMap.get(pressInfo.fromId);
        if (task) {
          if (onSelectTaskIds) {
            onSelectTaskIds(new Set([task.id]));
          }
          onSelectTask(task);
        }
      }

      setConnectionDrag(null);
      setTargetHoverId(null);
      return;
    }

    // 2. If we were drawing a task frame / marquee selecting
    if (drawStart && drawCurrent) {
      const dragDistance = Math.hypot(
        drawCurrent.x - drawStart.x,
        drawCurrent.y - drawStart.y
      );

      // ONLY handle if user actually dragged a box with meaningful distance (> 15px)!
      if (dragDistance > 15) {
        if (coveredTaskIds.length > 0) {
          // If the box covered existing tasks (e.g. Kick off and rfq), user wants to select them to move/reposition!
          if (e.shiftKey && selectedTaskIds && selectedTaskIds.size > 0) {
            const next = new Set(selectedTaskIds);
            coveredTaskIds.forEach(id => next.add(id));
            onSelectTaskIds?.(next);
          } else {
            onSelectTaskIds?.(new Set(coveredTaskIds));
          }
          setIsDrawingMode(false);
        } else if (isDrawingMode) {
          // Empty space and in drawing mode: create a new task at this position
          const rect = containerRef.current?.getBoundingClientRect();
          const containerLeft = rect ? rect.left : 0;
          const containerTop = rect ? rect.top : 0;

          const screenMinX = Math.min(drawStart.x, drawCurrent.x);
          const screenMinY = Math.min(drawStart.y, drawCurrent.y);

          const canvasX = Math.round((screenMinX - containerLeft - transform.x) / transform.scale);
          const canvasY = Math.round((screenMinY - containerTop - transform.y) / transform.scale);

          if (onCreateTaskAt) {
            onCreateTaskAt({ x: canvasX, y: canvasY });
          }
          setIsDrawingMode(false);
        }
      } else {
        // Simple click without drag in drawing mode: deselect any selected task
        onSelectTaskIds?.(new Set());
      }

      setDrawStart(null);
      setDrawCurrent(null);
      return;
    }

    if (isPanning) {
      setIsPanning(false);
      // If user clicked on canvas background without panning: deselect any selected task!
      if (!hasCanvasPannedRef.current) {
        onSelectTaskIds?.(new Set());
      }
      return;
    }

    setIsPanning(false);
  };

  // Double click canvas to quick create at spot
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current && (e.target as HTMLElement).tagName !== 'svg') {
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    const containerLeft = rect ? rect.left : 0;
    const containerTop = rect ? rect.top : 0;
    const canvasX = Math.round((e.clientX - containerLeft - transform.x) / transform.scale);
    const canvasY = Math.round((e.clientY - containerTop - transform.y) / transform.scale);
    onCreateTaskAt?.({ x: canvasX, y: canvasY });
  };

  // Zoom controls
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(prev => {
      const newScale = Math.min(Math.max(0.2, prev.scale * zoomFactor), 2.5);
      return {
        ...prev,
        scale: newScale,
      };
    });
  };

  const zoomIn = () => setTransform(t => ({ ...t, scale: Math.min(2.5, t.scale * 1.2) }));
  const zoomOut = () => setTransform(t => ({ ...t, scale: Math.max(0.2, t.scale / 1.2) }));
  const resetZoom = () => {
    computeAutoLayout();
    setTransform({ x: 80, y: 80, scale: 0.85 });
  };

  // Adaptive edge path calculation for any relative angle (horizontal, vertical, diagonal)
  const calculateEdgePath = (sourcePos: NodePosition, targetPos: NodePosition): string => {
    // Check if target is sufficiently to the right of source's right edge
    const isTargetToRight = targetPos.x >= sourcePos.x + sourcePos.width - 25;

    if (isTargetToRight) {
      // Standard horizontal flow: Right of source -> Left of target
      const startX = sourcePos.x + sourcePos.width;
      const startY = sourcePos.y + sourcePos.height / 2;
      const endX = targetPos.x;
      const endY = targetPos.y + targetPos.height / 2;

      const dx = Math.max(0, endX - startX);
      const cOffset = Math.min(Math.max(dx * 0.5, 25), 140);
      return `M ${startX} ${startY} C ${startX + cOffset} ${startY}, ${endX - cOffset} ${endY}, ${endX} ${endY}`;
    }

    // Target is stacked vertically (above or below) or placed to the left
    const isTargetAbove = (targetPos.y + targetPos.height / 2) < (sourcePos.y + sourcePos.height / 2);

    if (isTargetAbove) {
      // Exit Top center of source -> Smoothly curve into Left of target
      const startX = sourcePos.x + sourcePos.width / 2;
      const startY = sourcePos.y;
      const endX = targetPos.x;
      const endY = targetPos.y + targetPos.height / 2;

      const vDist = Math.max(25, startY - endY);
      const hDist = Math.max(30, Math.abs(startX - endX) * 0.45);
      const cp1Y = startY - Math.min(vDist * 0.5, 80);
      const cp2X = endX - hDist;
      return `M ${startX} ${startY} C ${startX} ${cp1Y}, ${cp2X} ${endY}, ${endX} ${endY}`;
    } else {
      // Exit Bottom center of source -> Smoothly curve into Left of target
      const startX = sourcePos.x + sourcePos.width / 2;
      const startY = sourcePos.y + sourcePos.height;
      const endX = targetPos.x;
      const endY = targetPos.y + targetPos.height / 2;

      const vDist = Math.max(25, endY - startY);
      const hDist = Math.max(30, Math.abs(startX - endX) * 0.45);
      const cp1Y = startY + Math.min(vDist * 0.5, 80);
      const cp2X = endX - hDist;
      return `M ${startX} ${startY} C ${startX} ${cp1Y}, ${cp2X} ${endY}, ${endX} ${endY}`;
    }
  };

  // Render edges / arrows (with deduplication & adaptive routing)
  const renderEdges = () => {
    const edges: React.ReactNode[] = [];
    const renderedEdgePairs = new Set<string>();

    // 1. First Pass: Reverse Anchor connection lines
    tasks.forEach(task => {
      if (task.anchor && task.anchor.enabled && task.anchor.targetTaskId) {
        const sourcePos = positions.get(task.id);
        const targetPos = positions.get(task.anchor.targetTaskId);
        if (sourcePos && targetPos) {
          const edgePairKey = `${task.id}->${task.anchor.targetTaskId}`;
          renderedEdgePairs.add(edgePairKey);

          const isCritical = criticalEdgeSet.has(edgePairKey);
          const pathData = calculateEdgePath(sourcePos, targetPos);
          const anchorEdgeKey = `anchor-${task.id}-${task.anchor.targetTaskId}`;

          edges.push(
            <g
              key={anchorEdgeKey}
              className="group/anchor-edge cursor-pointer"
              onDoubleClick={e => {
                e.stopPropagation();
                setDeleteEdgeModal({ fromId: task.id, toId: task.anchor!.targetTaskId });
              }}
            >
              {/* Wider transparent stroke for easier hover / click / double-click */}
              <path
                d={pathData}
                fill="none"
                stroke="transparent"
                strokeWidth="20"
                style={{ pointerEvents: 'stroke' }}
                className="cursor-pointer"
              >
                <title>{`⚓ 反向錨定關聯：[${task.id}] 鎖定於「${taskMap.get(task.anchor.targetTaskId)?.name || task.anchor.targetTaskId}」開始前 ${task.anchor.leadDays} ${task.anchor.useWorkingDays !== false ? '個工作天' : '天'}\n👉 雙擊 (Double Click) 可刪除此關聯連線`}</title>
              </path>
              {/* Visible Anchor Line */}
              <path
                d={pathData}
                fill="none"
                stroke={isCritical ? '#ef4444' : '#94a3b8'}
                strokeWidth={isCritical ? 2.4 : 2.0}
                strokeDasharray="5 3"
                markerEnd={isCritical ? 'url(#arrow-anchor-critical)' : 'url(#arrow-anchor)'}
                style={{ pointerEvents: 'stroke' }}
                className={`transition-all duration-150 ${isCritical ? 'group-hover/anchor-edge:stroke-red-600' : 'group-hover/anchor-edge:stroke-slate-600'} group-hover/anchor-edge:stroke-[2.8px]`}
              />
            </g>
          );
        }
      }
    });

    // 2. Second Pass: Standard Predecessor edges (skipping any that are already rendered as reverse anchor)
    tasks.forEach(task => {
      const targetPos = positions.get(task.id);
      if (!targetPos) return;

      task.predecessors.forEach(predId => {
        const edgePairKey = `${predId}->${task.id}`;
        if (renderedEdgePairs.has(edgePairKey)) {
          // Already rendered as reverse anchor edge! Prevent duplicate line & ghosting arrow.
          return;
        }
        renderedEdgePairs.add(edgePairKey);

        const sourcePos = positions.get(predId);
        if (!sourcePos) return;

        const isCritical = criticalEdgeSet.has(edgePairKey);
        const edgeKey = `${predId}-${task.id}`;
        const pathData = calculateEdgePath(sourcePos, targetPos);

        edges.push(
          <g
            key={edgeKey}
            className="cursor-pointer group/edge"
            onDoubleClick={e => {
              e.stopPropagation();
              setDeleteEdgeModal({ fromId: predId, toId: task.id });
            }}
          >
            {/* Wider transparent stroke for easier hover / click / double-click */}
            <path
              d={pathData}
              fill="none"
              stroke="transparent"
              strokeWidth="20"
              style={{ pointerEvents: 'stroke' }}
              className="cursor-pointer"
            >
              <title>{`流程連線：[${predId}] ➔ [${task.id}]\n👉 雙擊 (Double Click) 可刪除此前置依賴關聯`}</title>
            </path>
            {/* Visible Line */}
            <path
              d={pathData}
              fill="none"
              stroke={isCritical ? '#dc2626' : '#64748b'}
              strokeWidth={isCritical ? 2.2 : 1.8}
              strokeDasharray={isCritical ? 'none' : 'none'}
              markerEnd={isCritical ? 'url(#arrow-critical)' : 'url(#arrow-normal)'}
              style={{ pointerEvents: 'stroke' }}
              className="transition-all duration-150 group-hover/edge:stroke-blue-600 group-hover/edge:stroke-[2.8px]"
            />
          </g>
        );
      });
    });

    return edges;
  };

  // Distinct category background badge colors
  const getCategoryColor = (cat?: string) => {
    switch (cat) {
      case 'Research/Learn':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Design':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'Coding and Component Testing':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Documentation':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'Contract':
      case 'Initiation':
        return 'bg-sky-100 text-sky-800 border-sky-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full select-none bg-slate-50 overflow-hidden ${
        isDrawingMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
    >
      {/* Top Floating Stats Banner (Replicating "Critical Path: 88 Days" from user reference image) */}
      <div className="absolute top-4 right-6 z-20 flex items-center space-x-4 bg-white/90 backdrop-blur-md px-5 py-3 rounded-2xl shadow-md border border-slate-200 pointer-events-auto">
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-red-600 animate-pulse" />
          <span className="text-slate-600 text-sm font-semibold tracking-wide">
            Critical Path:
          </span>
          <span className="text-xl font-bold font-mono">
            {formatDays(criticalPathDuration)} <span className="text-sm font-medium">Days</span>
          </span>
        </div>
        <div className="h-6 w-px bg-slate-200" />
        <div className="text-xs text-slate-500 font-medium">
          關鍵任務數: <span className="font-bold text-slate-800">{criticalPathTaskIds.length}</span> / {tasks.length}
        </div>
      </div>


      {/* Floating Control Toolbar */}
      <div
        data-toolbar="true"
        onMouseDown={e => e.stopPropagation()}
        onMouseUp={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        className="absolute bottom-6 left-6 z-20 flex items-center bg-white/90 backdrop-blur-md p-1.5 rounded-xl shadow-lg border border-slate-200 pointer-events-auto space-x-1"
      >
        {/* Drag to Draw Toggle */}
        <button
          onClick={() => setIsDrawingMode(!isDrawingMode)}
          title="切換拖曳繪製任務框模式 (亦可隨時按住 Shift 鍵直接在畫布上拖曳)"
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-all ${
            isDrawingMode
              ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <SquareDashed size={16} />
          <span>{isDrawingMode ? '繪製中 (點擊結束)' : '拖曳繪製任務'}</span>
        </button>

        <div className="h-5 w-px bg-slate-200 mx-1" />

        <button
          onClick={zoomIn}
          title="放大 (Zoom In)"
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ZoomIn size={18} />
        </button>
        <button
          onClick={zoomOut}
          title="縮小 (Zoom Out)"
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ZoomOut size={18} />
        </button>
        <button
          onClick={resetZoom}
          title="重置視角"
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Maximize2 size={18} />
        </button>
        <button
          onClick={() => computeAutoLayout(true)}
          title="重新自動拓撲排列 (Auto Layout)"
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <RefreshCw size={17} />
        </button>

        <div className="h-5 w-px bg-slate-200 mx-1" />

        <button
          onClick={() => setShowDetailedBox(!showDetailedBox)}
          title="切換 PERT 節點詳細欄位 (ES, EF, LS, LF, Float)"
          className={`px-2.5 py-1 text-xs font-medium rounded-lg flex items-center space-x-1 transition-colors ${
            showDetailedBox
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers size={14} />
          <span>{showDetailedBox ? '詳細節點' : '經典節點'}</span>
        </button>
      </div>

      {/* Live Drawing / Selection Box Overlay */}
      {drawStart && drawCurrent && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(drawStart.x, drawCurrent.x),
            top: Math.min(drawStart.y, drawCurrent.y),
            width: Math.max(Math.abs(drawCurrent.x - drawStart.x), 20),
            height: Math.max(Math.abs(drawCurrent.y - drawStart.y), 20),
          }}
          className={`pointer-events-none z-50 border-2 border-dashed rounded-lg flex items-center justify-center text-xs font-bold backdrop-blur-2xs shadow-xl transition-colors duration-100 ${
            coveredTaskIds.length > 0
              ? 'border-indigo-600 bg-indigo-500/20 text-indigo-900'
              : 'border-blue-600 bg-blue-500/15 text-blue-700 animate-pulse'
          }`}
        >
          <div className="bg-white/95 px-2.5 py-1 rounded shadow-sm border border-slate-300 text-[11px] font-bold flex items-center space-x-1.5">
            {coveredTaskIds.length > 0 ? (
              <>
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                <span className="text-indigo-900">已框選 {coveredTaskIds.length} 個工作項目 (鬆開以選取並可整批移動)</span>
              </>
            ) : (
              <span className="text-blue-800">鬆開滑鼠建立新工作項目</span>
            )}
          </div>
        </div>
      )}

      {/* SVG Canvas for Edges & Marker Definitions */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
      >
        <defs>
          {/* Normal arrow */}
          <marker
            id="arrow-normal"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
          </marker>
          {/* Critical arrow (Refined Red) */}
          <marker
            id="arrow-critical"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6.8"
            markerHeight="6.8"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#dc2626" />
          </marker>
          {/* Dragging connection arrow (Vibrant Blue) */}
          <marker
            id="arrow-linking"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#2563eb" />
          </marker>
          {/* Reverse Anchor arrow (Slate dashed) */}
          <marker
            id="arrow-anchor"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6.8"
            markerHeight="6.8"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#64748b" />
          </marker>
          {/* Reverse Anchor arrow (Critical Red dashed) */}
          <marker
            id="arrow-anchor-critical"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6.8"
            markerHeight="6.8"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#ef4444" />
          </marker>
        </defs>

        {renderEdges()}

        {/* Dynamic live dragging connection line */}
        {connectionDrag && (() => {
          const sourcePos = positions.get(connectionDrag.fromId);
          if (!sourcePos) return null;
          const startX = sourcePos.x + sourcePos.width;
          const startY = sourcePos.y + sourcePos.height / 2;
          const endX = connectionDrag.toX;
          const endY = connectionDrag.toY;
          const dx = endX - startX;
          const cOffset = dx >= 0 ? Math.min(Math.max(dx * 0.5, 25), 140) : Math.max(30, Math.abs(endY - startY) * 0.3);
          const pathData = dx >= 0
            ? `M ${startX} ${startY} C ${startX + cOffset} ${startY}, ${endX - cOffset} ${endY}, ${endX} ${endY}`
            : `M ${startX} ${startY} C ${startX + 35} ${startY}, ${endX - 35} ${endY}, ${endX} ${endY}`;
          return (
            <g>
              <path
                d={pathData}
                fill="none"
                stroke="#2563eb"
                strokeWidth="3.5"
                strokeDasharray="6 4"
                markerEnd="url(#arrow-linking)"
              />
              <circle cx={startX} cy={startY} r="4" fill="#2563eb" />
            </g>
          );
        })()}
      </svg>

      {/* Nodes Layer (DOM elements for crisp rendering and rich interactivity) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {tasks.map(task => {
          const pos = positions.get(task.id);
          if (!pos) return null;

          const isMilestone = (task.duration ?? 0) === 0;
          const isSummary = !!task.isSummary;
          const isSubtask = (task.outlineLevel || 1) > 1;
          const isCritical = criticalSet.has(task.id);
          const isTargetHover = targetHoverId === task.id;
          const isSourceDragging = connectionDrag?.fromId === task.id;
          const isSelected = !!selectedTaskIds?.has(task.id) || coveredTaskIds.includes(task.id);
          const isSubtaskOfSelected = !isSelected && selectedParentSubtaskIds.has(task.id);

          return (
            <div
              key={task.id}
              style={{
                position: 'absolute',
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: `${pos.width}px`,
                minHeight: showDetailedBox ? '110px' : `${pos.height}px`,
                willChange: (draggingTaskId === task.id || (selectedTaskIds?.has(task.id) && !!draggingTaskId)) ? 'left, top' : 'auto',
              }}
              onMouseDown={e => handleBorderMouseDown(e, task.id)}
              onClick={e => {
                e.stopPropagation();
                // If user just finished dragging node(s), do not collapse multi-selection on click!
                if (dragMovedRef.current) return;
                if (onSelectTaskIds) {
                  if (e.ctrlKey || e.metaKey) {
                    const next = new Set(selectedTaskIds || []);
                    if (next.has(task.id)) {
                      next.delete(task.id);
                    } else {
                      next.add(task.id);
                    }
                    onSelectTaskIds(next);
                  } else {
                    onSelectTaskIds(new Set([task.id]));
                  }
                }
              }}
              onContextMenu={e => {
                e.preventDefault();
                e.stopPropagation();
                if (onSelectTaskIds && !selectedTaskIds?.has(task.id)) {
                  onSelectTaskIds(new Set([task.id]));
                }
                setContextMenu({
                  task,
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
              onMouseEnter={() => {
                if (connectionDrag && connectionDrag.fromId !== task.id) {
                  setTargetHoverId(task.id);
                }
              }}
              onMouseLeave={() => {
                if (targetHoverId === task.id) {
                  setTargetHoverId(null);
                }
              }}
              className={`group pointer-events-auto cursor-move p-[5px] select-none ${
                isMilestone
                  ? 'rounded-2xl border-2'
                  : isSummary
                  ? 'rounded-lg border-2 border-dashed'
                  : 'rounded-lg border'
              } ${
                draggingTaskId === task.id
                  ? '!transition-none shadow-2xl z-40 ring-2 ring-blue-500 scale-[1.01]'
                  : 'transition-[border-color,box-shadow,background-color,transform] duration-150'
              } ${
                isSelected
                  ? '!ring-4 !ring-blue-600 !border-blue-600 scale-105 shadow-2xl z-30'
                  : isSubtaskOfSelected
                  ? '!ring-3 !ring-sky-400 !border-sky-500 !bg-sky-50/70 shadow-xl scale-[1.02] z-20'
                  : ''
              } ${
                isMilestone
                  ? isCritical
                    ? 'border-red-600 bg-gradient-to-br from-amber-100 via-rose-50 to-red-100 shadow-md shadow-red-300/50 ring-2 ring-red-400'
                    : 'border-amber-500 bg-gradient-to-br from-amber-100 via-amber-50 to-orange-100 shadow-md shadow-amber-200/50 ring-2 ring-amber-400'
                  : isSummary
                  ? isCritical
                    ? 'border-red-600 bg-red-50/90 shadow-md ring-2 ring-red-400'
                    : 'border-slate-700 bg-slate-100/90 shadow-md ring-1 ring-slate-400'
                  : isCritical
                  ? 'border-red-600 bg-slate-200/90 shadow-md shadow-red-200/60'
                  : 'border-slate-400 bg-slate-200/90 shadow-xs hover:border-blue-500 hover:shadow-md'
              } ${
                isTargetHover
                  ? 'ring-4 ring-blue-500 scale-105 shadow-2xl bg-blue-100/90'
                  : ''
              } ${
                isSourceDragging
                  ? 'ring-2 ring-blue-400 opacity-90'
                  : ''
              }`}
            >
              {/* Category pill if available and not milestone */}
              {task.category && !isMilestone && (
                <div className="absolute -top-3 left-2 z-10 pointer-events-none">
                  <span
                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border shadow-2xs ${getCategoryColor(
                      task.category
                    )}`}
                  >
                    {task.category}
                  </span>
                </div>
              )}

              {/* Reverse Anchor Badge (e.g. 齊料日 ⚓ SMT -11d) */}
              {task.anchor && task.anchor.enabled && task.anchor.targetTaskId && (
                <div
                  className="absolute -top-3.5 right-1.5 z-15 pointer-events-none"
                  title={`⚓ 反向錨定至「${taskMap.get(task.anchor.targetTaskId)?.name || task.anchor.targetTaskId}」：提前 ${task.anchor.leadDays} ${task.anchor.useWorkingDays !== false ? '個工作天' : '天'} 完成\n當目標任務順延時，此任務將自動同步推遲`}
                >
                  <span className="inline-flex items-center space-x-1 text-[9.5px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300 shadow-2xs animate-in zoom-in-90 duration-150">
                    <Anchor size={11} className="shrink-0 text-slate-500" />
                    <span>{taskMap.get(task.anchor.targetTaskId)?.name || task.anchor.targetTaskId} -{task.anchor.leadDays}d</span>
                  </span>
                </div>
              )}

              {/* Central Area: Finger Cursor (cursor-pointer), drag to connect, click to edit */}
              <div
                onMouseDown={e => handleCenterMouseDown(e, task.id)}
                onContextMenu={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    task,
                    x: e.clientX,
                    y: e.clientY,
                  });
                }}
                className={`w-full h-full cursor-pointer bg-white overflow-hidden border ${
                  isMilestone
                    ? 'rounded-xl border-amber-300'
                    : 'rounded-md border-slate-300'
                }`}
              >
                {!showDetailedBox ? (
                  <div className="flex flex-col h-full divide-y divide-slate-300">
                    {/* Task Name Box */}
                    <div
                      className={`px-2.5 py-2 text-xs font-semibold leading-tight flex items-center justify-between min-h-[46px] hover:bg-slate-50 ${
                        isMilestone
                          ? isCritical
                            ? 'bg-red-50 text-red-950 font-bold'
                            : 'bg-amber-50/90 text-amber-950 font-bold'
                          : isCritical
                          ? 'bg-red-50/40 text-red-950 font-bold'
                          : 'text-slate-800'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5 min-w-0">
                        {isSummary ? (
                          <span className="text-sm select-none shrink-0" title={`父階任務 (${getParentBadgeLabel(task)})`}>
                            📁
                          </span>
                        ) : isSubtask ? (
                          <span
                            className="text-blue-600 select-none shrink-0 inline-flex items-center"
                            title={`子任務 (L${task.outlineLevel || 2})`}
                          >
                            <Indent size={14} />
                          </span>
                        ) : null}
                        <span className="line-clamp-2">
                          {task.name}
                        </span>
                      </div>
                      {isCritical && (
                        <span className="shrink-0 ml-1 w-2 h-2 rounded-full bg-red-600" />
                      )}
                    </div>

                    {/* Date & Duration Bottom Row */}
                    <div
                      className={`flex items-center text-[11px] font-medium divide-x h-[32px] ${
                        isMilestone
                          ? isCritical
                            ? 'bg-red-100/80 text-red-900 divide-red-200 font-bold'
                            : 'bg-amber-100/80 text-amber-900 divide-amber-200 font-bold'
                          : isCritical
                          ? 'bg-red-50/80 text-red-900 divide-slate-300 font-bold'
                          : 'bg-slate-50/70 text-slate-600 divide-slate-300'
                      }`}
                    >
                      {/* Date Cell: Click to select/edit, but isolate onMouseDown to prevent connection drag */}
                      <div
                        className="flex-1 px-1.5 text-center truncate font-mono text-[10px] cursor-pointer hover:bg-black/5 transition-colors"
                        title={`排程日期：${task.startDate || ''} ~ ${task.finishDate || ''} (點擊編輯任務)`}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation();
                          if (onSelectTaskIds) {
                            onSelectTaskIds(new Set([task.id]));
                          }
                          onSelectTask(task);
                        }}
                      >
                        {formatDateRangeForDisplay(task.startDate, task.finishDate) || `Day ${formatDays(task.earlyStart)}`}
                      </div>

                      {/* Duration Cell: Isolated from node clicks, with dedicated large stepper buttons */}
                      <div
                        className="group/dur flex-1 h-full flex items-center justify-between pl-2 pr-0 relative select-none cursor-default bg-slate-50/60 hover:bg-slate-100/80 transition-colors"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => e.stopPropagation()}
                        onDoubleClick={e => e.stopPropagation()}
                      >
                        {isSummary ? (
                          <span
                            className="font-bold flex items-center justify-center space-x-1 text-slate-800 text-[11px] w-full"
                            title={`${getParentBadgeLabel(task)}，工期由子任務自動彙總`}
                          >
                            <span>📁 {formatDays(task.duration)} 天</span>
                          </span>
                        ) : (
                          <>
                            <span
                              className="flex-1 text-center truncate font-mono text-[10.5px] font-semibold text-slate-700"
                              title={`任務工期：${formatDays(task.duration)} 天 (點擊右側 ▲ / ▼ 調整)`}
                            >
                              {formatDays(task.duration)} {task.duration === 1 ? 'day' : 'days'}
                            </span>
                            {onUpdateTaskDuration && (
                              <div className="flex flex-col h-full w-6 shrink-0 border-l border-slate-300/80 divide-y divide-slate-300/80 opacity-60 group-hover/dur:opacity-100 hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  title="增加工期 (+1天)"
                                  onClick={e => {
                                    e.stopPropagation();
                                    const cur = typeof task.duration === 'number' ? task.duration : 1;
                                    onUpdateTaskDuration(task.id, cur + 1);
                                  }}
                                  onMouseDown={e => e.stopPropagation()}
                                  className="flex-1 flex items-center justify-center hover:bg-blue-600 hover:text-white text-slate-600 active:bg-blue-700 transition-colors cursor-pointer"
                                >
                                  <ChevronUp size={12} strokeWidth={2.5} />
                                </button>
                                <button
                                  type="button"
                                  title="減少工期 (-1天)"
                                  onClick={e => {
                                    e.stopPropagation();
                                    const cur = typeof task.duration === 'number' ? task.duration : 1;
                                    const min = isMilestone ? 0 : 1;
                                    onUpdateTaskDuration(task.id, Math.max(min, cur - 1));
                                  }}
                                  onMouseDown={e => e.stopPropagation()}
                                  className="flex-1 flex items-center justify-center hover:bg-blue-600 hover:text-white text-slate-600 active:bg-blue-700 transition-colors cursor-pointer"
                                >
                                  <ChevronDown size={12} strokeWidth={2.5} />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Full Detailed CPM Node (ES, EF, LS, LF, Duration, Float) */
                  <div className="flex flex-col text-[10px] divide-y divide-slate-200">
                    <div
                      className={`p-1.5 font-bold truncate ${
                        isMilestone
                          ? isCritical
                            ? 'bg-red-100 text-red-950'
                            : 'bg-amber-100 text-amber-950'
                          : isSummary
                          ? isCritical
                            ? 'bg-red-100 text-red-950 font-black'
                            : 'bg-slate-200 text-slate-900 font-bold'
                          : isCritical
                            ? 'bg-red-50 text-red-900'
                            : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {isSummary ? (
                        <span className="mr-1 select-none" title={`父階任務 (${getParentBadgeLabel(task)})`}>📁</span>
                      ) : isSubtask ? (
                        <span className="mr-1 select-none inline-flex items-center text-blue-600 align-middle" title={`子任務 (L${task.outlineLevel || 2})`}>
                          <Indent size={12} />
                        </span>
                      ) : null}[{task.id}] {task.name}
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-slate-200 text-center py-1">
                      <div>
                        <div className="text-[8px] text-slate-400">ES</div>
                        <div className="font-mono font-bold">{formatDays(task.earlyStart)}</div>
                      </div>
                      <div>
                        <div className="text-[8px] text-slate-400">{isSummary ? 'ROLLUP' : 'DUR'}</div>
                        <div className="font-mono font-bold">
                          {`${formatDays(task.duration)}d`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[8px] text-slate-400">EF</div>
                        <div className="font-mono font-bold">{formatDays(task.earlyFinish)}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-slate-200 text-center py-1 bg-slate-50">
                      <div>
                        <div className="text-[8px] text-slate-400">LS</div>
                        <div className="font-mono font-bold">{formatDays(task.lateStart)}</div>
                      </div>
                      <div>
                        <div className="text-[8px] text-slate-400">SLACK</div>
                        <div
                          className={`font-mono font-bold ${
                            isCritical ? 'text-red-600' : 'text-slate-600'
                          }`}
                        >
                          {formatDays(task.totalFloat)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[8px] text-slate-400">LF</div>
                        <div className="font-mono font-bold">{formatDays(task.lateFinish)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task Context Menu (Right Click) */}
      <TaskContextMenu
        task={contextMenu?.task || null}
        position={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
        onClose={() => setContextMenu(null)}
        onIndent={task => {
          onIndentTask?.(task);
          setContextMenu(null);
        }}
        onOutdent={task => {
          onOutdentTask?.(task);
          setContextMenu(null);
        }}
        onEdit={task => {
          onSelectTask(task);
          setContextMenu(null);
        }}
        onDelete={taskId => {
          onDeleteTask?.(taskId);
          setContextMenu(null);
        }}
        canIndent={true}
        canOutdent={((contextMenu?.task?.outlineLevel || 1) > 1)}
      />

      {/* Delete Predecessor Dependency Confirmation Modal */}
      {deleteEdgeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setDeleteEdgeModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 flex flex-col space-y-4 animate-in zoom-in-95"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-xl bg-red-100 text-red-600 shrink-0">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">刪除前置任務依賴關聯？</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  您剛雙擊了前置連線：
                </p>
                <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs font-mono flex items-center justify-center space-x-2 text-slate-800">
                  <span className="font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                    {deleteEdgeModal.fromId}
                  </span>
                  <span className="text-slate-400">➔ (前置於) ➔</span>
                  <span className="font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                    {deleteEdgeModal.toId}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  確定要解除任務 [{deleteEdgeModal.toId}] 對 [{deleteEdgeModal.fromId}] 的前置關聯嗎？
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteEdgeModal(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onRemoveDependency) {
                    onRemoveDependency(deleteEdgeModal.fromId, deleteEdgeModal.toId);
                  }
                  setDeleteEdgeModal(null);
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-colors flex items-center space-x-1"
              >
                <Trash2 size={13} />
                <span>確認刪除前置關聯</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

