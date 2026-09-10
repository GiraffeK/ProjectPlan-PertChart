import { useState, useMemo, useEffect, useRef } from 'react';
import type { Task, ProjectData, ScheduleMode, Holiday } from './core/types';
import { calculateCPM, resolveWBSHierarchy, syncFirstChildPredecessors, getTodayDateStr } from './core/cpmEngine';
import { SAMPLE_PROJECT_TASKS } from './data/sampleProject';
import { exportToMSProjectXML, parseMSProjectXML } from './core/msProject';
import { PertChart, type NodePosition } from './components/PertChart';
import { GanttChart } from './components/GanttChart';
import { TaskTable } from './components/TaskTable';
import { Toolbar, type ViewMode } from './components/Toolbar';
import { TaskModal } from './components/TaskModal';
import { MppGuideModal } from './components/MppGuideModal';
import { SaveAsModal } from './components/SaveAsModal';
import { HelpModal } from './components/HelpModal';
import { ConfirmNewProjectModal } from './components/ConfirmNewProjectModal';
import { HolidayModal } from './components/HolidayModal';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

const DEFAULT_INITIAL_TASK: Task[] = [
  {
    id: 'T1',
    uid: 1,
    name: 'Start Project',
    duration: 1,
    category: 'Initiation',
    predecessors: [],
    x: 80,
    y: 80,
  },
];

const STORAGE_KEY = 'pertchart_project_data';
const STORAGE_TIME_KEY = 'pertchart_project_last_saved';

interface InitialProjectState {
  tasks: Task[];
  projectName: string;
  startDate: string;
  scheduleMode?: ScheduleMode;
  holidays?: Holiday[];
  pertTransform?: { x: number; y: number; scale: number };
}

const loadInitialProject = (): InitialProjectState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
        const posRecord = parsed.pertPositions || {};
        const loadedTasks = parsed.tasks.map((t: Task) => ({
          ...t,
          x: t.x !== undefined ? t.x : posRecord[t.id]?.x,
          y: t.y !== undefined ? t.y : posRecord[t.id]?.y,
        }));
        return {
          tasks: syncFirstChildPredecessors(loadedTasks),
          projectName: parsed.projectName || 'My Project',
          startDate: parsed.startDate || getTodayDateStr(),
          scheduleMode: (parsed.scheduleMode as ScheduleMode) || 'working',
          holidays: Array.isArray(parsed.holidays) ? parsed.holidays : [],
          pertTransform: parsed.pertTransform,
        };
      }
    }
  } catch (e) {
    console.error('Failed to load project from localStorage', e);
  }
  return {
    tasks: syncFirstChildPredecessors(DEFAULT_INITIAL_TASK),
    projectName: 'My Project',
    startDate: getTodayDateStr(),
    scheduleMode: 'working',
    holidays: [],
  };
};

