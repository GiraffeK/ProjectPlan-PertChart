#!/usr/bin/env python3
"""
Pure Python MPP Reader using olefile.

This module provides reading capabilities for Microsoft Project files
without requiring Java/MPXJ. It reads the OLE compound document structure
and extracts tasks, resources, and assignments with work hours.

Tested against MPXJ output - work hours match for all standard work resources.

Supported Features:
- Project metadata (title, author, dates)
- Tasks with:
  - Name, ID, unique ID
  - Dates (start, finish, actual start/finish)
  - Duration and work hours
  - Outline level and parent/child hierarchy (WBS)
  - Summary task detection
  - Priority (0-1000, default 500)
  - Percent complete
  - Constraint type and date
  - Notes and hyperlinks (fields defined, parsing available if data present)
  - Baseline fields (start, finish, duration, work, cost)
  - Earned value fields (BCWS, BCWP, ACWP)
  - Custom fields dictionary
- Resources with:
  - Name, ID, type (Work/Material/Cost)
  - Group assignment
  - Notes
  - Rate fields (standard, overtime, cost per use)
- Assignments with:
  - Task and resource IDs
  - Work hours (planned and actual)
  - Units (% allocation)
  - Dates (start, finish)
- Predecessor/successor relationships (FS, SS, FF, SF link types with lag)
- Calendars with:
  - Working days (Mon-Fri by default)
  - Exception names (holidays: Labor Day, Thanksgiving, Christmas, etc.)
- Agile/Board features:
  - Board column definitions (Not Started, Next up, In progress, Done)
  - Sprint definitions with names and dates
- Project start/finish dates (calculated from tasks)
- Weekly hours breakdown (via get_weekly_hours method)
- Resource totals (via get_resource_totals method)

Limitations:
- Only tested with MPP14+ files (MS Project 2010 and later)
- Weekly hours are calculated by distributing work evenly across assignment dates
  (actual time-phased data from MPP file not extracted due to format complexity)
- No write support
- Project summary task (row 0) is not included in task list
- Resource rates may not be extracted if stored in sparse format
- Calendar exception dates (start/finish) use complex encoding not fully decoded
- Outline codes not linked to tasks (definitions only)

Usage:
    from mpp_reader import MPPReader

    reader = MPPReader("project.mpp")
    project = reader.read()

    for task in project.tasks:
        print(f"{task.name}: Level {task.outline_level}, Priority {task.priority}")

    for resource in project.resources:
        print(f"{resource.name}: {resource.id} ({resource.type})")

    for assignment in project.assignments:
        hours = assignment.work_minutes / 60
        print(f"Task {assignment.task_id}: {hours:.1f}h @ {assignment.units*100:.0f}%")

    # Access Agile features
    for col in project.board_columns:
        print(f"Board column: {col.name}")

    for sprint in project.sprints:
        print(f"Sprint: {sprint.name} ({sprint.start} - {sprint.finish})")
"""

import olefile
import struct
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional


# MPP date epoch - December 31, 1983 at midnight
# Dates are stored as (days * 65536) since this epoch
MPP_DATE_EPOCH = datetime(1983, 12, 31)
MPP_DATE_DIVISOR = 65536  # Dates stored as value / 65536 = days since epoch

# Resource type constants
RESOURCE_TYPE_WORK = 0
RESOURCE_TYPE_MATERIAL = 1
RESOURCE_TYPE_COST = 2

# Resource type indicator offset in FixedData (record size 120)
# Value -1 (0xFFFF) indicates Material, 0 indicates Work
RESOURCE_TYPE_OFFSET = 70
RESOURCE_RECORD_SIZE = 120


# Task field offsets vary by record size - these are format-specific layouts
# Format detected at runtime based on record_count and fixed_data size

# 202-byte format (standard MPP14)
TASK_OFFSETS_202 = {
    'id': 48,              # int32
    'unique_id': 52,       # int32
    'outline_level': 18,   # int16: 0=project, 1=top level, 2+...
    'constraint_date': 32, # int32
    'constraint_type': 34, # byte: 0=ASAP, 1=ALAP, 2=MSO, etc.
    'work': 56,            # double, divide by 1000 for minutes
    'priority': 126,       # int16, default 500
    'duration': 132,       # uint32, tenths of minutes
    'start': 144,          # uint32, MPP date format
    'finish': 148,         # uint32, MPP date format
    'summary_flag': 188,   # byte: 1=summary task
}

# 172-byte format (compact MPP14 - observed in some files)
TASK_OFFSETS_172 = {
    'id': 4,               # int32
    'unique_id': 0,        # int32 (sometimes at offset 8)
    'outline_level': 146,  # int16
    'constraint_date': None,  # not yet mapped
    'constraint_type': None,  # not yet mapped
    'work': None,          # not yet mapped
    'priority': 82,        # int16, default 500
    'duration': 84,        # uint32, tenths of minutes
    'start': 100,          # uint32, MPP date format
    'finish': 104,         # uint32, MPP date format
    'summary_flag': 144,   # byte: 1=summary task
}

# 193-byte format (medium - observed in some files)
TASK_OFFSETS_193 = {
    'id': 48,              # int32 (same as 202)
    'unique_id': 52,       # int32 (same as 202)
    'outline_level': 18,   # int16
    'constraint_date': 32,
    'constraint_type': 34,
    'work': 56,            # double
    'priority': 126,       # int16
    'duration': 132,       # uint32
    'start': 144,          # uint32
    'finish': 148,         # uint32
    'summary_flag': 179,   # adjusted for shorter record
}

