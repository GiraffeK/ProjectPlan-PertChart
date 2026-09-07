"""
MSP Export - Pure Python Microsoft Project file parser.

Parse MPP binary and XML files without requiring Java.
"""

from .mpp_reader import (
    MPPReader,
    ProjectData,
    Task,
    Resource,
    Assignment,
    Predecessor,
    Calendar,
    CalendarException,
    BoardColumn,
    Sprint,
    RESOURCE_TYPE_WORK,
    RESOURCE_TYPE_MATERIAL,
    RESOURCE_TYPE_COST,
)

__version__ = '0.1.0'
__all__ = [
    'MPPReader',
    'ProjectData',
    'Task',
    'Resource',
    'Assignment',
    'Predecessor',
    'Calendar',
    'CalendarException',
    'BoardColumn',
    'Sprint',
    'RESOURCE_TYPE_WORK',
    'RESOURCE_TYPE_MATERIAL',
    'RESOURCE_TYPE_COST',
]
