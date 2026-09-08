import type { Task, ProjectData, Holiday, ScheduleMode } from './types';

/**
 * Format duration in days to MS Project ISO 8601 Duration (standard 8h/day)
 * e.g. 1 day -> PT8H0M0S, 4 days -> PT32H0M0S
 */
function formatMSPDuration(days: number): string {
  const hours = Math.round(days * 8 * 100) / 100;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `PT${h}H${m}M0S`;
}

/**
 * Parse MS Project duration string into days (8h = 1 day)
 */
function parseMSPDuration(durationStr: string): number {
  if (!durationStr) return 1;

  // Check ISO 8601: PT8H0M0S or PT24H or P1D
  const matchHours = durationStr.match(/PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?/);
  if (matchHours) {
    const hours = parseFloat(matchHours[1] || '0');
    const minutes = parseFloat(matchHours[2] || '0');
    const totalHours = hours + minutes / 60;
    if (totalHours > 0) {
      return Math.round((totalHours / 8) * 100) / 100;
    }
  }

  const matchDays = durationStr.match(/P(\d+(?:\.\d+)?)D/);
  if (matchDays) {
    return parseFloat(matchDays[1]);
  }

  // Raw number fallback
  const rawNum = parseFloat(durationStr);
  return isNaN(rawNum) ? 1 : rawNum;
}

/**
 * Export project to standard Microsoft Project XML (MSPDI 2003/2007/2010/2013/2016/2019/365 compatible)
 */