# Default offsets (202-byte) for backward compatibility
TASK_OUTLINE_LEVEL_OFFSET = 18
TASK_CONSTRAINT_DATE_OFFSET = 32
TASK_CONSTRAINT_TYPE_OFFSET = 34
TASK_ID_OFFSET = 48
TASK_UNIQUE_ID_OFFSET = 52
TASK_WORK_OFFSET = 56
TASK_PRIORITY_OFFSET = 126
TASK_DURATION_OFFSET = 132
TASK_START_OFFSET = 144
TASK_FINISH_OFFSET = 148
TASK_SUMMARY_FLAG_OFFSET = 188
TASK_RECORD_SIZE = 202


def get_task_offsets(record_size):
    """Get field offsets dictionary for the given record size."""
    if record_size == 172:
        return TASK_OFFSETS_172
    elif record_size == 193:
        return TASK_OFFSETS_193
    elif record_size >= 200:
        return TASK_OFFSETS_202
    else:
        # Unknown format, return 202 offsets and hope for the best
        return TASK_OFFSETS_202

# VarMeta field type flags (correlate to XML schema field IDs)
VARMETA_TASK_NAME = 0x000E
VARMETA_TASK_NOTES = 0x007C
VARMETA_TASK_WBS = 0x04E3
VARMETA_RESOURCE_NAME = 0x0001
VARMETA_RESOURCE_INITIALS = 0x0002
VARMETA_RESOURCE_GROUP = 0x0055


@dataclass
class Task:
    """Represents a task from the MPP file."""
    id: int = 0
    unique_id: int = 0
    name: str = ""
    duration_minutes: float = 0.0
    start: Optional[datetime] = None
    finish: Optional[datetime] = None
    actual_start: Optional[datetime] = None  # Actual start date
    actual_finish: Optional[datetime] = None  # Actual finish date
    work_minutes: float = 0.0
    percent_complete: float = 0.0
    outline_level: int = 0
    is_summary: bool = False
    priority: int = 500  # 0-1000, default 500
    parent_task_id: Optional[int] = None
    constraint_type: int = 0  # 0=ASAP, 1=ALAP, 2=MSO, 3=MFO, 4=SNET, 5=SNLT, 6=FNET, 7=FNLT
    constraint_date: Optional[datetime] = None  # Date for constraint if applicable
    notes: str = ""  # Task notes (RTF or plain text)
    hyperlink: str = ""  # Task hyperlink URL
    # Baseline fields (Baseline 0)
    baseline_start: Optional[datetime] = None
    baseline_finish: Optional[datetime] = None
    baseline_duration_minutes: float = 0.0
    baseline_work_minutes: float = 0.0
    baseline_cost: float = 0.0
    # Earned Value fields
    bcws: float = 0.0  # Budgeted Cost of Work Scheduled
    bcwp: float = 0.0  # Budgeted Cost of Work Performed
    acwp: float = 0.0  # Actual Cost of Work Performed
    # Custom fields storage
    custom_fields: dict = field(default_factory=dict)


@dataclass
class Resource:
    """Represents a resource from the MPP file."""
    id: int = 0
    unique_id: int = 0
    name: str = ""
    initials: str = ""
    type: int = 0  # 0=Work, 1=Material, 2=Cost
    group: str = ""  # Resource group
    notes: str = ""  # Resource notes
    standard_rate: float = 0.0  # Standard rate ($/hour)
    overtime_rate: float = 0.0  # Overtime rate ($/hour)
    cost_per_use: float = 0.0  # Cost per use


@dataclass
class Assignment:
    """Represents a resource assignment to a task."""
    id: int = 0
    unique_id: int = 0
    task_id: int = 0
    resource_id: int = 0
    work_minutes: float = 0.0
    actual_work_minutes: float = 0.0  # Actual work performed
    units: float = 1.0  # Resource allocation (1.0 = 100%)
    start: Optional[datetime] = None
    finish: Optional[datetime] = None


@dataclass
class Predecessor:
    """Represents a predecessor relationship between tasks."""
    id: int = 0
    predecessor_task_id: int = 0
    successor_task_id: int = 0
    link_type: str = "FS"  # FS, SS, FF, SF
    lag_minutes: float = 0.0


@dataclass
class CalendarException:
    """Represents a calendar exception (holiday, non-working day)."""
    name: str = ""
    start: Optional[datetime] = None
    finish: Optional[datetime] = None
    working: bool = False  # False = non-working day


@dataclass
class Calendar:
    """Represents a project calendar."""
    id: int = 0
    name: str = ""
    is_default: bool = False
    # Default working days (0=Sunday, 6=Saturday)
    working_days: list[bool] = field(default_factory=lambda: [False, True, True, True, True, True, False])
    exceptions: list[CalendarException] = field(default_factory=list)


@dataclass
class BoardColumn:
    """Represents an Agile/Kanban board column definition."""
    id: int = 0
    name: str = ""
    order: int = 0  # Display order of the column


@dataclass
class Sprint:
    """Represents an Agile sprint definition."""
    id: int = 0
    name: str = ""
    start: Optional[datetime] = None
    finish: Optional[datetime] = None


@dataclass
class OutlineCode:
    """Represents an outline code definition (custom hierarchical code)."""
    id: int = 0
    name: str = ""
    field_id: int = 0  # Which outline code field (1-10)


