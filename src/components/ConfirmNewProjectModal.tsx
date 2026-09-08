import React from 'react';
import { AlertTriangle, X, FilePlus } from 'lucide-react';

interface ConfirmNewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  projectName: string;
}

export const ConfirmNewProjectModal: React.FC<ConfirmNewProjectModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  projectName,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 flex flex-col space-y-4 animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Icon & Title */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">確認放棄當前設計並新增專案？</h3>
              <p className="text-xs text-slate-500 mt-0.5">目前專案「{projectName}」尚未手動儲存</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Warning Notice */}
        <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900 leading-relaxed space-y-1">
          <p className="font-semibold text-amber-950 flex items-center space-x-1.5">
            <span>⚠️ 溫馨提醒</span>
          </p>
          <p>
            您有尚未正式儲存的修改。若直接建立新專案，畫布將被清空並重設為初始狀態。
          </p>
          <p className="text-[11px] text-amber-700 pt-1">
            提示：若想保留現有成果，您可以先點選「返回」，並透過「檔案 ➔ 儲存專案 (Ctrl+S)」或「另存新檔」備份您的工作。
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            返回繼續編輯
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <FilePlus size={14} />
            <span>放棄變更並新增專案</span>
          </button>
        </div>
      </div>
    </div>
  );
};
