import React, { useRef } from 'react';
import {
  Network,
  BarChart2,
  Columns,
  Table as TableIcon,
  Plus,
  FileDown,
  FileUp,
  RotateCcw,
  Sparkles,
  Calendar,
  AlertOctagon,
  HelpCircle,
  Save,
  Check,
  FolderPlus,
  Undo2,
  Redo2,
} from 'lucide-react';

export type ViewMode = 'pert' | 'gantt' | 'split' | 'table';

interface ToolbarProps {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  projectName: string;
  onChangeProjectName: (name: string) => void;
  onAddTask: () => void;
  onSave: () => void;
  onSaveAs?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isDirty?: boolean;
  lastSavedTime?: string | null;
  onLoadSample: () => void;
  onExportMSProject: () => void;
  onImportMSProject: (file: File) => void;
  onExportJSON: () => void;
  onOpenMppGuide?: () => void;
  onOpenHelp?: () => void;
  startDate: string;
  onChangeStartDate: (date: string) => void;
  criticalPathDuration: number;
  hasCycle?: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  viewMode,
  onChangeViewMode,
  projectName,
  onChangeProjectName,
  onAddTask,
  onSave,
  onSaveAs,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isDirty,
  lastSavedTime,
  onLoadSample,
  onExportMSProject,
  onImportMSProject,
  onExportJSON,
  onOpenMppGuide,
  onOpenHelp,
  startDate,
  onChangeStartDate,
  criticalPathDuration,
  hasCycle,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportMSProject(file);
      e.target.value = '';
    }
  };

  return (
    <header className="flex items-center justify-between px-3 lg:px-4 py-1.5 bg-slate-900 text-white shadow-md z-30 select-none border-b border-slate-800 shrink-0 w-full overflow-x-auto min-w-0">
      {/* Left: Branding, HELP & View Tabs */}
      <div className="flex items-center space-x-3 lg:space-x-4 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-md shrink-0">
            <Network size={16} className="text-white" />
          </div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xs lg:text-sm font-bold tracking-tight text-white shrink-0">
              PERT & Gantt
            </h1>
            {onOpenHelp && (
              <button
                onClick={onOpenHelp}
                title="查看 Microsoft Project 操作體驗與說明 (HELP)"
                className="flex items-center space-x-1 px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 border border-amber-500/40 rounded text-[11px] font-bold shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <HelpCircle size={12} className="text-amber-400" />
                <span>HELP</span>
              </button>
            )}
            <div className="hidden sm:flex items-center bg-slate-800/90 px-2 py-0.5 rounded-md border border-slate-700 shrink-0">
              <input
                type="text"
                value={projectName}
                onChange={e => onChangeProjectName(e.target.value)}
                placeholder="專案名稱"
                title="點擊修改專案名稱"
                className="bg-transparent text-xs font-semibold text-slate-200 focus:text-white focus:outline-none w-28 md:w-32 placeholder-slate-500 truncate"
              />
            </div>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/80 space-x-0.5 shrink-0">
          <button
            onClick={() => onChangeViewMode('pert')}
            title="切換至 PERT 網圖"
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              viewMode === 'pert'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Network size={13} />
            <span>PERT 網圖</span>
          </button>
          <button
            onClick={() => onChangeViewMode('gantt')}
            title="切換至甘特圖 (Gantt Chart)"
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              viewMode === 'gantt'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <BarChart2 size={13} />
            <span>甘特圖</span>
          </button>
          <button
            onClick={() => onChangeViewMode('split')}
            title="切換至雙視圖 (Split View)"
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              viewMode === 'split'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Columns size={13} />
            <span>雙視圖</span>
          </button>
          <button
            onClick={() => onChangeViewMode('table')}
            title="切換至任務清單"
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              viewMode === 'table'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <TableIcon size={13} />
            <span>任務清單</span>
          </button>
        </div>
      </div>

      {/* Center: Cycle Alert, Project Start Date & Critical Path Badge */}
      <div className="flex items-center space-x-2 shrink-0 mx-2">
        {hasCycle ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-red-500/20 border border-red-500/50 rounded-lg text-xs text-red-300 font-medium animate-pulse">
            <AlertOctagon size={14} className="text-red-400" />
            <span>檢測到前置循環依賴！</span>
          </div>
        ) : (
          <>
            <div className="flex items-center space-x-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 text-xs">
              <Calendar size={13} className="text-slate-400" />
              <span className="text-slate-400 text-[11px]">專案起日:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => onChangeStartDate(e.target.value)}
                className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer"
              />
            </div>
            <div className="flex items-center space-x-1.5 px-2 py-1 bg-red-950/40 border border-red-800/60 rounded-lg text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-slate-300 text-[11px]">關鍵工期:</span>
              <span className="font-bold text-red-400 font-mono">{criticalPathDuration} 天</span>
            </div>
          </>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center space-x-1.5 shrink-0">
        {/* Save Button (Manual Save to original file) */}
        <button
          onClick={onSave}
          title={`手動儲存至原檔「${projectName}」 (快捷鍵 Ctrl + S)`}
          className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
        >
          <Save size={13} />
          <span>儲存</span>
        </button>

        {/* Save As Button */}
        {onSaveAs && (
          <button
            onClick={onSaveAs}
            title="專案另存新檔 (以新名稱或下載備份)"
            className="flex items-center space-x-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer border border-slate-600 shrink-0"
          >
            <FolderPlus size={13} />
            <span>另存</span>
          </button>
        )}

        {/* Undo / Redo Buttons */}
        <div className="flex items-center space-x-0.5 bg-slate-800/90 p-0.5 rounded-lg border border-slate-700/90 shrink-0">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="復原操作 (Undo，快捷鍵 Ctrl + Z)"
            className={`p-1 rounded-md transition-colors ${
              canUndo
                ? 'text-slate-200 hover:text-white hover:bg-slate-700 cursor-pointer'
                : 'text-slate-600 cursor-not-allowed opacity-40'
            }`}
          >
            <Undo2 size={13} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="重做操作 (Redo，快捷鍵 Ctrl + Y / Ctrl + Shift + Z)"
            className={`p-1 rounded-md transition-colors ${
              canRedo
                ? 'text-slate-200 hover:text-white hover:bg-slate-700 cursor-pointer'
                : 'text-slate-600 cursor-not-allowed opacity-40'
            }`}
          >
            <Redo2 size={13} />
          </button>
        </div>

        {/* Autosave Status Badge: Compact */}
        <div
          className="flex items-center justify-center text-[11px] font-mono px-2 py-1 rounded bg-slate-800/80 border border-slate-700/80 shrink-0 select-none cursor-default"
          title={
            isDirty
              ? `變更將自動備份至 [${projectName}_autosave]`
              : `已自動儲存至 [${projectName}_autosave] ${lastSavedTime ? `(${lastSavedTime})` : ''}\n點擊「儲存」按鈕可存至原檔「${projectName}」`
          }
        >
          {isDirty ? (
            <span className="flex items-center space-x-1 text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="whitespace-nowrap">存檔中</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1 text-emerald-400/90">
              <Check size={12} className="text-emerald-400 shrink-0" />
              <span className="whitespace-nowrap">已存檔</span>
            </span>
          )}
        </div>

        {/* Add Task Button */}
        <button
          onClick={onAddTask}
          className="flex items-center space-x-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors shrink-0"
        >
          <Plus size={14} />
          <span>新增任務</span>
        </button>

        <div className="h-4 w-px bg-slate-700 mx-0.5 shrink-0" />

        {/* Load Sample Reference */}
        <button
          onClick={onLoadSample}
          title="重新載入 88 天軟體開發參考範例"
          className="flex items-center space-x-1 px-2 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-slate-700 shrink-0"
        >
          <RotateCcw size={12} />
          <span>範例</span>
        </button>

        {/* Hidden File Input for Import */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".xml,.mpx,.mspdi,.mpp,.json"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Import MS Project Button & MPP Help */}
        <div className="flex items-center space-x-0.5 shrink-0">
          <button
            onClick={() => fileInputRef.current?.click()}
            title="匯入 Microsoft Project 檔案 (支援 .mpp / .xml / .json)"
            className="flex items-center space-x-1 px-2 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-slate-700"
          >
            <FileUp size={12} />
            <span>匯入</span>
          </button>
          {onOpenMppGuide && (
            <button
              onClick={onOpenMppGuide}
              title="MPP 檔案匯入說明指引"
              className="p-1 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-md transition-colors"
            >
              <HelpCircle size={13} />
            </button>
          )}
        </div>

        {/* Export MS Project XML */}
        <button
          onClick={onExportMSProject}
          title="匯出為標準 Microsoft Project XML (可在 MS Project 中直接開啟)"
          className="flex items-center space-x-1 px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium shadow-xs transition-colors shrink-0"
        >
          <FileDown size={12} />
          <span>匯出 XML</span>
        </button>

        {/* Export JSON */}
        <button
          onClick={onExportJSON}
          title="匯出專案 JSON 備份檔"
          className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors shrink-0"
        >
          <Sparkles size={14} />
        </button>
      </div>
    </header>
  );
};