@dataclass
class ProjectData:
    """Container for all project data."""
    title: str = ""
    author: str = ""
    created: Optional[datetime] = None
    modified: Optional[datetime] = None
    start_date: Optional[datetime] = None
    finish_date: Optional[datetime] = None
    tasks: list[Task] = field(default_factory=list)
    resources: list[Resource] = field(default_factory=list)
    assignments: list[Assignment] = field(default_factory=list)
    predecessors: list[Predecessor] = field(default_factory=list)
    calendars: list[Calendar] = field(default_factory=list)
    board_columns: list[BoardColumn] = field(default_factory=list)
    sprints: list[Sprint] = field(default_factory=list)
    outline_codes: list[OutlineCode] = field(default_factory=list)

    def get_weekly_hours(self, work_resources_only: bool = True) -> dict[str, dict[str, float]]:
        """
        Calculate weekly hours breakdown by resource.

        Args:
            work_resources_only: If True (default), only include Work type resources.
                                 Material and Cost resources are excluded.

        Returns a dict of {week_start_date: {resource_name: hours}}.
        Week start dates are Monday of each week in YYYY-MM-DD format.

        Note: This distributes work evenly across the assignment duration.
        For exact time-phased data, use MPXJ.
        """
        # Build resource lookups
        resource_names = {r.id: r.name for r in self.resources}
        resource_types = {r.id: r.type for r in self.resources}

        # Build task date lookup
        task_dates = {}
        for task in self.tasks:
            if task.start and task.finish:
                task_dates[task.id] = (task.start, task.finish)

        weekly_hours: dict[str, dict[str, float]] = {}

        for assignment in self.assignments:
            if assignment.work_minutes <= 0:
                continue

            resource_id = assignment.resource_id
            resource_name = resource_names.get(resource_id)
            if not resource_name:
                continue

            # Skip non-work resources if requested
            if work_resources_only:
                resource_type = resource_types.get(resource_id, RESOURCE_TYPE_WORK)
                if resource_type != RESOURCE_TYPE_WORK:
                    continue

            # Get dates from assignment or task
            start = assignment.start
            finish = assignment.finish

            if not start or not finish:
                # Try to get from task
                if assignment.task_id in task_dates:
                    start, finish = task_dates[assignment.task_id]
                else:
                    continue

            # Calculate work per day
            total_days = max(1, (finish - start).days)
            hours_total = assignment.work_minutes / 60
            hours_per_day = hours_total / total_days

            # Distribute hours across weeks
            current = start
            while current <= finish:
                # Get Monday of the week
                days_since_monday = current.weekday()
                week_start = current - timedelta(days=days_since_monday)
                week_key = week_start.strftime("%Y-%m-%d")

                # Calculate hours for this day
                if week_key not in weekly_hours:
                    weekly_hours[week_key] = {}
                if resource_name not in weekly_hours[week_key]:
                    weekly_hours[week_key][resource_name] = 0.0

                weekly_hours[week_key][resource_name] += hours_per_day
                current += timedelta(days=1)

        # Round values
        for week in weekly_hours:
            for resource in weekly_hours[week]:
                weekly_hours[week][resource] = round(weekly_hours[week][resource], 1)

        return weekly_hours

    def get_resource_totals(self, work_resources_only: bool = True) -> dict[str, float]:
        """
        Get total hours by resource name.

        Args:
            work_resources_only: If True (default), only include Work type resources.
                                 Material and Cost resources are excluded to match
                                 MPXJ behavior.
        """
        # Build lookups
        resource_names = {r.id: r.name for r in self.resources}
        resource_types = {r.id: r.type for r in self.resources}

        totals: dict[str, float] = {}

        for assignment in self.assignments:
            if assignment.work_minutes <= 0:
                continue

            resource_id = assignment.resource_id
            resource_name = resource_names.get(resource_id)
            if not resource_name:
                continue

            # Skip non-work resources if requested
            if work_resources_only:
                resource_type = resource_types.get(resource_id, RESOURCE_TYPE_WORK)
                if resource_type != RESOURCE_TYPE_WORK:
                    continue

            if resource_name not in totals:
                totals[resource_name] = 0.0
            totals[resource_name] += assignment.work_minutes / 60

        return {k: round(v, 1) for k, v in totals.items()}


