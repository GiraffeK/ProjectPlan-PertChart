import { calculateCPM } from './cpmEngine';
import { SAMPLE_PROJECT_TASKS } from '../data/sampleProject';

const result = calculateCPM(SAMPLE_PROJECT_TASKS, '2000-02-01');
console.log('Project Total Duration:', result.criticalPathDuration, 'Days');
console.log('Has Cycle:', result.hasCycle);
console.log('Critical Path Task IDs:', result.criticalPathTaskIds);

const criticalTasks = result.tasks.filter(t => t.isCritical);
console.log('Critical Tasks:');
criticalTasks.forEach(t => {
  console.log(` - [${t.id}] ${t.name}: dur=${t.duration}, ES=${t.earlyStart}, EF=${t.earlyFinish}, LS=${t.lateStart}, LF=${t.lateFinish}, TF=${t.totalFloat}`);
});
