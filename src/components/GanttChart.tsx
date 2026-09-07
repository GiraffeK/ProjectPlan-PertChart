import React, { useState, useMemo } from 'react';
import type { Task } from '../core/types';
import { formatDateForDisplay } from '../core/cpmEngine';
import { Calendar, Filter, ZoomIn, ZoomOut } from 'lucide-react';

interface GanttChartProps {
  tasks: Task[];
  criticalPathDuration: number;
  criticalPathTaskIds: string[];
  projectStartDate: string;
  onSelectTask: (task: Task) => void;
}

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  criticalPathDuration,
  criticalPathTaskIds,
  projectStartDate,
  onSelectTask,
}) => {
  const [dayWidth, setDayWidth] = useState(24); // pixels per day
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [hoveredTask, setHoveredTask] = useState<Task | null>(null);

  const criticalSet = useMemo(() => new Set(criticalPathTaskIds), [criticalPathTaskIds]);

  const filteredTasks = useMemo(() => {
    if (!onlyCritical) return tasks;
    return tasks.filter(t => criticalSet.has(t.id));
  }, [tasks, onlyCritical, criticalSet]);

  const totalDays = Math.max(criticalPathDuration + 10, 40);

  // Generate day tick markers
  const timelineDays = useMemo(() => {
    const days: number[] = [];
    for (let d = 0; d <= totalDays; d++) {
      days.push(d);
    }
    return days;
  }, [totalDays]);

  const ROW_HEIGHT = 44;

  return (
    <div className="flex flex-col w-full h-full bg-white select-none overflow-hidden">
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
            <span>關鍵任務 (Critical)</span>
            <span className="w-3 h-3 rounded-xs bg-blue-500 ml-3" />
            <span>非關鍵任務 (Non-critical)</span>
            <span className="w-3 h-3 rounded-xs bg-slate-200 border border-dashed border-slate-400 ml-3" />
            <span>浮時 (Slack / Float)</span>
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
        <div className="w-[420px] shrink-0 border-r border-slate-200 flex flex-col bg-white overflow-hidden shadow-xs z-10">
          {/* Table Header */}
          <div className="h-12 border-b border-slate-200 bg-slate-100/80 flex items-center text-xs font-semibold text-slate-600 divide-x divide-slate-200">
            <div className="w-14 text-center px-1">ID</div>
            <div className="flex-1 px-3">任務名稱</div>
            <div className="w-14 text-center px-1">工期</div>
            <div className="w-20 text-center px-1">開始日</div>
            <div className="w-14 text-center px-1">浮時</div>
          </div>

          {/* Table Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredTasks.map(task => {
              const isCrit = criticalSet.has(task.id);
              return (
                <div
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  onMouseEnter={() => setHoveredTask(task)}
                  onMouseLeave={() => setHoveredTask(null)}
                  style={{ height: `${ROW_HEIGHT}px` }}
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
                  <div className="flex-1 px-3 font-medium text-slate-800 truncate flex items-center space-x-1.5">
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
              width: `${totalDays * dayWidth + 120}px`,
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
                const es = task.earlyStart ?? 0;
                const ef = task.earlyFinish ?? es + task.duration;
                const lf = task.lateFinish ?? ef;
                const float = task.totalFloat ?? 0;

                const barLeft = es * dayWidth;
                const barWidth = Math.max(task.duration * dayWidth, 3);
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
                    {float > 0 && (
                      <div
                        style={{
                          left: `${barLeft + barWidth}px`,
                          width: `${slackWidth}px`,
                          height: '18px',
                        }}
                        title={`浮時 (Slack): ${float} 天 (最晚結束: Day ${lf})`}
                        className="absolute rounded-r border border-dashed border-slate-400 bg-slate-200/60 flex items-center justify-center text-[9px] text-slate-500 font-mono"
                      >
                        +{float}d
                      </div>
                    )}

                    {/* Main Task Bar */}
                    <div
                      style={{
                        left: `${barLeft}px`,
                        width: `${barWidth}px`,
                        height: '24px',
                      }}
                      onClick={() => onSelectTask(task)}
                      onMouseEnter={() => setHoveredTask(task)}
                      onMouseLeave={() => setHoveredTask(null)}
                      title={`[${task.id}] ${task.name}\n開始: Day ${es} (${task.startDate})\n結束: Day ${ef} (${task.finishDate})\n工期: ${task.duration} 天\n浮時: ${float} 天`}
                      className={`absolute rounded-md shadow-xs flex items-center px-2 cursor-pointer transition-all duration-150 hover:brightness-105 ${
                        isCrit
                          ? 'bg-gradient-to-r from-red-600 to-rose-500 text-white font-bold ring-2 ring-red-300'
                          : 'bg-gradient-to-r from-blue-600 to-indigo-500 text-white font-medium'
                      }`}
                    >
                      <span className="text-[11px] truncate select-none drop-shadow-xs">
                        {task.name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
