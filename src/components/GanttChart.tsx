import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Task } from '../core/types';
import { formatDateForDisplay } from '../core/cpmEngine';
import { TaskContextMenu } from './TaskContextMenu';
import { Calendar, Filter, ZoomIn, ZoomOut, MoveHorizontal } from 'lucide-react';

interface GanttChartProps {
  tasks: Task[];
  criticalPathDuration: number;
  criticalPathTaskIds: string[];
  projectStartDate: string;
  onSelectTask: (task: Task) => void;
  onUpdateTaskSchedule?: (taskId: string, updates: { manualEarlyStart?: number; duration?: number }) => void;
  onIndentTask?: (task: Task) => void;
  onOutdentTask?: (task: Task) => void;
  onDeleteTask?: (taskId: string) => void;
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
  onSelectTask,
  onUpdateTaskSchedule,
  onIndentTask,
  onOutdentTask,
  onDeleteTask,
}) => {
  const [dayWidth, setDayWidth] = useState(24); // pixels per day
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [hoveredTask, setHoveredTask] = useState<Task | null>(null);

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

  const totalDays = Math.max(criticalPathDuration + 15, 40);

  // Generate day tick markers
  const timelineDays = useMemo(() => {
    const days: number[] = [];
    for (let d = 0; d <= totalDays; d++) {
      days.push(d);
    }
    return days;
  }, [totalDays]);

  const ROW_HEIGHT = 44;

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

  const handleContextMenu = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      task,
      x: e.clientX,
      y: e.clientY,
    });
  };

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
            <span className="ml-4 text-slate-400 font-normal flex items-center space-x-1">
              <MoveHorizontal size={13} />
              <span>拖曳任務條可調整開始時間與工期 / 按右鍵縮排</span>
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
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
        <div className="w-[430px] shrink-0 border-r border-slate-200 flex flex-col bg-white overflow-hidden shadow-xs z-10">
          {/* Table Header */}
          <div className="h-12 border-b border-slate-200 bg-slate-100/80 flex items-center text-xs font-semibold text-slate-600 divide-x divide-slate-200">
            <div className="w-14 text-center px-1">ID</div>
            <div className="flex-1 px-3">任務名稱 (右鍵縮排)</div>
            <div className="w-14 text-center px-1">工期</div>
            <div className="w-20 text-center px-1">開始日</div>
            <div className="w-14 text-center px-1">浮時</div>
          </div>

          {/* Table Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredTasks.map(task => {
              const isCrit = criticalSet.has(task.id);
              const isSubtask = (task.outlineLevel || 1) > 1;
              const indentPadding = Math.min((task.outlineLevel || 1) - 1, 4) * 16;

              return (
                <div
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  onContextMenu={e => handleContextMenu(e, task)}
                  onMouseEnter={() => setHoveredTask(task)}
                  onMouseLeave={() => setHoveredTask(null)}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  title="左鍵點擊編輯 / 右鍵開啟選單 (縮排/凸排/刪除)"
                  className={`flex items-center text-xs cursor-pointer transition-colors divide-x divide-slate-100 ${
                    isCrit ? 'bg-red-50/20 hover:bg-red-50/50' : 'hover:bg-slate-50'
                  } ${hoveredTask?.id === task.id ? 'bg-blue-50/40' : ''}`}
                >
                  <div
                    className={`w-14 text-center font-mono font-bold ${
                      isCrit ? 'text-red-600' : 'text-slate-500'
                    }`}
                  >
                    {task.id}
                  </div>
                  <div
                    style={{ paddingLeft: `${12 + indentPadding}px` }}
                    className="flex-1 pr-3 font-medium text-slate-800 truncate flex items-center space-x-1.5"
                  >
                    {isSubtask && (
                      <span className="text-slate-400 font-mono text-[11px] select-none shrink-0">
                        ↳
                      </span>
                    )}
                    {isCrit && <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />}
                    <span className="truncate" title={task.name}>
                      {task.name}
                    </span>
                  </div>
                  <div className="w-14 text-center font-mono text-slate-600">
                    {task.duration}d
                  </div>
                  <div className="w-20 text-center font-mono text-[11px] text-slate-500">
                    {formatDateForDisplay(task.startDate)}
                  </div>
                  <div
                    className={`w-14 text-center font-mono font-semibold ${
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
                const isMajor = day % 7 === 0;
                return (
                  <div
                    key={day}
                    style={{ width: `${dayWidth}px` }}
                    className={`shrink-0 border-r border-slate-200/80 flex flex-col justify-end items-center pb-1 text-[10px] font-mono ${
                      isMajor
                        ? 'bg-slate-200/60 font-bold text-slate-800'
                        : 'text-slate-400'
                    }`}
                  >
                    {day}
                  </div>
                );
              })}
            </div>

            {/* Vertical grid background lines */}
            <div className="absolute top-12 bottom-0 left-0 right-0 pointer-events-none flex">
              {timelineDays.map(day => (
                <div
                  key={day}
                  style={{ width: `${dayWidth}px` }}
                  className={`shrink-0 border-r ${
                    day % 7 === 0 ? 'border-slate-300/70 bg-slate-100/20' : 'border-slate-200/40'
                  }`}
                />
              ))}
            </div>

            {/* Bars rows */}
            <div className="pt-0">
              {filteredTasks.map(task => {
                const isCrit = criticalSet.has(task.id);
                const isDraggingThis = barDrag?.taskId === task.id;

                const es = isDraggingThis ? barDrag.currentStartDay : (task.earlyStart ?? 0);
                const duration = isDraggingThis ? barDrag.currentDuration : task.duration;
                const ef = es + duration;
                const float = task.totalFloat ?? 0;

                const barLeft = es * dayWidth;
                const barWidth = Math.max(duration * dayWidth, 14);
                const slackWidth = float * dayWidth;

                return (
                  <div
                    key={task.id}
                    style={{ height: `${ROW_HEIGHT}px` }}
                    className={`relative flex items-center border-b border-slate-100 transition-colors ${
                      hoveredTask?.id === task.id ? 'bg-blue-50/20' : ''
                    }`}
                  >
                    {/* Float / Slack Bar (Dashed striped) */}
                    {float > 0 && !isDraggingThis && (
                      <div
                        style={{
                          left: `${(task.earlyStart ?? 0) * dayWidth + task.duration * dayWidth}px`,
                          width: `${slackWidth}px`,
                          height: '18px',
                        }}
                        title={`浮時 (Slack): ${float} 天`}
                        className="absolute rounded-r border border-dashed border-slate-400 bg-slate-200/60 flex items-center justify-center text-[9px] text-slate-500 font-mono pointer-events-none"
                      >
                        +{float}d
                      </div>
                    )}

                    {/* Main Task Bar */}
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
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <TaskContextMenu
          task={contextMenu.task}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onIndent={t => onIndentTask?.(t)}
          onOutdent={t => onOutdentTask?.(t)}
          onEdit={t => onSelectTask(t)}
          onDelete={id => onDeleteTask?.(id)}
          canIndent={tasks.findIndex(t => t.id === contextMenu.task.id) > 0}
          canOutdent={(contextMenu.task.outlineLevel || 1) > 1}
        />
      )}
    </div>
  );
};
