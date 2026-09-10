import type { Task, ScheduleMode, Holiday } from './types';
import { calculateTaskDates, subtractWorkingDays, countWorkingDaysBetween } from './calendarEngine';

export interface CPMCalculationResult {
  tasks: Task[];
  criticalPathDuration: number;
  criticalPathTaskIds: string[];
  criticalEdges: Array<{ from: string; to: string }>;
  hasCycle: boolean;
  cycleNodes: string[];
}

/**
 * Returns today's date formatted as local YYYY-MM-DD avoiding UTC midnight timezone shift
 */
export function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Adds days to a Date string (YYYY-MM-DD) and returns new Date string
 */
export function addDaysToDate(dateStr: string, days: number): string {
  if (!dateStr) return dateStr;
  const parts = dateStr.trim().split('T')[0].split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const utcDate = new Date(Date.UTC(y, m - 1, d));
      utcDate.setUTCDate(utcDate.getUTCDate() + Math.round(days));
      return utcDate.toISOString().split('T')[0];
    }
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return dateStr;
  }
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const utcDate = new Date(Date.UTC(y, m, d));
  utcDate.setUTCDate(utcDate.getUTCDate() + Math.round(days));
  return utcDate.toISOString().split('T')[0];
}

/**
 * Format date into MM/DD/YY for display matching PERT reference
 */
export function formatDateForDisplay(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parts[0].slice(-2);
    const month = parts[1];
    const day = parts[2];
    return `${month}/${day}/${year}`;
  }
  return dateStr;
}

/**
 * Format date into MM/DD
 */
