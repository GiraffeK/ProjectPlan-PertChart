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
