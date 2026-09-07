import React, { useState, useEffect } from 'react';
import { X, Save, FileDown, Sparkles, FolderPlus, Folder, FolderOpen, Check } from 'lucide-react';

interface SaveAsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectName: string;
  onSaveAs: (newName: string, exportType: 'none' | 'xml' | 'json', dirHandle?: any) => void;
}

export const SaveAsModal: React.FC<SaveAsModalProps> = ({
  isOpen,
  onClose,
  currentProjectName,
  onSaveAs,
}) => {
  const [newName, setNewName] = useState(currentProjectName);
  const [exportOption, setExportOption] = useState<'none' | 'xml' | 'json'>('none');
  const [selectedDir, setSelectedDir] = useState<any | null>(null);
  const [dirNotice, setDirNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNewName(currentProjectName);
      setExportOption('none');
      setSelectedDir(null);
      setDirNotice(null);
    }
  }, [isOpen, currentProjectName]);

  if (!isOpen) return null;

  // Handle picking computer directory via browser File System Access API
  const handlePickDirectory = async () => {
    setDirNotice(null);
    if ('showDirectoryPicker' in window) {
      try {
        const handle = await (window as any).showDirectoryPicker();
        setSelectedDir(handle);
        setDirNotice(null);
      } catch (err: any) {
        if (err.name === 'SecurityError') {
          setDirNotice('⚠️ 瀏覽器安全防護限制：Chrome/Edge 禁止網頁直接取得整顆「下載」或「桌面」根目錄權限。若想存入「下載」，您無需在此預先指定目錄，只需直接點選下方儲存選項並按下「確認另存」，在彈出的存檔視窗中即可自由存入「下載」；或者您也可以在「下載」中建立子資料夾後選取該子資料夾。');
        } else if (err.name !== 'AbortError') {
          console.error('Directory picker error:', err);
          setDirNotice('選取目錄失敗：' + (err.message || '未知錯誤'));
        }
      }
    } else {
      setDirNotice('提示：您的瀏覽器未支援直接選擇目錄 API。另存時將透過標準檔案對話框供您選擇儲存路徑。');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onSaveAs(newName.trim(), exportOption, selectedDir);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
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

          {/* Computer Save Directory Section */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <FolderOpen size={14} className="text-blue-600" />
                <span>電腦端儲存目錄 (Save Directory)</span>
              </label>
              {selectedDir && (
                <button
                  type="button"
                  onClick={() => setSelectedDir(null)}
                  className="text-[11px] text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                >
                  清除選取
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <div
                className={`flex-1 px-3.5 py-2.5 rounded-xl border text-xs flex items-center space-x-2.5 min-w-0 transition-colors ${
                  selectedDir
                    ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-medium shadow-2xs'
                    : 'bg-slate-50 border-slate-300 text-slate-500'
                }`}
              >
                {selectedDir ? (
                  <>
                    <span className="text-base select-none shrink-0">📁</span>
                    <span className="truncate font-semibold text-slate-800" title={selectedDir.name}>
                      {selectedDir.name}
                    </span>
                    <span className="text-[10px] bg-emerald-200/90 text-emerald-800 px-2 py-0.5 rounded-full font-bold shrink-0 ml-auto flex items-center space-x-1 select-none">
                      <Check size={11} className="stroke-[3]" />
                      <span>已指定本機目錄</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Folder size={15} className="text-slate-400 shrink-0 select-none" />
                    <span className="truncate text-slate-400">
                      尚未指定目錄（點右側按鈕瀏覽選取電腦資料夾）
                    </span>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={handlePickDirectory}
                className="px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold shrink-0 flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
              >
                <FolderOpen size={15} />
                <span>{selectedDir ? '變更目錄' : '選擇電腦端目錄...'}</span>
              </button>
            </div>

            {dirNotice && (
              <p className="text-[11px] text-amber-700 mt-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                {dirNotice}
              </p>
            )}

            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              {selectedDir ? (
                <span className="text-emerald-700 font-medium">
                  ✓ 檔案將直接寫入電腦目錄「{selectedDir.name}」中。
                </span>
              ) : (
                <span>
                  💡 說明：若要儲存至「下載 (Downloads)」或「桌面」，無需點上方按鈕，只要選好格式直接點擊下方「確認另存」，在彈出的 Windows 另存視窗中即可自由點選存入「下載」！
                </span>
              )}
            </p>
          </div>

          {/* Export Options */}
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              儲存與匯出選項：
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
                  <div className="text-slate-500 text-[11px]">
                    {selectedDir
                      ? `系統將切換至新專案，並同步將專案備份檔輸出至「${selectedDir.name}」`
                      : '原專案保留不變，切換至新副本'}
                  </div>
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
                    <span>另存並匯出 Microsoft Project XML (*.xml)</span>
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    {selectedDir
                      ? `直接儲存 .xml 至「${selectedDir.name}」，可直接在微軟 Project 軟體中開啟`
                      : '可直接在微軟 Project 軟體中開啟，另存時可選擇電腦端儲存位置'}
                  </div>
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
                    <span>另存並匯出專案完整 JSON 備份檔 (*.json)</span>
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    {selectedDir
                      ? `直接儲存 .json 至「${selectedDir.name}」，包含所有佈局與工期資料`
                      : '包含所有佈局、工期與關聯資訊，另存時可選擇電腦端儲存位置'}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-sm flex items-center space-x-1.5 transition-colors cursor-pointer"
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
