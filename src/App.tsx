import { useState, useMemo } from 'react';
import type { Task, ProjectData } from './core/types';
import { calculateCPM } from './core/cpmEngine';
import { SAMPLE_PROJECT_TASKS } from './data/sampleProject';
import { exportToMSProjectXML, parseMSProjectXML } from './core/msProject';
import { PertChart } from './components/PertChart';
import { GanttChart } from './components/GanttChart';
import { TaskTable } from './components/TaskTable';
import { Toolbar, type ViewMode } from './components/Toolbar';
import { TaskModal } from './components/TaskModal';
import { MppGuideModal } from './components/MppGuideModal';
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

export function App() {
  const [tasks, setTasks] = useState<Task[]>(DEFAULT_INITIAL_TASK);
  const [projectName, setProjectName] = useState<string>('My Project');
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<ViewMode>('pert');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMppGuideOpen, setIsMppGuideOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [pendingTaskPos, setPendingTaskPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingPredecessors, setPendingPredecessors] = useState<string[]>([]);

  // Toast / notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // Recalculate CPM automatically whenever tasks or start date changes
  const cpmResult = useMemo(() => {
    return calculateCPM(tasks, startDate);
  }, [tasks, startDate]);

  // Handle drag-to-draw create task at coordinate (with optional predecessor)
  const handleCreateTaskAt = (pos: { x: number; y: number }, predecessorId?: string) => {
    setPendingTaskPos(pos);
    setPendingPredecessors(predecessorId ? [predecessorId] : []);
    setEditingTask(null);
    setIsModalOpen(true);
  };

  // Persist node dragged positions
  const handleUpdateTaskPosition = (taskId: string, x: number, y: number) => {
    setTasks(prev =>
      prev.map(t => (t.id === taskId ? { ...t, x, y } : t))
    );
  };

  // Handle Save Task (Create or Update)
  const handleSaveTask = (taskData: Partial<Task>) => {
    if (taskData.id) {
      // Update existing
      setTasks(prev =>
        prev.map(t =>
          t.id === taskData.id
            ? {
                ...t,
                name: taskData.name || t.name,
                duration: taskData.duration ?? t.duration,
                category: taskData.category,
                predecessors: taskData.predecessors || [],
              }
            : t
        )
      );
      showToast(`已更新任務 [${taskData.id}] ${taskData.name}`, 'success');
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

      const newTask: Task = {
        id: newId,
        uid: maxNum + 1,
        name: taskData.name || `Task ${newId}`,
        duration: taskData.duration ?? 1,
        category: taskData.category,
        predecessors,
        x: pendingTaskPos?.x,
        y: pendingTaskPos?.y,
      };
      setTasks(prev => [...prev, newTask]);
      setPendingTaskPos(null);
      setPendingPredecessors([]);
      showToast(`已在畫布建立新任務 [${newId}] ${newTask.name}`, 'success');
    }
  };

  // Handle Delete Task
  const handleDeleteTask = (taskId: string) => {
    setTasks(prev => {
      return prev
        .filter(t => t.id !== taskId)
        .map(t => ({
          ...t,
          predecessors: t.predecessors.filter(p => p !== taskId),
        }));
    });
    showToast(`已刪除任務 [${taskId}]`, 'info');
  };

  // Connect dependency directly in PERT chart
  const handleAddDependency = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setTasks(prev =>
      prev.map(t => {
        if (t.id === toId && !t.predecessors.includes(fromId)) {
          return {
            ...t,
            predecessors: [...t.predecessors, fromId],
          };
        }
        return t;
      })
    );
    showToast(`已建立依賴關聯：[${fromId}] ➔ [${toId}]`, 'success');
  };

  // Export to Microsoft Project XML
  const handleExportMSProject = () => {
    const projectData: ProjectData = {
      id: 'msp-export',
      name: projectName,
      startDate,
      tasks: cpmResult.tasks,
      criticalPathDuration: cpmResult.criticalPathDuration,
      criticalPathTaskIds: cpmResult.criticalPathTaskIds,
    };
    const xmlContent = exportToMSProjectXML(projectData);
    const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/\s+/g, '_')}_msproject.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('已成功匯出 Microsoft Project XML 檔案！', 'success');
  };

  // Import Microsoft Project XML or MPP
  const handleImportMSProject = (file: File) => {
    if (file.name.toLowerCase().endsWith('.mpp')) {
      setIsMppGuideOpen(true);
      showToast('檢測到 .mpp 檔案，請依指引在 MS Project 另存為 XML 格式後匯入！', 'info');
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
        setProjectName(imported.projectName);
        setStartDate(imported.startDate);
        setTasks(imported.tasks);
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

  // Export JSON Backup
  const handleExportJSON = () => {
    const backup = {
      projectName,
      startDate,
      tasks,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/\s+/g, '_')}_backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('已下載專案 JSON 備份檔', 'info');
  };

  // Reload Sample
  const handleLoadSample = () => {
    setTasks(SAMPLE_PROJECT_TASKS);
    setProjectName('Software Development Project');
    setStartDate('2000-02-01');
    showToast('已重新載入 88 天軟體開發專案參考範例！', 'info');
  };

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-slate-100">
      {/* Top Main Toolbar */}
      <Toolbar
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        onAddTask={() => {
          setEditingTask(null);
          setIsModalOpen(true);
        }}
        onLoadSample={handleLoadSample}
        onExportMSProject={handleExportMSProject}
        onImportMSProject={handleImportMSProject}
        onExportJSON={handleExportJSON}
        onOpenMppGuide={() => setIsMppGuideOpen(true)}
        startDate={startDate}
        onChangeStartDate={setStartDate}
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
            onSelectTask={t => {
              setEditingTask(t);
              setIsModalOpen(true);
            }}
            onAddDependency={handleAddDependency}
            onCreateTaskAt={handleCreateTaskAt}
            onUpdateTaskPosition={handleUpdateTaskPosition}
          />
        )}

        {viewMode === 'gantt' && (
          <GanttChart
            tasks={cpmResult.tasks}
            criticalPathDuration={cpmResult.criticalPathDuration}
            criticalPathTaskIds={cpmResult.criticalPathTaskIds}
            projectStartDate={startDate}
            onSelectTask={t => {
              setEditingTask(t);
              setIsModalOpen(true);
            }}
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
                onSelectTask={t => {
                  setEditingTask(t);
                  setIsModalOpen(true);
                }}
                onAddDependency={handleAddDependency}
                onCreateTaskAt={handleCreateTaskAt}
                onUpdateTaskPosition={handleUpdateTaskPosition}
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
                onSelectTask={t => {
                  setEditingTask(t);
                  setIsModalOpen(true);
                }}
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
        existingTasks={tasks}
        defaultPredecessors={pendingPredecessors}
      />

      {/* MPP Guide Modal */}
      <MppGuideModal
        isOpen={isMppGuideOpen}
        onClose={() => setIsMppGuideOpen(false)}
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
