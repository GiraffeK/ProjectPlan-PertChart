import React, { useState, useEffect } from 'react';
import { X, Save, FileDown, Sparkles, FolderPlus } from 'lucide-react';

interface SaveAsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectName: string;
  onSaveAs: (newName: string, exportType: 'none' | 'xml' | 'json') => void;
}

export const SaveAsModal: React.FC<SaveAsModalProps> = ({
  isOpen,
  onClose,
  currentProjectName,
  onSaveAs,
}) => {
  const [newName, setNewName] = useState(currentProjectName);
  const [exportOption, setExportOption] = useState<'none' | 'xml' | 'json'>('none');

  useEffect(() => {
    if (isOpen) {
      setNewName(`${currentProjectName}_copy`);
      setExportOption('none');
    }
  }, [isOpen, currentProjectName]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onSaveAs(newName.trim(), exportOption);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FolderPlus size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">專案另存新檔 (Save As)</h3>
              <p className="text-xs text-slate-500">以新專案名稱儲存，或同時匯出檔案</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              新專案 / 檔案名稱 (New Project Name)
            </label>
            <input
              type="text"
              required
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="請輸入新專案名稱"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          {/* Export Options */}
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              儲存選項：
            </label>
            <div className="space-y-2 text-xs">
              <label className="flex items-center space-x-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="exportOption"
                  checked={exportOption === 'none'}
                  onChange={() => setExportOption('none')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-semibold text-slate-800">另存為新專案（在系統中以此名稱繼續編輯）</div>
                  <div className="text-slate-500 text-[11px]">原專案保留不變，切換至新副本</div>
                </div>
              </label>

              <label className="flex items-center space-x-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="exportOption"
                  checked={exportOption === 'xml'}
                  onChange={() => setExportOption('xml')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-semibold text-slate-800 flex items-center space-x-1.5">
                    <FileDown size={14} className="text-emerald-600" />
                    <span>另存並下載 Microsoft Project XML (*.xml)</span>
                  </div>
                  <div className="text-slate-500 text-[11px]">可直接在微軟 Project 軟體中開啟</div>
                </div>
              </label>

              <label className="flex items-center space-x-2.5 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="exportOption"
                  checked={exportOption === 'json'}
                  onChange={() => setExportOption('json')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-semibold text-slate-800 flex items-center space-x-1.5">
                    <Sparkles size={14} className="text-blue-600" />
                    <span>另存並下載專案完整 JSON 備份檔 (*.json)</span>
                  </div>
                  <div className="text-slate-500 text-[11px]">包含所有佈局、工期與關聯資訊</div>
                </div>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-sm flex items-center space-x-1.5 transition-colors"
            >
              <Save size={14} />
              <span>確認另存</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
