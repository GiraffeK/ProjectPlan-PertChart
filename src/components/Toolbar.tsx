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
  isDirty?: boolean;
  lastSavedTime?: string | null;
  onLoadSample: () => void;
  onExportMSProject: () => void;
  onImportMSProject: (file: File) => void;
  onExportJSON: () => void;
  onOpenMppGuide?: () => void;
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
  isDirty,
  lastSavedTime,
  onLoadSample,
  onExportMSProject,
  onImportMSProject,
  onExportJSON,
  onOpenMppGuide,
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
    <header className="flex items-center justify-between px-6 py-2.5 bg-slate-900 text-white shadow-md z-30 select-none border-b border-slate-800">
      {/* Left: Branding & View Tabs */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-md">
            <Network size={18} className="text-white" />
          </div>
          <div className="flex items-center space-x-2">
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center space-x-1.5">
              <span>PERT & Gantt</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                MS Project
              </span>
            </h1>
            <div className="hidden sm:flex items-center space-x-1 bg-slate-800/90 px-2 py-0.5 rounded-md border border-slate-700">
              <input
                type="text"
                value={projectName}
                onChange={e => onChangeProjectName(e.target.value)}
                placeholder="專案名稱"
                title="點擊修改專案名稱"
                className="bg-transparent text-xs font-semibold text-slate-200 focus:text-white focus:outline-none w-24 md:w-32 lg:w-44 placeholder-slate-500 truncate"
              />
            </div>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-800/80 p-1 rounded-lg border border-slate-700/80 space-x-1">
          <button
            onClick={() => onChangeViewMode('pert')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === 'pert'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Network size={14} />
            <span>PERT 網圖</span>
          </button>
          <button
            onClick={() => onChangeViewMode('gantt')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === 'gantt'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <BarChart2 size={14} />
            <span>甘特圖 (Gantt)</span>
          </button>
          <button
            onClick={() => onChangeViewMode('split')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === 'split'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Columns size={14} />
            <span>雙視圖 (Split)</span>
          </button>
          <button
            onClick={() => onChangeViewMode('table')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === 'table'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <TableIcon size={14} />
            <span>任務清單</span>
          </button>
        </div>
      </div>

      {/* Center: Cycle Alert, Project Start Date & Critical Path Badge */}
      <div className="flex items-center space-x-3">
        {hasCycle ? (
          <div className="flex items-center space-x-1.5 px-3 py-1 bg-red-500/20 border border-red-500/50 rounded-lg text-xs text-red-300 font-medium animate-pulse">
            <AlertOctagon size={15} className="text-red-400" />
            <span>檢測到前置循環依賴！請調整前置任務</span>
          </div>
        ) : (
          <>
            <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-700 text-xs">
              <Calendar size={14} className="text-slate-400" />
              <span className="text-slate-400">專案起日:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => onChangeStartDate(e.target.value)}
                className="bg-transparent text-white font-mono focus:outline-none cursor-pointer"
              />
            </div>
            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-red-950/40 border border-red-800/60 rounded-lg text-xs">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-slate-300">關鍵工期:</span>
              <span className="font-bold text-red-400 font-mono">{criticalPathDuration} 天</span>
            </div>
          </>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center space-x-2">
        {/* Save Button (Manual Save to original file) */}
        <button
          onClick={onSave}
          title={`手動儲存至原檔「${projectName}」 (快捷鍵 Ctrl + S)`}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <Save size={14} />
          <span>儲存</span>
        </button>

        {/* Save As Button */}
        {onSaveAs && (
          <button
            onClick={onSaveAs}
            title="專案另存新檔 (以新名稱或下載備份)"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer border border-slate-600"
          >
            <FolderPlus size={14} />
            <span>另存新檔</span>
          </button>
        )}

        {/* Autosave Status Badge */}
        <div className="hidden lg:flex items-center text-[11px] font-mono pr-1">
          {isDirty ? (
            <span
              className="flex items-center space-x-1 text-amber-400"
              title={`變更自動備份至 [${projectName}_autosave]`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>自動儲存中...</span>
            </span>
          ) : (
            <span
              className="flex items-center space-x-1 text-emerald-400/90"
              title={`已自動儲存至 [${projectName}_autosave]`}
            >
              <Check size={13} className="text-emerald-400" />
              <span>
                已自動存檔 [{projectName}_autosave] {lastSavedTime ? `(${lastSavedTime})` : ''}
              </span>
            </span>
          )}
        </div>

        <button
          onClick={onAddTask}
          className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
        >
          <Plus size={15} />
          <span>新增任務</span>
        </button>

        <div className="h-5 w-px bg-slate-700 mx-1" />

        {/* Load Sample Reference */}
        <button
          onClick={onLoadSample}
          title="載入參考範例 (88 天關鍵路徑)"
          className="flex items-center space-x-1 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-slate-700"
        >
          <RotateCcw size={13} />
          <span>重載範例</span>
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
        <div className="flex items-center space-x-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            title="匯入 Microsoft Project 檔案 (支援 .mpp / .xml / .json)"
            className="flex items-center space-x-1 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-slate-700"
          >
            <FileUp size={13} />
            <span>匯入 MS Project</span>
          </button>
          {onOpenMppGuide && (
            <button
              onClick={onOpenMppGuide}
              title="MPP 檔案匯入說明"
              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <HelpCircle size={14} />
            </button>
          )}
        </div>

        {/* Export MS Project XML */}
        <button
          onClick={onExportMSProject}
          title="匯出為標準 Microsoft Project XML (可在 MS Project 中直接開啟)"
          className="flex items-center space-x-1 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium shadow-xs transition-colors"
        >
          <FileDown size={13} />
          <span>匯出 MS Project XML</span>
        </button>

        {/* Export JSON */}
        <button
          onClick={onExportJSON}
          title="匯出專案 JSON 備份"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Sparkles size={15} />
        </button>
      </div>
    </header>
  );
};
