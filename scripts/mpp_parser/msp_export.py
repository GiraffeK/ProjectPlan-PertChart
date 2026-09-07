#!/usr/bin/env python3
"""
MSP Export - Parse Microsoft Project files (MPP/XML) and export to JSON.

This is a pure Python implementation that does not require Java.
Supports MPP14+ files (MS Project 2010 and later) and MS Project XML format.

Usage:
    msp_export.py <input_file> [output_file]

If output_file is not specified, writes to stdout.
"""

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Optional

from mpp_reader import MPPReader, ProjectData


def parse_xml_duration(duration_str: Optional[str]) -> float:
    """
    Parse MS Project XML duration format (ISO 8601 duration).
    Format: PT8H0M0S = 8 hours, P5D = 5 days
    Returns minutes.
    """
    if not duration_str:
        return 0.0

    minutes = 0.0
    duration_str = duration_str.upper()

    # Handle PT prefix (time duration)
    if duration_str.startswith('PT'):
        duration_str = duration_str[2:]

        # Parse hours
        if 'H' in duration_str:
            h_idx = duration_str.index('H')
            hours = float(duration_str[:h_idx])
            minutes += hours * 60
            duration_str = duration_str[h_idx + 1:]

        # Parse minutes
        if 'M' in duration_str:
            m_idx = duration_str.index('M')
            mins = float(duration_str[:m_idx])
            minutes += mins
            duration_str = duration_str[m_idx + 1:]

        # Parse seconds
        if 'S' in duration_str:
            s_idx = duration_str.index('S')
            secs = float(duration_str[:s_idx])
            minutes += secs / 60

    # Handle P prefix (date duration)
    elif duration_str.startswith('P'):
        duration_str = duration_str[1:]

        # Parse days
        if 'D' in duration_str:
            d_idx = duration_str.index('D')
            days = float(duration_str[:d_idx])
            minutes += days * 8 * 60  # Assuming 8-hour days

    return minutes


def parse_xml_datetime(dt_str: Optional[str]) -> Optional[datetime]:
    """Parse MS Project XML datetime format."""
    if not dt_str:
        return None

    try:
        # Handle ISO format with timezone
        if 'T' in dt_str:
            # Remove timezone suffix if present
            if dt_str.endswith('Z'):
                dt_str = dt_str[:-1]
            elif '+' in dt_str[-6:]:
                dt_str = dt_str[:dt_str.rfind('+')]
            elif '-' in dt_str[-6:]:
                # Be careful not to remove date hyphens
                last_dash = dt_str.rfind('-')
                if last_dash > 10:  # After the date part
                    dt_str = dt_str[:last_dash]

            return datetime.fromisoformat(dt_str)
        else:
            return datetime.strptime(dt_str, '%Y-%m-%d')
    except Exception:
        return None


