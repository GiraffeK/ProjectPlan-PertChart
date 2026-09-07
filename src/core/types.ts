export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface Dependency {
  fromTaskId: string;
  toTaskId: string;
  type?: DependencyType;
  lag?: number; // in days
}

export interface Task {
  id: string;
  uid?: number; // For MS Project UID mapping
  name: string;
  duration: number; // in days (integer or decimal)
  category?: string; // e.g. "Research/Learn", "Design", "Coding and Component Testing", "Documentation"
  predecessors: string[]; // List of task IDs this task depends on (Finish-to-Start default)
  
  // WBS / Hierarchy
  outlineLevel?: number; // 1 = root, 2 = subtask, etc. (MS Project compatible)
  parentId?: string; // parent task ID if subtask
  isSummary?: boolean; // True if this task has subtasks (Summary / Parent Task)
  subtaskIds?: string[]; // IDs of all descendant subtasks
  childrenIds?: string[]; // IDs of direct child subtasks
  summaryLabel?: string; // Custom or default label for parent badge (e.g. "L1:(T2, T3)")
  
  // Schedule overrides
  manualEarlyStart?: number; // manual start day offset in Gantt chart
  
  // CPM Calculated fields
  earlyStart?: number; // day offset from project start
  earlyFinish?: number;
  lateStart?: number;
  lateFinish?: number;
  totalFloat?: number; // slack
  freeFloat?: number;
  isCritical?: boolean;
  
  // Date representations
  startDate?: string; // YYYY-MM-DD or MM/DD/YY
  finishDate?: string; // YYYY-MM-DD
  
  // Layout metadata
  x?: number;
  y?: number;
}

export interface ProjectData {
  id: string;
  name: string;
  startDate: string; // ISO date string (YYYY-MM-DD)
  tasks: Task[];
  criticalPathDuration: number;
  criticalPathTaskIds: string[];
  hasCycle?: boolean;
  cycleNodes?: string[];
}
