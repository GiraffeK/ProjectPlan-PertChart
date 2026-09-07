#!/usr/bin/env python3
"""
Compare task FixedData records with XML ground truth to discover field offsets.
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
            uid_elem = task_elem.find(f'{ns}UID')
            name_elem = task_elem.find(f'{ns}Name')
            outline_elem = task_elem.find(f'{ns}OutlineLevel')
            start_elem = task_elem.find(f'{ns}Start')
            finish_elem = task_elem.find(f'{ns}Finish')
            summary_elem = task_elem.find(f'{ns}Summary')
            priority_elem = task_elem.find(f'{ns}Priority')
            duration_elem = task_elem.find(f'{ns}Duration')

            uid = int(uid_elem.text) if uid_elem is not None and uid_elem.text else 0
            name = name_elem.text if name_elem is not None else ''
            outline = int(outline_elem.text) if outline_elem is not None and outline_elem.text else 0
            summary = summary_elem.text == '1' if summary_elem is not None else False
            priority = int(priority_elem.text) if priority_elem is not None and priority_elem.text else 500

            start = None
            if start_elem is not None and start_elem.text:
                try:
                    start = datetime.fromisoformat(start_elem.text.replace('Z', ''))
                except:
                    pass

            finish = None
            if finish_elem is not None and finish_elem.text:
                try:
                    finish = datetime.fromisoformat(finish_elem.text.replace('Z', ''))
                except:
                    pass

            tasks.append({
                'uid': uid,
                'name': name,
                'outline_level': outline,
                'start': start,
                'finish': finish,
                'summary': summary,
                'priority': priority,
            })

    return tasks


def hex_row(data, offset, length=16):
    """Return hex representation of a row."""
    chunk = data[offset:offset+length]
    return ' '.join(f'{b:02x}' for b in chunk)


def main():
    if len(sys.argv) < 3:
        print("Usage: compare_records.py <mpp_file> <xml_file>")
        sys.exit(1)

    mpp_path = Path(sys.argv[1])
    xml_path = Path(sys.argv[2])

    # Parse XML ground truth
    xml_tasks = parse_xml_tasks(xml_path)
    print(f"XML Tasks: {len(xml_tasks)}")

    # Filter to non-zero UID tasks
    xml_tasks = [t for t in xml_tasks if t['uid'] > 0]
    print(f"Non-zero UID tasks: {len(xml_tasks)}")

    for t in xml_tasks[:5]:
        print(f"  UID {t['uid']:2d}: {t['name']:20s} Level={t['outline_level']} Start={t['start']}")

    # Read MPP
    with olefile.OleFileIO(str(mpp_path)) as ole:
        main_storage = None
        for entry in ole.listdir():
            stripped = entry[0].strip()
            if stripped.isdigit() and int(stripped) < 200:
                main_storage = entry[0]
                break

        fixed_meta = ole.openstream([main_storage, 'TBkndTask', 'FixedMeta']).read()
        fixed_data = ole.openstream([main_storage, 'TBkndTask', 'FixedData']).read()

        record_count = read_uint32(fixed_meta, 8)
        record_size = len(fixed_data) // record_count if record_count > 0 else 0

        print(f"\nMPP Records: {record_count}, Size: {record_size} bytes each")

        # For each XML task, try to find corresponding MPP record
        # by searching for date values
        print("\n" + "="*80)
        print("SEARCHING FOR DATE PATTERNS")
        print("="*80)

        for xml_task in xml_tasks[:5]:
            if not xml_task['start']:
                continue

            # Calculate expected MPP date value
            days_since_epoch = (xml_task['start'] - MPP_DATE_EPOCH).days
            expected_date_value = int(days_since_epoch * MPP_DATE_DIVISOR)

            print(f"\nTask: {xml_task['name']}")
            print(f"  XML Start: {xml_task['start']}")
            print(f"  Expected date value: {expected_date_value} (0x{expected_date_value:08x})")

            # Search all records for this value
            for rec_idx in range(record_count):
                rec_offset = rec_idx * record_size
                record = fixed_data[rec_offset:rec_offset + record_size]

                for offset in range(0, record_size - 4, 4):
                    value = read_uint32(record, offset)
                    # Allow some tolerance for time component
                    if abs(value - expected_date_value) < 65536:  # Within a day
                        decoded = decode_date(value)
                        if decoded:
                            print(f"    Found at record {rec_idx}, offset {offset}: {decoded}")

        # Show first few records with byte analysis
        print("\n" + "="*80)
        print("RECORD ANALYSIS (first 3 non-null records)")
        print("="*80)

        shown = 0
        for rec_idx in range(record_count):
            if shown >= 3:
                break

            rec_offset = rec_idx * record_size
            record = fixed_data[rec_offset:rec_offset + record_size]

            # Skip null records
            first_int = read_int32(record, 0)
            if first_int == -65536 or first_int == 0:
                if rec_idx < 3:
                    print(f"\nRecord {rec_idx}: [HEADER/NULL]")
                continue

            shown += 1
            print(f"\nRecord {rec_idx}:")
            for row in range(0, min(record_size, 128), 16):
                print(f"  {row:3d}: {hex_row(record, row)}")

            # Try to interpret fields
            print(f"\n  Interpretation attempts:")

            # Look for int16 values that could be outline level (0-10 range)
            for off in range(0, min(64, record_size - 2), 2):
                val = read_int16(record, off)
                if 0 <= val <= 10:
                    print(f"    offset {off:3d} int16={val:5d}  (could be outline level)")

            # Look for dates
            for off in range(0, min(record_size - 4, 160), 4):
                val = read_uint32(record, off)
                dt = decode_date(val)
                if dt and 2020 < dt.year < 2030:
                    print(f"    offset {off:3d} date={dt.strftime('%Y-%m-%d')}")


if __name__ == '__main__':
    main()