def read_xml_project(filepath: str) -> ProjectData:
    """
    Read MS Project XML file and return ProjectData.
    """
    from mpp_reader import (
        Task, Resource, Assignment, Predecessor, Calendar,
        CalendarException, BoardColumn, Sprint, ProjectData,
        RESOURCE_TYPE_WORK, RESOURCE_TYPE_MATERIAL, RESOURCE_TYPE_COST
    )

    tree = ET.parse(filepath)
    root = tree.getroot()

    # Handle namespace
    ns = ''
    if root.tag.startswith('{'):
        ns = root.tag[1:root.tag.index('}')]
        ns = '{' + ns + '}'

    def find(element, path):
        """Find element with namespace handling."""
        if ns:
            path = '/'.join(ns + p for p in path.split('/'))
        return element.find(path)

    def findall(element, path):
        """Find all elements with namespace handling."""
        if ns:
            path = '/'.join(ns + p for p in path.split('/'))
        return element.findall(path)

    def get_text(element, path, default=''):
        """Get text content of child element."""
        child = find(element, path)
        return child.text if child is not None and child.text else default

    def get_int(element, path, default=0):
        """Get integer content of child element."""
        text = get_text(element, path)
        try:
            return int(text) if text else default
        except ValueError:
            return default

    def get_float(element, path, default=0.0):
        """Get float content of child element."""
        text = get_text(element, path)
        try:
            return float(text) if text else default
        except ValueError:
            return default

    project = ProjectData()

    # Project metadata
    project.title = get_text(root, 'Name') or get_text(root, 'Title')
    project.author = get_text(root, 'Author')

    # Parse tasks
    tasks_element = find(root, 'Tasks')
    if tasks_element is not None:
        for task_elem in findall(tasks_element, 'Task'):
            task = Task()
            task.id = get_int(task_elem, 'ID')
            task.unique_id = get_int(task_elem, 'UID')
            task.name = get_text(task_elem, 'Name')
            task.outline_level = get_int(task_elem, 'OutlineLevel')
            task.priority = get_int(task_elem, 'Priority', 500)
            task.is_summary = get_text(task_elem, 'Summary') == '1'
            task.percent_complete = get_float(task_elem, 'PercentComplete')

            # Parse dates
            task.start = parse_xml_datetime(get_text(task_elem, 'Start'))
            task.finish = parse_xml_datetime(get_text(task_elem, 'Finish'))
            task.actual_start = parse_xml_datetime(get_text(task_elem, 'ActualStart'))
            task.actual_finish = parse_xml_datetime(get_text(task_elem, 'ActualFinish'))

            # Parse duration and work
            task.duration_minutes = parse_xml_duration(get_text(task_elem, 'Duration'))
            task.work_minutes = parse_xml_duration(get_text(task_elem, 'Work'))

            # Parse constraint
            task.constraint_type = get_int(task_elem, 'ConstraintType')
            task.constraint_date = parse_xml_datetime(get_text(task_elem, 'ConstraintDate'))

            # Parse notes
            task.notes = get_text(task_elem, 'Notes')

            # Skip UID 0 (project summary)
            if task.unique_id > 0:
                project.tasks.append(task)

    # Calculate task hierarchy
    _calculate_task_hierarchy(project.tasks)

    # Parse resources
    resources_element = find(root, 'Resources')
    if resources_element is not None:
        for res_elem in findall(resources_element, 'Resource'):
            resource = Resource()
            resource.id = get_int(res_elem, 'ID')
            resource.unique_id = get_int(res_elem, 'UID')
            resource.name = get_text(res_elem, 'Name')
            resource.initials = get_text(res_elem, 'Initials')
            resource.group = get_text(res_elem, 'Group')
            resource.notes = get_text(res_elem, 'Notes')

            # Parse type (0=Work, 1=Material, 2=Cost)
            resource.type = get_int(res_elem, 'Type')

            # Parse rates
            resource.standard_rate = get_float(res_elem, 'StandardRate')
            resource.overtime_rate = get_float(res_elem, 'OvertimeRate')
            resource.cost_per_use = get_float(res_elem, 'CostPerUse')

            # Skip empty resources (UID 0 or no name)
            if resource.unique_id > 0 and resource.name:
                project.resources.append(resource)

    # Parse assignments
    assignments_element = find(root, 'Assignments')
    if assignments_element is not None:
        for assn_elem in findall(assignments_element, 'Assignment'):
            assignment = Assignment()
            assignment.id = get_int(assn_elem, 'UID')
            assignment.unique_id = get_int(assn_elem, 'UID')
            assignment.task_id = get_int(assn_elem, 'TaskUID')
            assignment.resource_id = get_int(assn_elem, 'ResourceUID')

            # Parse work
            assignment.work_minutes = parse_xml_duration(get_text(assn_elem, 'Work'))
            assignment.actual_work_minutes = parse_xml_duration(get_text(assn_elem, 'ActualWork'))

            # Parse units (stored as decimal, e.g., 1.0 = 100%)
            assignment.units = get_float(assn_elem, 'Units', 1.0)

            # Parse dates
            assignment.start = parse_xml_datetime(get_text(assn_elem, 'Start'))
            assignment.finish = parse_xml_datetime(get_text(assn_elem, 'Finish'))

            # Skip unassigned (resource_id 0 or -65535)
            if assignment.resource_id > 0:
                project.assignments.append(assignment)

    # Parse predecessors from task elements
    if tasks_element is not None:
        link_id = 0
        for task_elem in findall(tasks_element, 'Task'):
            successor_id = get_int(task_elem, 'UID')
            for pred_elem in findall(task_elem, 'PredecessorLink'):
                pred = Predecessor()
                pred.id = link_id
                link_id += 1
                pred.predecessor_task_id = get_int(pred_elem, 'PredecessorUID')
                pred.successor_task_id = successor_id

                # Parse link type (0=FF, 1=FS, 2=SF, 3=SS)
                link_type_num = get_int(pred_elem, 'Type', 1)
                link_types = {0: 'FF', 1: 'FS', 2: 'SF', 3: 'SS'}
                pred.link_type = link_types.get(link_type_num, 'FS')

                # Parse lag
                pred.lag_minutes = parse_xml_duration(get_text(pred_elem, 'LinkLag'))

                project.predecessors.append(pred)

    # Parse calendars
    calendars_element = find(root, 'Calendars')
    if calendars_element is not None:
        for cal_elem in findall(calendars_element, 'Calendar'):
            calendar = Calendar()
            calendar.id = get_int(cal_elem, 'UID')
            calendar.name = get_text(cal_elem, 'Name')
            calendar.is_default = get_text(cal_elem, 'IsBaseCalendar') == '1'

            # Parse exceptions
            exceptions_elem = find(cal_elem, 'Exceptions')
            if exceptions_elem is not None:
                for exc_elem in findall(exceptions_elem, 'Exception'):
                    exception = CalendarException()
                    exception.name = get_text(exc_elem, 'Name')
                    exception.start = parse_xml_datetime(get_text(exc_elem, 'TimePeriod/FromDate'))
                    exception.finish = parse_xml_datetime(get_text(exc_elem, 'TimePeriod/ToDate'))
                    exception.working = get_text(exc_elem, 'DayWorking') == '1'
                    calendar.exceptions.append(exception)

            project.calendars.append(calendar)

    # Calculate project dates from tasks
    task_starts = [t.start for t in project.tasks if t.start]
    task_finishes = [t.finish for t in project.tasks if t.finish]
    if task_starts:
        project.start_date = min(task_starts)
    if task_finishes:
        project.finish_date = max(task_finishes)

    return project