export function exportToMSProjectXML(project: ProjectData): string {
  const taskUidMap = new Map<string, number>();
  
  // Assign UIDs
  project.tasks.forEach((task, index) => {
    taskUidMap.set(task.id, task.uid || index + 1);
  });

  const startDateTime = `${project.startDate}T08:00:00`;
  const finishDate = project.tasks.reduce((max, t) => {
    return t.finishDate && t.finishDate > max ? t.finishDate : max;
  }, project.startDate);
  const finishDateTime = `${finishDate}T17:00:00`;

  let exceptionsXml = '';
  if (project.holidays && project.holidays.length > 0) {
    project.holidays.forEach(h => {
      exceptionsXml += `
        <Exception>
          <EnteredByOccurrences>0</EnteredByOccurrences>
          <TimePeriod>
            <FromDate>${h.date}T00:00:00</FromDate>
            <ToDate>${h.date}T23:59:00</ToDate>
          </TimePeriod>
          <Occurrences>1</Occurrences>
          <Name>${escapeXml(h.name || 'Holiday')}</Name>
          <Type>1</Type>
          <DayWorking>0</DayWorking>
        </Exception>`;
    });
  }

  const isCalendarMode = project.scheduleMode === 'calendar';
  const weekendDayWorking = isCalendarMode ? '1' : '0';

  const calendarsXml = `
  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Standard</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <BaseCalendarUID>-1</BaseCalendarUID>
      <WeekDays>
        <WeekDay>
          <DayType>1</DayType>
          <DayWorking>${weekendDayWorking}</DayWorking>
        </WeekDay>
        <WeekDay>
          <DayType>2</DayType>
          <DayWorking>1</DayWorking>
          <WorkingTimes>
            <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>
            <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>
          </WorkingTimes>
        </WeekDay>
        <WeekDay>
          <DayType>3</DayType>
          <DayWorking>1</DayWorking>
          <WorkingTimes>
            <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>
            <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>
          </WorkingTimes>
        </WeekDay>
        <WeekDay>
          <DayType>4</DayType>
          <DayWorking>1</DayWorking>
          <WorkingTimes>
            <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>
            <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>
          </WorkingTimes>
        </WeekDay>
        <WeekDay>
          <DayType>5</DayType>
          <DayWorking>1</DayWorking>
          <WorkingTimes>
            <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>
            <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>
          </WorkingTimes>
        </WeekDay>
        <WeekDay>
          <DayType>6</DayType>
          <DayWorking>1</DayWorking>
          <WorkingTimes>
            <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>
            <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>
          </WorkingTimes>
        </WeekDay>
        <WeekDay>
          <DayType>7</DayType>
          <DayWorking>${weekendDayWorking}</DayWorking>
        </WeekDay>
      </WeekDays>${exceptionsXml ? `
      <Exceptions>${exceptionsXml}
      </Exceptions>` : ''}
    </Calendar>
  </Calendars>`;

  let tasksXml = '';
  project.tasks.forEach((task, index) => {
    const uid = taskUidMap.get(task.id) || index + 1;
    const taskStart = task.startDate ? `${task.startDate}T08:00:00` : startDateTime;
    const taskFinish = task.finishDate ? `${task.finishDate}T17:00:00` : finishDateTime;
    const durationStr = formatMSPDuration(task.duration);

    let linksXml = '';
    if (task.predecessors && task.predecessors.length > 0) {
      task.predecessors.forEach(predId => {
        const predUid = taskUidMap.get(predId);
        if (predUid !== undefined) {
          linksXml += `
        <PredecessorLink>
          <PredecessorUID>${predUid}</PredecessorUID>
          <Type>1</Type>
          <CrossProject>0</CrossProject>
          <LinkLag>0</LinkLag>
          <LagFormat>7</LagFormat>
        </PredecessorLink>`;
        }
      });
    }

    tasksXml += `
    <Task>
      <UID>${uid}</UID>
      <ID>${index + 1}</ID>
      <Name>${escapeXml(task.name)}</Name>
      <Type>0</Type>
      <IsNull>0</IsNull>
      <CreateDate>${startDateTime}</CreateDate>
      <WBS>${index + 1}</WBS>
      <OutlineNumber>${index + 1}</OutlineNumber>
      <OutlineLevel>${task.outlineLevel || 1}</OutlineLevel>
      <Priority>500</Priority>
      <Start>${taskStart}</Start>
      <Finish>${taskFinish}</Finish>
      <Duration>${durationStr}</Duration>
      <DurationFormat>21</DurationFormat>
      <Work>${durationStr}</Work>
      <ResumeValid>0</ResumeValid>
      <EffortDriven>0</EffortDriven>
      <Recurring>0</Recurring>
      <OverAllocated>0</OverAllocated>
      <Estimated>0</Estimated>
      <Milestone>${task.duration === 0 ? 1 : 0}</Milestone>
      <Summary>0</Summary>
      <Critical>${task.isCritical ? 1 : 0}</Critical>
      <IsSubproject>0</IsSubproject>
      <IsSubprojectReadOnly>0</IsSubprojectReadOnly>
      <ExternalTask>0</ExternalTask>
      <EarlyStart>${taskStart}</EarlyStart>
      <EarlyFinish>${taskFinish}</EarlyFinish>
      <LateStart>${taskStart}</LateStart>
      <LateFinish>${taskFinish}</LateFinish>
      <FreeSlack>${(task.freeFloat ?? 0) * 8 * 60}</FreeSlack>
      <TotalSlack>${(task.totalFloat ?? 0) * 8 * 60}</TotalSlack>${linksXml}
    </Task>`;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>14</SaveVersion>
  <Name>${escapeXml(project.name)}</Name>
  <Title>${escapeXml(project.name)}</Title>
  <CreationDate>${new Date().toISOString()}</CreationDate>
  <LastSaved>${new Date().toISOString()}</LastSaved>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>${startDateTime}</StartDate>
  <FinishDate>${finishDateTime}</FinishDate>
  <FYStartDate>1</FYStartDate>
  <CriticalSlackLimit>0</CriticalSlackLimit>
  <CurrencyDigits>2</CurrencyDigits>
  <CurrencySymbol>$</CurrencySymbol>
  <CurrencyCode>USD</CurrencyCode>
  <CurrencySymbolPosition>0</CurrencySymbolPosition>
  <CalendarUID>1</CalendarUID>
  <DefaultStartTime>08:00:00</DefaultStartTime>
  <DefaultEndTime>17:00:00</DefaultEndTime>
  <MinutesPerDay>480</MinutesPerDay>
  <MinutesPerWeek>2400</MinutesPerWeek>
  <DaysPerMonth>20</DaysPerMonth>
  <DefaultTaskType>0</DefaultTaskType>
  <DefaultFixedCostAccrual>3</DefaultFixedCostAccrual>
  <DefaultStandardRate>0</DefaultStandardRate>
  <DefaultOvertimeRate>0</DefaultOvertimeRate>
  <DurationFormat>21</DurationFormat>
  <WorkFormat>2</WorkFormat>
  <EditableActualCosts>0</EditableActualCosts>
  <HonorConstraints>0</HonorConstraints>${calendarsXml}
  <Tasks>${tasksXml}
  </Tasks>
</Project>`;
}

/**
 * Parses Microsoft Project XML string into Task list and project metadata
 */
export function parseMSProjectXML(xmlContent: string): {
  projectName: string;
  startDate: string;
  tasks: Task[];
  scheduleMode?: ScheduleMode;
  holidays?: Holiday[];
} {
  // Check if browser DOMParser is available
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');

    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('Invalid XML content: ' + parserError.textContent);
    }

    const projectNameEl = xmlDoc.querySelector('Project > Name, Project > Title');
    const projectName = projectNameEl?.textContent?.trim() || 'Imported MS Project';

    const startDateEl = xmlDoc.querySelector('Project > StartDate');
    let startDate = '2000-02-01';
    if (startDateEl?.textContent) {
      const rawDate = startDateEl.textContent.trim().split('T')[0];
      if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        startDate = rawDate;
      }
    }

    // Parse WeekDays for ScheduleMode (calendar vs working)
    let scheduleMode: ScheduleMode = 'working';
    const weekDays = Array.from(xmlDoc.querySelectorAll('WeekDays > WeekDay'));
    const sunWd = weekDays.find(w => w.querySelector('DayType')?.textContent?.trim() === '1');
    const satWd = weekDays.find(w => w.querySelector('DayType')?.textContent?.trim() === '7');
    if (
      sunWd?.querySelector('DayWorking')?.textContent?.trim() === '1' &&
      satWd?.querySelector('DayWorking')?.textContent?.trim() === '1'
    ) {
      scheduleMode = 'calendar';
    }

    // Parse Exceptions for Holidays
    const holidayElements = Array.from(
      xmlDoc.querySelectorAll('Calendar > Exceptions > Exception, Exceptions > Exception')
    );
    const holidays: Holiday[] = [];
    holidayElements.forEach((el, idx) => {
      const dayWorkingEl = el.querySelector('DayWorking');
      if (dayWorkingEl?.textContent?.trim() === '1') return; // working time exception, not a holiday

      const fromDateEl = el.querySelector('TimePeriod > FromDate, FromDate');
      const nameEl = el.querySelector('Name');
      if (fromDateEl?.textContent) {
        const date = fromDateEl.textContent.trim().split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          const name = nameEl?.textContent?.trim() || 'Holiday';
          if (!holidays.some(h => h.date === date)) {
            holidays.push({
              id: `h_imported_${date}_${idx}`,
              date,
              name,
            });
          }
        }
      }
    });

    const taskElements = Array.from(xmlDoc.querySelectorAll('Tasks > Task'));
    const uidToTaskIdMap = new Map<number, string>();
    const rawTasks: Array<{
      uid: number;
      id: string;
      name: string;
      duration: number;
      predUids: number[];
      outlineLevel?: number;
    }> = [];

    let validCounter = 1;
    taskElements.forEach(taskEl => {
      const uidStr = taskEl.querySelector('UID')?.textContent?.trim();
      const nameStr = taskEl.querySelector('Name')?.textContent?.trim();
      const durationStr = taskEl.querySelector('Duration')?.textContent?.trim() || '';
      const isNull = taskEl.querySelector('IsNull')?.textContent?.trim();

      if (isNull === '1' || (!nameStr && uidStr === '0')) {
        return;
      }

      const uid = uidStr ? parseInt(uidStr, 10) : validCounter;
      const id = `T${uid}`;
      const name = nameStr || `Task ${uid}`;
      const duration = parseMSPDuration(durationStr);

      const predLinks = Array.from(taskEl.querySelectorAll('PredecessorLink'));
      const predUids: number[] = [];
      predLinks.forEach(link => {
        const pUidStr = link.querySelector('PredecessorUID')?.textContent?.trim();
        if (pUidStr) {
          const pUid = parseInt(pUidStr, 10);
          if (!isNaN(pUid) && pUid !== uid) {
            predUids.push(pUid);
          }
        }
      });

      const outlineLevelStr = taskEl.querySelector('OutlineLevel')?.textContent?.trim();
      const outlineLevel = outlineLevelStr ? parseInt(outlineLevelStr, 10) : 1;

      uidToTaskIdMap.set(uid, id);
      rawTasks.push({ uid, id, name, duration, predUids, outlineLevel });
      validCounter++;
    });

    const tasks: Task[] = rawTasks.map(rt => {
      const predecessors = rt.predUids
        .map(pUid => uidToTaskIdMap.get(pUid))
        .filter((pId): pId is string => Boolean(pId));

      return {
        id: rt.id,
        uid: rt.uid,
        name: rt.name,
        duration: rt.duration,
        predecessors,
        outlineLevel: rt.outlineLevel,
      };
    });

    return { projectName, startDate, tasks, scheduleMode, holidays };
  }

  // Regex fallback for non-DOM environments (e.g. Node tests)
  const nameMatch = xmlContent.match(/<Name>(.*?)<\/Name>/);
  const projectName = nameMatch ? nameMatch[1] : 'Imported MS Project';

  const startMatch = xmlContent.match(/<StartDate>(.*?)<\/StartDate>/);
  const startDate = startMatch ? startMatch[1].split('T')[0] : '2000-02-01';

  // Fallback check for Calendar mode vs Working mode
  let scheduleMode: ScheduleMode = 'working';
  const sundayCalendarMatch = /<WeekDay>\s*<DayType>1<\/DayType>\s*<DayWorking>1<\/DayWorking>/i.test(xmlContent);
  const saturdayCalendarMatch = /<WeekDay>\s*<DayType>7<\/DayType>\s*<DayWorking>1<\/DayWorking>/i.test(xmlContent);
  if (sundayCalendarMatch && saturdayCalendarMatch) {
    scheduleMode = 'calendar';
  }

  // Fallback parse exceptions
  const holidays: Holiday[] = [];
  const exceptionRegex = /<Exception>([\s\S]*?)<\/Exception>/g;
  let excMatch: RegExpExecArray | null;
  let excIdx = 1;
  while ((excMatch = exceptionRegex.exec(xmlContent)) !== null) {
    const excXml = excMatch[1];
    const dayWorkingMatch = excXml.match(/<DayWorking>(\d+)<\/DayWorking>/);
    if (dayWorkingMatch && dayWorkingMatch[1] === '1') continue;

    const fromDateMatch = excXml.match(/<FromDate>(.*?)<\/FromDate>/);
    const excNameMatch = excXml.match(/<Name>(.*?)<\/Name>/);
    if (fromDateMatch) {
      const date = fromDateMatch[1].split('T')[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const name = excNameMatch ? excNameMatch[1] : 'Holiday';
        if (!holidays.some(h => h.date === date)) {
          holidays.push({ id: `h_imported_${date}_${excIdx++}`, date, name });
        }
      }
    }
  }

  const taskRegex = /<Task>([\s\S]*?)<\/Task>/g;
  let match: RegExpExecArray | null;
  const rawTasks: Array<{ uid: number; id: string; name: string; duration: number; predUids: number[] }> = [];
  const uidToTaskIdMap = new Map<number, string>();
  let validCounter = 1;

  while ((match = taskRegex.exec(xmlContent)) !== null) {
    const taskXml = match[1];
    const uidMatch = taskXml.match(/<UID>(\d+)<\/UID>/);
    const nameMatch = taskXml.match(/<Name>(.*?)<\/Name>/);
    const durMatch = taskXml.match(/<Duration>(.*?)<\/Duration>/);
    const isNullMatch = taskXml.match(/<IsNull>(\d+)<\/IsNull>/);

    const uid = uidMatch ? parseInt(uidMatch[1], 10) : validCounter;
    const name = nameMatch ? nameMatch[1] : `Task ${uid}`;
    const isNull = isNullMatch ? isNullMatch[1] : '0';

    if (isNull === '1' || (!nameMatch && uid === 0)) continue;

    const duration = durMatch ? parseMSPDuration(durMatch[1]) : 1;
    const predUids: number[] = [];
    const predRegex = /<PredecessorUID>(\d+)<\/PredecessorUID>/g;
    let predMatch: RegExpExecArray | null;
    while ((predMatch = predRegex.exec(taskXml)) !== null) {
      predUids.push(parseInt(predMatch[1], 10));
    }

    const id = `T${uid}`;
    uidToTaskIdMap.set(uid, id);
    rawTasks.push({ uid, id, name, duration, predUids });
    validCounter++;
  }

  const tasks: Task[] = rawTasks.map(rt => {
    const predecessors = rt.predUids
      .map(pUid => uidToTaskIdMap.get(pUid))
      .filter((pId): pId is string => Boolean(pId));

    return {
      id: rt.id,
      uid: rt.uid,
      name: rt.name,
      duration: rt.duration,
      predecessors,
    };
  });

  return { projectName, startDate, tasks, scheduleMode, holidays };
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
