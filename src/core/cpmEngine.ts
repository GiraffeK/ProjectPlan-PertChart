import type { Task } from './types';

export interface CPMCalculationResult {
  tasks: Task[];
  criticalPathDuration: number;
  criticalPathTaskIds: string[];
  criticalEdges: Array<{ from: string; to: string }>;
  hasCycle: boolean;
  cycleNodes: string[];
}

/**
 * Adds days to a Date string (YYYY-MM-DD) and returns new Date string
 */
export function addDaysToDate(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return dateStr;
  }
  date.setDate(date.getDate() + Math.round(days));
  return date.toISOString().split('T')[0];
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

/**
 * Calculates CPM schedule (ES, EF, LS, LF, Float, Critical Path)
 */
export function calculateCPM(
  tasksInput: Task[],
  projectStartDate: string = '2000-02-01'
): CPMCalculationResult {
  // Deep clone tasks
  const tasks: Task[] = tasksInput.map(t => ({
    ...t,
    predecessors: [...(t.predecessors || [])],
    duration: Math.max(0, Number(t.duration) || 0),
  }));

  const taskMap = new Map<string, Task>();
  tasks.forEach(t => taskMap.set(t.id, t));

  // Build adjacency list (predecessor -> successors)
  const successorsMap = new Map<string, string[]>();
  const predecessorsMap = new Map<string, string[]>();

  tasks.forEach(t => {
    successorsMap.set(t.id, []);
    // Filter predecessors to only existing valid tasks
    const validPreds = t.predecessors.filter(pId => taskMap.has(pId));
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

  // Topological sorting (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  tasks.forEach(t => inDegree.set(t.id, predecessorsMap.get(t.id)?.length || 0));

  const queue: string[] = [];
  tasks.forEach(t => {
    if ((inDegree.get(t.id) || 0) === 0) {
      queue.push(t.id);
    }
  });

  const sortedOrder: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sortedOrder.push(current);

    const succs = successorsMap.get(current) || [];
    for (const succ of succs) {
      const currentIn = inDegree.get(succ)! - 1;
      inDegree.set(succ, currentIn);
      if (currentIn === 0) {
        queue.push(succ);
      }
    }
  }

  // Forward Pass: Early Start (ES) & Early Finish (EF)
  for (const id of sortedOrder) {
    const task = taskMap.get(id)!;
    const preds = predecessorsMap.get(id) || [];

    if (preds.length === 0) {
      task.earlyStart = 0;
    } else {
      let maxPredEF = 0;
      for (const pId of preds) {
        const predTask = taskMap.get(pId)!;
        maxPredEF = Math.max(maxPredEF, predTask.earlyFinish ?? 0);
      }
      task.earlyStart = maxPredEF;
    }
    task.earlyFinish = task.earlyStart + task.duration;
  }

  // Find max project early finish
  let projectDuration = 0;
  tasks.forEach(t => {
    projectDuration = Math.max(projectDuration, t.earlyFinish ?? 0);
  });

  // Backward Pass: Late Finish (LF) & Late Start (LS)
  // Process in reverse topological order
  const reverseOrder = [...sortedOrder].reverse();
  for (const id of reverseOrder) {
    const task = taskMap.get(id)!;
    const succs = successorsMap.get(id) || [];

    if (succs.length === 0) {
      task.lateFinish = projectDuration;
    } else {
      let minSuccLS = Infinity;
      for (const sId of succs) {
        const succTask = taskMap.get(sId)!;
        minSuccLS = Math.min(minSuccLS, succTask.lateStart ?? projectDuration);
      }
      task.lateFinish = minSuccLS === Infinity ? projectDuration : minSuccLS;
    }
    task.lateStart = task.lateFinish - task.duration;

    // Total float (slack)
    task.totalFloat = Math.round((task.lateStart - (task.earlyStart ?? 0)) * 1000) / 1000;

    // Free float
    if (succs.length === 0) {
      task.freeFloat = task.totalFloat;
    } else {
      let minSuccES = Infinity;
      for (const sId of succs) {
        const succTask = taskMap.get(sId)!;
        minSuccES = Math.min(minSuccES, succTask.earlyStart ?? projectDuration);
      }
      task.freeFloat = Math.max(0, Math.round((minSuccES - (task.earlyFinish ?? 0)) * 1000) / 1000);
    }

    // Critical check: total float <= epsilon
    task.isCritical = Math.abs(task.totalFloat) < 0.0001;

    // Dates
    task.startDate = addDaysToDate(projectStartDate, task.earlyStart ?? 0);
    task.finishDate = addDaysToDate(projectStartDate, task.earlyFinish ?? 0);
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
    criticalPathDuration: projectDuration,
    criticalPathTaskIds,
    criticalEdges,
    hasCycle: false,
    cycleNodes: [],
  };
}