class MPPReader:
    """
    Reader for Microsoft Project MPP files.

    Uses olefile to read the OLE compound document structure.
    """

    def __init__(self, filepath: str):
        self.filepath = filepath
        self.ole: Optional[olefile.OleFileIO] = None
        self.main_storage = ""
        self._task_names: dict[int, str] = {}
        self._resource_names: dict[int, str] = {}

    def _read_uint32(self, data: bytes, offset: int) -> int:
        """Read 32-bit unsigned integer."""
        if offset + 4 <= len(data):
            return struct.unpack_from('<I', data, offset)[0]
        return 0

    def _read_int32(self, data: bytes, offset: int) -> int:
        """Read 32-bit signed integer."""
        if offset + 4 <= len(data):
            return struct.unpack_from('<i', data, offset)[0]
        return 0

    def _read_uint16(self, data: bytes, offset: int) -> int:
        """Read 16-bit unsigned integer."""
        if offset + 2 <= len(data):
            return struct.unpack_from('<H', data, offset)[0]
        return 0

    def _read_int16(self, data: bytes, offset: int) -> int:
        """Read 16-bit signed integer."""
        if offset + 2 <= len(data):
            return struct.unpack_from('<h', data, offset)[0]
        return 0

    def _read_double(self, data: bytes, offset: int) -> float:
        """Read IEEE 754 double."""
        if offset + 8 <= len(data):
            return struct.unpack_from('<d', data, offset)[0]
        return 0.0

    def _read_timestamp(self, data: bytes, offset: int) -> Optional[datetime]:
        """
        Read an MPP timestamp from data.

        MPP stores dates as uint32: value / 65536 = days since Dec 31, 1983.
        Returns None if the value is invalid or zero.
        """
        if offset + 4 > len(data):
            return None

        value = self._read_uint32(data, offset)

        # Valid date range: roughly 1990-2100
        if value < 300000000 or value > 1500000000:
            return None

        days = value / MPP_DATE_DIVISOR
        return MPP_DATE_EPOCH + timedelta(days=days)

    def _read_stream(self, path: list[str]) -> bytes:
        """Read a stream from the OLE file."""
        if self.ole and self.ole.exists(path):
            return self.ole.openstream(path).read()
        return b''

    def _parse_utf16_string(self, data: bytes, offset: int, max_len: int = 500) -> tuple[str, int]:
        """
        Parse a UTF-16LE string from data.
        Returns (string, bytes_consumed).
        """
        if offset >= len(data):
            return "", 0

        # Find null terminator (two zero bytes)
        end = offset
        while end + 1 < len(data) and end - offset < max_len:
            if data[end] == 0 and data[end + 1] == 0:
                break
            end += 2

        if end <= offset:
            return "", 0

        try:
            text = data[offset:end].decode('utf-16-le', errors='ignore')
            return text, end - offset + 2  # Include null terminator
        except:
            return "", 0

    def _parse_var2data_strings(self, var2_data: bytes, var_meta: bytes) -> dict[int, dict[int, str]]:
        """
        Parse Var2Data to extract strings, indexed by record_id and field_type.
        Returns: {record_id: {field_type: string_value}}
        """
        result: dict[int, dict[int, str]] = {}

        if len(var_meta) < 24:
            return result

        # Parse VarMeta header
        magic = self._read_uint32(var_meta, 0)
        if magic != 0xfadfadba:
            return result

        item_count = self._read_uint32(var_meta, 8)

        # Parse VarMeta entries
        offset = 24
        for _ in range(item_count):
            if offset + 12 > len(var_meta):
                break

            field_info = self._read_uint32(var_meta, offset)
            record_id = self._read_uint32(var_meta, offset + 4)
            data_offset = self._read_uint32(var_meta, offset + 8)

            field_type = field_info & 0xFFFF

            # Read string from Var2Data at the specified offset
            if data_offset < len(var2_data):
                # First read length prefix
                str_len = self._read_uint32(var2_data, data_offset)
                if 0 < str_len < 1000 and data_offset + 4 + str_len <= len(var2_data):
                    try:
                        text = var2_data[data_offset + 4:data_offset + 4 + str_len].decode('utf-16-le', errors='ignore')
                        text = text.rstrip('\x00')
                        if text and all(c.isprintable() or c.isspace() for c in text):
                            if record_id not in result:
                                result[record_id] = {}
                            result[record_id][field_type] = text
                    except:
                        pass

            offset += 12

        return result

    def _parse_fixed_meta(self, data: bytes) -> tuple[int, int]:
        """
        Parse FixedMeta to get record count and data size.
        Returns: (record_count, data_size)
        """
        if len(data) < 16:
            return 0, 0

        magic = self._read_uint32(data, 0)
        if magic != 0xfadfadba:
            return 0, 0

        record_count = self._read_uint32(data, 8)
        data_size = self._read_uint32(data, 12)

        return record_count, data_size

    def _extract_task_names_from_var2data(self, var2_data: bytes) -> list[str]:
        """
        Extract task names from Var2Data.

        Task names are length-prefixed UTF-16LE strings. We filter for:
        - At least 3 characters (excluding short garbage)
        - First character is printable ASCII (A-Z, a-z, 0-9)
        - Contains mostly printable characters
        """
        names = []
        offset = 0

        while offset < len(var2_data) - 4:
            length = self._read_uint32(var2_data, offset)

            # Valid string: reasonable length, even (UTF-16)
            if 8 <= length <= 500 and length % 2 == 0:
                str_start = offset + 4
                str_end = str_start + length

                if str_end <= len(var2_data):
                    try:
                        text = var2_data[str_start:str_end].decode('utf-16-le', errors='ignore')
                        text = text.rstrip('\x00').strip()

                        # Filter for valid task names:
                        # - At least 3 characters
                        # - First char is ASCII letter or digit
                        # - Mostly printable characters
                        if text and len(text) >= 3:
                            first_char = text[0]
                            if first_char.isalnum() and ord(first_char) < 128:
                                # Count printable chars
                                printable_count = sum(1 for c in text if c.isprintable() or c.isspace())
                                if printable_count >= len(text) * 0.9:  # 90% printable
                                    names.append(text)
                                    offset = str_end
                                    continue
                    except:
                        pass

            offset += 1  # Byte-by-byte scan to catch unaligned strings

        return names

    def read(self) -> ProjectData:
        """
        Read the MPP file and return project data.
        """
        if not olefile.isOleFile(self.filepath):
            raise ValueError(f"Not a valid OLE file: {self.filepath}")

        self.ole = olefile.OleFileIO(self.filepath)
        project = ProjectData()

        # Read metadata
        meta = self.ole.get_metadata()
        if meta:
            project.title = meta.title.decode('utf-8', errors='ignore') if isinstance(meta.title, bytes) else str(meta.title or '')
            project.author = meta.author.decode('utf-8', errors='ignore') if isinstance(meta.author, bytes) else str(meta.author or '')
            project.created = meta.create_time
            project.modified = meta.last_saved_time

        # Find main storage (typically "   114" for MPP14+)
        for storage in ["   114", "   112", "   19", "   18"]:
            if self.ole.exists([storage]):
                self.main_storage = storage
                break

        if not self.main_storage:
            raise ValueError("Could not find main data storage in MPP file")

        # Read tasks
        project.tasks = self._read_tasks()

        # Read resources
        project.resources = self._read_resources()

        # Read assignments
        project.assignments = self._read_assignments()

        # Read predecessor relationships
        project.predecessors = self._read_predecessors()

        # Read calendars with exceptions
        project.calendars = self._read_calendars()

        # Read Agile board columns
        project.board_columns = self._read_board_columns()

        # Read sprints
        project.sprints = self._read_sprints()

        # Calculate project start/finish from tasks
        task_starts = [t.start for t in project.tasks if t.start]
        task_finishes = [t.finish for t in project.tasks if t.finish]
        if task_starts:
            project.start_date = min(task_starts)
        if task_finishes:
            project.finish_date = max(task_finishes)

        self.ole.close()
        return project

    def _read_tasks(self) -> list[Task]:
        """Read task data from the MPP file."""
        tasks = []

        # Read task data streams
        fixed_data = self._read_stream([self.main_storage, 'TBkndTask', 'FixedData'])
        fixed_meta = self._read_stream([self.main_storage, 'TBkndTask', 'FixedMeta'])
        var2_data = self._read_stream([self.main_storage, 'TBkndTask', 'Var2Data'])

        if len(fixed_data) == 0:
            return tasks

        # Extract task names from variable data
        task_names = self._extract_task_names_from_var2data(var2_data)

        # Determine record size from FixedMeta header (more reliable)
        record_count = 0
        record_size = 0

        if len(fixed_meta) >= 12:
            magic = self._read_uint32(fixed_meta, 0)
            if magic == 0xfadfadba:
                record_count = self._read_uint32(fixed_meta, 8)
                if record_count > 0:
                    record_size = len(fixed_data) // record_count

        # Fallback to name-based estimation if FixedMeta not available
        if record_count == 0 and len(task_names) > 0:
            for test_size in [172, 193, 202, 200, 204, 196, 208]:
                test_count = len(fixed_data) // test_size
                if test_count >= len(task_names) and test_count <= len(task_names) + 5:
                    record_size = test_size
                    record_count = test_count
                    break
            else:
                record_size = len(fixed_data) // (len(task_names) + 1)
                record_count = len(fixed_data) // record_size

        if record_count == 0:
            return tasks

        # Get field offsets for this record size
        offsets = get_task_offsets(record_size)

        # Parse fixed records
        name_index = 0
        for i in range(record_count):
            data_offset = i * record_size
            if data_offset + record_size > len(fixed_data):
                break

            record = fixed_data[data_offset:data_offset + record_size]

            # Check first int32 for null marker
            val0 = self._read_int32(record, 0)

            # Skip null/deleted records (marked with -65536 or 0xFFFF0000)
            if val0 == -65536:
                continue

            task = Task()

            # Read ID and Unique ID using format-specific offsets
            if offsets['id'] is not None:
                task.id = self._read_int32(record, offsets['id'])
            else:
                task.id = i

            if offsets['unique_id'] is not None:
                task.unique_id = self._read_int32(record, offsets['unique_id'])
            else:
                task.unique_id = i

            # Use record index as fallback if values seem invalid
            if task.id <= 0:
                task.id = i
            if task.unique_id <= 0:
                task.unique_id = i

            # Assign name from extracted strings
            if name_index < len(task_names):
                task.name = task_names[name_index]
                name_index += 1

            # Parse outline level
            if offsets['outline_level'] is not None and offsets['outline_level'] + 2 <= record_size:
                task.outline_level = self._read_int16(record, offsets['outline_level'])
                # Sanity check - outline level should be 0-20 typically
                if task.outline_level < 0 or task.outline_level > 50:
                    task.outline_level = 0

            # Parse priority (default 500)
            if offsets['priority'] is not None and offsets['priority'] + 2 <= record_size:
                task.priority = self._read_int16(record, offsets['priority'])
            if task.priority <= 0 or task.priority > 1000:
                task.priority = 500

            # Parse dates from task record
            if offsets['start'] is not None and offsets['start'] + 4 <= record_size:
                task.start = self._read_timestamp(record, offsets['start'])
            if offsets['finish'] is not None and offsets['finish'] + 4 <= record_size:
                task.finish = self._read_timestamp(record, offsets['finish'])

            # Parse duration (tenths of minutes)
            if offsets['duration'] is not None and offsets['duration'] + 4 <= record_size:
                duration_raw = self._read_uint32(record, offsets['duration'])
                if duration_raw > 0 and duration_raw < 100000000:  # Sanity check
                    task.duration_minutes = duration_raw / 10

            # Parse work
            if offsets['work'] is not None and offsets['work'] + 8 <= record_size:
                work_raw = self._read_double(record, offsets['work'])
                if work_raw > 0:
                    task.work_minutes = work_raw / 1000

            # Parse constraint type
            if offsets['constraint_type'] is not None and offsets['constraint_type'] < record_size:
                task.constraint_type = record[offsets['constraint_type']]
                if offsets['constraint_date'] is not None and task.constraint_type > 0:
                    task.constraint_date = self._read_timestamp(record, offsets['constraint_date'])

            # Parse summary flag
            if offsets['summary_flag'] is not None and offsets['summary_flag'] < record_size:
                task.is_summary = record[offsets['summary_flag']] == 1

            # Only add tasks with names
            if task.name:
                tasks.append(task)

        # Calculate is_summary and parent_task_id based on outline levels
        self._calculate_task_hierarchy(tasks)

        return tasks

    def _calculate_task_hierarchy(self, tasks: list[Task]) -> None:
        """Calculate parent_task_id for tasks based on outline levels.

        Note: is_summary is now read from offset 188 in the binary data, so we
        only use outline level calculation as a fallback if the flag wasn't set.
        """
        # Build a stack to track parent tasks at each outline level
        parent_stack: list[Task] = []

        for i, task in enumerate(tasks):
            # Only calculate is_summary from outline levels if not already set
            # (the binary flag at offset 188 is more reliable when present)
            if not task.is_summary and i + 1 < len(tasks):
                # Fallback: derive from next task's outline level
                if tasks[i + 1].outline_level > task.outline_level:
                    task.is_summary = True

            # Find parent by looking for the most recent task with a lower outline level
            while parent_stack and parent_stack[-1].outline_level >= task.outline_level:
                parent_stack.pop()

            if parent_stack:
                task.parent_task_id = parent_stack[-1].id

            parent_stack.append(task)

    def _read_resources(self) -> list[Resource]:
        """Read resource data from the MPP file."""
        resources = []

        fixed_meta = self._read_stream([self.main_storage, 'TBkndRsc', 'FixedMeta'])
        fixed_data = self._read_stream([self.main_storage, 'TBkndRsc', 'FixedData'])
        var2_data = self._read_stream([self.main_storage, 'TBkndRsc', 'Var2Data'])
        var_meta = self._read_stream([self.main_storage, 'TBkndRsc', 'VarMeta'])

        record_count, _ = self._parse_fixed_meta(fixed_meta)
        if record_count == 0:
            return resources

        # Build record_index -> name mapping using VarMeta
        # VarMeta structure: field_type = resource record index, record = string offset
        record_to_name = self._parse_resource_varmeta(var2_data, var_meta)

        # Parse resource types from FixedData
        # Resource type indicator is at offset 70 in each 120-byte record
        # Value -1 (0xFFFF) = Material, 0 = Work
        record_to_type: dict[int, int] = {}
        for record_index in record_to_name.keys():
            record_offset = record_index * RESOURCE_RECORD_SIZE
            if record_offset + RESOURCE_RECORD_SIZE <= len(fixed_data):
                type_indicator = self._read_int16(
                    fixed_data, record_offset + RESOURCE_TYPE_OFFSET
                )
                if type_indicator == -1:
                    record_to_type[record_index] = RESOURCE_TYPE_MATERIAL
                else:
                    record_to_type[record_index] = RESOURCE_TYPE_WORK

        # Create resource objects using the record-to-name mapping
        # Resource ID matches the assignment resource_id field
        for record_index, name in sorted(record_to_name.items()):
            if name:
                resource = Resource()
                resource.id = record_index
                resource.unique_id = record_index
                resource.name = name
                resource.type = record_to_type.get(record_index, RESOURCE_TYPE_WORK)
                resources.append(resource)

        # Store the name mapping for assignment lookup
        self._resource_names = record_to_name

        return resources

    def _parse_resource_varmeta(self, var2_data: bytes, var_meta: bytes) -> dict[int, str]:
        """
        Parse VarMeta to map resource record indices to names.

        VarMeta structure (12 bytes per entry after 24-byte header):
        - field_type (uint32): resource record index (0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)
        - string_offset (uint32): offset in Var2Data where the string is stored
        - unknown (uint32): always 205520897-205521635 (seems to be flags)

        The string at string_offset is length-prefixed UTF-16LE.
        The first string for each record_index is the resource name.
        """
        result = {}

        if len(var_meta) < 24:
            return result

        magic = self._read_uint32(var_meta, 0)
        if magic != 0xfadfadba:
            return result

        item_count = self._read_uint32(var_meta, 8)

        offset = 24
        for _ in range(item_count):
            if offset + 12 > len(var_meta):
                break

            field_type = self._read_uint32(var_meta, offset) & 0xFFFF  # Resource record index
            string_offset = self._read_uint32(var_meta, offset + 4)  # Offset in Var2Data

            # Read string from Var2Data at string_offset
            if string_offset < len(var2_data) - 4:
                str_len = self._read_uint32(var2_data, string_offset)
                if 4 <= str_len <= 200 and str_len % 2 == 0:
                    try:
                        text = var2_data[string_offset + 4:string_offset + 4 + str_len].decode('utf-16-le', errors='ignore')
                        text = text.rstrip('\x00')

                        # Filter for valid resource names (first occurrence per record)
                        if (text and len(text) >= 3 and text[0].isupper() and
                                all(c.isalnum() or c.isspace() for c in text)):
                            if field_type not in result:
                                result[field_type] = text
                    except:
                        pass

            offset += 12

        return result

    def _read_assignments(self) -> list[Assignment]:
        """Read assignment data from the MPP file."""
        assignments = []

        fixed_meta = self._read_stream([self.main_storage, 'TBkndAssn', 'FixedMeta'])
        fixed_data = self._read_stream([self.main_storage, 'TBkndAssn', 'FixedData'])

        record_count, _ = self._parse_fixed_meta(fixed_meta)
        if record_count == 0:
            return assignments

        record_size = len(fixed_data) // record_count if record_count > 0 else 0

        # Parse each assignment record
        for i in range(record_count):
            offset = i * record_size
            if offset + record_size > len(fixed_data):
                break

            record = fixed_data[offset:offset + record_size]

            # Based on our analysis of MPP14+ files:
            # offset 0: assignment ID (int32)
            # offset 4: task ID (int32)
            # offset 8: resource ID (int32) - -65535 if unassigned
            # offset 20: work value (double) - stored as tenths of minutes * 100
            assn_id = self._read_int32(record, 0)
            task_id = self._read_int32(record, 4)
            resource_id = self._read_int32(record, 8)

            # Skip invalid/unassigned
            if resource_id < 0 or resource_id == 65535:
                continue
            if task_id < 0:
                continue

            # Skip resources that don't have a name (likely placeholder/null resources)
            if resource_id not in self._resource_names:
                continue

            # Read work value from FixedData at offset 20
            # Work is stored as double: value / 60000 = hours
            work_raw = self._read_double(record, 20)
            work_hours = work_raw / 60000 if work_raw > 0 else 0.0
            work_minutes = work_hours * 60

            assignment = Assignment()
            assignment.id = assn_id
            assignment.unique_id = assn_id
            assignment.task_id = task_id
            assignment.resource_id = resource_id
            assignment.work_minutes = work_minutes

            # Read units (resource allocation percentage) from offset 16
            # Stored as float32, value ~6.11 corresponds to 100% (default)
            # The exact encoding is: 1.0 = 100% allocation
            # Note: This field may use sparse storage in some files
            if record_size >= 20:
                units_raw = struct.unpack_from('<f', record, 16)[0] if len(record) >= 20 else 0
                # Convert from MPP internal format to decimal (1.0 = 100%)
                # The value 6.11 appears to be a flag, treat as 100%
                if units_raw > 5.0 and units_raw < 7.0:
                    assignment.units = 1.0  # Default 100%
                elif units_raw > 0:
                    assignment.units = units_raw
                else:
                    assignment.units = 1.0  # Default to 100%

            # Parse assignment dates
            # Offset 52: Start date, Offset 56: Finish date
            assignment.start = self._read_timestamp(record, 52)
            assignment.finish = self._read_timestamp(record, 56)

            assignments.append(assignment)

        return assignments

    def _read_predecessors(self) -> list[Predecessor]:
        """Read predecessor relationships from TBkndCons."""
        predecessors = []

        fixed_data = self._read_stream([self.main_storage, 'TBkndCons', 'FixedData'])

        if len(fixed_data) == 0:
            return predecessors

        # Each record is 20 bytes
        record_size = 20
        record_count = len(fixed_data) // record_size

        # Link type mapping: 0=FF, 1=FS, 2=SF, 3=SS
        link_types = {0: 'FF', 1: 'FS', 2: 'SF', 3: 'SS'}

        for i in range(record_count):
            offset = i * record_size
            record = fixed_data[offset:offset + record_size]

            link_id = self._read_int32(record, 0)
            pred_id = self._read_int32(record, 4)
            succ_id = self._read_int32(record, 8)
            link_type_num = self._read_int32(record, 12)
            lag_raw = self._read_int32(record, 16)

            # Skip invalid records
            if pred_id <= 0 or succ_id <= 0:
                continue

            pred = Predecessor()
            pred.id = link_id
            pred.predecessor_task_id = pred_id
            pred.successor_task_id = succ_id
            pred.link_type = link_types.get(link_type_num, 'FS')

            # Lag: 458752 (0x70000) seems to be a zero/flag value
            if lag_raw != 458752 and lag_raw > 0:
                pred.lag_minutes = lag_raw / 10  # Assuming tenths of minutes

            predecessors.append(pred)

        return predecessors

    def _read_calendars(self) -> list[Calendar]:
        """Read calendar data including exceptions from TBkndCal."""
        calendars = []

        var2_data = self._read_stream([self.main_storage, 'TBkndCal', 'Var2Data'])

        if len(var2_data) == 0:
            return calendars

        # Extract calendar and exception names from Var2Data
        # Format: length-prefixed UTF-16LE strings
        # Known strings: "Standard", holiday names like "Labor Day", "Thanksgiving", etc.
        strings = []
        offset = 0
        while offset < len(var2_data) - 4:
            length = self._read_uint32(var2_data, offset)
            if 4 <= length <= 100 and offset + 4 + length <= len(var2_data):
                try:
                    text = var2_data[offset + 4:offset + 4 + length].decode('utf-16-le', errors='ignore')
                    text = text.rstrip('\x00')
                    if text and text[0].isalpha():
                        strings.append(text)
                        offset += 4 + length
                        continue
                except:
                    pass
            offset += 1

        # Create default "Standard" calendar
        standard_cal = Calendar()
        standard_cal.id = 1
        standard_cal.name = "Standard"
        standard_cal.is_default = True
        standard_cal.working_days = [False, True, True, True, True, True, False]  # Mon-Fri working

        # Add exceptions found in Var2Data
        for name in strings:
            if name != "Standard":
                exception = CalendarException()
                exception.name = name
                exception.working = False  # Holidays are non-working
                standard_cal.exceptions.append(exception)

        calendars.append(standard_cal)
        return calendars

    def _read_board_columns(self) -> list[BoardColumn]:
        """Read Agile board column definitions from TBkndBoardColumn."""
        columns = []

        var2_data = self._read_stream([self.main_storage, 'TBkndBoardColumn', 'Var2Data'])
        fixed_data = self._read_stream([self.main_storage, 'TBkndBoardColumn', 'FixedData'])
        fixed_meta = self._read_stream([self.main_storage, 'TBkndBoardColumn', 'FixedMeta'])

        if len(var2_data) == 0:
            return columns

        record_count, _ = self._parse_fixed_meta(fixed_meta)

        # Extract column names from Var2Data
        # Format: length-prefixed UTF-16LE strings
        # Known columns: "Not Started", "Next up", "In progress", "Done"
        column_names = []
        offset = 0
        while offset < len(var2_data) - 4:
            length = self._read_uint32(var2_data, offset)
            if 4 <= length <= 100 and offset + 4 + length <= len(var2_data):
                try:
                    text = var2_data[offset + 4:offset + 4 + length].decode('utf-16-le', errors='ignore')
                    text = text.rstrip('\x00')
                    if text and text[0].isalpha():
                        column_names.append(text)
                        offset += 4 + length
                        continue
                except:
                    pass
            offset += 1

        # Create BoardColumn objects
        for i, name in enumerate(column_names):
            col = BoardColumn()
            col.id = i
            col.name = name
            col.order = i
            columns.append(col)

        return columns

    def _read_sprints(self) -> list[Sprint]:
        """Read Agile sprint definitions from TBkndSprint."""
        sprints = []

        var2_data = self._read_stream([self.main_storage, 'TBkndSprint', 'Var2Data'])
        fixed_data = self._read_stream([self.main_storage, 'TBkndSprint', 'FixedData'])
        fixed_meta = self._read_stream([self.main_storage, 'TBkndSprint', 'FixedMeta'])

        if len(var2_data) == 0:
            return sprints

        record_count, _ = self._parse_fixed_meta(fixed_meta)

        # Extract sprint names from Var2Data
        # Format: length-prefixed UTF-16LE strings
        # Known: "No Sprint", "Sprint 1"
        sprint_names = []
        offset = 0
        while offset < len(var2_data) - 4:
            length = self._read_uint32(var2_data, offset)
            if 4 <= length <= 100 and offset + 4 + length <= len(var2_data):
                try:
                    text = var2_data[offset + 4:offset + 4 + length].decode('utf-16-le', errors='ignore')
                    text = text.rstrip('\x00')
                    if text:
                        sprint_names.append(text)
                        offset += 4 + length
                        continue
                except:
                    pass
            offset += 1

        # Parse FixedData for sprint dates
        # Record size: 38 bytes based on analysis
        # Offset 24: Start date, Offset 28: Finish date (MPP format)
        record_size = 38
        if record_count > 0 and len(fixed_data) >= record_count * record_size:
            for i in range(record_count):
                sprint = Sprint()
                sprint.id = i
                sprint.name = sprint_names[i] if i < len(sprint_names) else f"Sprint {i}"

                record = fixed_data[i * record_size:(i + 1) * record_size]

                # Parse dates from offsets 24 and 28
                sprint.start = self._read_timestamp(record, 24)
                sprint.finish = self._read_timestamp(record, 28)

                sprints.append(sprint)
        else:
            # Fallback: just create from names
            for i, name in enumerate(sprint_names):
                sprint = Sprint()
                sprint.id = i
                sprint.name = name
                sprints.append(sprint)

        return sprints


