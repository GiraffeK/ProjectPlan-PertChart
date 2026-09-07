#!/usr/bin/env python3
"""
Discover task field offsets by comparing MPP binary data with XML ground truth.
"""

import olefile
import struct
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path


MPP_DATE_EPOCH = datetime(1983, 12, 31)
MPP_DATE_DIVISOR = 65536


def read_uint32(data, offset):
    if offset + 4 > len(data):
        return 0
    return struct.unpack_from('<I', data, offset)[0]


def read_int32(data, offset):
    if offset + 4 > len(data):
        return 0
    return struct.unpack_from('<i', data, offset)[0]


def read_int16(data, offset):
    if offset + 2 > len(data):
        return 0
    return struct.unpack_from('<h', data, offset)[0]


def read_uint16(data, offset):
    if offset + 2 > len(data):
        return 0
    return struct.unpack_from('<H', data, offset)[0]


def read_double(data, offset):
    if offset + 8 > len(data):
        return 0.0
    return struct.unpack_from('<d', data, offset)[0]


def decode_date(value):
    if value == 0 or value == 0xFFFFFFFF:
        return None
    days = value / MPP_DATE_DIVISOR
    return MPP_DATE_EPOCH + timedelta(days=days)


def parse_xml_tasks(xml_path):
    """Parse tasks from XML."""
    tree = ET.parse(xml_path)
    root = tree.getroot()

    ns = ''
    if root.tag.startswith('{'):
        ns = root.tag[1:root.tag.index('}')]
        ns = '{' + ns + '}'

    tasks = []
    tasks_elem = root.find(f'{ns}Tasks')
    if tasks_elem is not None:
        for task_elem in tasks_elem.findall(f'{ns}Task'):
            uid = int(task_elem.findtext(f'{ns}UID', '0'))
            if uid == 0:
                continue

            task = {
                'uid': uid,
                'id': int(task_elem.findtext(f'{ns}ID', '0')),
                'name': task_elem.findtext(f'{ns}Name', ''),
                'outline_level': int(task_elem.findtext(f'{ns}OutlineLevel', '0')),
                'priority': int(task_elem.findtext(f'{ns}Priority', '500')),
                'summary': task_elem.findtext(f'{ns}Summary', '0') == '1',
            }

            # Parse dates
            start_str = task_elem.findtext(f'{ns}Start', '')
            if start_str:
                try:
                    task['start'] = datetime.fromisoformat(start_str.replace('Z', ''))
                except:
                    task['start'] = None
            else:
                task['start'] = None

            finish_str = task_elem.findtext(f'{ns}Finish', '')
            if finish_str:
                try:
                    task['finish'] = datetime.fromisoformat(finish_str.replace('Z', ''))
                except:
                    task['finish'] = None
            else:
                task['finish'] = None

            # Parse duration (PT8H0M0S format)
            dur_str = task_elem.findtext(f'{ns}Duration', '')
            task['duration_minutes'] = 0.0
            if dur_str and dur_str.startswith('PT'):
                dur_str = dur_str[2:]
                hours = minutes = seconds = 0
                if 'H' in dur_str:
                    h, dur_str = dur_str.split('H')
                    hours = int(h)
                if 'M' in dur_str:
                    m, dur_str = dur_str.split('M')
                    minutes = int(m)
                if 'S' in dur_str:
                    s = dur_str.replace('S', '')
                    seconds = int(s)
                task['duration_minutes'] = hours * 60 + minutes + seconds / 60

            tasks.append(task)

    return tasks


def discover_offsets(mpp_path, xml_path):
    """Find field offsets by searching for known values."""

    xml_tasks = parse_xml_tasks(xml_path)
    print(f"Loaded {len(xml_tasks)} tasks from XML")

    with olefile.OleFileIO(str(mpp_path)) as ole:
        # Find main storage
        main_storage = None
        for entry in ole.listdir():
            stripped = entry[0].strip()
            if stripped.isdigit() and int(stripped) < 200:
                main_storage = entry[0]
                break

        fixed_meta = ole.openstream([main_storage, 'TBkndTask', 'FixedMeta']).read()
        fixed_data = ole.openstream([main_storage, 'TBkndTask', 'FixedData']).read()

        magic = read_uint32(fixed_meta, 0)
        record_count = read_uint32(fixed_meta, 8)
        record_size = len(fixed_data) // record_count if record_count > 0 else 0

        print(f"MPP: {record_count} records, {record_size} bytes each")
        print(f"Total fixed data: {len(fixed_data)} bytes")
        print("=" * 80)

        # For each XML task, search for its values in the binary
        for xml_task in xml_tasks[:10]:
            print(f"\n--- Task: {xml_task['name']} (UID={xml_task['uid']}, ID={xml_task['id']}) ---")
            print(f"    XML: outline={xml_task['outline_level']}, priority={xml_task['priority']}, "
                  f"summary={xml_task['summary']}")
            if xml_task['start']:
                print(f"    Start: {xml_task['start']}")
            if xml_task['duration_minutes']:
                print(f"    Duration: {xml_task['duration_minutes']} minutes")

            # Calculate expected MPP values
            uid = xml_task['uid']
            task_id = xml_task['id']
            outline = xml_task['outline_level']
            priority = xml_task['priority']

            # Search all records for this task
            for rec_idx in range(record_count):
                rec_offset = rec_idx * record_size
                record = fixed_data[rec_offset:rec_offset + record_size]

                # Search for UID match
                found_uid = False
                for offset in range(0, record_size - 4, 4):
                    val = read_uint32(record, offset)
                    if val == uid:
                        print(f"    Record {rec_idx}: UID={uid} found at offset {offset}")
                        found_uid = True

                        # Now search this record for other known values
                        print(f"    Searching record {rec_idx} for other values...")

                        # Look for ID
                        for off in range(0, record_size - 4, 4):
                            if read_uint32(record, off) == task_id and off != offset:
                                print(f"      ID={task_id} at offset {off}")

                        # Look for outline level (int16)
                        for off in range(0, record_size - 2, 2):
                            if read_int16(record, off) == outline:
                                print(f"      Outline={outline} at offset {off}")

                        # Look for priority (int16)
                        for off in range(0, record_size - 2, 2):
                            if read_int16(record, off) == priority:
                                print(f"      Priority={priority} at offset {off}")

                        # Look for dates
                        if xml_task['start']:
                            expected_days = (xml_task['start'] - MPP_DATE_EPOCH).days
                            expected_val = int(expected_days * MPP_DATE_DIVISOR)
                            # Allow time-of-day variation
                            for off in range(0, record_size - 4, 4):
                                val = read_uint32(record, off)
                                if abs(val - expected_val) < 65536:
                                    decoded = decode_date(val)
                                    if decoded:
                                        print(f"      Start date at offset {off}: {decoded}")

                        # Look for duration (tenths of minutes)
                        if xml_task['duration_minutes'] > 0:
                            expected_dur = int(xml_task['duration_minutes'] * 10)
                            for off in range(0, record_size - 4, 4):
                                val = read_uint32(record, off)
                                if val == expected_dur:
                                    print(f"      Duration={expected_dur} (tenths) at offset {off}")

                        break  # Found the record with matching UID

                if found_uid:
                    break


def main():
    if len(sys.argv) < 3:
        print("Usage: discover_offsets.py <mpp_file> <xml_file>")
        print("\nCompares MPP binary data with XML to discover field offsets.")
        sys.exit(1)

    mpp_path = Path(sys.argv[1])
    xml_path = Path(sys.argv[2])

    discover_offsets(mpp_path, xml_path)


if __name__ == '__main__':
    main()