def _calculate_task_hierarchy(tasks: list) -> None:
    """Calculate parent_task_id for tasks based on outline levels."""
    parent_stack = []

    for i, task in enumerate(tasks):
        # Determine if summary from next task's level
        if not task.is_summary and i + 1 < len(tasks):
            if tasks[i + 1].outline_level > task.outline_level:
                task.is_summary = True

        # Find parent
        while parent_stack and parent_stack[-1].outline_level >= task.outline_level:
            parent_stack.pop()

        if parent_stack:
            task.parent_task_id = parent_stack[-1].id

        parent_stack.append(task)


def project_to_dict(project: ProjectData) -> dict:
    """
    Convert ProjectData to a JSON-serializable dictionary.
    """
    def datetime_handler(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return obj

    def task_to_dict(task):
        d = {
            'id': task.id,
            'unique_id': task.unique_id,
            'name': task.name,
            'duration_minutes': task.duration_minutes,
            'work_minutes': task.work_minutes,
            'percent_complete': task.percent_complete,
            'outline_level': task.outline_level,
            'is_summary': task.is_summary,
            'priority': task.priority,
            'parent_task_id': task.parent_task_id,
            'constraint_type': task.constraint_type,
        }
        if task.start:
            d['start'] = task.start.isoformat()
        if task.finish:
            d['finish'] = task.finish.isoformat()
        if task.actual_start:
            d['actual_start'] = task.actual_start.isoformat()
        if task.actual_finish:
            d['actual_finish'] = task.actual_finish.isoformat()
        if task.constraint_date:
            d['constraint_date'] = task.constraint_date.isoformat()
        if task.notes:
            d['notes'] = task.notes
        if task.custom_fields:
            d['custom_fields'] = task.custom_fields
        return d

    def resource_to_dict(resource):
        type_names = {0: 'Work', 1: 'Material', 2: 'Cost'}
        return {
            'id': resource.id,
            'unique_id': resource.unique_id,
            'name': resource.name,
            'initials': resource.initials,
            'type': type_names.get(resource.type, 'Work'),
            'type_id': resource.type,
            'group': resource.group,
            'notes': resource.notes,
            'standard_rate': resource.standard_rate,
            'overtime_rate': resource.overtime_rate,
            'cost_per_use': resource.cost_per_use,
        }

    def assignment_to_dict(assignment):
        d = {
            'id': assignment.id,
            'unique_id': assignment.unique_id,
            'task_id': assignment.task_id,
            'resource_id': assignment.resource_id,
            'work_minutes': assignment.work_minutes,
            'actual_work_minutes': assignment.actual_work_minutes,
            'units': assignment.units,
        }
        if assignment.start:
            d['start'] = assignment.start.isoformat()
        if assignment.finish:
            d['finish'] = assignment.finish.isoformat()
        return d

    def predecessor_to_dict(pred):
        return {
            'id': pred.id,
            'predecessor_task_id': pred.predecessor_task_id,
            'successor_task_id': pred.successor_task_id,
            'link_type': pred.link_type,
            'lag_minutes': pred.lag_minutes,
        }

    def calendar_to_dict(cal):
        return {
            'id': cal.id,
            'name': cal.name,
            'is_default': cal.is_default,
            'working_days': cal.working_days,
            'exceptions': [
                {
                    'name': e.name,
                    'start': e.start.isoformat() if e.start else None,
                    'finish': e.finish.isoformat() if e.finish else None,
                    'working': e.working,
                }
                for e in cal.exceptions
            ]
        }

    def board_column_to_dict(col):
        return {
            'id': col.id,
            'name': col.name,
            'order': col.order,
        }

    def sprint_to_dict(sprint):
        return {
            'id': sprint.id,
            'name': sprint.name,
            'start': sprint.start.isoformat() if sprint.start else None,
            'finish': sprint.finish.isoformat() if sprint.finish else None,
        }

    # Calculate totals
    resource_totals = project.get_resource_totals()
    total_hours = sum(resource_totals.values())

    return {
        'project': {
            'title': project.title,
            'author': project.author,
            'created': project.created.isoformat() if project.created else None,
            'modified': project.modified.isoformat() if project.modified else None,
            'start_date': project.start_date.isoformat() if project.start_date else None,
            'finish_date': project.finish_date.isoformat() if project.finish_date else None,
        },
        'summary': {
            'task_count': len(project.tasks),
            'resource_count': len(project.resources),
            'assignment_count': len(project.assignments),
            'predecessor_count': len(project.predecessors),
            'total_hours': round(total_hours, 1),
        },
        'tasks': [task_to_dict(t) for t in project.tasks],
        'resources': [resource_to_dict(r) for r in project.resources],
        'assignments': [assignment_to_dict(a) for a in project.assignments],
        'predecessors': [predecessor_to_dict(p) for p in project.predecessors],
        'calendars': [calendar_to_dict(c) for c in project.calendars],
        'board_columns': [board_column_to_dict(c) for c in project.board_columns],
        'sprints': [sprint_to_dict(s) for s in project.sprints],
        'resource_totals': resource_totals,
    }


def main():
    parser = argparse.ArgumentParser(
        description='Parse Microsoft Project files and export to JSON',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
    msp_export.py project.mpp                    # Output to stdout
    msp_export.py project.mpp output.json        # Output to file
    msp_export.py project.xml output.json        # Parse XML format
    msp_export.py project.mpp -o output.json     # Alternative syntax
'''
    )
    parser.add_argument('input', help='Input MPP or XML file')
    parser.add_argument('output', nargs='?', help='Output JSON file (default: stdout)')
    parser.add_argument('-o', '--output-file', dest='output_file',
                        help='Output JSON file (alternative to positional argument)')
    parser.add_argument('-p', '--pretty', action='store_true',
                        help='Pretty-print JSON output')
    parser.add_argument('-q', '--quiet', action='store_true',
                        help='Suppress summary output to stderr')

    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    output_path = args.output_file or args.output

    # Determine file type and parse
    suffix = input_path.suffix.lower()
    try:
        if suffix == '.xml':
            project = read_xml_project(str(input_path))
        elif suffix in ('.mpp', '.mpt'):
            reader = MPPReader(str(input_path))
            project = reader.read()
        else:
            print(f"Error: Unsupported file format: {suffix}", file=sys.stderr)
            print("Supported formats: .mpp, .mpt, .xml", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"Error parsing file: {e}", file=sys.stderr)
        sys.exit(1)

    # Convert to JSON
    data = project_to_dict(project)

    # Output
    indent = 2 if args.pretty else None
    json_output = json.dumps(data, indent=indent, ensure_ascii=False)

    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(json_output)
        if not args.quiet:
            print(f"Exported {len(project.tasks)} tasks, {len(project.resources)} resources, "
                  f"{data['summary']['total_hours']} hours to {output_path}", file=sys.stderr)
    else:
        print(json_output)


if __name__ == '__main__':
    main()
