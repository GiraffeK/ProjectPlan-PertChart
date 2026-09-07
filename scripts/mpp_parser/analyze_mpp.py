#!/usr/bin/env python3
"""
Analyze MPP file structure and compare with XML ground truth.
Used for binary format discovery and validation.
"""

import json
import olefile
import struct
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timedelta


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
    """Decode MPP date format."""
    if value == 0 or value == 0xFFFFFFFF:
        return None
    days = value / MPP_DATE_DIVISOR
    return MPP_DATE_EPOCH + timedelta(days=days)


def hex_dump(data, start=0, length=None, bytes_per_line=16):
    """Pretty hex dump of binary data."""
    if length is None:
        length = len(data) - start
    end = min(start + length, len(data))

    lines = []
    for i in range(start, end, bytes_per_line):
        chunk = data[i:min(i + bytes_per_line, end)]
        hex_part = ' '.join(f'{b:02x}' for b in chunk)
        ascii_part = ''.join(chr(b) if 32 <= b < 127 else '.' for b in chunk)
        lines.append(f'{i:04x}: {hex_part:<{bytes_per_line*3}} {ascii_part}')
    return '\n'.join(lines)


def extract_strings_from_var2data(var2_data):
    """Extract all strings from Var2Data."""
    strings = []
    offset = 0

    while offset < len(var2_data) - 4:
        length = read_uint32(var2_data, offset)

        # Valid UTF-16LE string: reasonable length, even
        if 4 <= length <= 500 and length % 2 == 0:
            str_start = offset + 4
            str_end = str_start + length

            if str_end <= len(var2_data):
                try:
                    text = var2_data[str_start:str_end].decode('utf-16-le', errors='ignore')
                    text = text.rstrip('\x00').strip()

                    if text and len(text) >= 2:
                        # Filter for printable text
                        printable = sum(1 for c in text if c.isprintable() or c.isspace())
                        if printable >= len(text) * 0.8:
                            strings.append((offset, text))
                            offset = str_end
                            continue
                except:
                    pass

        offset += 1

    return strings


def parse_xml_tasks(xml_path):
    """Parse task names and IDs from XML for comparison."""
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
            uid = task_elem.find(f'{ns}UID')
            name = task_elem.find(f'{ns}Name')
            outline = task_elem.find(f'{ns}OutlineLevel')
            start = task_elem.find(f'{ns}Start')

            if uid is not None and name is not None:
                tasks.append({
                    'uid': int(uid.text) if uid.text else 0,
                    'name': name.text or '',
                    'outline_level': int(outline.text) if outline is not None and outline.text else 0,
                    'start': start.text if start is not None else None,
                })

    return tasks


def analyze_task_fixed_data(ole, main_storage):
    """Analyze task FixedData structure."""
    fixed_meta = ole.openstream([main_storage, 'TBkndTask', 'FixedMeta']).read()
    fixed_data = ole.openstream([main_storage, 'TBkndTask', 'FixedData']).read()
    var2_data = ole.openstream([main_storage, 'TBkndTask', 'Var2Data']).read()

    # Parse FixedMeta
    magic = read_uint32(fixed_meta, 0)
    record_count = read_uint32(fixed_meta, 8)

    print(f"\n{'='*60}")
    print("TASK FIXED DATA ANALYSIS")
    print(f"{'='*60}")
    print(f"Magic: 0x{magic:08x} (expected 0xfadfadba)")
    print(f"Record count: {record_count}")
    print(f"FixedData size: {len(fixed_data)} bytes")

    if record_count > 0:
        record_size = len(fixed_data) // record_count
        print(f"Calculated record size: {record_size} bytes")

    # Extract task names from Var2Data
    strings = extract_strings_from_var2data(var2_data)
    print(f"\nStrings found in Var2Data: {len(strings)}")
    for offset, text in strings[:20]:
        print(f"  @{offset}: {text}")

    # Dump first few records
    if record_count > 0:
        record_size = len(fixed_data) // record_count
        print(f"\n--- First 3 Task Records (size={record_size}) ---")

        for i in range(min(3, record_count)):
            offset = i * record_size
            record = fixed_data[offset:offset + record_size]

            print(f"\nRecord {i}:")
            print(hex_dump(record, 0, min(record_size, 64)))

            # Try known offsets
            print(f"\n  Possible fields:")

            # Try various offsets for Task ID
            for test_offset in [0, 4, 8, 48, 52]:
                if test_offset + 4 <= record_size:
                    val = read_int32(record, test_offset)
                    print(f"    offset {test_offset:3d}: int32={val}")

            # Look for date-like values
            print(f"  Searching for date-like values...")
            for test_offset in range(0, min(record_size - 4, 160), 4):
                val = read_uint32(record, test_offset)
                # Valid date range check
                if 30000 < val // 65536 < 50000:
                    dt = decode_date(val)
                    if dt and 2020 < dt.year < 2030:
                        print(f"    offset {test_offset:3d}: date={dt.strftime('%Y-%m-%d')}")

    return record_count, fixed_data, var2_data


def analyze_resource_data(ole, main_storage):
    """Analyze resource FixedData structure."""
    try:
        fixed_meta = ole.openstream([main_storage, 'TBkndRsc', 'FixedMeta']).read()
        fixed_data = ole.openstream([main_storage, 'TBkndRsc', 'FixedData']).read()
        var2_data = ole.openstream([main_storage, 'TBkndRsc', 'Var2Data']).read()
    except:
        return 0, b'', b''

    magic = read_uint32(fixed_meta, 0)
    record_count = read_uint32(fixed_meta, 8)

    print(f"\n{'='*60}")
    print("RESOURCE DATA ANALYSIS")
    print(f"{'='*60}")
    print(f"Record count: {record_count}")
    print(f"FixedData size: {len(fixed_data)} bytes")

    if record_count > 0:
        record_size = len(fixed_data) // record_count
        print(f"Calculated record size: {record_size} bytes")

    strings = extract_strings_from_var2data(var2_data)
    print(f"\nResource strings found: {len(strings)}")
    for offset, text in strings[:10]:
        print(f"  @{offset}: {text}")

    return record_count, fixed_data, var2_data


def main():
    if len(sys.argv) < 2:
        print("Usage: analyze_mpp.py <mpp_file> [xml_file]")
        sys.exit(1)

    mpp_path = Path(sys.argv[1])
    xml_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None

    # If XML exists alongside MPP, use it for comparison
    if xml_path is None:
        potential_xml = mpp_path.with_suffix('.xml')
        if potential_xml.exists():
            xml_path = potential_xml

    print(f"Analyzing: {mpp_path}")

    # Parse XML ground truth if available
    if xml_path and xml_path.exists():
        print(f"Ground truth: {xml_path}")
        xml_tasks = parse_xml_tasks(xml_path)
        print(f"\nXML Tasks ({len(xml_tasks)}):")
        for t in xml_tasks[:10]:
            print(f"  UID {t['uid']:2d}: Level {t['outline_level']} - {t['name']}")

    # Analyze MPP
    with olefile.OleFileIO(str(mpp_path)) as ole:
        # Find main storage
        main_storage = None
        for entry in ole.listdir():
            stripped = entry[0].strip()
            if stripped.isdigit() and int(stripped) < 200:
                main_storage = entry[0]
                print(f"\nMain storage: '{main_storage}' (version indicator: {stripped})")
                break

        if not main_storage:
            print("ERROR: Could not find main storage")
            return

        # Analyze tasks
        analyze_task_fixed_data(ole, main_storage)

        # Analyze resources
        analyze_resource_data(ole, main_storage)


if __name__ == '__main__':
    main()
