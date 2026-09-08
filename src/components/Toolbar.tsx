import React, { useState, useEffect, useRef } from 'react';
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
  ChevronDown,
  Folder,
  Briefcase,
  CalendarDays,
} from 'lucide-react';
import type { ScheduleMode } from '../core/types';

export type ViewMode = 'pert' | 'gantt' | 'split' | 'table';

interface ToolbarProps {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  projectName: string;
  onChangeProjectName: (name: string) => void;
  onNewProject?: () => void;
  onAddTask?: () => void;
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
  scheduleMode?: ScheduleMode;
  onChangeScheduleMode?: (mode: ScheduleMode) => void;
  customHolidaysCount?: number;
  onOpenHolidays?: () => void;
  criticalPathDuration?: number;
  hasCycle?: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  viewMode,
  onChangeViewMode,
  projectName,
  onChangeProjectName,
  onNewProject,
  onSave,
  onSaveAs,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  isDirty = false,
  lastSavedTime,
  onLoadSample,
  onExportMSProject,
  onImportMSProject,
  onExportJSON,
  onOpenMppGuide,
  onOpenHelp,
  startDate,
  onChangeStartDate,
  scheduleMode = 'working',
  onChangeScheduleMode,
  customHolidaysCount = 0,
  onOpenHolidays,
  hasCycle,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setIsFileMenuOpen(false);
      }
    };
    if (isFileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFileMenuOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportMSProject(file);
      e.target.value = '';
    }
  };

  return (
    <header className="relative z-30 flex items-center px-3 lg:px-4 py-1.5 bg-slate-900 text-white shadow-md select-none border-b border-slate-800 shrink-0 w-full space-x-2.5">
      {/* Hidden File Input for Import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".xml,.mpx,.mspdi,.mpp,.json"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 1. Brand */}
      <div className="flex items-center space-x-1.5 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-md shrink-0">
          <Network size={16} className="text-white" />
        </div>
        <span className="text-xs lg:text-sm font-bold tracking-tight text-white shrink-0">
          PERT & Gantt
        </span>
      </div>

      {/* 2. HELP Button */}
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

      {/* 3. File Operations Dropdown (檔案下拉選單) */}
      <div className="relative shrink-0" ref={fileMenuRef}>
        <button
          onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
          title="檔案操作選單 (新增專案、儲存、另存、匯入、匯出)"
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer border ${
            isFileMenuOpen
              ? 'bg-slate-700 text-white border-slate-500 ring-2 ring-blue-500/30'
              : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border-slate-700'
          }`}
        >
          <Folder size={13} className="text-blue-400" />
          <span>檔案</span>
          <ChevronDown
            size={11}
            className={`transition-transform duration-150 ${
              isFileMenuOpen ? 'rotate-180 text-blue-400' : 'text-slate-400'
            }`}
          />
        </button>

        {isFileMenuOpen && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 z-50 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-800">
            {/* Group 1: 新增與儲存 */}
            <div className="py-1">
              <button
                onClick={() => {
                  setIsFileMenuOpen(false);
                  if (onNewProject) {
                    onNewProject();
                  }
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left font-medium text-blue-400"
              >
                <Plus size={15} />
                <span>新增專案 (New Project)</span>
              </button>

              <button
                onClick={() => {
                  onSave();
                  setIsFileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center space-x-2.5">
                  <Save size={14} className="text-emerald-400" />
                  <span className="font-medium">儲存專案</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Ctrl+S</span>
              </button>

              {onSaveAs && (
                <button
                  onClick={() => {
                    onSaveAs();
                    setIsFileMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left"
                >
                  <FolderPlus size={14} className="text-blue-400" />
                  <span className="font-medium">另存新檔 (Save As)...</span>
                </button>
              )}
            </div>

            {/* Group 2: 匯入與匯出 */}
            <div className="py-1">
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                  setIsFileMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left"
              >
                <FileUp size={14} className="text-amber-400" />
                <span className="font-medium">匯入專案 (MPP / XML / JSON)...</span>
              </button>

              <button
                onClick={() => {
                  onExportMSProject();
                  setIsFileMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left"
              >
                <FileDown size={14} className="text-emerald-400" />
                <span className="font-medium">匯出 MS Project XML (*.xml)</span>
              </button>

              <button
                onClick={() => {
                  onExportJSON();
                  setIsFileMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left"
              >
                <Sparkles size={14} className="text-purple-400" />
                <span className="font-medium">匯出 JSON 備份檔 (*.json)</span>
              </button>
            </div>

            {/* Group 3: 範例與說明 */}
            <div className="py-1">
              <button
                onClick={() => {
                  onLoadSample();
                  setIsFileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center space-x-2.5">
                  <RotateCcw size={14} className="text-slate-400" />
                  <span className="font-medium">載入參考範例專案</span>
                </div>
                <span className="text-[10px] text-slate-400">88天範例</span>
              </button>

              {onOpenMppGuide && (
                <button
                  onClick={() => {
                    onOpenMppGuide();
                    setIsFileMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left"
                >
                  <HelpCircle size={14} className="text-blue-400" />
                  <span className="font-medium">MPP 格式匯入轉換說明</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. Project Name Input */}
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

      <div className="h-4 w-px bg-slate-700 mx-0.5 shrink-0" />

      {/* 5. View Mode Switcher */}
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

      <div className="h-4 w-px bg-slate-700 mx-0.5 shrink-0" />

      {/* 6. Project Start Date */}
      <div className="flex items-center space-x-1 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700 text-xs shrink-0">
        <Calendar size={13} className="text-slate-400" />
        <span className="text-slate-400 text-[11px]">專案起日:</span>
        <input
          type="date"
          value={startDate}
          onChange={e => onChangeStartDate(e.target.value)}
          className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer"
        />
      </div>

      {/* 6.1 Schedule Mode Toggle (工作天 / 日曆天) */}
      {onChangeScheduleMode && (
        <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700 space-x-0.5 shrink-0 text-xs">
          <button
            onClick={() => onChangeScheduleMode('working')}
            title="以「工作天」做日程規劃：遇週末、固定公休 (12/25, 01/01) 及自訂假日自動順延，不扣除工期"
            className={`flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              scheduleMode === 'working'
                ? 'bg-amber-600 text-white shadow-xs font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Briefcase size={12} />
            <span>工作天</span>
          </button>
          <button
            onClick={() => onChangeScheduleMode('calendar')}
            title="以「日曆天」做日程規劃：每日皆計為排程天數（連續日曆日），不排除假日"
            className={`flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              scheduleMode === 'calendar'
                ? 'bg-amber-600 text-white shadow-xs font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <CalendarDays size={12} />
            <span>日曆天</span>
          </button>
        </div>
      )}

      {/* 6.2 Holiday Management Button */}
      {onOpenHolidays && (
        <button
          onClick={onOpenHolidays}
          title="設定特定假日 (預設週六日、12/25、1/1，可自訂新增國定或特休假日)"
          className="flex items-center space-x-1.5 px-2 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0"
        >
          <Calendar size={12} className="text-amber-400" />
          <span>假日設定</span>
          {customHolidaysCount > 0 && (
            <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 font-bold rounded-full text-[10px]">
              {customHolidaysCount}
            </span>
          )}
        </button>
      )}

      <div className="h-4 w-px bg-slate-700 mx-0.5 shrink-0" />

      {/* 7. Undo / Redo Buttons (Moved forward to cluster nicely) */}
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

      {/* 8. Autosave Status Badge (Moved forward to cluster nicely) */}
      <div
        className="flex items-center justify-center text-[11px] font-mono px-2 py-1 rounded bg-slate-800/80 border border-slate-700/80 shrink-0 select-none cursor-default"
        title={
          isDirty
            ? `變更將自動備份至 [${projectName}_autosave]`
            : `已自動儲存至 [${projectName}_autosave] ${
                lastSavedTime ? `(${lastSavedTime})` : ''
              }\n點擊「檔案 ➔ 儲存」可存至原檔「${projectName}」`
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

      {/* Cycle Dependency Alert (if any) */}
      {hasCycle && (
        <div className="flex items-center space-x-1 px-2 py-0.5 bg-red-500/20 border border-red-500/50 rounded text-xs text-red-300 font-medium animate-pulse shrink-0">
          <AlertOctagon size={13} className="text-red-400" />
          <span>循環依賴！</span>
        </div>
      )}
    </header>
  );
};
