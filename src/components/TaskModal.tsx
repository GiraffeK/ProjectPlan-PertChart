import React, { useState, useEffect, useRef } from 'react';
import type { Task } from '../core/types';
import { formatDays, getParentBadgeLabel } from '../core/cpmEngine';
import { X, Trash2, Check, Anchor } from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskData: Partial<Task>) => void;
  onDelete?: (taskId: string) => void;
  initialTask?: Task | null;
  existingTasks: Task[];
  defaultPredecessors?: string[];
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialTask,
  existingTasks,
  defaultPredecessors,
}) => {
  const [name, setName] = useState('');
  const [duration, setDuration] = useState(1);
  const [category, setCategory] = useState('');
  const [summaryLabel, setSummaryLabel] = useState('');
  const [predecessors, setPredecessors] = useState<string[]>([]);
  const [inheritedFromParent, setInheritedFromParent] = useState<{ parentName: string; predIds: string[] } | null>(null);

  // Reverse Anchor state (e.g. SMT 齊料日倒推錨定)
  const [anchorEnabled, setAnchorEnabled] = useState(false);
  const [anchorLeadDays, setAnchorLeadDays] = useState(7);
  const [anchorUseWorkingDays, setAnchorUseWorkingDays] = useState(true);

  // Automatically find all successor tasks that depend on this task (tasks that have this task in their predecessors)
  const successorTasks = initialTask
    ? existingTasks.filter(t => (t.predecessors || []).includes(initialTask.id))
    : [];
  const primarySuccessor = successorTasks.length > 0 ? successorTasks[0] : null;

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialTask) {
      setName(initialTask.name);
      setDuration(initialTask.duration);
      setCategory(initialTask.category || '');
      setSummaryLabel(initialTask.summaryLabel || '');

      // Initialize anchor state
      if (initialTask.anchor && initialTask.anchor.enabled) {
        setAnchorEnabled(true);
        setAnchorLeadDays(initialTask.anchor.leadDays || 7);
        setAnchorUseWorkingDays(initialTask.anchor.useWorkingDays !== false);
      } else {
        setAnchorEnabled(false);
        setAnchorLeadDays(7);
        setAnchorUseWorkingDays(true);
      }

      let initialPreds = initialTask.predecessors || [];
      // Inherit parent's predecessors if this task is the first child of its parent
      if (initialTask.parentId) {
        const parent = existingTasks.find(t => t.id === initialTask.parentId);
        if (parent && parent.predecessors && parent.predecessors.length > 0) {
          const siblings = existingTasks.filter(t => t.parentId === parent.id);
          if (siblings.length > 0 && siblings[0].id === initialTask.id) {
            initialPreds = Array.from(new Set([...initialPreds, ...parent.predecessors]));
            setInheritedFromParent({ parentName: `[${parent.id}] ${parent.name}`, predIds: parent.predecessors });
          } else {
            setInheritedFromParent(null);
          }
        } else {
          setInheritedFromParent(null);
        }
      } else {
        setInheritedFromParent(null);
      }

      setPredecessors(initialPreds);
    } else {
      setName('');
      setDuration(1);
      setCategory('');
      setSummaryLabel('');
      setPredecessors(defaultPredecessors || []);
      setInheritedFromParent(null);
      setAnchorEnabled(false);
      setAnchorLeadDays(7);
      setAnchorUseWorkingDays(true);
    }

    if (isOpen) {
      setTimeout(() => {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      }, 50);
    }
  }, [initialTask, isOpen, existingTasks, defaultPredecessors]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    onSave({
      id: initialTask?.id,
      name: name.trim(),
      duration: Math.max(0, Number(duration)),
      category: category.trim() || undefined,
      summaryLabel: summaryLabel.trim() || undefined,
      predecessors,
      anchor: anchorEnabled && primarySuccessor
        ? {
            enabled: true,
            targetTaskId: primarySuccessor.id,
            leadDays: Math.max(0, Number(anchorLeadDays) || 0),
            useWorkingDays: anchorUseWorkingDays,
          }
        : undefined,
    });
    onClose();
  };

  const togglePredecessor = (pId: string) => {
    setPredecessors(prev =>
      prev.includes(pId) ? prev.filter(id => id !== pId) : [...prev, pId]
    );
  };

  // Predecessors list should exclude current task to prevent immediate self-loop
  const availablePredecessors = existingTasks.filter(
    t => !initialTask || t.id !== initialTask.id
  );

  const predefinedCategories = [
    'Initiation',
    'Research/Learn',
    'Design',
    'Coding and Component Testing',
    'Documentation',
    'Delivery',
  ];

  const primarySourcePredId = !initialTask && defaultPredecessors && defaultPredecessors.length > 0
    ? defaultPredecessors[0]
    : null;
  const newSourceTask = primarySourcePredId
    ? existingTasks.find(t => t.id === primarySourcePredId)
    : null;
  const newSourceParent = newSourceTask?.parentId
    ? existingTasks.find(t => t.id === newSourceTask.parentId)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <h3 className="text-lg font-semibold text-slate-800">
            {initialTask ? `編輯任務：${initialTask.id}` : '新增任務 (New Task)'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {newSourceTask && (
            <div className="px-3 py-2 bg-blue-50/80 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-center space-x-1.5">
              <span className="text-sm">💡</span>
              <span>
                {newSourceTask.isSummary
                  ? `將作為 [${newSourceTask.id} ${newSourceTask.name}] 的子任務 (階層 Level ${(newSourceTask.outlineLevel || 1) + 1})`
                  : newSourceParent
                  ? `將與前置任務 [${newSourceTask.id} ${newSourceTask.name}] 同為 [${newSourceParent.id} ${newSourceParent.name}] 之同階子任務 (Level ${newSourceTask.outlineLevel || 1})`
                  : `將與前置任務 [${newSourceTask.id} ${newSourceTask.name}] 處於同一階層 (Level ${newSourceTask.outlineLevel || 1})`}
              </span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              任務名稱 (Task Name)
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Implement GUI or Write Contract"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                工期 (Duration in Days) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                required
                disabled={!!initialTask?.isSummary}
                value={duration}
                onChange={e => setDuration(parseFloat(e.target.value) || 0)}
                className={`w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  initialTask?.isSummary ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : ''
                }`}
              />
              {initialTask?.isSummary ? (
                <p className="mt-1 text-xs text-blue-600 font-medium flex items-center space-x-1">
                  <span>📁 此為 Level {initialTask.outlineLevel || 1} 父階任務，工期由子項目自動彙總計算</span>
                </p>
              ) : null}
            </div>

            {initialTask?.isSummary && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  父階標籤 (Badge Label)
                </label>
                <input
                  type="text"
                  value={summaryLabel}
                  placeholder={`預設: ${getParentBadgeLabel(initialTask)}`}
                  onChange={e => setSummaryLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="mt-1 text-xs text-slate-500">
                  預設為 <span className="font-mono font-bold text-slate-700">{getParentBadgeLabel(initialTask)}</span>，若欲還原為預設格式請將此欄位留空儲存即可。
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                分類 / 階段 (Category)
              </label>
              <input
                type="text"
                list="category-suggestions"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="Select or type..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="category-suggestions">
                {predefinedCategories.map(cat => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Predecessors selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              前置任務關聯 (Predecessors / Dependencies)
            </label>
            <div className="text-xs text-slate-500 mb-2">
              選擇此任務必須在哪些任務完成後才能開始 (Finish-to-Start)：
            </div>
            <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg p-2 divide-y divide-slate-100 bg-slate-50/50">
              {availablePredecessors.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 text-center">
                  尚無其他任務可作為前置任務
                </div>
              ) : (
                availablePredecessors.map(task => {
                  const isSelected = predecessors.includes(task.id);
                  return (
                    <div
                      key={task.id}
                      onClick={() => togglePredecessor(task.id)}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors text-xs ${
                        isSelected
                          ? 'bg-blue-50 text-blue-900 font-medium'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check size={12} />}
                        </span>
                        <span className="font-mono text-slate-500 font-normal">
                          [{task.id}]
                        </span>
                        <span className="truncate">{task.name}</span>
                        {inheritedFromParent && inheritedFromParent.predIds.includes(task.id) && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium shrink-0 ml-1.5 select-none">
                            繼承自父階
                          </span>
                        )}
                      </div>
                      <span className="text-slate-400 shrink-0 ml-2">
                        {formatDays(task.duration)} 天
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Reverse Anchor Card: Directly bind to connected successor task */}
          {primarySuccessor ? (
            <div className="border border-indigo-200 rounded-xl p-3.5 bg-indigo-50/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={anchorEnabled}
                    onChange={e => setAnchorEnabled(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-bold text-indigo-950 flex items-center space-x-1.5">
                    <Anchor size={15} className="text-indigo-600" />
                    <span>
                      以關聯後置任務「[{primarySuccessor.id}] {primarySuccessor.name}」的起始日往前倒推
                    </span>
                  </span>
                </label>
                {anchorEnabled && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                    倒推排程中
                  </span>
                )}
              </div>

              {anchorEnabled && (
                <div className="pt-2 border-t border-indigo-100/80 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-700 font-medium">必須在後置任務開始前：</span>
                    <div className="flex items-center space-x-1">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={anchorLeadDays}
                        onChange={e => setAnchorLeadDays(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-center focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-bold text-slate-800"
                      />
                      <span className="text-slate-600 font-medium">天完成</span>
                    </div>
                    <select
                      value={anchorUseWorkingDays ? 'working' : 'calendar'}
                      onChange={e => setAnchorUseWorkingDays(e.target.value === 'working')}
                      className="px-2 py-1 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs text-slate-700 font-medium ml-1"
                    >
                      <option value="working">工作天 (扣假日)</option>
                      <option value="calendar">日曆天</option>
                    </select>
                  </div>

                  {initialTask?.startDate && (
                    <div className="text-[11px] font-mono text-indigo-700 bg-white px-2.5 py-1 rounded-md border border-indigo-200 font-semibold shadow-2xs">
                      📅 倒推完成日：{initialTask.startDate}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="border border-dashed border-slate-200 rounded-xl p-3 bg-slate-50/50 text-xs text-slate-400 flex items-center space-x-2">
              <Anchor size={14} className="text-slate-300 shrink-0" />
              <span>
                💡 提示：在網絡圖中把此任務連線至後續任務（例如 SMT）後，即可勾選以此後續任務之起始日自動往前倒推完成日期。
              </span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 mt-6">
            {initialTask && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`確定要刪除任務 [${initialTask.id}] ${initialTask.name} 嗎？`)) {
                    onDelete(initialTask.id);
                    onClose();
                  }
                }}
                className="flex items-center space-x-1 text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg text-sm transition-colors"
              >
                <Trash2 size={16} />
                <span>刪除任務</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition-colors"
              >
                {initialTask ? '儲存變更' : '建立任務'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
