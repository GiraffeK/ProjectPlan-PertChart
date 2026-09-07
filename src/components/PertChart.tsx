import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Task } from '../core/types';
import { formatDateForDisplay } from '../core/cpmEngine';
import dagre from 'dagre';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  SquareDashed,
  RefreshCw,
} from 'lucide-react';

interface PertChartProps {
  tasks: Task[];
  criticalPathDuration: number;
  criticalPathTaskIds: string[];
  criticalEdges: Array<{ from: string; to: string }>;
  onSelectTask: (task: Task) => void;
  onAddDependency?: (fromId: string, toId: string) => void;
  onCreateTaskAt?: (pos: { x: number; y: number }, predecessorId?: string) => void;
  onUpdateTaskPosition?: (taskId: string, x: number, y: number) => void;
}

interface NodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

const NODE_WIDTH = 190;
const NODE_HEIGHT = 80;

export const PertChart: React.FC<PertChartProps> = ({
  tasks,
  criticalPathDuration,
  criticalPathTaskIds,
  criticalEdges,
  onSelectTask,
  onAddDependency,
  onCreateTaskAt,
  onUpdateTaskPosition,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Map<string, NodePosition>>(new Map());
  const [transform, setTransform] = useState({ x: 80, y: 80, scale: 0.85 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showDetailedBox, setShowDetailedBox] = useState(false);

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
      const newPos = new Map(prev);
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
        } else if (!forceAll && prev.has(nodeId)) {
          // Keep current dragged position
        } else if (node) {
          newPos.set(nodeId, {
            x: node.x - NODE_WIDTH / 2,
            y: node.y - NODE_HEIGHT / 2,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          });
        }
      });
      return newPos;
    });
  };

  // Sync positions when tasks change, preserving existing layout
  useEffect(() => {
    computeAutoLayout(false);
  }, [tasks]);

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

  // Handle border mouse down (MS Project: Drag perimeter to move node)
  const handleBorderMouseDown = (e: React.MouseEvent, taskId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const pos = positions.get(taskId);
    if (pos) {
      setDraggingTaskId(taskId);
      draggingTaskIdRef.current = taskId;
      const rect = containerRef.current?.getBoundingClientRect();
      const containerLeft = rect ? rect.left : 0;
      const containerTop = rect ? rect.top : 0;
      const mouseCanvasX = (e.clientX - containerLeft - transform.x) / transform.scale;
      const mouseCanvasY = (e.clientY - containerTop - transform.y) / transform.scale;
      const offset = {
        x: mouseCanvasX - pos.x,
        y: mouseCanvasY - pos.y,
      };
      setDragOffset(offset);
      dragOffsetRef.current = offset;
    }
  };

  // High-performance window-level mouse move & up listeners while dragging a task node
  useEffect(() => {
    if (!draggingTaskId) return;

    let rafId: number | null = null;

    const onWindowMouseMove = (e: MouseEvent) => {
      const taskId = draggingTaskIdRef.current;
      if (!taskId || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouseCanvasX = (e.clientX - rect.left - transformRef.current.x) / transformRef.current.scale;
      const mouseCanvasY = (e.clientY - rect.top - transformRef.current.y) / transformRef.current.scale;

      const newX = Math.round(mouseCanvasX - dragOffsetRef.current.x);
      const newY = Math.round(mouseCanvasY - dragOffsetRef.current.y);

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        setPositions(prev => {
          const currentPos = prev.get(taskId);
          if (!currentPos) return prev;
          if (currentPos.x === newX && currentPos.y === newY) return prev;
          const next = new Map(prev);
          next.set(taskId, { ...currentPos, x: newX, y: newY });
          return next;
        });
      });
    };

    const onWindowMouseUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      const taskId = draggingTaskIdRef.current;
      if (taskId) {
        const finalPos = positionsRef.current.get(taskId);
        if (finalPos && onUpdateTaskPosition) {
          onUpdateTaskPosition(taskId, finalPos.x, finalPos.y);
        }
      }
      setDraggingTaskId(null);
      draggingTaskIdRef.current = null;
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
  }, [draggingTaskId, onUpdateTaskPosition]);

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
          const rect = containerRef.current?.getBoundingClientRect();
          const containerLeft = rect ? rect.left : 0;
          const containerTop = rect ? rect.top : 0;
          const canvasX = Math.round((e.clientX - containerLeft - transform.x) / transform.scale);
          const canvasY = Math.round((e.clientY - containerTop - transform.y) / transform.scale);
          if (onCreateTaskAt) {
            onCreateTaskAt({ x: canvasX, y: canvasY }, pressInfo.fromId);
          }
        }
      } else {
        // Was a simple click on the center! Open edit modal
        const task = taskMap.get(pressInfo.fromId);
        if (task) {
          onSelectTask(task);
        }
      }

      setConnectionDrag(null);
      setTargetHoverId(null);
      return;
    }

    // 2. If we were drawing a task frame
    if (drawStart && drawCurrent) {
      const rect = containerRef.current?.getBoundingClientRect();
      const containerLeft = rect ? rect.left : 0;
      const containerTop = rect ? rect.top : 0;

      const screenMinX = Math.min(drawStart.x, drawCurrent.x);
      const screenMinY = Math.min(drawStart.y, drawCurrent.y);

      // Convert to canvas coordinates
      const canvasX = Math.round((screenMinX - containerLeft - transform.x) / transform.scale);
      const canvasY = Math.round((screenMinY - containerTop - transform.y) / transform.scale);

      const dragDistance = Math.hypot(
        drawCurrent.x - drawStart.x,
        drawCurrent.y - drawStart.y
      );

      // ONLY create task if user actually dragged a box with meaningful distance (> 20px)!
      // Never trigger on simple clicks (which happens if clicking toolbar or canvas without drag)
      if (dragDistance > 20) {
        if (onCreateTaskAt) {
          onCreateTaskAt({ x: canvasX, y: canvasY });
        }
        setIsDrawingMode(false);
      }

      setDrawStart(null);
      setDrawCurrent(null);
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

  // Render edges / arrows
  const renderEdges = () => {
    const edges: React.ReactNode[] = [];

    tasks.forEach(task => {
      const targetPos = positions.get(task.id);
      if (!targetPos) return;

      task.predecessors.forEach(predId => {
        const sourcePos = positions.get(predId);
        if (!sourcePos) return;

        const isCritical = criticalEdgeSet.has(`${predId}->${task.id}`);
        const edgeKey = `${predId}-${task.id}`;

        // Connect right side of source to left side of target
        const startX = sourcePos.x + sourcePos.width;
        const startY = sourcePos.y + sourcePos.height / 2;
        const endX = targetPos.x;
        const endY = targetPos.y + targetPos.height / 2;

        // Smooth cubic bezier or stepped orthogonal curve
        const dx = Math.max(40, (endX - startX) * 0.5);
        const pathData = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

        edges.push(
          <g key={edgeKey}>
            {/* Wider transparent stroke for easier hover / click */}
            <path
              d={pathData}
              fill="none"
              stroke="transparent"
              strokeWidth="16"
              className="cursor-pointer"
            />
            {/* Visible Line */}
            <path
              d={pathData}
              fill="none"
              stroke={isCritical ? '#dc2626' : '#64748b'}
              strokeWidth={isCritical ? 3.5 : 1.8}
              strokeDasharray={isCritical ? 'none' : 'none'}
              markerEnd={isCritical ? 'url(#arrow-critical)' : 'url(#arrow-normal)'}
              className="transition-colors duration-200"
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
          <span className="text-2xl font-black text-red-600 tracking-tight">
            {criticalPathDuration} <span className="text-sm font-medium">Days</span>
          </span>
        </div>
        <div className="h-6 w-px bg-slate-200" />
        <div className="text-xs text-slate-500 font-medium">
          關鍵任務數: <span className="font-bold text-slate-800">{criticalPathTaskIds.length}</span> / {tasks.length}
        </div>
      </div>

      {/* Drawing & operation mode hint banner */}
      <div className="absolute top-4 left-6 z-20 pointer-events-none">
        <div className="bg-white/95 backdrop-blur-xs px-4 py-2 rounded-xl border border-slate-200 shadow-md text-xs text-slate-700 flex flex-col space-y-1">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span className="font-bold text-slate-900">Microsoft Project 操作體驗：</span>
          </div>
          <div className="text-[11px] text-slate-600 flex flex-wrap gap-x-4 gap-y-0.5">
            <span>👉 <b>框中央 (手指圖示)</b>：拖曳可拉出箭頭連線至別的任務；點擊編輯</span>
            <span>👉 <b>四周邊框 (移動圖示)</b>：拖曳移動任務框位置</span>
            <span>👉 <b>按住 Shift 拖曳畫布</b>：直接拉出新任務框</span>
          </div>
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

      {/* Live Drawing Box Overlay */}
      {drawStart && drawCurrent && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(drawStart.x, drawCurrent.x),
            top: Math.min(drawStart.y, drawCurrent.y),
            width: Math.max(Math.abs(drawCurrent.x - drawStart.x), 30),
            height: Math.max(Math.abs(drawCurrent.y - drawStart.y), 30),
          }}
          className="pointer-events-none z-50 border-2 border-dashed border-blue-600 bg-blue-500/15 rounded-lg flex items-center justify-center text-xs font-bold text-blue-700 backdrop-blur-2xs shadow-xl animate-pulse"
        >
          <div className="bg-white/95 px-2.5 py-1 rounded shadow-sm border border-blue-300 text-blue-800 text-[11px]">
            鬆開滑鼠建立新任務框
          </div>
        </div>
      )}

      {/* SVG Canvas for Edges & Marker Definitions */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
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
          {/* Critical arrow (Bold Red) */}
          <marker
            id="arrow-critical"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0.5 L 10 5 L 0 9.5 z" fill="#dc2626" />
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
          const dx = Math.max(30, Math.abs(endX - startX) * 0.4);
          const pathData = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;
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

          const isCritical = criticalSet.has(task.id);
          const isTargetHover = targetHoverId === task.id;
          const isSourceDragging = connectionDrag?.fromId === task.id;

          return (
            <div
              key={task.id}
              style={{
                position: 'absolute',
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: `${pos.width}px`,
                minHeight: showDetailedBox ? '110px' : `${pos.height}px`,
                willChange: draggingTaskId === task.id ? 'left, top' : 'auto',
              }}
              onMouseDown={e => handleBorderMouseDown(e, task.id)}
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
              title="四周（移動圖示）：拖曳可調整此任務框位置"
              className={`group pointer-events-auto rounded-lg bg-slate-200/90 cursor-move p-[5px] select-none ${
                draggingTaskId === task.id
                  ? '!transition-none shadow-2xl z-40 ring-2 ring-blue-500 scale-[1.01]'
                  : 'transition-[border-color,box-shadow,background-color] duration-150'
              } ${
                isCritical
                  ? 'border-2 border-red-600 shadow-md shadow-red-200/60'
                  : 'border border-slate-400 shadow-xs hover:border-blue-500 hover:shadow-md'
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
              {/* Category pill if available */}
              {task.category && (
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

              {/* Central Area: Finger Cursor (cursor-pointer), drag to connect, click to edit */}
              <div
                onMouseDown={e => handleCenterMouseDown(e, task.id)}
                title="中央（手指圖示）：拖曳拉出連線至其他任務，點擊編輯項目與天數"
                className="w-full h-full cursor-pointer bg-white rounded-md overflow-hidden border border-slate-300"
              >
                {!showDetailedBox ? (
                  <div className="flex flex-col h-full divide-y divide-slate-300">
                    {/* Task Name Box */}
                    <div
                      className={`px-2.5 py-2 text-xs font-semibold leading-tight text-slate-800 flex items-center justify-between min-h-[46px] hover:bg-slate-50 ${
                        isCritical ? 'bg-red-50/40 text-red-950 font-bold' : ''
                      }`}
                    >
                      <span className="line-clamp-2" title={task.name}>
                        {task.name}
                      </span>
                      {isCritical && (
                        <span className="shrink-0 ml-1 w-2 h-2 rounded-full bg-red-600" />
                      )}
                    </div>

                    {/* Date & Duration Bottom Row (Reference Image Style: "02/01/00 | 1 day") */}
                    <div
                      className={`flex items-center text-[11px] font-medium divide-x divide-slate-300 h-[32px] ${
                        isCritical ? 'bg-red-50/80 text-red-900 font-bold' : 'bg-slate-50/70 text-slate-600'
                      }`}
                    >
                      <div className="flex-1 px-2 text-center truncate font-mono">
                        {formatDateForDisplay(task.startDate) || `Day ${task.earlyStart}`}
                      </div>
                      <div className="flex-1 px-2 text-center truncate font-mono">
                        {task.duration} {task.duration === 1 ? 'day' : 'days'}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Full Detailed CPM Node (ES, EF, LS, LF, Duration, Float) */
                  <div className="flex flex-col text-[10px] divide-y divide-slate-200">
                    <div
                      className={`p-1.5 font-bold truncate text-slate-800 ${
                        isCritical ? 'bg-red-50 text-red-900' : 'bg-slate-100'
                      }`}
                    >
                      [{task.id}] {task.name}
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-slate-200 text-center py-1">
                      <div>
                        <div className="text-[8px] text-slate-400">ES</div>
                        <div className="font-mono font-bold">{task.earlyStart}</div>
                      </div>
                      <div>
                        <div className="text-[8px] text-slate-400">DUR</div>
                        <div className="font-mono font-bold">{task.duration}d</div>
                      </div>
                      <div>
                        <div className="text-[8px] text-slate-400">EF</div>
                        <div className="font-mono font-bold">{task.earlyFinish}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-slate-200 text-center py-1 bg-slate-50">
                      <div>
                        <div className="text-[8px] text-slate-400">LS</div>
                        <div className="font-mono font-bold">{task.lateStart}</div>
                      </div>
                      <div>
                        <div className="text-[8px] text-slate-400">SLACK</div>
                        <div
                          className={`font-mono font-bold ${
                            isCritical ? 'text-red-600' : 'text-slate-600'
                          }`}
                        >
                          {task.totalFloat}
                        </div>
                      </div>
                      <div>
                        <div className="text-[8px] text-slate-400">LF</div>
                        <div className="font-mono font-bold">{task.lateFinish}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

