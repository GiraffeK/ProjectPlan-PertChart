import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Task, ScheduleMode, Holiday } from '../core/types';
import { formatDateForDisplay, formatDays, getParentBadgeLabel, addDaysToDate } from '../core/cpmEngine';
import { isNonWorkingDay, getHolidayLabel, getCalendarDayDifference } from '../core/calendarEngine';
import { TaskContextMenu } from './TaskContextMenu';
import { Calendar, Filter, ZoomIn, ZoomOut, GitBranch, Trash2, Edit3, X } from 'lucide-react';

interface GanttChartProps {
  tasks: Task[];
  criticalPathDuration: number;
  criticalPathTaskIds: string[];
  projectStartDate: string;
  scheduleMode?: ScheduleMode;
  holidays?: Holiday[];
  selectedTaskIds?: Set<string>;
  onSelectTaskIds?: (taskIds: Set<string>) => void;
  onSelectTask: (task: Task) => void;
  onUpdateTaskSchedule?: (taskId: string, updates: { manualEarlyStart?: number; duration?: number }) => void;
  onRemoveDependency?: (fromId: string, toId: string) => void;
  onUpdatePredecessor?: (toId: string, oldPredId: string, newPredId: string) => void;
  onIndentTask?: (task: Task | Task[] | string[] | string) => void;
  onOutdentTask?: (task: Task | Task[] | string[] | string) => void;
  onDeleteTask?: (taskId: string) => void;
  onDeleteMultipleTasks?: (taskIds: string[]) => void;
  onReorderTasks?: (sourceTaskIds: string[], targetTaskId: string, position: 'before' | 'after') => void;
  onInsertTask?: (targetTaskId: string, position: 'before' | 'after') => void;
  onCopyTasks?: (taskIds: string[]) => void;
  onCutTasks?: (taskIds: string[]) => void;
  onPasteTasks?: (targetTaskId: string) => void;
  hasClipboard?: boolean;
  clipboardCount?: number;
}