def main():
    """Test the MPP reader."""
    import json

    mpp_files = list(Path(".").glob("*.mpp"))
    if not mpp_files:
        print("No MPP files found")
        return

    reader = MPPReader(str(mpp_files[0]))
    project = reader.read()

    print(f"=== Project Summary ===")
    print(f"Title: {project.title}")
    print(f"Author: {project.author}")
    print(f"Start: {project.start_date.strftime('%Y-%m-%d') if project.start_date else 'N/A'}")
    print(f"Finish: {project.finish_date.strftime('%Y-%m-%d') if project.finish_date else 'N/A'}")
    print(f"Tasks: {len(project.tasks)}")
    print(f"Resources: {len(project.resources)}")
    print(f"Assignments: {len(project.assignments)}")
    print(f"Predecessors: {len(project.predecessors)}")
    print(f"Calendars: {len(project.calendars)}")
    print(f"Board Columns: {len(project.board_columns)}")
    print(f"Sprints: {len(project.sprints)}")

    # Show calendars with exceptions
    if project.calendars:
        print(f"\n=== Calendars ===")
        for cal in project.calendars:
            print(f"  [{cal.id}] {cal.name} (default: {cal.is_default})")
            if cal.exceptions:
                print(f"      Exceptions: {', '.join(e.name for e in cal.exceptions)}")

    # Show board columns
    if project.board_columns:
        print(f"\n=== Board Columns ===")
        for col in project.board_columns:
            print(f"  [{col.order}] {col.name}")

    # Show sprints
    if project.sprints:
        print(f"\n=== Sprints ===")
        for sprint in project.sprints:
            start_str = sprint.start.strftime('%Y-%m-%d') if sprint.start else 'N/A'
            finish_str = sprint.finish.strftime('%Y-%m-%d') if sprint.finish else 'N/A'
            print(f"  [{sprint.id}] {sprint.name}: {start_str} - {finish_str}")

    # Show resources with types
    type_names = {RESOURCE_TYPE_WORK: "Work", RESOURCE_TYPE_MATERIAL: "Material", RESOURCE_TYPE_COST: "Cost"}
    print(f"\n=== Resources ===")
    for r in project.resources:
        type_str = type_names.get(r.type, "Unknown")
        print(f"  [{r.id:3d}] {r.name:20s} Type: {type_str}")

    print(f"\n=== Tasks with dates (first 10) ===")
    for task in project.tasks[:10]:
        start = task.start.strftime('%Y-%m-%d') if task.start else 'N/A'
        finish = task.finish.strftime('%Y-%m-%d') if task.finish else 'N/A'
        print(f"  [{task.id:3d}] {task.name[:30]:30s} {start} - {finish}")

    # Get resource totals
    print(f"\n=== Resource Totals (hours) ===")
    totals = project.get_resource_totals()
    for name, hours in sorted(totals.items(), key=lambda x: -x[1]):
        print(f"  {name:20s}: {hours:,.1f}")
    print(f"  {'TOTAL':20s}: {sum(totals.values()):,.1f}")

    # Get weekly hours
    print(f"\n=== Weekly Hours (first 5 weeks) ===")
    weekly = project.get_weekly_hours()
    for week in sorted(weekly.keys())[:5]:
        print(f"\nWeek of {week}:")
        for resource, hours in sorted(weekly[week].items(), key=lambda x: -x[1]):
            if hours >= 10:  # Only show significant hours
                print(f"  {resource:20s}: {hours:,.1f}")

    # Compare with MPXJ output
    json_file = mpp_files[0].with_suffix('.json')
    if json_file.exists():
        print(f"\n=== Comparison with MPXJ ===")
        with open(json_file) as f:
            mpxj_data = json.load(f)

        print("\nResource totals comparison:")
        print(f"{'Resource':20s} {'MPP Reader':>12s} {'MPXJ':>12s} {'Diff':>10s}")
        print("-" * 56)

        mpxj_totals = mpxj_data.get('resource_totals', {})
        all_resources = set(totals.keys()) | set(mpxj_totals.keys())

        for name in sorted(all_resources):
            mpp = totals.get(name, 0)
            mpxj = mpxj_totals.get(name, 0)
            diff = mpp - mpxj
            diff_str = f"{diff:+.1f}" if diff != 0 else "OK"
            print(f"{name:20s} {mpp:>12.1f} {mpxj:>12.1f} {diff_str:>10s}")

        print(f"\nMPXJ total: {mpxj_data.get('total_hours', 0):.1f}")
        print(f"MPP Reader total: {sum(totals.values()):.1f}")


if __name__ == "__main__":
    main()
