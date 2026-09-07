import React, { useEffect, useRef } from 'react';
import type { Task } from '../core/types';
import {
  Indent,
  Outdent,
  Edit,
  Trash2,
  GitBranch,
  Copy,
  Scissors,
  ClipboardPaste,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface TaskContextMenuProps {
  task: Task | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onIndent: (task: Task) => void;
  onOutdent: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onInsertAbove?: (task: Task) => void;
  onInsertBelow?: (task: Task) => void;
  onCopy?: (task: Task) => void;
  onCut?: (task: Task) => void;
  onPaste?: (targetTask: Task) => void;
  hasClipboard?: boolean;
  clipboardCount?: number;
  selectedCount?: number;
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
  onInsertAbove,
  onInsertBelow,
  onCopy,
  onCut,
  onPaste,
  hasClipboard = false,
  clipboardCount = 0,
  selectedCount = 1,
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
  const menuWidth = 240;
  const menuHeight = 360;
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
      className="z-50 w-60 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200 py-1.5 text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100 select-none"
    >
      {/* Header with task info */}
      <div className="px-3 py-1.5 pb-2">
        <div className="flex items-center space-x-1.5 font-bold text-slate-800 truncate">
          <span className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-[11px]">
            {task.id}
          </span>
          <span className="truncate">{task.name}</span>
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
          <span className="flex items-center space-x-1">
            <GitBranch size={11} />
            <span>
              {isSubtask ? `子任務 (L${task.outlineLevel})` : '主任務 (L1)'}
            </span>
          </span>
          {selectedCount > 1 && (
            <span className="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded text-[10px]">
              已選取 {selectedCount} 個項目
            </span>
          )}
        </div>
      </div>

      {/* Row Insert Actions (Insert Task) */}
      {(onInsertAbove || onInsertBelow) && (
        <div className="py-1">
          {onInsertAbove && (
            <button
              onClick={() => {
                onInsertAbove(task);
                onClose();
              }}
              className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 transition-colors"
            >
              <ArrowUp size={13} className="text-emerald-600" />
              <span>在上方插入新任務 (Insert Above)</span>
            </button>
          )}
          {onInsertBelow && (
            <button
              onClick={() => {
                onInsertBelow(task);
                onClose();
              }}
              className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 transition-colors"
            >
              <ArrowDown size={13} className="text-emerald-600" />
              <span>在下方插入新任務 (Insert Below)</span>
            </button>
          )}
        </div>
      )}

      {/* Clipboard: Copy, Cut, Paste */}
      {(onCopy || onCut || onPaste) && (
        <div className="py-1">
          {onCopy && (
            <button
              onClick={() => {
                onCopy(task);
                onClose();
              }}
              className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors"
            >
              <Copy size={13} className="text-blue-600" />
              <span>複製任務 (Copy{selectedCount > 1 ? ` ${selectedCount} 項` : ''})</span>
            </button>
          )}
          {onCut && (
            <button
              onClick={() => {
                onCut(task);
                onClose();
              }}
              className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-amber-50 hover:text-amber-800 text-slate-700 transition-colors"
            >
              <Scissors size={13} className="text-amber-600" />
              <span>剪下任務 (Cut / Crop{selectedCount > 1 ? ` ${selectedCount} 項` : ''})</span>
            </button>
          )}
          {onPaste && (
            <button
              onClick={() => {
                if (hasClipboard) {
                  onPaste(task);
                  onClose();
                }
              }}
              disabled={!hasClipboard}
              className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
                hasClipboard
                  ? 'hover:bg-purple-50 hover:text-purple-700 text-slate-700'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              <ClipboardPaste size={13} className={hasClipboard ? 'text-purple-600' : 'text-slate-300'} />
              <span>
                貼上任務 (Paste{clipboardCount > 0 ? ` ${clipboardCount} 項` : ''})
              </span>
            </button>
          )}
        </div>
      )}

      {/* Subtask Indent / Outdent Actions */}
      <div className="py-1">
        <button
          onClick={() => {
            onIndent(task);
            onClose();
          }}
          disabled={!canIndent}
          className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
            canIndent
              ? 'hover:bg-blue-50 hover:text-blue-700 text-slate-700'
              : 'text-slate-300 cursor-not-allowed'
          }`}
        >
          <Indent size={14} className="text-blue-600" />
          <span>縮排成子任務 (Indent{selectedCount > 1 ? ` ${selectedCount} 項` : ''})</span>
        </button>

        <button
          onClick={() => {
            onOutdent(task);
            onClose();
          }}
          disabled={!canOutdent}
          className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 transition-colors ${
            canOutdent
              ? 'hover:bg-indigo-50 hover:text-indigo-700 text-slate-700'
              : 'text-slate-300 cursor-not-allowed'
          }`}
        >
          <Outdent size={14} className="text-indigo-600" />
          <span>凸排 / 取消子任務 (Outdent{selectedCount > 1 ? ` ${selectedCount} 項` : ''})</span>
        </button>
      </div>

      {/* General Actions: Edit & Delete */}
      <div className="py-1">
        <button
          onClick={() => {
            onEdit(task);
            onClose();
          }}
          className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-slate-100 text-slate-700 transition-colors"
        >
          <Edit size={13} className="text-slate-500" />
          <span>編輯項目與工期</span>
        </button>

        <button
          onClick={() => {
            onDelete(task.id);
            onClose();
          }}
          className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-red-50 text-red-600 transition-colors font-medium"
        >
          <Trash2 size={13} />
          <span>刪除任務 (DEL{selectedCount > 1 ? ` ${selectedCount} 項` : ''})</span>
        </button>
      </div>
    </div>
  );
};
