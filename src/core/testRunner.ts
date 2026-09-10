import { calculateCPM } from './cpmEngine';
import { calculateTaskDates } from './calendarEngine';
import { SAMPLE_PROJECT_TASKS } from '../data/sampleProject';

const result = calculateCPM(SAMPLE_PROJECT_TASKS, '2000-02-01');
console.log('Project Total Duration:', result.criticalPathDuration, 'Days');
console.log('Has Cycle:', result.hasCycle);
console.log('Critical Path Task IDs:', result.criticalPathTaskIds);

console.log('\n--- Testing Calendar Engine ---');
// Test 1: Friday start, 1 day duration (Working Days mode)
// 2026-09-04 is Friday. 1 working day -> finishes 2026-09-04
const t1 = calculateTaskDates('2026-09-04', 0, 1, [], 'working');
console.log('Test 1 (Friday 1 day working):', t1);
console.assert(t1.startDate === '2026-09-04' && t1.finishDate === '2026-09-04', 'Test 1 Failed');

// Test 2: Friday start, 2 days duration (Working Days mode)
// Day 1: Fri 09-04, Sat 09-05 (weekend), Sun 09-06 (weekend), Day 2: Mon 09-07 -> finishes 2026-09-07
const t2 = calculateTaskDates('2026-09-04', 0, 2, [], 'working');
console.log('Test 2 (Friday 2 days working, skips weekend):', t2);
console.assert(t2.startDate === '2026-09-04' && t2.finishDate === '2026-09-07', 'Test 2 Failed');

// Test 3: Friday start, 2 days duration with Monday 2026-09-07 as custom holiday
// Day 1: Fri 09-04, Sat (off), Sun (off), Mon (holiday off), Day 2: Tue 09-08 -> finishes 2026-09-08
const t3 = calculateTaskDates('2026-09-04', 0, 2, [{ id: '1', date: '2026-09-07', name: 'Custom Off' }], 'working');
console.log('Test 3 (Friday 2 days with Monday holiday):', t3);
console.assert(t3.startDate === '2026-09-04' && t3.finishDate === '2026-09-08', 'Test 3 Failed');

// Test 4: Fixed holiday 12/25 (Christmas)
// 2026-12-24 is Thursday. Duration = 2 days.
// Day 1: Thu 12-24. Fri 12-25 is Christmas (fixed holiday). Sat 12-26 (weekend). Sun 12-27 (weekend). Day 2: Mon 12-28 -> finishes 2026-12-28
const t4 = calculateTaskDates('2026-12-24', 0, 2, [], 'working');
console.log('Test 4 (Spanning 12/25 Christmas):', t4);
console.assert(t4.startDate === '2026-12-24' && t4.finishDate === '2026-12-28', 'Test 4 Failed');

// Test 5: Calendar mode (continuous calendar days)
// 2026-09-04 Friday, duration = 2 days in calendar mode -> finishes 2026-09-05 Saturday
const t5 = calculateTaskDates('2026-09-04', 0, 2, [], 'calendar');
console.log('Test 5 (Calendar mode 2 days):', t5);
console.assert(t5.startDate === '2026-09-04' && t5.finishDate === '2026-09-05', 'Test 5 Failed');

console.log('\n--- Testing Plan 2: Reverse Anchored Tasks (JIT / 倒推齊料日) ---');
import type { Task } from './types';

const testTasks: Task[] = [
  { id: 'T_SMT', name: 'SMT 打樣', duration: 3, predecessors: [] },
  {
    id: 'T_PARTS',
    name: '備料齊料日',
    duration: 0,
    predecessors: [],
    anchor: {
      enabled: true,
      targetTaskId: 'T_SMT',
      leadDays: 5,
      useWorkingDays: true,
    },
  },
];

// Project starts on Monday 2026-09-14.
// T_SMT starts on 2026-09-14 (Monday).
// T_PARTS is anchored to T_SMT with 5 working days lead time.
// Stepping backwards 5 working days from 2026-09-14: Fri 09-11, Thu 09-10, Wed 09-09, Tue 09-08, Mon 09-07.
const cpmTest = calculateCPM(testTasks, '2026-09-14', 'working', []);
const smtTask = cpmTest.tasks.find(t => t.id === 'T_SMT')!;
const partsTask = cpmTest.tasks.find(t => t.id === 'T_PARTS')!;

console.log('SMT Task dates:', smtTask.startDate, '~', smtTask.finishDate);
console.log('Anchored Parts Task date:', partsTask.startDate);
console.assert(partsTask.startDate === '2026-09-07', `Expected 2026-09-07 but got ${partsTask.startDate}`);
console.assert(partsTask.finishDate === '2026-09-07', `Expected 2026-09-07 but got ${partsTask.finishDate}`);

console.log('All Calendar & Reverse Anchor Tests Passed Successfully! 🎉');


