import React, { useEffect, useRef } from 'react';
import type { Task } from '../core/types';
import {
  Indent,
  Outdent,
  Edit,
  Trash2,
  GitBranch,
} from 'lucide-react';

interface TaskContextMenuProps {
  task: Task | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onIndent: (task: Task) => void;
  onOutdent: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  canIndent?: boolean;
  canOutdent?: boolean;
}

export const TaskContextMenu: React.FC<TaskContextMenuProps> = ({
  task,
  position,
  onClose,
  onIndent,
  onOutdent,
  onEdit,
  onDelete,
  canIndent = true,
  canOutdent = true,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!task || !position) return null;

  // Prevent menu going outside window viewport
  const menuWidth = 220;
  const menuHeight = 210;
  const adjustedX = Math.min(position.x, window.innerWidth - menuWidth - 10);
  const adjustedY = Math.min(position.y, window.innerHeight - menuHeight - 10);

  const isSubtask = (task.outlineLevel || 1) > 1;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: `${adjustedX}px`,
        top: `${adjustedY}px`,
      }}
      className="z-50 w-56 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200 py-1.5 text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100"
    >
      {/* Header with task info */}
      <div className="px-3 py-1.5 pb-2">
        <div className="flex items-center space-x-1.5 font-bold text-slate-800 truncate">
          <span className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-[11px]">
            {task.id}
          </span>
          <span className="truncate">{task.name}</span>
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center space-x-1">
          <GitBranch size={11} />
          <span>
            層級: {isSubtask ? `子任務 (Level ${task.outlineLevel})` : '主任務 (Level 1)'}
          </span>
        </div>
      </div>

      {/* Subtask Indent / Outdent Actions */}
      <div className="py-1">
        <button
          onClick={() => {
            onIndent(task);
            onClose();
          }}
          disabled={!canIndent}
          className={`w-full text-left px-3 py-2 flex items-center space-x-2.5 transition-colors ${
            canIndent
              ? 'hover:bg-blue-50 hover:text-blue-700 text-slate-700'
              : 'text-slate-300 cursor-not-allowed'
          }`}
          title="將此任務縮排，成為上方任務的子任務"
        >
          <Indent size={15} className="text-blue-600" />
          <div className="flex flex-col">
            <span className="font-semibold">縮排成子任務 (Indent)</span>
            <span className="text-[10px] text-slate-400">降級為前項任務之子層</span>
          </div>
        </button>

        <button
          onClick={() => {
            onOutdent(task);
            onClose();
          }}
          disabled={!canOutdent && !isSubtask}
          className={`w-full text-left px-3 py-2 flex items-center space-x-2.5 transition-colors ${
            isSubtask
              ? 'hover:bg-indigo-50 hover:text-indigo-700 text-slate-700'
              : 'text-slate-300 cursor-not-allowed'
          }`}
          title="將此子任務凸排，升級為上層獨立任務"
        >
          <Outdent size={15} className="text-indigo-600" />
          <div className="flex flex-col">
            <span className="font-semibold">凸排 / 取消子任務 (Outdent)</span>
            <span className="text-[10px] text-slate-400">升級層級為主任務</span>
          </div>
        </button>
      </div>

      {/* General Actions: Edit & Delete */}
      <div className="py-1">
        <button
          onClick={() => {
            onEdit(task);
            onClose();
          }}
          className="w-full text-left px-3 py-1.5 flex items-center space-x-2.5 hover:bg-slate-100 text-slate-700 transition-colors"
        >
          <Edit size={14} className="text-slate-500" />
          <span>編輯項目與工期</span>
        </button>

        <button
          onClick={() => {
            onDelete(task.id);
            onClose();
          }}
          className="w-full text-left px-3 py-1.5 flex items-center space-x-2.5 hover:bg-red-50 text-red-600 transition-colors"
        >
          <Trash2 size={14} />
          <span>刪除此任務</span>
        </button>
      </div>
    </div>
  );
};