export function App() {
  const initialData = useMemo(() => loadInitialProject(), []);
  const [tasks, setTasks] = useState<Task[]>(() => syncFirstChildPredecessors(initialData.tasks));
  const [projectName, setProjectName] = useState<string>(initialData.projectName);
  const [startDate, setStartDate] = useState<string>(initialData.startDate);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(() => initialData.scheduleMode || 'working');
  const [customHolidays, setCustomHolidays] = useState<Holiday[]>(() => initialData.holidays || []);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [initialPertTransform, setInitialPertTransform] = useState<{ x: number; y: number; scale: number } | undefined>(
    () => initialData.pertTransform
  );

  const pertPositionsRef = useRef<Map<string, NodePosition>>(
    (() => {
      const map = new Map<string, NodePosition>();
      initialData.tasks.forEach(t => {
        if (t.x !== undefined && t.y !== undefined) {
          map.set(t.id, { x: t.x, y: t.y, width: 190, height: 80 });
        }
      });
      return map;
    })()
  );
  const pertTransformRef = useRef<{ x: number; y: number; scale: number }>(
    initialData.pertTransform || { x: 80, y: 80, scale: 0.85 }
  );

  const getTasksWithPositions = (currentTasks: Task[]): Task[] => {
    const posMap = pertPositionsRef.current;
    return currentTasks.map(t => {
      const pos = posMap.get(t.id);
      if (pos) {
        return { ...t, x: pos.x, y: pos.y };
      }
      return t;
    });
  };

  const [viewMode, setViewMode] = useState<ViewMode>('pert');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_TIME_KEY) || null;
  });
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMppGuideOpen, setIsMppGuideOpen] = useState(false);
  const [isSaveAsOpen, setIsSaveAsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isConfirmNewProjectOpen, setIsConfirmNewProjectOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [pendingTaskPos, setPendingTaskPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingPredecessors, setPendingPredecessors] = useState<string[]>([]);

  // Undo / Redo History Stack
  interface HistorySnapshot {
    tasks: Task[];
    projectName: string;
    startDate: string;
    scheduleMode: ScheduleMode;
    holidays: Holiday[];
  }
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  const stateRef = useRef({ tasks, projectName, startDate, scheduleMode, customHolidays });
  stateRef.current = { tasks, projectName, startDate, scheduleMode, customHolidays };

  const pushHistory = () => {
    setUndoStack(prev => {
      const next = [
        ...prev,
        {
          tasks: stateRef.current.tasks,
          projectName: stateRef.current.projectName,
          startDate: stateRef.current.startDate,
          scheduleMode: stateRef.current.scheduleMode,
          holidays: [...stateRef.current.customHolidays],
        },
      ];
      if (next.length > 50) next.shift();
      return next;
    });
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [
      ...prev,
      {
        tasks: stateRef.current.tasks,
        projectName: stateRef.current.projectName,
        startDate: stateRef.current.startDate,
        scheduleMode: stateRef.current.scheduleMode,
        holidays: [...stateRef.current.customHolidays],
      },
    ]);
    setTasks(previous.tasks);
    setProjectName(previous.projectName);
    setStartDate(previous.startDate);
    if (previous.scheduleMode) setScheduleMode(previous.scheduleMode);
    if (previous.holidays) setCustomHolidays(previous.holidays);
    showToast('↩️ 已復原上一步操作 (Undo)', 'info');
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [
      ...prev,
      {
        tasks: stateRef.current.tasks,
        projectName: stateRef.current.projectName,
        startDate: stateRef.current.startDate,
        scheduleMode: stateRef.current.scheduleMode,
        holidays: [...stateRef.current.customHolidays],
      },
    ]);
    setTasks(next.tasks);
    setProjectName(next.projectName);
    setStartDate(next.startDate);
    if (next.scheduleMode) setScheduleMode(next.scheduleMode);
    if (next.holidays) setCustomHolidays(next.holidays);
    showToast('↪️ 已重做操作 (Redo)', 'info');
  };

  // Toast / notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // Selection state shared across Gantt and PERT charts
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Recalculate CPM automatically whenever tasks, start date, scheduleMode, or holidays change
  const cpmResult = useMemo(() => {
    return calculateCPM(tasks, startDate, scheduleMode, customHolidays);
  }, [tasks, startDate, scheduleMode, customHolidays]);

  // Save project:
  // - manual save writes to original project name: pertchart_project_${projectName}
  // - autosave writes to [projectName]_autosave: pertchart_project_${projectName}_autosave
  const handleSaveProject = (manual: boolean = true) => {
    try {
      const enrichedTasks = getTasksWithPositions(tasks);
      const pertPositions: Record<string, { x: number; y: number }> = {};
      pertPositionsRef.current.forEach((val, key) => {
        pertPositions[key] = { x: val.x, y: val.y };
      });
      const data = {
        projectName,
        startDate,
        scheduleMode,
        holidays: customHolidays,
        tasks: enrichedTasks,
        pertTransform: pertTransformRef.current,
        pertPositions,
      };
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      localStorage.setItem(STORAGE_TIME_KEY, nowStr);
      setLastSavedTime(nowStr);
      setIsDirty(false);

      if (manual) {
        localStorage.setItem(`pertchart_project_${projectName}`, JSON.stringify(data));
        showToast(`💾 專案已手動儲存至原檔「${projectName}」！下次開啟自動載入。`, 'success');
      } else {
        localStorage.setItem(`pertchart_project_${projectName}_autosave`, JSON.stringify(data));
      }
    } catch (err: any) {
      showToast('儲存失敗：' + (err.message || err), 'error');
    }
  };

  // Handle Save As (另存新檔)
  const handleSaveAs = async (newName: string, exportType: 'none' | 'xml' | 'json', dirHandle?: any) => {
    try {
      const trimmed = newName.trim();
      setProjectName(trimmed);
      const enrichedTasks = getTasksWithPositions(tasks);
      const pertPositions: Record<string, { x: number; y: number }> = {};
      pertPositionsRef.current.forEach((val, key) => {
        pertPositions[key] = { x: val.x, y: val.y };
      });
      const data = {
        projectName: trimmed,
        startDate,
        scheduleMode,
        holidays: customHolidays,
        tasks: enrichedTasks,
        pertTransform: pertTransformRef.current,
        pertPositions,
      };
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      localStorage.setItem(`pertchart_project_${trimmed}`, JSON.stringify(data));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      localStorage.setItem(STORAGE_TIME_KEY, nowStr);
      setLastSavedTime(nowStr);
      setIsDirty(false);

      const cleanName = trimmed.replace(/\.(json|xml)$/i, '').trim();
      const baseName = cleanName.toLowerCase().replace(/\s+/g, '_');
      const xmlFilename = `${baseName}.xml`;
      const jsonFilename = `${baseName}.json`;

      if (exportType === 'xml') {
        const projectData: ProjectData = {
          id: 'msp-export',
          name: trimmed,
          startDate,
          scheduleMode,
          holidays: customHolidays,
          tasks: cpmResult.tasks,
          criticalPathDuration: cpmResult.criticalPathDuration,
          criticalPathTaskIds: cpmResult.criticalPathTaskIds,
        };
        const xmlContent = exportToMSProjectXML(projectData);

        if (dirHandle && typeof dirHandle.getFileHandle === 'function') {
          // Write directly to user-selected directory
          const fileHandle = await dirHandle.getFileHandle(xmlFilename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(xmlContent);
          await writable.close();
          showToast(`🎉 已成功將 XML 另存至本機目錄 [${dirHandle.name}]！`, 'success');
        } else if ('showSaveFilePicker' in window) {
          try {
            const fileHandle = await (window as any).showSaveFilePicker({
              suggestedName: xmlFilename,
              types: [
                {
                  description: 'Microsoft Project XML (*.xml)',
                  accept: { 'application/xml': ['.xml'], 'text/xml': ['.xml'] },
                },
              ],
            });
            const writable = await fileHandle.createWritable();
            await writable.write(xmlContent);
            await writable.close();
            showToast(`🎉 已成功另存 XML 檔案 [${fileHandle.name}]！`, 'success');
          } catch (err: any) {
            if (err.name === 'AbortError') {
              showToast(`已建立新專案「${trimmed}」（已取消匯出 XML 檔案）`, 'info');
              return;
            }
            throw err;
          }
        } else {
          // Standard download fallback
          const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = xmlFilename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast(`🎉 已成功另存新檔「${trimmed}」並下載 XML！`, 'success');
        }
      } else if (exportType === 'json') {
        const jsonContent = JSON.stringify(data, null, 2);

        if (dirHandle && typeof dirHandle.getFileHandle === 'function') {
          // Write directly to user-selected directory
          const fileHandle = await dirHandle.getFileHandle(jsonFilename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(jsonContent);
          await writable.close();
          showToast(`🎉 已成功將 JSON 備份檔另存至本機目錄 [${dirHandle.name}]！`, 'success');
        } else if ('showSaveFilePicker' in window) {
          try {
            const fileHandle = await (window as any).showSaveFilePicker({
              suggestedName: jsonFilename,
              types: [
                {
                  description: 'JSON 專案檔 (*.json)',
                  accept: { 'application/json': ['.json'] },
                },
              ],
            });
            const writable = await fileHandle.createWritable();
            await writable.write(jsonContent);
            await writable.close();
            showToast(`🎉 已成功另存 JSON 檔案 [${fileHandle.name}]！`, 'success');
          } catch (err: any) {
            if (err.name === 'AbortError') {
              showToast(`已建立新專案「${trimmed}」（已取消匯出 JSON 檔案）`, 'info');
              return;
            }
            throw err;
          }
        } else {
          // Standard download fallback
          const blob = new Blob([jsonContent], {
            type: 'application/json;charset=utf-8',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = jsonFilename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast(`🎉 已成功另存新檔「${trimmed}」並下載 JSON！`, 'success');
        }
      } else {
        // exportType === 'none' (另存為新專案)
        if (dirHandle && typeof dirHandle.getFileHandle === 'function') {
          // User picked a computer directory: save project backup into that directory as well!
          const jsonContent = JSON.stringify(data, null, 2);
          const fileHandle = await dirHandle.getFileHandle(jsonFilename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(jsonContent);
          await writable.close();
          showToast(`🎉 已另存新專案「${trimmed}」，並同步儲存至電腦目錄 [${dirHandle.name}]！`, 'success');
        } else {
          showToast(`🎉 已成功另存新專案為「${trimmed}」！`, 'success');
        }
      }
    } catch (err: any) {
      showToast('另存新檔失敗：' + (err.message || err), 'error');
    }
  };

  // Holiday and Schedule Mode Handlers
  const handleAddHoliday = (holiday: { date: string; name: string }) => {
    pushHistory();
    const newH: Holiday = {
      id: `H_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      date: holiday.date,
      name: holiday.name,
    };
    setCustomHolidays(prev => [...prev, newH]);
    showToast(`已新增特定假日：${holiday.date} (${holiday.name || '自訂假日'})`, 'success');
  };

  const handleRemoveHoliday = (holidayId: string) => {
    pushHistory();
    setCustomHolidays(prev => prev.filter(h => h.id !== holidayId));
    showToast('已移除自訂假日', 'info');
  };

  const handleChangeStartDate = (newDate: string) => {
    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return;
    if (newDate === startDate) return;
    pushHistory();
    setStartDate(newDate);
    showToast(`📅 專案起日已設定為：${newDate}（所有任務排程已同步更新）`, 'info');
  };

  const handleChangeScheduleMode = (mode: ScheduleMode) => {
    if (mode === scheduleMode) return;
    pushHistory();
    setScheduleMode(mode);
    showToast(`已切換日程規劃模式為「${mode === 'working' ? '💼 工作天' : '📆 日曆天'}」`, 'info');
  };

  // Update schedule (start offset or duration) from Gantt drag
  const handleUpdateTaskSchedule = (
    taskId: string,
    updates: { manualEarlyStart?: number; duration?: number }
  ) => {
    pushHistory();
    setTasks(prev =>
      prev.map(t =>
        t.id === taskId
          ? {
              ...t,
              manualEarlyStart:
                updates.manualEarlyStart !== undefined
                  ? Math.round((updates.manualEarlyStart + Number.EPSILON) * 100) / 100
                  : t.manualEarlyStart,
              duration:
                updates.duration !== undefined
                  ? Math.round((Math.max(0, updates.duration) + Number.EPSILON) * 100) / 100
                  : t.duration,
            }
          : t
      )
    );
  };

  // Indent task(s) as subtask(s):
  // 支援單一任務或多個已選取任務同時縮排（例如 T2, T3 都選中時一起縮排）
  const handleIndentTask = (target: Task | Task[] | string[] | string) => {
    let targetIds: string[] = [];
    if (Array.isArray(target)) {
      targetIds = target.map(item => (typeof item === 'string' ? item : item.id));
    } else if (typeof target === 'string') {
      targetIds = [target];
    } else {
      targetIds = [target.id];
    }

    if (targetIds.length === 0) return;

    const targetSet = new Set(targetIds);
    const orderedTargetTasks = tasks.filter(t => targetSet.has(t.id));
    if (orderedTargetTasks.length === 0) return;

    const firstIdx = tasks.findIndex(t => t.id === orderedTargetTasks[0].id);
    if (firstIdx <= 0 && orderedTargetTasks.length === 1) {
      showToast(`第一項任務 [${orderedTargetTasks[0].id}] 上方無鄰接任務，無法縮排`, 'info');
      return;
    }

    pushHistory();

    setTasks(prev => {
      const next = prev.map(t => ({ ...t }));

      for (let k = 0; k < orderedTargetTasks.length; k++) {
        const currentTarget = orderedTargetTasks[k];
        const idx = next.findIndex(t => t.id === currentTarget.id);
        if (idx <= 0) continue;

        const prevTask = next[idx - 1];
        const prevLevel = prevTask.outlineLevel || 1;
        const currentLevel = next[idx].outlineLevel || 1;

        let newLevel: number;
        let newParentId: string | undefined;

        // 若直接前一列也是本次同時縮排的任務，則維持同階兄弟子任務關係
        if (targetSet.has(prevTask.id)) {
          newLevel = prevTask.outlineLevel || 1;
          newParentId = prevTask.parentId;
        } else {
          if (currentLevel === prevLevel) {
            // 規則 1: 和 UI 上一層鄰接 task 同一階時，讓上一層 task 直接為其父階 task
            newParentId = prevTask.id;
            newLevel = prevLevel + 1;
          } else if (prevLevel > currentLevel) {
            // 規則 2: 若上一階已是別人的子階，就讓他也成為同一父階的子階
            newParentId = prevTask.parentId;
            newLevel = prevLevel;
          } else {
            // 當前已比上一階深，進一步以上一階為父階
            newParentId = prevTask.id;
            newLevel = currentLevel + 1;
          }
        }

        next[idx].outlineLevel = newLevel;
        next[idx].parentId = newParentId;
      }

      return syncFirstChildPredecessors(next);
    });

    if (orderedTargetTasks.length === 1) {
      showToast(`已縮排任務 [${orderedTargetTasks[0].id}] 為子任務`, 'info');
    } else {
      showToast(`已同時縮排 ${orderedTargetTasks.length} 個任務 (${orderedTargetTasks.map(t => t.id).join(', ')})`, 'success');
    }
  };

  // Outdent task(s)
  const handleOutdentTask = (target: Task | Task[] | string[] | string) => {
    let targetIds: string[] = [];
    if (Array.isArray(target)) {
      targetIds = target.map(item => (typeof item === 'string' ? item : item.id));
    } else if (typeof target === 'string') {
      targetIds = [target];
    } else {
      targetIds = [target.id];
    }

    if (targetIds.length === 0) return;

    const targetSet = new Set(targetIds);
    const orderedTargetTasks = tasks.filter(t => targetSet.has(t.id));
    const outdentable = orderedTargetTasks.filter(t => (t.outlineLevel || 1) > 1);

    if (outdentable.length === 0) {
      showToast(`所選任務已是頂級任務，無法再凸排`, 'info');
      return;
    }

    pushHistory();

    setTasks(prev => {
      const next = prev.map(t => ({ ...t }));

      for (let k = 0; k < orderedTargetTasks.length; k++) {
        const currentTarget = orderedTargetTasks[k];
        const idx = next.findIndex(t => t.id === currentTarget.id);
        if (idx < 0) continue;

        const currentLevel = next[idx].outlineLevel || 1;
        if (currentLevel <= 1) continue;

        const newLevel = currentLevel - 1;
        let parentId: string | undefined = undefined;

        if (newLevel > 1) {
          for (let i = idx - 1; i >= 0; i--) {
            const pLevel = next[i].outlineLevel || 1;
            if (pLevel < newLevel) {
              parentId = next[i].id;
              break;
            } else if (pLevel === newLevel) {
              parentId = next[i].parentId;
              break;
            }
          }
        }

        next[idx].outlineLevel = newLevel;
        next[idx].parentId = parentId;
      }

      return syncFirstChildPredecessors(next);
    });

    if (outdentable.length === 1) {
      showToast(`已將任務 [${outdentable[0].id}] 凸排 (階層 ${outdentable[0].outlineLevel ? outdentable[0].outlineLevel - 1 : 1})`, 'info');
    } else {
      showToast(`已同時凸排 ${outdentable.length} 個任務`, 'success');
    }
  };

  // Auto-save debounced when tasks, projectName, or startDate changes
  useEffect(() => {
    setIsDirty(true);
    const timer = setTimeout(() => {
      handleSaveProject(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, [tasks, projectName, startDate, scheduleMode, customHolidays]);

  // Keyboard shortcuts: Ctrl+S (Save), Ctrl+Z (Undo), Ctrl+Y / Ctrl+Shift+Z (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveProject(true);
      } else if ((e.key === 'Delete' || e.key === 'Del') && selectedTaskIds.size > 0) {
        e.preventDefault();
        handleDeleteMultipleTasks(Array.from(selectedTaskIds));
        setSelectedTaskIds(new Set());
      } else if (e.key === 'Escape') {
        setSelectedTaskIds(new Set());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack, tasks, projectName, startDate, selectedTaskIds]);

  // Handle drag-to-draw create task at coordinate (with optional predecessor)
  const handleCreateTaskAt = (pos: { x: number; y: number }, predecessorId?: string) => {
    setPendingTaskPos(pos);
    setPendingPredecessors(predecessorId ? [predecessorId] : []);
    setEditingTask(null);
    setIsModalOpen(true);
  };

  // Persist node dragged positions
  const handleUpdateTaskPosition = (taskId: string, x: number, y: number) => {
    pertPositionsRef.current.set(taskId, { x, y, width: 190, height: 80 });
    setTasks(prev =>
      prev.map(t => (t.id === taskId ? { ...t, x, y } : t))
    );
  };

  const handleUpdateTaskPositions = (updates: Array<{ id: string; x: number; y: number }>) => {
    updates.forEach(u => {
      pertPositionsRef.current.set(u.id, { x: u.x, y: u.y, width: 190, height: 80 });
    });
    const updateMap = new Map(updates.map(u => [u.id, u]));
    setTasks(prev =>
      prev.map(t => {
        const u = updateMap.get(t.id);
        return u ? { ...t, x: u.x, y: u.y } : t;
      })
    );
  };

  // Handle Save Task (Create or Update)
  const handleSaveTask = (taskData: Partial<Task>) => {
    pushHistory();
    if (taskData.id) {
      // Update existing
      setTasks(prev => {
        // Check if predecessor was removed from a first child that also belonged to its parent
        const { parentMap, childrenMap } = resolveWBSHierarchy(prev);
        const parentId = parentMap.get(taskData.id!);
        const isFirstChild = parentId ? childrenMap.get(parentId)?.[0] === taskData.id : false;

        const newPreds = taskData.predecessors || [];
        const existingTask = prev.find(t => t.id === taskData.id);
        const removedPreds = (existingTask?.predecessors || []).filter(p => !newPreds.includes(p));

        const next = prev.map(t => {
          if (t.id === taskData.id) {
            return {
              ...t,
              name: taskData.name !== undefined ? taskData.name : t.name,
              duration: taskData.duration ?? t.duration,
              category: taskData.category,
              predecessors: newPreds,
              anchor: taskData.anchor,
              summaryLabel:
                taskData.summaryLabel !== undefined
                  ? taskData.summaryLabel
                  : t.summaryLabel,
            };
          }
          // If editing first child and user removed a predecessor that parent had, also remove from parent
          if (isFirstChild && t.id === parentId && removedPreds.length > 0) {
            return {
              ...t,
              predecessors: (t.predecessors || []).filter(p => !removedPreds.includes(p)),
            };
          }
          return t;
        });
        return syncFirstChildPredecessors(next);
      });
      showToast(`已更新任務 [${taskData.id}] ${taskData.name || ''}`, 'success');
    } else {
      // Create new
      let maxNum = 0;
      tasks.forEach(t => {
        const num = parseInt(t.id.replace(/\D/g, ''), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      });
      const newId = `T${maxNum + 1}`;
      const predecessors =
        taskData.predecessors !== undefined
          ? taskData.predecessors
          : pendingPredecessors;

      // Determine outlineLevel and parentId from predecessor if not explicitly provided
      const primaryPredId = predecessors && predecessors.length > 0 ? predecessors[0] : undefined;
      const predTask = primaryPredId ? tasks.find(t => t.id === primaryPredId) : undefined;
      let outlineLevel = taskData.outlineLevel;
      let parentId = taskData.parentId;

      if (outlineLevel === undefined && predTask) {
        if (predTask.isSummary) {
          // If dragged from a summary task, child is inside it
          outlineLevel = (predTask.outlineLevel || 1) + 1;
          parentId = predTask.id;
        } else {
          // Same level and same parent as predecessor (e.g. dragging from T9 child -> T10 has same level & parent as T9)
          outlineLevel = predTask.outlineLevel || 1;
          parentId = predTask.parentId;
        }
      }

      const newTask: Task = {
        id: newId,
        uid: maxNum + 1,
        name: taskData.name !== undefined ? taskData.name : '',
        duration: taskData.duration ?? 1,
        category: taskData.category,
        outlineLevel: outlineLevel || 1,
        parentId,
        predecessors,
        anchor: taskData.anchor,
        x: pendingTaskPos?.x,
        y: pendingTaskPos?.y,
      };

      setTasks(prev => {
        const next = [...prev];
        // Insert right after the predecessor (or after its subtree if summary) to maintain natural WBS order
        if (predTask) {
          const predIdx = next.findIndex(t => t.id === predTask.id);
          if (predIdx >= 0) {
            let k = predIdx + 1;
            const predLevel = predTask.outlineLevel || 1;
            while (k < next.length && (next[k].outlineLevel || 1) > predLevel) {
              k++;
            }
            next.splice(k, 0, newTask);
            return syncFirstChildPredecessors(next);
          }
        }
        next.push(newTask);
        return syncFirstChildPredecessors(next);
      });
      setPendingTaskPos(null);
      setPendingPredecessors([]);
      showToast(`已在畫布建立新任務 [${newId}] ${newTask.name || ''}`, 'success');
    }
  };

  // Handle Delete Task
  const handleDeleteTask = (taskId: string) => {
    pushHistory();
    setTasks(prev => {
      const next = prev
        .filter(t => t.id !== taskId)
        .map(t => ({
          ...t,
          predecessors: (t.predecessors || []).filter(p => p !== taskId),
        }));
      return syncFirstChildPredecessors(next);
    });
    showToast(`已刪除任務 [${taskId}]`, 'info');
  };

  // Handle Delete Multiple Tasks
  const handleDeleteMultipleTasks = (taskIds: string[]) => {
    if (taskIds.length === 0) return;
    pushHistory();
    const idSet = new Set(taskIds);
    setTasks(prev => {
      const next = prev
        .filter(t => !idSet.has(t.id))
        .map(t => ({
          ...t,
          predecessors: (t.predecessors || []).filter(p => !idSet.has(p)),
        }));
      return syncFirstChildPredecessors(next);
    });
    showToast(`已刪除 ${taskIds.length} 個任務`, 'info');
  };

  // Reorder tasks (Drag and drop row)
  const handleReorderTasks = (sourceTaskIds: string[], targetTaskId: string, position: 'before' | 'after') => {
    if (sourceTaskIds.length === 0 || sourceTaskIds.includes(targetTaskId)) return;
    pushHistory();
    setTasks(prev => {
      const moving = prev.filter(t => sourceTaskIds.includes(t.id));
      const remaining = prev.filter(t => !sourceTaskIds.includes(t.id));
      const targetIdx = remaining.findIndex(t => t.id === targetTaskId);
      if (targetIdx < 0) return prev;

      const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
      const nextTasks = [...remaining];
      nextTasks.splice(insertIdx, 0, ...moving);
      return syncFirstChildPredecessors(nextTasks);
    });
    showToast(`已調整 ${sourceTaskIds.length} 項任務順序`, 'info');
  };

  // Insert task above or below target
  const handleInsertTask = (targetTaskId: string, position: 'before' | 'after') => {
    pushHistory();
    setTasks(prev => {
      let maxNum = 0;
      prev.forEach(t => {
        const num = parseInt(t.id.replace(/\D/g, ''), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      });
      const newId = `T${maxNum + 1}`;
      const targetTask = prev.find(t => t.id === targetTaskId);
      const targetIdx = prev.findIndex(t => t.id === targetTaskId);

      const newTask: Task = {
        id: newId,
        uid: maxNum + 1,
        name: `新任務 ${newId}`,
        duration: 1,
        outlineLevel: targetTask?.outlineLevel ?? 1,
        parentId: targetTask?.parentId,
        predecessors: [],
      };

      const nextTasks = [...prev];
      const insertIdx = targetIdx < 0 ? nextTasks.length : position === 'before' ? targetIdx : targetIdx + 1;
      nextTasks.splice(insertIdx, 0, newTask);
      return syncFirstChildPredecessors(nextTasks);
    });
    showToast(`已在${position === 'before' ? '上方' : '下方'}插入新任務`, 'success');
  };

  // Clipboard state for copy / cut / paste
  const [clipboard, setClipboard] = useState<{
    tasks: Task[];
    mode: 'copy' | 'cut';
  } | null>(null);

  const handleCopyTasks = (taskIds: string[]) => {
    const matched = tasks.filter(t => taskIds.includes(t.id));
    if (matched.length === 0) return;
    setClipboard({ tasks: matched, mode: 'copy' });
    showToast(`已複製 ${matched.length} 項任務到剪貼簿`, 'info');
  };

  const handleCutTasks = (taskIds: string[]) => {
    const matched = tasks.filter(t => taskIds.includes(t.id));
    if (matched.length === 0) return;
    setClipboard({ tasks: matched, mode: 'cut' });
    showToast(`已剪下 ${matched.length} 項任務，請至目標位置按右鍵「貼上」`, 'info');
  };

  const handlePasteTasks = (targetTaskId: string) => {
    if (!clipboard || clipboard.tasks.length === 0) {
      showToast('剪貼簿無任務可貼上', 'info');
      return;
    }

    pushHistory();
    if (clipboard.mode === 'cut') {
      const cutIds = clipboard.tasks.map(t => t.id);
      handleReorderTasks(cutIds, targetTaskId, 'after');
      setClipboard(null);
      showToast(`已移動貼上 ${cutIds.length} 項任務`, 'success');
    } else {
      setTasks(prev => {
        let maxNum = 0;
        prev.forEach(t => {
          const num = parseInt(t.id.replace(/\D/g, ''), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        });

        const newTasks: Task[] = clipboard.tasks.map(orig => {
          maxNum++;
          return {
            ...orig,
            id: `T${maxNum}`,
            uid: maxNum,
            name: `${orig.name} (複本)`,
            predecessors: [],
          };
        });

        const targetIdx = prev.findIndex(t => t.id === targetTaskId);
        const nextTasks = [...prev];
        const insertIdx = targetIdx < 0 ? nextTasks.length : targetIdx + 1;
        nextTasks.splice(insertIdx, 0, ...newTasks);
        return syncFirstChildPredecessors(nextTasks);
      });
      showToast(`已複製並貼上 ${clipboard.tasks.length} 項新任務`, 'success');
    }
  };

  // Connect dependency directly in PERT chart
  const handleAddDependency = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    pushHistory();
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id === toId && !t.predecessors.includes(fromId)) {
          return {
            ...t,
            predecessors: [...t.predecessors, fromId],
          };
        }
        return t;
      });
      return syncFirstChildPredecessors(next);
    });
    showToast(`已建立依賴關聯：[${fromId}] ➔ [${toId}]`, 'success');
  };

  // Remove dependency directly (when double clicked in PERT arrow or Gantt tag)
  const handleRemoveDependency = (fromId: string, toId: string) => {
    pushHistory();
    setTasks(prev => {
      const { parentMap, childrenMap } = resolveWBSHierarchy(prev);
      const parentId = parentMap.get(toId);
      const isFirstChild = parentId ? childrenMap.get(parentId)?.[0] === toId : false;

      const next = prev.map(t => {
        if (t.id === toId) {
          return {
            ...t,
            predecessors: t.predecessors.filter(p => p !== fromId),
          };
        }
        // If removing from first child, also remove from parent if present so it doesn't get re-synced
        if (isFirstChild && t.id === parentId) {
          return {
            ...t,
            predecessors: t.predecessors.filter(p => p !== fromId),
          };
        }
        return t;
      });
      return syncFirstChildPredecessors(next);
    });
    showToast(`已刪除前置任務依賴：[${fromId}] ➔ [${toId}]`, 'info');
  };

  // Edit/replace predecessor task ID (when double clicked in Gantt tag)
  const handleUpdatePredecessor = (toId: string, oldPredId: string, newPredId: string) => {
    if (oldPredId === newPredId) return;
    if (newPredId === toId) {
      showToast(`前置任務不能是自己 [${toId}]`, 'error');
      return;
    }
    const targetTaskExists = tasks.some(t => t.id === newPredId);
    if (!targetTaskExists) {
      showToast(`找不到任務編號 [${newPredId}]，請確認編號是否正確`, 'error');
      return;
    }
    pushHistory();
    setTasks(prev => {
      const { parentMap, childrenMap } = resolveWBSHierarchy(prev);
      const parentId = parentMap.get(toId);
      const isFirstChild = parentId ? childrenMap.get(parentId)?.[0] === toId : false;

      const next = prev.map(t => {
        if (t.id === toId) {
          const nextPreds = t.predecessors.map(p => (p === oldPredId ? newPredId : p));
          return {
            ...t,
            predecessors: Array.from(new Set(nextPreds)),
          };
        }
        if (isFirstChild && t.id === parentId) {
          const nextPreds = (t.predecessors || []).map(p => (p === oldPredId ? newPredId : p));
          return {
            ...t,
            predecessors: Array.from(new Set(nextPreds)),
          };
        }
        return t;
      });
      return syncFirstChildPredecessors(next);
    });
    showToast(`已更新前置任務編號：[${oldPredId}] ➔ [${newPredId}]`, 'success');
  };

  // Export to Microsoft Project XML (supports choosing save directory)
  const handleExportMSProject = async () => {
    const projectData: ProjectData = {
      id: 'msp-export',
      name: projectName,
      startDate,
      scheduleMode,
      holidays: customHolidays,
      tasks: cpmResult.tasks,
      criticalPathDuration: cpmResult.criticalPathDuration,
      criticalPathTaskIds: cpmResult.criticalPathTaskIds,
    };
    const xmlContent = exportToMSProjectXML(projectData);
    const cleanProjectName = projectName.replace(/\.xml$/i, '').trim();
    const xmlFilename = `${cleanProjectName.toLowerCase().replace(/\s+/g, '_')}.xml`;

    if ('showSaveFilePicker' in window) {
      try {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: xmlFilename,
          types: [
            {
              description: 'Microsoft Project XML (*.xml)',
              accept: { 'application/xml': ['.xml'], 'text/xml': ['.xml'] },
            },
          ],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(xmlContent);
        await writable.close();
        showToast(`🎉 已成功儲存 XML 至本機檔案 [${fileHandle.name}]！`, 'success');
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.warn('showSaveFilePicker error, falling back:', err);
      }
    }

    const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = xmlFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('已成功匯出 Microsoft Project XML 檔案！', 'success');
  };

  // Import Microsoft Project XML or MPP
  const handleImportMSProject = (file: File) => {
    if (file.name.toLowerCase().endsWith('.mpp')) {
      showToast('正在透過解析引擎讀取 .mpp 檔案，請稍候...', 'info');
      fetch('/api/parse-mpp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: file,
      })
        .then(async res => {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          if (!data.tasks || data.tasks.length === 0) {
            throw new Error('未能從該 .mpp 檔案解析出有效任務。');
          }
          setProjectName(data.projectName || 'Imported Project');
          if (data.startDate) {
            setStartDate(data.startDate);
          }
          pertPositionsRef.current.clear();
          setTasks(syncFirstChildPredecessors(data.tasks));
          showToast(
            `🎉 成功直接匯入 .mpp 專案「${data.projectName}」，共 ${data.tasks.length} 個任務！`,
            'success'
          );
        })
        .catch(err => {
          console.warn('Direct MPP parse error:', err);
          setIsMppGuideOpen(true);
          showToast(`無法直接解析此 .mpp 格式（${err.message || '格式限制'}），已為您開啟轉換指引！`, 'info');
        });
      return;
    }

    // Import JSON backup
    if (file.name.toLowerCase().endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (data.tasks && Array.isArray(data.tasks)) {
            pushHistory();
            setProjectName(data.projectName || 'Imported Project');
            if (data.startDate) setStartDate(data.startDate);
            if (data.scheduleMode) setScheduleMode(data.scheduleMode);
            if (Array.isArray(data.holidays)) setCustomHolidays(data.holidays);

            const posRecord = data.pertPositions || {};
            const restoredTasks: Task[] = data.tasks.map((t: any) => ({
              ...t,
              x: t.x !== undefined ? t.x : posRecord[t.id]?.x,
              y: t.y !== undefined ? t.y : posRecord[t.id]?.y,
            }));

            // Clear and repopulate pertPositionsRef immediately
            const newPosMap = new Map<string, NodePosition>();
            restoredTasks.forEach(t => {
              if (t.x !== undefined && t.y !== undefined) {
                newPosMap.set(t.id, { x: t.x, y: t.y, width: 190, height: 80 });
              }
            });
            pertPositionsRef.current = newPosMap;

            if (data.pertTransform) {
              pertTransformRef.current = data.pertTransform;
              setInitialPertTransform({ ...data.pertTransform });
            }

            setTasks(syncFirstChildPredecessors(restoredTasks));
            showToast(`成功匯入專案備份檔「${data.projectName || file.name}」，共 ${data.tasks.length} 個任務！`, 'success');
          } else {
            showToast('JSON 備份檔案格式無效（缺少 tasks 陣列）', 'error');
          }
        } catch (err: any) {
          showToast('解析 JSON 備份檔失敗：' + err.message, 'error');
        }
      };
      reader.readAsText(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target?.result as string;
      if (!content) return;
      try {
        const imported = parseMSProjectXML(content);
        if (imported.tasks.length === 0) {
          showToast('檔案中未找到有效任務資料', 'error');
          return;
        }
        pushHistory();
        setProjectName(imported.projectName);
        setStartDate(imported.startDate);
        if (imported.scheduleMode) {
          setScheduleMode(imported.scheduleMode);
        }
        if (imported.holidays && imported.holidays.length > 0) {
          setCustomHolidays(imported.holidays);
        }
        pertPositionsRef.current.clear();
        setTasks(syncFirstChildPredecessors(imported.tasks));
        showToast(
          `成功匯入 Microsoft Project 專案「${imported.projectName}」，共 ${imported.tasks.length} 個任務！`,
          'success'
        );
      } catch (err: any) {
        showToast('解析 XML 失敗：' + (err.message || err), 'error');
      }
    };
    reader.readAsText(file);
  };

  // Export JSON Backup (supports choosing save directory)
  const handleExportJSON = async () => {
    const enrichedTasks = getTasksWithPositions(tasks);
    const pertPositions: Record<string, { x: number; y: number }> = {};
    pertPositionsRef.current.forEach((val, key) => {
      pertPositions[key] = { x: val.x, y: val.y };
    });
    const backup = {
      projectName,
      startDate,
      scheduleMode,
      holidays: customHolidays,
      tasks: enrichedTasks,
      criticalPathDuration: cpmResult.criticalPathDuration,
      criticalPathTaskIds: cpmResult.criticalPathTaskIds,
      pertTransform: pertTransformRef.current,
      pertPositions,
    };
    const jsonContent = JSON.stringify(backup, null, 2);
    const cleanProjectName = projectName.replace(/\.json$/i, '').trim();
    const jsonFilename = `${cleanProjectName.toLowerCase().replace(/\s+/g, '_')}.json`;

    if ('showSaveFilePicker' in window) {
      try {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: jsonFilename,
          types: [
            {
              description: 'JSON 專案備份檔 (*.json)',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(jsonContent);
        await writable.close();
        showToast(`🎉 已成功儲存備份至本機檔案 [${fileHandle.name}]！`, 'success');
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.warn('showSaveFilePicker error, falling back:', err);
      }
    }

    const blob = new Blob([jsonContent], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = jsonFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('已下載專案 JSON 備份檔', 'info');
  };

  // Reload Sample
  const handleLoadSample = () => {
    pushHistory();
    pertPositionsRef.current.clear();
    setTasks(syncFirstChildPredecessors(SAMPLE_PROJECT_TASKS));
    setProjectName('Software Development Project');
    setStartDate('2000-02-01');
    setInitialPertTransform({ x: 80, y: 80, scale: 0.85 });
    showToast('已重新載入 88 天軟體開發專案參考範例！', 'info');
  };

  // Execute resetting to first-time entrance state (新增專案)
  const handleCreateNewProject = () => {
    pushHistory();
    const today = getTodayDateStr();
    const initialTasks = syncFirstChildPredecessors(DEFAULT_INITIAL_TASK);
    pertPositionsRef.current.clear();
    setTasks(initialTasks);
    setProjectName('My Project');
    setStartDate(today);
    setScheduleMode('working');
    setCustomHolidays([]);
    setInitialPertTransform({ x: 80, y: 80, scale: 0.85 });
    setSelectedTaskIds(new Set());
    setUndoStack([]);
    setRedoStack([]);

    // Clear saved storage so next refresh stays in fresh initial state
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_TIME_KEY);
      setLastSavedTime(null);
      setIsDirty(false);
    } catch (e) {
      console.error(e);
    }

    showToast('✨ 已成功建立新專案！所有畫面已重設為初始狀態。', 'success');
  };

  // Prompt or directly create new project
  const handleRequestNewProject = () => {
    if (isDirty) {
      setIsConfirmNewProjectOpen(true);
    } else {
      handleCreateNewProject();
    }
  };

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-slate-100">
      {/* Top Main Toolbar */}
      <Toolbar
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        projectName={projectName}
        onChangeProjectName={setProjectName}
        onNewProject={handleRequestNewProject}
        onAddTask={() => {
          setEditingTask(null);
          setIsModalOpen(true);
        }}
        onSave={() => handleSaveProject(true)}
        onSaveAs={() => setIsSaveAsOpen(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        isDirty={isDirty}
        lastSavedTime={lastSavedTime}
        onLoadSample={handleLoadSample}
        onExportMSProject={handleExportMSProject}
        onImportMSProject={handleImportMSProject}
        onExportJSON={handleExportJSON}
        onOpenMppGuide={() => setIsMppGuideOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
        startDate={startDate}
        onChangeStartDate={handleChangeStartDate}
        scheduleMode={scheduleMode}
        onChangeScheduleMode={handleChangeScheduleMode}
        customHolidaysCount={customHolidays.length}
        onOpenHolidays={() => setIsHolidayModalOpen(true)}
        criticalPathDuration={cpmResult.criticalPathDuration}
        hasCycle={cpmResult.hasCycle}
      />

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden">
        {/* Cycle Error Banner */}
        {cpmResult.hasCycle && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-red-600 text-white px-5 py-2.5 rounded-xl shadow-xl flex items-center space-x-3 text-xs font-semibold animate-bounce">
            <AlertTriangle size={18} />
            <span>
              檢測到前置依賴循環！涉及節點：{cpmResult.cycleNodes.join(' ➔ ')}，無法計算關鍵路徑。
            </span>
          </div>
        )}

        {/* View Routing */}
        {viewMode === 'pert' && (
          <PertChart
            tasks={cpmResult.tasks}
            criticalPathDuration={cpmResult.criticalPathDuration}
            criticalPathTaskIds={cpmResult.criticalPathTaskIds}
            criticalEdges={cpmResult.criticalEdges}
            selectedTaskIds={selectedTaskIds}
            onSelectTaskIds={setSelectedTaskIds}
            onSelectTask={t => {
              setEditingTask(t);
              setIsModalOpen(true);
            }}
            onAddDependency={handleAddDependency}
            onRemoveDependency={handleRemoveDependency}
            onCreateTaskAt={handleCreateTaskAt}
            onUpdateTaskPosition={handleUpdateTaskPosition}
            onUpdateTaskPositions={handleUpdateTaskPositions}
            onPositionsChange={posMap => {
              pertPositionsRef.current = posMap;
            }}
            onTransformChange={tf => {
              pertTransformRef.current = tf;
            }}
            initialTransform={initialPertTransform}
            onIndentTask={handleIndentTask}
            onOutdentTask={handleOutdentTask}
            onDeleteTask={handleDeleteTask}
            onDeleteMultipleTasks={handleDeleteMultipleTasks}
            onUpdateTaskDuration={(taskId, newDuration) =>
              handleUpdateTaskSchedule(taskId, { duration: newDuration })
            }
          />
        )}

        {viewMode === 'gantt' && (
          <GanttChart
            tasks={cpmResult.tasks}
            criticalPathDuration={cpmResult.criticalPathDuration}
            criticalPathTaskIds={cpmResult.criticalPathTaskIds}
            projectStartDate={startDate}
            scheduleMode={scheduleMode}
            holidays={customHolidays}
            selectedTaskIds={selectedTaskIds}
            onSelectTaskIds={setSelectedTaskIds}
            onSelectTask={t => {
              setEditingTask(t);
              setIsModalOpen(true);
            }}
            onUpdateTaskSchedule={handleUpdateTaskSchedule}
            onRemoveDependency={handleRemoveDependency}
            onUpdatePredecessor={handleUpdatePredecessor}
            onIndentTask={handleIndentTask}
            onOutdentTask={handleOutdentTask}
            onDeleteTask={handleDeleteTask}
            onDeleteMultipleTasks={handleDeleteMultipleTasks}
            onReorderTasks={handleReorderTasks}
            onInsertTask={handleInsertTask}
            onCopyTasks={handleCopyTasks}
            onCutTasks={handleCutTasks}
            onPasteTasks={handlePasteTasks}
            hasClipboard={!!clipboard && clipboard.tasks.length > 0}
            clipboardCount={clipboard?.tasks.length || 0}
          />
        )}

        {viewMode === 'split' && (
          <div className="flex flex-col h-full w-full divide-y-2 divide-slate-300">
            {/* Top Half: PERT */}
            <div className="h-1/2 w-full relative">
              <div className="absolute top-2 left-3 z-20 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded">
                PERT Chart (網圖)
              </div>
              <PertChart
                tasks={cpmResult.tasks}
                criticalPathDuration={cpmResult.criticalPathDuration}
                criticalPathTaskIds={cpmResult.criticalPathTaskIds}
                criticalEdges={cpmResult.criticalEdges}
                selectedTaskIds={selectedTaskIds}
                onSelectTaskIds={setSelectedTaskIds}
                onSelectTask={t => {
                  setEditingTask(t);
                  setIsModalOpen(true);
                }}
                onAddDependency={handleAddDependency}
                onRemoveDependency={handleRemoveDependency}
                onCreateTaskAt={handleCreateTaskAt}
                onUpdateTaskPosition={handleUpdateTaskPosition}
                onUpdateTaskPositions={handleUpdateTaskPositions}
                onPositionsChange={posMap => {
                  pertPositionsRef.current = posMap;
                }}
                onTransformChange={tf => {
                  pertTransformRef.current = tf;
                }}
                initialTransform={initialPertTransform}
                onIndentTask={handleIndentTask}
                onOutdentTask={handleOutdentTask}
                onDeleteTask={handleDeleteTask}
                onUpdateTaskDuration={(taskId, newDuration) =>
                  handleUpdateTaskSchedule(taskId, { duration: newDuration })
                }
              />
            </div>

            {/* Bottom Half: Gantt */}
            <div className="h-1/2 w-full relative">
              <div className="absolute top-2 left-3 z-20 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded">
                Gantt Chart (甘特圖)
              </div>
              <GanttChart
                tasks={cpmResult.tasks}
                criticalPathDuration={cpmResult.criticalPathDuration}
                criticalPathTaskIds={cpmResult.criticalPathTaskIds}
                projectStartDate={startDate}
                scheduleMode={scheduleMode}
                holidays={customHolidays}
                selectedTaskIds={selectedTaskIds}
                onSelectTaskIds={setSelectedTaskIds}
                onSelectTask={t => {
                  setEditingTask(t);
                  setIsModalOpen(true);
                }}
                onUpdateTaskSchedule={handleUpdateTaskSchedule}
                onRemoveDependency={handleRemoveDependency}
                onUpdatePredecessor={handleUpdatePredecessor}
                onIndentTask={handleIndentTask}
                onOutdentTask={handleOutdentTask}
                onDeleteTask={handleDeleteTask}
                onDeleteMultipleTasks={handleDeleteMultipleTasks}
                onReorderTasks={handleReorderTasks}
                onInsertTask={handleInsertTask}
                onCopyTasks={handleCopyTasks}
                onCutTasks={handleCutTasks}
                onPasteTasks={handlePasteTasks}
                hasClipboard={!!clipboard && clipboard.tasks.length > 0}
                clipboardCount={clipboard?.tasks.length || 0}
              />
            </div>
          </div>
        )}

        {viewMode === 'table' && (
          <TaskTable
            tasks={cpmResult.tasks}
            criticalPathTaskIds={cpmResult.criticalPathTaskIds}
            onSelectTask={t => {
              setEditingTask(t);
              setIsModalOpen(true);
            }}
            onAddTask={() => {
              setEditingTask(null);
              setIsModalOpen(true);
            }}
            onDeleteTask={handleDeleteTask}
          />
        )}
      </main>

      {/* Task Edit / Create Modal */}
      <TaskModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setPendingPredecessors([]);
        }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        initialTask={editingTask}
        existingTasks={cpmResult.tasks}
        scheduleMode={scheduleMode}
        customHolidays={customHolidays}
        defaultPredecessors={pendingPredecessors}
      />

      {/* Save As Modal */}
      <SaveAsModal
        isOpen={isSaveAsOpen}
        onClose={() => setIsSaveAsOpen(false)}
        currentProjectName={projectName}
        onSaveAs={handleSaveAs}
      />

      {/* MPP Guide Modal */}
      <MppGuideModal
        isOpen={isMppGuideOpen}
        onClose={() => setIsMppGuideOpen(false)}
      />

      {/* HELP / Operation Guide Modal */}
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />

      {/* Confirm New Project Modal */}
      <ConfirmNewProjectModal
        isOpen={isConfirmNewProjectOpen}
        onClose={() => setIsConfirmNewProjectOpen(false)}
        onConfirm={handleCreateNewProject}
        projectName={projectName}
      />

      {/* Holiday Management Modal */}
      <HolidayModal
        isOpen={isHolidayModalOpen}
        onClose={() => setIsHolidayModalOpen(false)}
        holidays={customHolidays}
        onAddHoliday={handleAddHoliday}
        onRemoveHoliday={handleRemoveHoliday}
      />

      {/* Toast Floating Notification */}
      {toast && (
        <div className="fixed bottom-5 right-6 z-50 flex items-center space-x-2 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl text-xs font-medium border border-slate-700 animate-in slide-in-from-bottom-5 duration-200">
          {toast.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400" />}
          {toast.type === 'error' && <AlertTriangle size={16} className="text-red-400" />}
          {toast.type === 'info' && <Info size={16} className="text-blue-400" />}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-slate-400 hover:text-white p-0.5"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