export function formatMonthDay(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}`;
  }
  return dateStr;
}

/**
 * Format start and finish dates into "MM/DD - MM/DD"
 */
export function formatDateRangeForDisplay(startDate?: string, finishDate?: string): string {
  if (!startDate) return '';
  const startMD = formatMonthDay(startDate);
  if (!finishDate || finishDate === startDate) {
    return startMD;
  }
  const finishMD = formatMonthDay(finishDate);
  return `${startMD} - ${finishMD}`;
}

/**
 * Round number to avoid IEEE 754 precision issues (e.g., 1.0000000000000002)
 */
export function roundDays(val: number, decimals: number = 4): number {
  if (!Number.isFinite(val)) return 0;
  const factor = 10 ** decimals;
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * Format days / duration cleanly for UI display (removes trailing precision artifacts)
 */
export function formatDays(val: number | undefined | null, maxDecimals: number = 2): string {
  if (val === undefined || val === null || isNaN(val)) return '0';
  const factor = 10 ** maxDecimals;
  const rounded = Math.round((val + Number.EPSILON) * factor) / factor;
  return rounded.toString();
}

/**
 * Generates default or returns custom parent summary badge label
 * e.g., "L1:(T2, T3)"
 */
export function getParentBadgeLabel(task: Task): string {
  if (task.summaryLabel && task.summaryLabel.trim() !== '') {
    return task.summaryLabel.trim();
  }
  const level = task.outlineLevel || 1;
  const childIds = (task.childrenIds && task.childrenIds.length > 0 ? task.childrenIds : task.subtaskIds) || [];
  return `L${level}:(${childIds.join(', ')})`;
}

/**
 * Detect cycles using DFS
 */
function detectCycle(
  adjList: Map<string, string[]>,
  nodeIds: string[]
): { hasCycle: boolean; cycleNodes: string[] } {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycleNodes: string[] = [];

  function dfs(node: string): boolean {
    visited.add(node);
    inStack.add(node);

    const neighbors = adjList.get(node) || [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        if (dfs(next)) return true;
      } else if (inStack.has(next)) {
        cycleNodes.push(next, node);
        return true;
      }
    }

    inStack.delete(node);
    return false;
  }

  for (const id of nodeIds) {
    if (!visited.has(id)) {
      if (dfs(id)) {
        return { hasCycle: true, cycleNodes };
      }
    }
  }

  return { hasCycle: false, cycleNodes: [] };
}

export interface WBSInfo {
  parentMap: Map<string, string>; // childId -> direct parentId
  childrenMap: Map<string, string[]>; // parentId -> direct childrenIds
  descendantsMap: Map<string, string[]>; // parentId -> all descendantIds
  ancestorsMap: Map<string, string[]>; // childId -> all ancestorIds
  summaryTaskIds: Set<string>;
}

/**
 * Resolves WBS Parent-Child hierarchy from explicit parentId or outlineLevel sequence
 */
export function resolveWBSHierarchy(tasks: Task[]): WBSInfo {
  const taskMap = new Map<string, Task>();
  tasks.forEach(t => taskMap.set(t.id, t));

  const parentMap = new Map<string, string>();
  const childrenMap = new Map<string, string[]>();

  // Stack of { level, id } to deduce parent from outlineLevel
  const levelStack: Array<{ level: number; id: string }> = [];

  for (const task of tasks) {
    const level = task.outlineLevel ?? 1;
    let parentId = task.parentId;

    if (parentId && taskMap.has(parentId)) {
      parentMap.set(task.id, parentId);
    } else if (level > 1) {
      // Find nearest preceding task in stack with level < current level
      while (levelStack.length > 0 && levelStack[levelStack.length - 1].level >= level) {
        levelStack.pop();
      }
      if (levelStack.length > 0) {
        const deducedParentId = levelStack[levelStack.length - 1].id;
        parentMap.set(task.id, deducedParentId);
      }
    }

    while (levelStack.length > 0 && levelStack[levelStack.length - 1].level >= level) {
      levelStack.pop();
    }
    levelStack.push({ level, id: task.id });
  }

  // Populate childrenMap
  tasks.forEach(t => childrenMap.set(t.id, []));
  parentMap.forEach((pId, childId) => {
    childrenMap.get(pId)?.push(childId);
  });

  const summaryTaskIds = new Set<string>();
  childrenMap.forEach((children, pId) => {
    if (children.length > 0) {
      summaryTaskIds.add(pId);
    }
  });

  // Build descendantsMap
  const descendantsMap = new Map<string, string[]>();
  function getDescendants(pId: string): string[] {
    if (descendantsMap.has(pId)) return descendantsMap.get(pId)!;
    const direct = childrenMap.get(pId) || [];
    const all: string[] = [...direct];
    for (const childId of direct) {
      all.push(...getDescendants(childId));
    }
    descendantsMap.set(pId, all);
    return all;
  }
  tasks.forEach(t => getDescendants(t.id));

  // Build ancestorsMap
  const ancestorsMap = new Map<string, string[]>();
  tasks.forEach(t => {
    const ancestors: string[] = [];
    let curr = parentMap.get(t.id);
    while (curr) {
      ancestors.push(curr);
      curr = parentMap.get(curr);
    }
    ancestorsMap.set(t.id, ancestors);
  });

  return { parentMap, childrenMap, descendantsMap, ancestorsMap, summaryTaskIds };
}

/**
 * Synchronizes predecessors so that the first child of any summary task
 * inherits the predecessor dependencies of that summary task.
 * Also cleans invalid ancestor / descendant dependencies that cause circular feedback loops.
 */
export function syncFirstChildPredecessors(tasks: Task[]): Task[] {
  const wbs = resolveWBSHierarchy(tasks);
  let changed = false;

  // First pass: strip any dependencies where a task depends on its own ancestor or descendant
  const newTasks = tasks.map(t => {
    const ancestors = new Set(wbs.ancestorsMap.get(t.id) || []);
    const descendants = new Set(wbs.descendantsMap.get(t.id) || []);
    const filtered = (t.predecessors || []).filter(p => p !== t.id && !ancestors.has(p) && !descendants.has(p));
    if (filtered.length !== (t.predecessors || []).length) {
      changed = true;
    }
    return {
      ...t,
      predecessors: filtered,
    };
  });

  const taskMap = new Map<string, Task>();
  newTasks.forEach(t => taskMap.set(t.id, t));

  wbs.childrenMap.forEach((children, parentId) => {
    if (children.length > 0) {
      const parentTask = taskMap.get(parentId);
      const firstChild = taskMap.get(children[0]);
      if (parentTask && firstChild && parentTask.predecessors && parentTask.predecessors.length > 0) {
        const descendants = new Set(wbs.descendantsMap.get(parentId) || []);
        const ancestors = new Set(wbs.ancestorsMap.get(firstChild.id) || []);
        const missingPreds = parentTask.predecessors.filter(
          p => !firstChild.predecessors.includes(p) && p !== firstChild.id && !descendants.has(p) && !ancestors.has(p)
        );
        if (missingPreds.length > 0) {
          firstChild.predecessors = [...firstChild.predecessors, ...missingPreds];
          changed = true;
        }
      }
    }
  });

  return changed ? newTasks : tasks;
}

/**
 * Calculates CPM schedule (ES, EF, LS, LF, Float, Critical Path) with WBS Summary Task Rollup
 */
export function calculateCPM(
  tasksInput: Task[],
  projectStartDate: string = '2000-02-01',
  scheduleMode: ScheduleMode = 'working',
  customHolidays: (Holiday | string)[] = []
): CPMCalculationResult {
  const syncedTasks = syncFirstChildPredecessors(tasksInput);
  // Deep clone tasks
  const tasks: Task[] = syncedTasks.map(t => ({
    ...t,
    predecessors: [...(t.predecessors || [])],
    duration: roundDays(Math.max(0, Number(t.duration) || 0)),
    manualEarlyStart: t.manualEarlyStart !== undefined ? roundDays(t.manualEarlyStart) : undefined,
  }));

  const taskMap = new Map<string, Task>();
  tasks.forEach(t => taskMap.set(t.id, t));

  // Resolve hierarchy
  const { parentMap, childrenMap, descendantsMap, ancestorsMap, summaryTaskIds } = resolveWBSHierarchy(tasks);

  // Annotate tasks with summary information
  tasks.forEach(t => {
    const isSumm = summaryTaskIds.has(t.id);
    t.isSummary = isSumm;
    t.subtaskIds = descendantsMap.get(t.id) || [];
    t.childrenIds = childrenMap.get(t.id) || [];
    if (parentMap.has(t.id)) {
      t.parentId = parentMap.get(t.id);
    }
  });

  // Build adjacency list (predecessor -> successors)
  const successorsMap = new Map<string, string[]>();
  const predecessorsMap = new Map<string, string[]>();

  tasks.forEach(t => {
    successorsMap.set(t.id, []);
    // Filter predecessors to only existing valid tasks (and not self, descendants, or ancestors)
    const descendants = new Set(descendantsMap.get(t.id) || []);
    const ancestors = new Set(ancestorsMap.get(t.id) || []);
    const validPreds = t.predecessors.filter(
      pId => taskMap.has(pId) && pId !== t.id && !descendants.has(pId) && !ancestors.has(pId)
    );
    predecessorsMap.set(t.id, validPreds);
  });

  tasks.forEach(t => {
    const preds = predecessorsMap.get(t.id) || [];
    preds.forEach(pId => {
      successorsMap.get(pId)?.push(t.id);
    });
  });

  // Cycle check
  const taskIds = tasks.map(t => t.id);
  const cycleCheck = detectCycle(successorsMap, taskIds);
  if (cycleCheck.hasCycle) {
    return {
      tasks,
      criticalPathDuration: 0,
      criticalPathTaskIds: [],
      criticalEdges: [],
      hasCycle: true,
      cycleNodes: cycleCheck.cycleNodes,
    };
  }

  // Initialize ES & EF
  tasks.forEach(t => {
    t.earlyStart = t.manualEarlyStart ?? 0;
    t.earlyFinish = roundDays((t.earlyStart ?? 0) + t.duration);
  });

  // Forward Pass using iterative relaxation (handles arbitrary summary hierarchies and DAG dependencies)
  const MAX_ITER = Math.max(tasks.length * 5, 50);
  let changed = true;
  let iter = 0;

  while (changed && iter < MAX_ITER) {
    changed = false;
    iter++;

    for (const task of tasks) {
      const isSumm = summaryTaskIds.has(task.id);

      if (isSumm) {
        // Summary task: schedule rolls up from all children
        const children = childrenMap.get(task.id) || [];
        if (children.length > 0) {
          const minES = roundDays(Math.min(...children.map(cId => taskMap.get(cId)!.earlyStart ?? 0)));
          const maxEF = roundDays(Math.max(...children.map(cId => taskMap.get(cId)!.earlyFinish ?? 0)));
          const newDur = roundDays(Math.max(0, maxEF - minES));

          if (task.earlyStart !== minES || task.earlyFinish !== maxEF || task.duration !== newDur) {
            task.earlyStart = minES;
            task.earlyFinish = maxEF;
            task.duration = newDur;
            changed = true;
          }
        }
      } else {
        // Leaf task: schedule governed by direct predecessors and ancestor predecessors
        let es = task.manualEarlyStart ?? 0;

        // Direct predecessors
        const preds = predecessorsMap.get(task.id) || [];
        for (const pId of preds) {
          const p = taskMap.get(pId);
          if (p) {
            es = Math.max(es, p.earlyFinish ?? 0);
          }
        }

        // Predecessors of ancestor summary tasks
        let currParent = parentMap.get(task.id);
        while (currParent) {
          const pPreds = predecessorsMap.get(currParent) || [];
          for (const ppId of pPreds) {
            const pp = taskMap.get(ppId);
            if (pp) {
              es = Math.max(es, pp.earlyFinish ?? 0);
            }
          }
          currParent = parentMap.get(currParent);
        }

        es = roundDays(es);
        const ef = roundDays(es + task.duration);
        if (task.earlyStart !== es || task.earlyFinish !== ef) {
          task.earlyStart = es;
          task.earlyFinish = ef;
          changed = true;
        }
      }
    }
  }

  // Find max project early finish
  let projectDuration = 0;
  tasks.forEach(t => {
    projectDuration = Math.max(projectDuration, t.earlyFinish ?? 0);
  });
  projectDuration = roundDays(projectDuration);

  // Initialize LF & LS
  tasks.forEach(t => {
    t.lateFinish = projectDuration;
    t.lateStart = roundDays(Math.max(0, projectDuration - t.duration));
  });

  // Backward Pass: Late Finish & Late Start
  changed = true;
  iter = 0;

  while (changed && iter < MAX_ITER) {
    changed = false;
    iter++;

    for (const task of tasks) {
      const isSumm = summaryTaskIds.has(task.id);

      if (isSumm) {
        // Summary task: LS = min(children.LS), LF = max(children.LF)
        const children = childrenMap.get(task.id) || [];
        if (children.length > 0) {
          const minLS = roundDays(Math.min(...children.map(cId => taskMap.get(cId)!.lateStart ?? projectDuration)));
          const maxLF = roundDays(Math.max(...children.map(cId => taskMap.get(cId)!.lateFinish ?? projectDuration)));

          if (task.lateStart !== minLS || task.lateFinish !== maxLF) {
            task.lateStart = minLS;
            task.lateFinish = maxLF;
            changed = true;
          }
        }
      } else {
        // Leaf task: constrained by direct successors and ancestor successors
        let lf = projectDuration;

        // Direct successors
        const succs = successorsMap.get(task.id) || [];
        for (const sId of succs) {
          const s = taskMap.get(sId);
          if (s) {
            lf = Math.min(lf, s.lateStart ?? projectDuration);
          }
        }

        // Successors of ancestor summary tasks
        let currParent = parentMap.get(task.id);
        while (currParent) {
          const pSuccs = successorsMap.get(currParent) || [];
          for (const psId of pSuccs) {
            const ps = taskMap.get(psId);
            if (ps) {
              lf = Math.min(lf, ps.lateStart ?? projectDuration);
            }
          }
          currParent = parentMap.get(currParent);
        }

        lf = roundDays(lf);
        const ls = roundDays(Math.max(0, lf - task.duration));
        if (task.lateFinish !== lf || task.lateStart !== ls) {
          task.lateFinish = lf;
          task.lateStart = ls;
          changed = true;
        }
      }
    }
  }

  // Calculate float, criticality, and dates
  for (const task of tasks) {
    const isSumm = summaryTaskIds.has(task.id);

    if (isSumm) {
      const descendants = descendantsMap.get(task.id) || [];
      const hasCriticalChild = descendants.some(dId => taskMap.get(dId)?.isCritical);
      const float = roundDays((task.lateStart ?? 0) - (task.earlyStart ?? 0), 2);
      task.totalFloat = hasCriticalChild ? 0 : Math.max(0, float);
      task.isCritical = hasCriticalChild || Math.abs(task.totalFloat) < 0.0001;
    } else {
      task.totalFloat = roundDays((task.lateStart ?? 0) - (task.earlyStart ?? 0), 2);
      task.isCritical = Math.abs(task.totalFloat) < 0.0001;
    }

    // Free float
    const succs = successorsMap.get(task.id) || [];
    if (succs.length === 0) {
      task.freeFloat = task.totalFloat;
    } else {
      let minSuccES = Infinity;
      for (const sId of succs) {
        const succTask = taskMap.get(sId)!;
        minSuccES = Math.min(minSuccES, succTask.earlyStart ?? projectDuration);
      }
      task.freeFloat = Math.max(0, roundDays(minSuccES - (task.earlyFinish ?? 0), 2));
    }

    // Dates calculated by Calendar Engine (respecting working days / holidays / weekends)
    const { startDate, finishDate } = calculateTaskDates(
      projectStartDate,
      task.earlyStart ?? 0,
      task.duration ?? 1,
      customHolidays,
      scheduleMode
    );
    task.startDate = startDate;
    task.finishDate = finishDate;
  }

  // Second Pass for Reverse-Anchored Tasks (e.g. SMT 齊料日)
  // Anchored tasks derive their finish and start dates backwards from target task's start date
  for (const task of tasks) {
    if (task.anchor && task.anchor.enabled && task.anchor.targetTaskId && task.anchor.leadDays > 0) {
      const target = taskMap.get(task.anchor.targetTaskId);
      if (target && target.startDate) {
        const leadDays = task.anchor.leadDays;
        const useWorkingDays = task.anchor.useWorkingDays !== false;

        // Finish date of anchored task is target.startDate minus leadDays
        const finishDate = subtractWorkingDays(
          target.startDate,
          leadDays,
          customHolidays,
          useWorkingDays ? scheduleMode : 'calendar'
        );

        let startDate = finishDate;
        if (task.duration > 0) {
          const additionalDays = Math.max(0, Math.round(task.duration) - 1);
          startDate = additionalDays === 0
            ? finishDate
            : subtractWorkingDays(finishDate, additionalDays, customHolidays, scheduleMode);
        }

        task.finishDate = finishDate;
        task.startDate = startDate;

        // Sync earlyStart and earlyFinish offsets relative to projectStartDate
        const esWorkingDays = countWorkingDaysBetween(projectStartDate, startDate, customHolidays, scheduleMode);
        task.earlyStart = Math.max(0, esWorkingDays);
        task.earlyFinish = task.duration === 0 ? task.earlyStart : roundDays(task.earlyStart + task.duration);
        task.lateStart = task.earlyStart;
        task.lateFinish = task.earlyFinish;
        task.totalFloat = 0;
        task.freeFloat = 0;
      }
    }
  }

  const criticalPathTaskIds = tasks.filter(t => t.isCritical).map(t => t.id);

  // Identify critical edges (edges where both endpoints are critical and pred.EF == succ.ES)
  const criticalEdges: Array<{ from: string; to: string }> = [];
  tasks.forEach(t => {
    if (t.isCritical) {
      const succs = successorsMap.get(t.id) || [];
      succs.forEach(sId => {
        const succ = taskMap.get(sId);
        if (succ && succ.isCritical && Math.abs((t.earlyFinish ?? 0) - (succ.earlyStart ?? 0)) < 0.0001) {
          criticalEdges.push({ from: t.id, to: sId });
        }
      });
    }
  });

  return {
    tasks,
    criticalPathDuration: roundDays(projectDuration),
    criticalPathTaskIds,
    criticalEdges,
    hasCycle: false,
    cycleNodes: [],
  };
}
