import React from 'react';
import type { Task } from '../core/types';
import { formatDateForDisplay, formatDays, getParentBadgeLabel } from '../core/cpmEngine';
import { Plus, Trash2, Edit2 } from 'lucide-react';

interface TaskTableProps {
  tasks: Task[];
  criticalPathTaskIds: string[];
  onSelectTask: (task: Task) => void;
  onAddTask: () => void;
  onDeleteTask: (taskId: string) => void;
}

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  criticalPathTaskIds,
  onSelectTask,
  onAddTask,
  onDeleteTask,
}) => {
  const criticalSet = new Set(criticalPathTaskIds);

  return (
    <div className="flex flex-col w-full h-full bg-white overflow-hidden select-none">
      {/* Table Header Controls */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-slate-50/70">
        <div className="flex items-center space-x-3">
          <span className="text-sm font-semibold text-slate-700">
            任務明細資料表 (WBS Task Grid)
          </span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-medium">
            共 {tasks.length} 個任務
          </span>
        </div>
        <button
          onClick={onAddTask}
          className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
        >
          <Plus size={15} />
          <span>新增任務</span>
        </button>
      </div>

      {/* Main Table Container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs text-slate-700 border-collapse">
          <thead className="bg-slate-100/80 text-slate-600 font-semibold border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 w-16 text-center">ID</th>
              <th className="px-4 py-3">任務名稱 (Task Name)</th>
              <th className="px-3 py-3 w-28">分類 (Category)</th>
              <th className="px-3 py-3 w-20 text-center">工期 (天)</th>
              <th className="px-4 py-3 w-44">前置依賴 (Predecessors)</th>
              <th className="px-3 py-3 w-24 text-center">最早開始 (ES)</th>
              <th className="px-3 py-3 w-24 text-center">最早完成 (EF)</th>
              <th className="px-3 py-3 w-24 text-center">最晚開始 (LS)</th>
              <th className="px-3 py-3 w-24 text-center">最晚完成 (LF)</th>
              <th className="px-3 py-3 w-20 text-center">總浮時 (TF)</th>
              <th className="px-3 py-3 w-28 text-center">關鍵路徑</th>
              <th className="px-4 py-3 w-24 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map(task => {
              const isCrit = criticalSet.has(task.id);
              const isSummary = !!task.isSummary;
              const isSubtask = (task.outlineLevel || 1) > 1;
              const indentPadding = Math.min((task.outlineLevel || 1) - 1, 4) * 16;

              return (
                <tr
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${
                    isSummary
                      ? 'bg-slate-50/80 font-bold hover:bg-slate-100/90 text-slate-950'
                      : isCrit
                      ? 'bg-red-50/20'
                      : ''
                  }`}
                >
                  <td className={`px-4 py-2.5 text-center font-mono font-bold ${isSummary ? 'text-slate-900' : 'text-slate-600'}`}>
                    {task.id}
                  </td>
                  <td
                    style={{ paddingLeft: `${16 + indentPadding}px` }}
                    className={`px-4 py-2.5 ${isSummary ? 'font-bold text-slate-950' : 'font-medium text-slate-900'}`}
                  >
                    <div className="flex items-center space-x-2">
                      {isSummary ? (
                        <span className="text-slate-700 text-sm shrink-0" title={getParentBadgeLabel(task)}>
                          📁
                        </span>
                      ) : isSubtask ? (
                        <span className="text-slate-400 font-mono text-[11px] shrink-0 select-none">
                          ↳
                        </span>
                      ) : null}
                      {isCrit && (
                        <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
                      )}
                      <span>{task.name}</span>
                      {task.anchor && task.anchor.enabled && task.anchor.targetTaskId && (
                        <span
                          className="inline-flex items-center space-x-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0 ml-1.5"
                          title={`⚓ 反向錨定至「${tasks.find(t => t.id === task.anchor?.targetTaskId)?.name || task.anchor.targetTaskId}」：提前 ${task.anchor.leadDays} ${task.anchor.useWorkingDays !== false ? '個工作天' : '天'}`}
                        >
                          <span>⚓ {tasks.find(t => t.id === task.anchor?.targetTaskId)?.name || task.anchor?.targetTaskId} -{task.anchor?.leadDays}d</span>
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">
                    {task.category ? (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px] font-medium text-slate-700">
                        {task.category}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-800">
                    {isSummary ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-200/80 text-slate-900 text-[11px] font-bold border border-slate-300" title={`${getParentBadgeLabel(task)}，由子項目自動彙總工期`}>
                        📁 {formatDays(task.duration)} ({getParentBadgeLabel(task)})
                      </span>
                    ) : task.duration === 0 ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[11px] font-bold border border-amber-200">
                        0
                      </span>
                    ) : (
                      formatDays(task.duration)
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">
                    {task.predecessors && task.predecessors.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {task.predecessors.map(p => (
                          <span
                            key={p}
                            className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px]"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">無</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono text-slate-600">
                    {task.earlyStart} ({formatDateForDisplay(task.startDate)})
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono text-slate-600">
                    {task.earlyFinish} ({formatDateForDisplay(task.finishDate)})
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono text-slate-600">
                    {task.lateStart}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono text-slate-600">
                    {task.lateFinish}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-center font-mono font-bold ${
                      isCrit ? 'text-red-600' : 'text-slate-600'
                    }`}
                  >
                    {task.totalFloat}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {isCrit ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                        Critical
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Normal</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => onSelectTask(task)}
                        title="編輯任務"
                        className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`確定要刪除任務 [${task.id}] ${task.name} 嗎？`)) {
                            onDeleteTask(task.id);
                          }
                        }}
                        title="刪除任務"
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
