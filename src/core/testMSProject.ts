import { calculateCPM } from './cpmEngine';
import { SAMPLE_PROJECT_TASKS } from '../data/sampleProject';
import { exportToMSProjectXML, parseMSProjectXML } from './msProject';
import type { ProjectData } from './types';

const cpmResult = calculateCPM(SAMPLE_PROJECT_TASKS, '2000-02-01');

const project: ProjectData = {
  id: 'proj-1',
  name: 'Software Development Project',
  startDate: '2000-02-01',
  tasks: cpmResult.tasks,
  criticalPathDuration: cpmResult.criticalPathDuration,
  criticalPathTaskIds: cpmResult.criticalPathTaskIds,
};

const xml = exportToMSProjectXML(project);
console.log('--- MS Project XML Sample (First 300 chars) ---');
console.log(xml.slice(0, 300));
console.log('...\nTotal XML Length:', xml.length);

const parsed = parseMSProjectXML(xml);
console.log('--- Parsed Back ---');
console.log('Project Name:', parsed.projectName);
console.log('Start Date:', parsed.startDate);
console.log('Total Tasks Count:', parsed.tasks.length);

// Verify CPM on parsed tasks
const recomputedCPM = calculateCPM(parsed.tasks, parsed.startDate);
console.log('Recomputed Duration:', recomputedCPM.criticalPathDuration);
console.log('Recomputed Critical Path Task Count:', recomputedCPM.criticalPathTaskIds.length);
console.log('Success:', recomputedCPM.criticalPathDuration === cpmResult.criticalPathDuration);