interface BarDragState {
  taskId: string;
  mode: 'move' | 'resize';
  startClientX: number;
  initialStartDay: number;
  initialDuration: number;
  currentStartDay: number;
  currentDuration: number;
}

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  criticalPathDuration,
  criticalPathTaskIds,
  projectStartDate,
  scheduleMode = 'working',
  holidays = [],
  selectedTaskIds: externalSelectedTaskIds,
  onSelectTaskIds,
  onSelectTask,
  onUpdateTaskSchedule,
  onRemoveDependency,
  onUpdatePredecessor,
  onIndentTask,
  onOutdentTask,
  onDeleteTask,
  onDeleteMultipleTasks,
  onReorderTasks,
  onInsertTask,
  onCopyTasks,
  onCutTasks,
  onPasteTasks,
  hasClipboard = false,
  clipboardCount = 0,
}) => {
  const [dayWidth, setDayWidth] = useState(24); // pixels per day
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [showDependencyArrows, setShowDependencyArrows] = useState(true);
  const [hoveredTask, setHoveredTask] = useState<Task | null>(null);

  // Multi-selection state for Task ID / row (controlled via prop if provided, else internal)
  const [internalSelectedTaskIds, setInternalSelectedTaskIds] = useState<Set<string>>(new Set());
  const selectedTaskIds = externalSelectedTaskIds !== undefined ? externalSelectedTaskIds : internalSelectedTaskIds;
  const updateSelectedTaskIds = (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    const nextVal = typeof updater === 'function' ? updater(selectedTaskIds) : updater;
    if (onSelectTaskIds) {
      onSelectTaskIds(nextVal);
    } else {
      setInternalSelectedTaskIds(nextVal);
    }
  };

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

  const [lastSelectedTaskId, setLastSelectedTaskId] = useState<string | null>(null);

  // Inline duration edit state
  const [editingDurationTaskId, setEditingDurationTaskId] = useState<string | null>(null);
  const [durationInputVal, setDurationInputVal] = useState<string>('');

  // Predecessor edit / delete modal state (from table chip double click or timeline arrow double click)
  const [predActionModal, setPredActionModal] = useState<{
    toTaskId: string;
    fromPredId: string;
    editVal: string;
  } | null>(null);

  // Row Drag-to-Reorder state
  const [draggingRowIds, setDraggingRowIds] = useState<string[] | null>(null);
  const [dropTarget, setDropTarget] = useState<{ taskId: string; position: 'before' | 'after' } | null>(null);

  // Task Name complete content floating tooltip
  const [nameTooltip, setNameTooltip] = useState<{
    name: string;
    id: string;
    category?: string;
    x: number;
    y: number;
  } | null>(null);

  // Task bar drag state
  const [barDrag, setBarDrag] = useState<BarDragState | null>(null);
  const barDragRef = useRef<BarDragState | null>(null);
  barDragRef.current = barDrag;

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    task: Task;
    x: number;
    y: number;
  } | null>(null);

  const criticalSet = useMemo(() => new Set(criticalPathTaskIds), [criticalPathTaskIds]);

  const filteredTasks = useMemo(() => {
    if (!onlyCritical) return tasks;
    return tasks.filter(t => criticalSet.has(t.id));
  }, [tasks, onlyCritical, criticalSet]);

  const maxCalendarSpan = useMemo(() => {
    let max = criticalPathDuration;
    tasks.forEach(t => {
      if (t.finishDate) {
        const diff = getCalendarDayDifference(projectStartDate, t.finishDate);
        if (diff > max) max = diff;
      }
      if (t.earlyFinish && t.earlyFinish > max) {
        max = t.earlyFinish;
      }
    });
    return max;
  }, [tasks, projectStartDate, criticalPathDuration]);

  const totalDays = Math.max(maxCalendarSpan + 15, 40);

  // Generate day tick markers
  const timelineDays = useMemo(() => {
    const days: number[] = [];
    for (let d = 0; d <= totalDays; d++) {
      days.push(d);
    }
    return days;
  }, [totalDays]);

  const ROW_HEIGHT = 44;

  // Task map and index map for fast lookup
  const taskRowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    filteredTasks.forEach((t, idx) => {
      map.set(t.id, idx);
    });
    return map;
  }, [filteredTasks]);

  const taskByIdMap = useMemo(() => {
    const map = new Map<string, Task>();
    tasks.forEach(t => map.set(t.id, t));
    return map;
  }, [tasks]);

  // Compute dependency lines/arrows from predecessor to successor
  interface DependencyArrow {
    id: string;
    fromId: string;
    toId: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    pathD: string;
    isCritical: boolean;
  }

  const dependencyArrows = useMemo(() => {
    if (!showDependencyArrows) return [];
    const arrows: DependencyArrow[] = [];

    filteredTasks.forEach(task => {
      const toRow = taskRowIndexMap.get(task.id);
      if (toRow === undefined) return;

      const toCalStart = task.startDate ? getCalendarDayDifference(projectStartDate, task.startDate) : (task.earlyStart ?? 0);
      const toX = barDrag?.taskId === task.id ? barDrag.currentStartDay * dayWidth : toCalStart * dayWidth;
      const toY = toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

      if (!task.predecessors || task.predecessors.length === 0) return;

      task.predecessors.forEach(predId => {
        const predRow = taskRowIndexMap.get(predId);
        if (predRow === undefined) return;

        const predTask = taskByIdMap.get(predId);
        if (!predTask) return;

        const pCalStart = predTask.startDate ? getCalendarDayDifference(projectStartDate, predTask.startDate) : (predTask.earlyStart ?? 0);
        const pCalFinish = predTask.finishDate ? getCalendarDayDifference(projectStartDate, predTask.finishDate) : (predTask.earlyFinish ?? 0);
        const pSpan = predTask.duration === 0 ? 0 : Math.max(1, pCalFinish - pCalStart + 1);

        const fromX = barDrag?.taskId === predId
          ? (barDrag.currentStartDay + barDrag.currentDuration) * dayWidth
          : (pCalStart + pSpan) * dayWidth;
        const fromY = predRow * ROW_HEIGHT + ROW_HEIGHT / 2;

        const isCriticalEdge = criticalSet.has(predId) && criticalSet.has(task.id) &&
          (task.earlyStart ?? 0) === ((predTask.earlyStart ?? 0) + predTask.duration);

        // Path calculation (Orthogonal step or smooth bezier)
        let pathD = '';
        if (toX >= fromX + 16) {
          // Normal case: Successor starts after predecessor finish
          const midX = fromX + (toX - fromX) / 2;
          pathD = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
        } else {
          // Overlap or reverse: loop around
          const offsetRight = fromX + 12;
          const offsetLeft = toX - 12;
          const midY = fromY + (toY - fromY) / 2;
          pathD = `M ${fromX} ${fromY} L ${offsetRight} ${fromY} C ${offsetRight + 12} ${fromY}, ${offsetRight + 12} ${midY}, ${offsetRight} ${midY} L ${offsetLeft} ${midY} C ${offsetLeft - 12} ${midY}, ${offsetLeft - 12} ${toY}, ${offsetLeft} ${toY} L ${toX} ${toY}`;
        }

        arrows.push({
          id: `${predId}->${task.id}`,
          fromId: predId,
          toId: task.id,
          fromX,
          fromY,
          toX,
          toY,
          pathD,
          isCritical: isCriticalEdge,
        });
      });
    });

    return arrows;
  }, [filteredTasks, taskRowIndexMap, taskByIdMap, showDependencyArrows, dayWidth, barDrag, criticalSet]);


  // Handle task bar mouse down (Move or Resize)
  const handleBarMouseDown = (
    e: React.MouseEvent,
    task: Task,
    mode: 'move' | 'resize'
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const es = task.earlyStart ?? 0;
    const dur = task.duration;

    const newDrag: BarDragState = {
      taskId: task.id,
      mode,
      startClientX: e.clientX,
      initialStartDay: es,
      initialDuration: dur,
      currentStartDay: es,
      currentDuration: dur,
    };

    setBarDrag(newDrag);
    barDragRef.current = newDrag;
  };

  // High-performance window-level mousemove & mouseup for dragging Gantt task bars
  useEffect(() => {
    if (!barDrag) return;

    let rafId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      const cur = barDragRef.current;
      if (!cur) return;

      const deltaX = e.clientX - cur.startClientX;
      const deltaDays = Math.round(deltaX / dayWidth);

      if (cur.mode === 'move') {
        const newStart = Math.max(0, cur.initialStartDay + deltaDays);
        if (newStart !== cur.currentStartDay) {
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            setBarDrag(prev => (prev ? { ...prev, currentStartDay: newStart } : null));
          });
        }
      } else if (cur.mode === 'resize') {
        const newDur = Math.max(1, cur.initialDuration + deltaDays);
        if (newDur !== cur.currentDuration) {
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            setBarDrag(prev => (prev ? { ...prev, currentDuration: newDur } : null));
          });
        }
      }
    };

    const handleMouseUp = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      const cur = barDragRef.current;
      if (cur && onUpdateTaskSchedule) {
        if (cur.mode === 'move') {
          if (cur.currentStartDay !== cur.initialStartDay) {
            onUpdateTaskSchedule(cur.taskId, { manualEarlyStart: cur.currentStartDay });
          }
        } else if (cur.mode === 'resize') {
          if (cur.currentDuration !== cur.initialDuration) {
            onUpdateTaskSchedule(cur.taskId, { duration: cur.currentDuration });
          }
        }
      }
      setBarDrag(null);
      barDragRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [barDrag, dayWidth, onUpdateTaskSchedule]);

  // Handle Task Number (Yellow column) Left Click (supports single, Ctrl-toggle, Shift-range)
  const handleTaskNumberClick = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      updateSelectedTaskIds(prev => {
        const next = new Set(prev);
        if (next.has(task.id)) {
          next.delete(task.id);
        } else {
          next.add(task.id);
        }
        return next;
      });
      setLastSelectedTaskId(task.id);
    } else if (e.shiftKey && lastSelectedTaskId) {
      const lastIdx = filteredTasks.findIndex(t => t.id === lastSelectedTaskId);
      const currentIdx = filteredTasks.findIndex(t => t.id === task.id);
      if (lastIdx >= 0 && currentIdx >= 0) {
        const start = Math.min(lastIdx, currentIdx);
        const end = Math.max(lastIdx, currentIdx);
        const rangeIds = filteredTasks.slice(start, end + 1).map(t => t.id);
        updateSelectedTaskIds(new Set(rangeIds));
      }
    } else {
      updateSelectedTaskIds(new Set([task.id]));
      setLastSelectedTaskId(task.id);
    }
  };

  // Handle Task Number Context Menu (Right Click on yellow column)
  const handleTaskNumberContextMenu = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedTaskIds.has(task.id)) {
      updateSelectedTaskIds(new Set([task.id]));
      setLastSelectedTaskId(task.id);
    }
    setContextMenu({
      task,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleContextMenu = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedTaskIds.has(task.id)) {
      updateSelectedTaskIds(new Set([task.id]));
      setLastSelectedTaskId(task.id);
    }
    setContextMenu({
      task,
      x: e.clientX,
      y: e.clientY,
    });
  };

  // Drag & drop row reordering handlers
  const handleRowDragStart = (e: React.DragEvent, task: Task) => {
    const ids = selectedTaskIds.has(task.id) && selectedTaskIds.size > 1
      ? Array.from(selectedTaskIds)
      : [task.id];
    setDraggingRowIds(ids);
    if (!selectedTaskIds.has(task.id)) {
      updateSelectedTaskIds(new Set([task.id]));
      setLastSelectedTaskId(task.id);
    }
    e.dataTransfer.setData('text/plain', JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleRowDragOver = (e: React.DragEvent, task: Task) => {
    if (!draggingRowIds) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const position = relY < rect.height / 2 ? 'before' : 'after';
    if (dropTarget?.taskId !== task.id || dropTarget?.position !== position) {
      setDropTarget({ taskId: task.id, position });
    }
  };

  const handleRowDrop = (e: React.DragEvent, _targetTask: Task) => {
    e.preventDefault();
    if (draggingRowIds && dropTarget && onReorderTasks) {
      onReorderTasks(draggingRowIds, dropTarget.taskId, dropTarget.position);
    }
    setDraggingRowIds(null);
    setDropTarget(null);
  };

  // Keyboard shortcuts listener: Delete, Backspace, Ctrl+C, Ctrl+X, Ctrl+V, Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTaskIds.size > 0) {
        e.preventDefault();
        if (onDeleteMultipleTasks) {
          onDeleteMultipleTasks(Array.from(selectedTaskIds));
        } else if (onDeleteTask) {
          selectedTaskIds.forEach(id => onDeleteTask(id));
        }
        updateSelectedTaskIds(new Set());
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedTaskIds.size > 0) {
        onCopyTasks?.(Array.from(selectedTaskIds));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && selectedTaskIds.size > 0) {
        onCutTasks?.(Array.from(selectedTaskIds));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && hasClipboard && lastSelectedTaskId) {
        onPasteTasks?.(lastSelectedTaskId);
      } else if (e.key === 'Escape') {
        updateSelectedTaskIds(new Set());
        setNameTooltip(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTaskIds, lastSelectedTaskId, onDeleteMultipleTasks, onDeleteTask, onCopyTasks, onCutTasks, onPasteTasks, hasClipboard]);

  return (
    <div className="flex flex-col w-full h-full bg-white select-none overflow-hidden relative">
      {/* Gantt Controls Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-slate-50/70">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Calendar size={18} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">
              專案開始日: <span className="font-mono text-blue-600">{projectStartDate}</span>
            </span>
          </div>
          <div className="h-4 w-px bg-slate-300" />
          <div className="flex items-center space-x-1.5 text-xs text-slate-600">
            <span className="w-3 h-3 rounded-xs bg-red-500" />
            <span>關鍵任務</span>
            <span className="w-3 h-3 rounded-xs bg-blue-500 ml-3" />
            <span>非關鍵任務</span>
            <span className="w-3 h-3 rounded-xs bg-slate-200 border border-dashed border-slate-400 ml-3" />
            <span>浮時</span>
          </div>

          {/* Selected count pill */}
          {selectedTaskIds.size > 0 && (
            <div className="flex items-center space-x-2 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-md text-xs text-amber-900 animate-in fade-in ml-2">
              <span className="font-bold">已選取 {selectedTaskIds.size} 項任務</span>
              <span className="text-[10px] text-amber-700">（拖曳編號調整順序 / 右鍵操作 / 按 Del 刪除）</span>
              <button
                onClick={() => updateSelectedTaskIds(new Set())}
                className="ml-1 text-amber-800 hover:text-amber-950 font-bold px-1 rounded hover:bg-amber-200/80"
                title="取消選取"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {/* Dependency Workflow Arrows Toggle */}
          <button
            onClick={() => setShowDependencyArrows(!showDependencyArrows)}
            title="開啟/關閉甘特圖上的任務前後流程相依性箭頭 (Predecessor Dependency Arrows)"
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              showDependencyArrows
                ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold shadow-2xs'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <GitBranch size={14} className={showDependencyArrows ? 'text-blue-600' : 'text-slate-400'} />
            <span>{showDependencyArrows ? '流程箭頭: 顯示' : '流程箭頭: 隱藏'}</span>
          </button>

          <button
            onClick={() => setOnlyCritical(!onlyCritical)}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              onlyCritical
                ? 'bg-red-50 text-red-700 border-red-200 font-semibold'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Filter size={14} />
            <span>{onlyCritical ? '僅顯示關鍵路徑' : '顯示全部任務'}</span>
          </button>

          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
            <button
              onClick={() => setDayWidth(w => Math.max(14, w - 4))}
              title="縮小時間軸"
              className="p-1 text-slate-500 hover:text-slate-800 rounded"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-xs px-2 font-mono text-slate-600">{dayWidth}px/d</span>
            <button
              onClick={() => setDayWidth(w => Math.min(50, w + 4))}
              title="放大時間軸"
              className="p-1 text-slate-500 hover:text-slate-800 rounded"
            >
              <ZoomIn size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Fixed Task Grid Table */}
        <div className="w-[500px] shrink-0 border-r border-slate-200 flex flex-col bg-white overflow-hidden shadow-xs z-10">
          {/* Table Header */}
          <div className="h-12 border-b border-slate-200 bg-slate-100/90 flex items-center text-xs font-semibold text-slate-700 divide-x divide-slate-200 select-none">
            <div
              className="w-16 text-center px-1 font-bold text-amber-900 bg-amber-50/80 flex flex-col justify-center h-full"
              title="Task ID (黃底)：左鍵點選 (可配合 Ctrl/Shift 鍵多選)；拖曳可改變順序；右鍵可增刪複製貼上"
            >
              <span>編號 ID</span>
              <span className="text-[9px] text-amber-700 font-normal">多選/拖曳</span>
            </div>
            <div
              className="flex-1 px-3 text-emerald-950 font-bold flex items-center justify-between h-full bg-emerald-50/30"
              title="任務名稱 (綠底)：滑鼠停懸時於滑鼠位置呈現完整名稱；點擊可編輯"
            >
              <span>任務名稱</span>
              <span className="text-[10px] text-emerald-700 font-normal">停懸看完整</span>
            </div>
            <div
              className="w-16 text-center px-1 font-bold text-blue-900 bg-blue-50/40 flex flex-col justify-center h-full"
              title="點擊工期數字可直接輸入天數變更 (Enter 確認 / Esc 取消)"
            >
              <span>工期</span>
              <span className="text-[9px] text-blue-600 font-normal">點擊輸入</span>
            </div>
            <div
              className="w-16 text-center px-1 font-bold text-slate-700 flex flex-col justify-center h-full"
              title="前置任務 (Predecessors)"
            >
              <span>前置</span>
              <span className="text-[9px] text-slate-500 font-normal">任務編號</span>
            </div>
            <div className="w-18 text-center px-1">開始日</div>
            <div className="w-12 text-center px-1">浮時</div>
          </div>

          {/* Table Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredTasks.map(task => {
              const isCrit = criticalSet.has(task.id);
              const isSubtask = (task.outlineLevel || 1) > 1;
              const isSummary = !!task.isSummary;
              const isSelected = selectedTaskIds.has(task.id);
              const isSubtaskOfSelected = !isSelected && selectedParentSubtaskIds.has(task.id);
              const isDragged = draggingRowIds?.includes(task.id);
              const isDropBefore = dropTarget?.taskId === task.id && dropTarget.position === 'before';
              const isDropAfter = dropTarget?.taskId === task.id && dropTarget.position === 'after';
              const indentPadding = Math.min((task.outlineLevel || 1) - 1, 4) * 16;
              const isEditingDuration = editingDurationTaskId === task.id;

              return (
                <div
                  key={task.id}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  onDragOver={e => handleRowDragOver(e, task)}
                  onDragLeave={() => {
                    if (dropTarget?.taskId === task.id) {
                      setDropTarget(null);
                    }
                  }}
                  onDrop={e => handleRowDrop(e, task)}
                  onMouseEnter={() => setHoveredTask(task)}
                  onMouseLeave={() => setHoveredTask(null)}
                  className={`flex items-center text-xs transition-colors divide-x divide-slate-100 relative select-none ${
                    isDragged ? 'opacity-40' : ''
                  } ${
                    isDropBefore ? 'border-t-2 !border-t-blue-600 bg-blue-50/60' : ''
                  } ${
                    isDropAfter ? 'border-b-2 !border-b-blue-600 bg-blue-50/60' : ''
                  } ${
                    isSelected
                      ? 'bg-amber-100/70 font-semibold'
                      : isSubtaskOfSelected
                      ? 'bg-sky-50/80 font-medium'
                      : isSummary
                      ? 'bg-slate-50 font-bold hover:bg-slate-100/80 text-slate-950'
                      : isCrit
                      ? 'bg-red-50/20 hover:bg-red-50/50'
                      : 'hover:bg-slate-50'
                  } ${hoveredTask?.id === task.id && !isSelected ? 'bg-blue-50/40' : ''}`}
                >
                  {/* Task ID / Number Column (Yellow background highlighted zone) */}
                  <div
                    draggable={true}
                    onDragStart={e => handleRowDragStart(e, task)}
                    onDragEnd={() => {
                      setDraggingRowIds(null);
                      setDropTarget(null);
                    }}
                    onClick={e => handleTaskNumberClick(e, task)}
                    onContextMenu={e => handleTaskNumberContextMenu(e, task)}
                    title={`[${task.id}]\n• 左鍵：選取此任務 (支援 Ctrl / Shift 鍵多選)\n• 拖曳：拖曳至目標列上下重新排位 (Drag to Reorder)\n• 右鍵：插入新任務 / 刪除 / 複製 / 剪下 / 貼上`}
                    className={`w-16 h-full text-center font-mono font-bold cursor-grab active:cursor-grabbing px-1 flex items-center justify-center transition-colors relative group/id ${
                      isSelected
                        ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-500 font-black shadow-xs z-10'
                        : 'bg-amber-50/80 hover:bg-amber-100/90 text-amber-900 border-r border-amber-200/60'
                    } ${isCrit && !isSelected ? '!text-red-700 font-black' : ''}`}
                  >
                    <span className="truncate">{task.id}</span>
                  </div>

                  {/* Task Name Column (Green background hover zone with tooltip) */}
                  <div
                    style={{ paddingLeft: `${12 + indentPadding}px` }}
                    onClick={() => onSelectTask(task)}
                    onContextMenu={e => handleContextMenu(e, task)}
                    onMouseEnter={e => {
                      setNameTooltip({
                        name: task.name,
                        id: task.id,
                        category: task.category,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                    onMouseMove={e => {
                      setNameTooltip(prev =>
                        prev
                          ? { ...prev, x: e.clientX, y: e.clientY }
                          : { name: task.name, id: task.id, category: task.category, x: e.clientX, y: e.clientY }
                      );
                    }}
                    onMouseLeave={() => setNameTooltip(null)}
                    className={`flex-1 pr-3 h-full truncate flex items-center space-x-1.5 cursor-pointer hover:bg-emerald-50/80 transition-colors ${
                      isSummary ? 'font-bold text-slate-950' : 'font-medium text-slate-800'
                    }`}
                  >
                    {isSummary ? (
                      <span className="text-slate-700 text-[12px] select-none shrink-0" title={getParentBadgeLabel(task)}>
                        📁
                      </span>
                    ) : isSubtask ? (
                      <span className="text-slate-400 font-mono text-[11px] select-none shrink-0">
                        ↳
                      </span>
                    ) : null}
                    {isCrit && <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />}
                    <span className="truncate">
                      {task.name}
                    </span>
                  </div>

                  {/* Duration Column (Editable on click) */}
                  <div
                    onClick={e => {
                      e.stopPropagation();
                      if (isSummary) return; // Summary tasks roll up duration
                      setEditingDurationTaskId(task.id);
                      setDurationInputVal(formatDays(task.duration));
                    }}
                    title={
                      isSummary
                        ? `${getParentBadgeLabel(task)}，由子任務自動彙總工期`
                        : '點擊可直接輸入變更工期天數 (Enter確認 / Esc取消)'
                    }
                    className={`w-16 h-full px-1 text-center font-mono flex items-center justify-center transition-colors ${
                      isSummary
                        ? 'cursor-default text-slate-900 font-bold bg-slate-50/50'
                        : 'cursor-text hover:bg-blue-50/80 group/dur'
                    }`}
                  >
                    {isEditingDuration ? (
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        autoFocus
                        value={durationInputVal}
                        onChange={e => setDurationInputVal(e.target.value)}
                        onBlur={() => {
                          const parsed = parseFloat(durationInputVal);
                          if (!isNaN(parsed) && parsed >= 0 && onUpdateTaskSchedule) {
                            onUpdateTaskSchedule(task.id, { duration: parsed });
                          }
                          setEditingDurationTaskId(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const parsed = parseFloat(durationInputVal);
                            if (!isNaN(parsed) && parsed >= 0 && onUpdateTaskSchedule) {
                              onUpdateTaskSchedule(task.id, { duration: parsed });
                            }
                            setEditingDurationTaskId(null);
                          } else if (e.key === 'Escape') {
                            setEditingDurationTaskId(null);
                          }
                        }}
                        onClick={e => e.stopPropagation()}
                        className="w-14 h-7 text-center font-mono text-xs font-bold text-blue-900 bg-white border-2 border-blue-600 rounded shadow-inner outline-none"
                      />
                    ) : isSummary ? (
                      <span className="text-slate-900 font-bold">
                        {formatDays(task.duration)}d
                      </span>
                    ) : task.duration === 0 ? (
                      <span className="text-amber-600 font-bold">0d</span>
                    ) : (
                      <span className="text-slate-700 group-hover/dur:text-blue-700 group-hover/dur:font-bold">
                        {formatDays(task.duration)}d
                      </span>
                    )}
                  </div>

                  {/* Predecessors Column */}
                  <div
                    className="w-16 h-full px-1 flex items-center justify-center overflow-x-auto overflow-y-hidden"
                    title={
                      task.predecessors && task.predecessors.length > 0
                        ? `前置任務：${task.predecessors.join(', ')}`
                        : '無前置任務'
                    }
                  >
                    {task.predecessors && task.predecessors.length > 0 ? (
                      <div className="flex items-center space-x-1">
                        {task.predecessors.map(predId => (
                          <span
                            key={predId}
                            onClick={e => {
                              e.stopPropagation();
                              updateSelectedTaskIds(new Set([predId]));
                              setLastSelectedTaskId(predId);
                            }}
                            onDoubleClick={e => {
                              e.stopPropagation();
                              setPredActionModal({
                                toTaskId: task.id,
                                fromPredId: predId,
                                editVal: predId,
                              });
                            }}
                            className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100/80 text-blue-800 border border-blue-300 hover:bg-blue-200 cursor-pointer transition-colors shadow-2xs group/chip"
                            title={`前置任務: ${predId}\n• 單擊：在圖表中選取此任務\n• 雙擊 (Double Click)：編輯或刪除此前置關聯`}
                          >
                            {predId}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-300 font-mono text-[10px]">-</span>
                    )}
                  </div>

                  {/* Start Date Column */}
                  <div className="w-18 text-center font-mono text-[11px] text-slate-500">
                    {formatDateForDisplay(task.startDate)}
                  </div>

                  {/* Total Float Column */}
                  <div
                    className={`w-12 text-center font-mono font-semibold ${
                      isCrit ? 'text-red-600' : 'text-slate-500'
                    }`}
                  >
                    {task.totalFloat}d
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Horizontal Scrollable Timeline */}
        <div className="flex-1 overflow-auto bg-slate-50/50 relative">
          <div
            style={{
              width: `${totalDays * dayWidth + 160}px`,
              minHeight: '100%',
            }}
            className="relative"
          >
            {/* Timeline Day Header */}
            <div className="h-12 border-b border-slate-200 bg-slate-100/90 sticky top-0 z-20 flex">
              {timelineDays.map(day => {
                const dateStr = addDaysToDate(projectStartDate, day);
                const isOff = isNonWorkingDay(dateStr, holidays, scheduleMode);
                const holidayLabel = getHolidayLabel(dateStr, holidays);
                const isMajor = day % 7 === 0;

                return (
                  <div
                    key={day}
                    style={{ width: `${dayWidth}px` }}
                    title={`${dateStr} (Day ${day})${holidayLabel ? ` - ${holidayLabel}` : ''}`}
                    className={`shrink-0 border-r border-slate-200/80 flex flex-col justify-between items-center py-1 text-[10px] font-mono select-none ${
                      isOff
                        ? 'bg-amber-100/50 text-amber-900 font-semibold'
                        : isMajor
                        ? 'bg-slate-200/60 font-bold text-slate-800'
                        : 'text-slate-500'
                    }`}
                  >
                    <span className="text-[8.5px] font-sans truncate w-full text-center text-amber-700/80 leading-none">
                      {isOff ? (holidayLabel?.slice(0, 2) || '休') : ''}
                    </span>
                    <span className="leading-none">{day}</span>
                  </div>
                );
              })}
            </div>

            {/* Vertical grid background lines */}
            <div className="absolute top-12 bottom-0 left-0 right-0 pointer-events-none flex">
              {timelineDays.map(day => {
                const dateStr = addDaysToDate(projectStartDate, day);
                const isOff = isNonWorkingDay(dateStr, holidays, scheduleMode);
                return (
                  <div
                    key={day}
                    style={{ width: `${dayWidth}px` }}
                    className={`shrink-0 border-r ${
                      isOff
                        ? 'bg-slate-200/40 border-slate-200/80'
                        : day % 7 === 0
                        ? 'border-slate-300/70 bg-slate-100/20'
                        : 'border-slate-200/40'
                    }`}
                  />
                );
              })}
            </div>

            {/* SVG Dependency Lines & Arrowheads Layer */}
            {showDependencyArrows && dependencyArrows.length > 0 && (
              <svg
                style={{
                  position: 'absolute',
                  top: '48px', // offset below 12 (h-12 = 48px) header
                  left: 0,
                  width: `${totalDays * dayWidth + 160}px`,
                  height: `${filteredTasks.length * ROW_HEIGHT}px`,
                  pointerEvents: 'none',
                  zIndex: 10,
                }}
              >
                <defs>
                  {/* Normal Predecessor Arrowhead (Slate-500) */}
                  <marker
                    id="gantt-arrow-normal"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerUnits="strokeWidth"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
                  </marker>
                  {/* Critical Predecessor Arrowhead (Red-600) */}
                  <marker
                    id="gantt-arrow-critical"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerUnits="strokeWidth"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#dc2626" />
                  </marker>
                  {/* Highlighted Arrowhead (Blue-600) */}
                  <marker
                    id="gantt-arrow-highlight"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerUnits="strokeWidth"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#2563eb" />
                  </marker>
                </defs>

                {dependencyArrows.map(arrow => {
                  const isHighlighted =
                    selectedTaskIds.has(arrow.fromId) ||
                    selectedTaskIds.has(arrow.toId) ||
                    hoveredTask?.id === arrow.fromId ||
                    hoveredTask?.id === arrow.toId;

                  const strokeColor = isHighlighted
                    ? '#2563eb'
                    : arrow.isCritical
                    ? '#dc2626'
                    : '#64748b';

                  const markerId = isHighlighted
                    ? 'url(#gantt-arrow-highlight)'
                    : arrow.isCritical
                    ? 'url(#gantt-arrow-critical)'
                    : 'url(#gantt-arrow-normal)';

                  const strokeWidth = isHighlighted ? 2.5 : arrow.isCritical ? 2 : 1.5;

                  return (
                    <g
                      key={arrow.id}
                      className="transition-all cursor-pointer group/garrow"
                      onDoubleClick={e => {
                        e.stopPropagation();
                        setPredActionModal({
                          toTaskId: arrow.toId,
                          fromPredId: arrow.fromId,
                          editVal: arrow.fromId,
                        });
                      }}
                    >
                      {/* Invisible wider hit area for easy hover and double click */}
                      <path
                        d={arrow.pathD}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="18"
                        style={{ pointerEvents: 'stroke' }}
                        className="cursor-pointer"
                      >
                        <title>{`相依關聯：[${arrow.fromId}] ➔ [${arrow.toId}]\n👉 雙擊 (Double Click) 可刪除或編輯此前置任務`}</title>
                      </path>

                      {/* Connection curve / step */}
                      <path
                        d={arrow.pathD}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={arrow.isCritical && !isHighlighted ? 'none' : undefined}
                        markerEnd={markerId}
                        opacity={isHighlighted ? 1 : 0.75}
                        style={{ pointerEvents: 'stroke' }}
                        className="transition-all duration-150 group-hover/garrow:stroke-blue-600 group-hover/garrow:stroke-[3px]"
                      />
                      {/* Start dot at predecessor finish point */}
                      <circle
                        cx={arrow.fromX}
                        cy={arrow.fromY}
                        r={isHighlighted ? 3.5 : 2.5}
                        fill={strokeColor}
                        style={{ pointerEvents: 'none' }}
                      />
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Bars rows */}
            <div className="pt-0">
              {filteredTasks.map(task => {
                const isCrit = criticalSet.has(task.id);
                const isDraggingThis = barDrag?.taskId === task.id;

                const es = isDraggingThis ? barDrag.currentStartDay : (task.earlyStart ?? 0);
                const duration = isDraggingThis ? barDrag.currentDuration : task.duration;
                const ef = es + duration;
                const float = task.totalFloat ?? 0;

                // Calendar-accurate positioning based on task.startDate & finishDate
                const calStart = task.startDate ? getCalendarDayDifference(projectStartDate, task.startDate) : es;
                const calFinish = task.finishDate ? getCalendarDayDifference(projectStartDate, task.finishDate) : ef;
                const calSpan = task.duration === 0 ? 0 : Math.max(1, calFinish - calStart + 1);

                const barLeft = isDraggingThis ? es * dayWidth : calStart * dayWidth;
                const barWidth = isDraggingThis
                  ? Math.max(duration * dayWidth, 14)
                  : task.duration === 0
                  ? 16
                  : Math.max(calSpan * dayWidth, 14);
                const slackWidth = float * dayWidth;

                const isSelected = selectedTaskIds.has(task.id);
                const isSubtaskOfSelected = !isSelected && selectedParentSubtaskIds.has(task.id);

                return (
                  <div
                    key={task.id}
                    style={{ height: `${ROW_HEIGHT}px` }}
                    className={`relative flex items-center border-b border-slate-100 transition-colors ${
                      isSubtaskOfSelected ? 'bg-sky-50/40' : ''
                    } ${
                      hoveredTask?.id === task.id ? 'bg-blue-50/20' : ''
                    }`}
                  >
                    {/* Float / Slack Bar (Dashed striped) */}
                    {float > 0 && !isDraggingThis && (
                      <div
                        style={{
                          left: `${barLeft + barWidth}px`,
                          width: `${slackWidth}px`,
                          height: '18px',
                        }}
                        title={`浮時 (Slack): ${float} 天`}
                        className="absolute rounded-r border border-dashed border-slate-400 bg-slate-200/60 flex items-center justify-center text-[9px] text-slate-500 font-mono pointer-events-none"
                      >
                        +{float}d
                      </div>
                    )}

                    {/* Main Task Bar: Summary Bar, Milestone Diamond, or Standard Bar */}
                    {task.isSummary ? (
                      /* MS Project Summary Task Bar (Bracket style) */
                      <div
                        style={{
                          left: `${barLeft}px`,
                          width: `${barWidth}px`,
                          height: '24px',
                        }}
                        onClick={() => onSelectTask(task)}
                        onContextMenu={e => handleContextMenu(e, task)}
                        onMouseEnter={() => setHoveredTask(task)}
                        onMouseLeave={() => setHoveredTask(null)}
                        title={`[${getParentBadgeLabel(task)}] [${task.id}] ${task.name}\n開始: Day ${formatDays(es)} (${formatDateForDisplay(task.startDate)})\n結束: Day ${formatDays(ef)} (${formatDateForDisplay(task.finishDate)})\n彙總工期: ${formatDays(duration)} 天\n👉 此為父階項目，由子任務自動彙總進度與時程\n👉 按右鍵可縮排/凸排`}
                        className="absolute flex flex-col justify-center cursor-pointer select-none group z-15"
                      >
                        <div className="relative w-full h-[8px] flex items-center">
                          {/* Main horizontal summary bar */}
                          <div
                            className={`w-full h-[7px] rounded-xs ${
                              isCrit ? 'bg-red-800 shadow-xs' : 'bg-slate-800 shadow-xs'
                            }`}
                          />
                          {/* Left downward bracket */}
                          <div
                            className={`absolute left-0 top-[6px] w-0 h-0 border-t-[7px] border-r-[7px] border-r-transparent ${
                              isCrit ? 'border-t-red-800' : 'border-t-slate-800'
                            }`}
                          />
                          {/* Right downward bracket */}
                          <div
                            className={`absolute right-0 top-[6px] w-0 h-0 border-t-[7px] border-l-[7px] border-l-transparent ${
                              isCrit ? 'border-t-red-800' : 'border-t-slate-800'
                            }`}
                          />
                        </div>

                        {/* Summary task label beside bar */}
                        <span className="absolute left-full ml-2 text-[11px] font-bold text-slate-900 whitespace-nowrap pointer-events-none flex items-center space-x-1 bg-white/80 px-1 rounded shadow-2xs">
                          <span>📁 {task.name}</span>
                          <span className="text-[10px] font-mono text-slate-600 font-semibold">({getParentBadgeLabel(task)})</span>
                          <span className="text-[10px] font-mono text-slate-400 font-normal">({formatDays(duration)}d)</span>
                        </span>
                      </div>
                    ) : duration === 0 ? (
                      /* Milestone Diamond (MS Project standard) */
                      <div
                        style={{
                          left: `${barLeft}px`,
                          willChange: isDraggingThis ? 'left' : 'auto',
                        }}
                        onMouseDown={e => handleBarMouseDown(e, task, 'move')}
                        onContextMenu={e => handleContextMenu(e, task)}
                        onClick={() => onSelectTask(task)}
                        onMouseEnter={() => setHoveredTask(task)}
                        onMouseLeave={() => setHoveredTask(null)}
                        title={`[里程碑] [${task.id}] ${task.name}\n達成日期: Day ${es} (${formatDateForDisplay(task.startDate)})\n工期: 0 天\n👉 拖曳可調整里程碑日期\n👉 按右鍵縮排/凸排`}
                        className="absolute -translate-x-1/2 flex items-center cursor-grab active:cursor-grabbing select-none z-20 group"
                      >
                        {/* 45-degree Rotated Diamond */}
                        <div
                          className={`w-[18px] h-[18px] rotate-45 rounded-[3px] shadow-md border-2 transition-transform duration-75 group-hover:scale-125 flex items-center justify-center ${
                            isCrit
                              ? 'bg-red-600 border-red-200 ring-2 ring-red-400'
                              : 'bg-amber-500 border-amber-200 ring-2 ring-amber-400'
                          } ${isDraggingThis ? 'scale-125 !ring-4 !ring-blue-500' : ''}`}
                        >
                          <div className="w-1.5 h-1.5 bg-white rounded-full" />
                        </div>

                        {/* Task label beside diamond */}
                        <span className="ml-2.5 text-[11px] font-bold text-slate-800 whitespace-nowrap bg-white/95 px-1.5 py-0.5 rounded shadow-xs border border-slate-200 pointer-events-none">
                          {task.name}
                        </span>

                        {/* Drag tooltip indicator */}
                        {isDraggingThis && (
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow-lg whitespace-nowrap pointer-events-none z-40 border border-slate-700 animate-in fade-in">
                            里程碑移至: Day {es}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Standard Task Bar */
                      <div
                        style={{
                          left: `${barLeft}px`,
                          width: `${barWidth}px`,
                          height: '26px',
                          willChange: isDraggingThis ? 'left, width' : 'auto',
                        }}
                        onMouseDown={e => handleBarMouseDown(e, task, 'move')}
                        onContextMenu={e => handleContextMenu(e, task)}
                        onClick={() => onSelectTask(task)}
                        onMouseEnter={() => setHoveredTask(task)}
                        onMouseLeave={() => setHoveredTask(null)}
                        title={`[${task.id}] ${task.name}\n開始: Day ${es}\n結束: Day ${ef}\n工期: ${duration} 天\n👉 拖曳整體調整開始時間，拖曳右緣調整工期天數\n👉 按右鍵縮排為子任務`}
                        className={`group absolute rounded-md shadow-xs flex items-center px-2 cursor-grab active:cursor-grabbing select-none transition-all duration-75 hover:brightness-105 ${
                          isDraggingThis ? '!transition-none ring-2 ring-blue-500 shadow-xl z-30' : ''
                        } ${
                          isSubtaskOfSelected ? 'ring-2 !ring-sky-400 ring-offset-1 shadow-md' : ''
                        } ${
                          isCrit
                            ? 'bg-gradient-to-r from-red-600 to-rose-500 text-white font-bold ring-1 ring-red-400'
                            : 'bg-gradient-to-r from-blue-600 to-indigo-500 text-white font-medium ring-1 ring-blue-400'
                        }`}
                      >
                        <span className="text-[11px] truncate drop-shadow-xs flex-1 pointer-events-none">
                          {task.name}
                        </span>

                        {/* Right-edge resize handle */}
                        <div
                          onMouseDown={e => handleBarMouseDown(e, task, 'resize')}
                          title="拖曳調整工期天數"
                          className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/30 rounded-r flex items-center justify-center"
                        >
                          <div className="w-0.5 h-3 bg-white/60 rounded-full" />
                        </div>

                        {/* Drag tooltip indicator */}
                        {isDraggingThis && (
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow-lg whitespace-nowrap pointer-events-none z-40 border border-slate-700 animate-in fade-in">
                            {barDrag.mode === 'move'
                              ? `開始: Day ${es}`
                              : `工期: ${duration} 天`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Complete Task Name Tooltip at Mouse Position */}
      {nameTooltip && (
        <div
          style={{
            position: 'fixed',
            left: `${Math.min(nameTooltip.x + 14, window.innerWidth - 360)}px`,
            top: `${Math.min(nameTooltip.y + 14, window.innerHeight - 90)}px`,
          }}
          className="z-50 pointer-events-none bg-slate-900/95 text-white backdrop-blur-md px-3.5 py-2.5 rounded-xl shadow-2xl border border-slate-700 max-w-sm animate-in fade-in zoom-in-95 duration-75 select-none"
        >
          <div className="flex items-center space-x-1.5 mb-1 text-[10px]">
            <span className="font-mono bg-blue-600 px-1.5 py-0.2 rounded font-bold text-white">
              {nameTooltip.id}
            </span>
            {nameTooltip.category && (
              <span className="text-slate-300 bg-slate-800 px-1.5 py-0.2 rounded font-medium">
                {nameTooltip.category}
              </span>
            )}
          </div>
          <div className="text-xs font-semibold text-slate-100 leading-relaxed break-words">
            {nameTooltip.name}
          </div>
        </div>
      )}

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <TaskContextMenu
          task={contextMenu.task}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onIndent={t => {
            const ids = selectedTaskIds.has(t.id) && selectedTaskIds.size > 1
              ? Array.from(selectedTaskIds)
              : [t.id];
            onIndentTask?.(ids);
          }}
          onOutdent={t => {
            const ids = selectedTaskIds.has(t.id) && selectedTaskIds.size > 1
              ? Array.from(selectedTaskIds)
              : [t.id];
            onOutdentTask?.(ids);
          }}
          onEdit={t => onSelectTask(t)}
          onDelete={id => {
            if (selectedTaskIds.size > 1 && selectedTaskIds.has(id) && onDeleteMultipleTasks) {
              onDeleteMultipleTasks(Array.from(selectedTaskIds));
              updateSelectedTaskIds(new Set());
            } else {
              onDeleteTask?.(id);
              updateSelectedTaskIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            }
          }}
          onInsertAbove={t => onInsertTask?.(t.id, 'before')}
          onInsertBelow={t => onInsertTask?.(t.id, 'after')}
          onCopy={t => {
            const ids = selectedTaskIds.has(t.id) && selectedTaskIds.size > 0
              ? Array.from(selectedTaskIds)
              : [t.id];
            onCopyTasks?.(ids);
          }}
          onCut={t => {
            const ids = selectedTaskIds.has(t.id) && selectedTaskIds.size > 0
              ? Array.from(selectedTaskIds)
              : [t.id];
            onCutTasks?.(ids);
          }}
          onPaste={t => onPasteTasks?.(t.id)}
          hasClipboard={hasClipboard}
          clipboardCount={clipboardCount}
          selectedCount={selectedTaskIds.has(contextMenu.task.id) ? selectedTaskIds.size : 1}
          canIndent={
            selectedTaskIds.has(contextMenu.task.id) && selectedTaskIds.size > 1
              ? tasks.findIndex(t => t.id === Array.from(selectedTaskIds)[0]) > 0
              : tasks.findIndex(t => t.id === contextMenu.task.id) > 0
          }
          canOutdent={
            selectedTaskIds.has(contextMenu.task.id) && selectedTaskIds.size > 1
              ? Array.from(selectedTaskIds).some(id => (tasks.find(t => t.id === id)?.outlineLevel || 1) > 1)
              : (contextMenu.task.outlineLevel || 1) > 1
          }
        />
      )}

      {/* Predecessor Action Modal: Delete or Edit Task ID Number */}
      {predActionModal && (() => {
        const toTask = tasks.find(t => t.id === predActionModal.toTaskId);
        const fromTask = tasks.find(t => t.id === predActionModal.fromPredId);

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in"
            onClick={() => setPredActionModal(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 flex flex-col space-y-4 animate-in zoom-in-95 select-text"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                    <GitBranch size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">前置任務依賴管理</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      您已選中前置任務：<span className="font-mono font-bold text-blue-700">{predActionModal.fromPredId}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPredActionModal(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Task Connection Overview */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between font-mono">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-sans">前置任務 (Predecessor)</span>
                    <span className="font-bold text-slate-800">
                      [{predActionModal.fromPredId}] {fromTask?.name || ''}
                    </span>
                  </div>
                  <span className="text-slate-400 font-bold px-2">➔ 依賴 ➔</span>
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] text-slate-400 font-sans">後續任務 (Successor)</span>
                    <span className="font-bold text-slate-800">
                      [{predActionModal.toTaskId}] {toTask?.name || ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Edit Predecessor Task ID Number Section */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                  <Edit3 size={14} className="text-blue-600" />
                  <span>編輯更換前置 Task ID：</span>
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={predActionModal.editVal}
                    onChange={e =>
                      setPredActionModal(prev => (prev ? { ...prev, editVal: e.target.value.trim() } : null))
                    }
                    placeholder="輸入新前置任務編號 (例如 T1, T2...)"
                    className="flex-1 px-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none uppercase"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (
                          predActionModal.editVal &&
                          predActionModal.editVal !== predActionModal.fromPredId &&
                          onUpdatePredecessor
                        ) {
                          onUpdatePredecessor(
                            predActionModal.toTaskId,
                            predActionModal.fromPredId,
                            predActionModal.editVal
                          );
                        }
                        setPredActionModal(null);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        predActionModal.editVal &&
                        predActionModal.editVal !== predActionModal.fromPredId &&
                        onUpdatePredecessor
                      ) {
                        onUpdatePredecessor(
                          predActionModal.toTaskId,
                          predActionModal.fromPredId,
                          predActionModal.editVal
                        );
                      }
                      setPredActionModal(null);
                    }}
                    disabled={
                      !predActionModal.editVal ||
                      predActionModal.editVal === predActionModal.fromPredId
                    }
                    className="px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors shrink-0"
                  >
                    儲存變更
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  可輸入現有任務的 ID 編號以直接變換此前置任務依賴。
                </p>
              </div>

              {/* Action Buttons: Delete or Cancel */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    if (onRemoveDependency) {
                      onRemoveDependency(predActionModal.fromPredId, predActionModal.toTaskId);
                    }
                    setPredActionModal(null);
                  }}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 hover:text-red-700 transition-colors flex items-center space-x-1.5"
                >
                  <Trash2 size={14} />
                  <span>刪除此前置任務</span>
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setPredActionModal(null)}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

