#!/usr/bin/env python3
"""
Detect MPP file version and format characteristics.

MPP files use OLE2 compound document format. The version can be determined by:
1. Main storage name (e.g., "   114" = MPP14 = Project 2010+)
2. File metadata
3. Props stream content
4. Record sizes and structure
"""

import olefile
import struct
import sys
from pathlib import Path


def read_uint32(data, offset):
    if offset + 4 > len(data):
        return 0
    return struct.unpack_from('<I', data, offset)[0]


def read_uint16(data, offset):
    if offset + 2 > len(data):
        return 0
    return struct.unpack_from('<H', data, offset)[0]


def analyze_version(mpp_path):
    """Analyze MPP file to determine version and characteristics."""

    print(f"Analyzing: {mpp_path}")
    print("=" * 60)

    if not olefile.isOleFile(str(mpp_path)):
        print("ERROR: Not a valid OLE file")
        return

    with olefile.OleFileIO(str(mpp_path)) as ole:
        # 1. Check OLE metadata
        print("\n1. OLE METADATA")
        print("-" * 40)
        meta = ole.get_metadata()
        if meta:
            print(f"  Title: {meta.title}")
            print(f"  Author: {meta.author}")
            print(f"  Creating App: {meta.creating_application}")
            print(f"  Last Saved By: {meta.last_saved_by}")
            print(f"  Revision: {meta.revision_number}")
            print(f"  Created: {meta.create_time}")
            print(f"  Modified: {meta.last_saved_time}")

        # 2. Find main storage and determine version
        print("\n2. MAIN STORAGE (VERSION INDICATOR)")
        print("-" * 40)

        storages = {}
        for entry in ole.listdir():
            if len(entry) >= 1:
                name = entry[0]
                stripped = name.strip()
                if stripped.isdigit() and name not in storages:
                    storages[name] = int(stripped)

        storages = list(storages.items())

        # Version mapping based on MPXJ source code
        version_map = {
            8: ("MPP8", "Project 98"),
            9: ("MPP9", "Project 2000/2002"),
            11: ("MPP11", "Project 2003"),
            12: ("MPP12", "Project 2007"),
            14: ("MPP14", "Project 2010"),
            114: ("MPP14", "Project 2010+"),  # Extended format
        }

        main_storage = None
        detected_version = None

        for name, num in storages:
            print(f"  Found storage: '{name}' (number: {num})")
            if num in version_map:
                print(f"    -> Version: {version_map[num][0]} ({version_map[num][1]})")
                # Use first valid version storage (primary data storage)
                if main_storage is None:
                    main_storage = name
                    detected_version = version_map[num]
            elif num > 100:
                # Extended format - base version is num % 100 or num - 100
                base = num % 100 if num % 100 in version_map else 14
                print(f"    -> Extended format, base version: MPP{base}")
                # Use first valid version storage (primary data storage)
                if main_storage is None:
                    main_storage = name
                    detected_version = (f"MPP{base}+", f"Project 2010+ (extended)")

        if not main_storage:
            print("  WARNING: Could not identify main storage")
            return

        # 3. Analyze Props stream for additional info
        print("\n3. PROPS STREAM ANALYSIS")
        print("-" * 40)

        try:
            props = ole.openstream([main_storage, 'Props']).read()
            print(f"  Props size: {len(props)} bytes")

            # Look for version indicators in Props
            # The Props stream contains various project settings

            # Try to find application name string
            if b'Microsoft Project' in props:
                # Find the full string
                idx = props.find(b'Microsoft Project')
                # Read surrounding context
                start = max(0, idx - 20)
                end = min(len(props), idx + 50)
                context = props[start:end]
                print(f"  Found 'Microsoft Project' at offset {idx}")

        except Exception as e:
            print(f"  Could not read Props: {e}")

        # 4. Analyze record sizes
        print("\n4. RECORD SIZE ANALYSIS")
        print("-" * 40)

        entities = ['TBkndTask', 'TBkndRsc', 'TBkndAssn', 'TBkndCons']

        for entity in entities:
            try:
                fixed_meta = ole.openstream([main_storage, entity, 'FixedMeta']).read()
                fixed_data = ole.openstream([main_storage, entity, 'FixedData']).read()

                if len(fixed_meta) >= 12:
                    magic = read_uint32(fixed_meta, 0)
                    record_count = read_uint32(fixed_meta, 8)

                    if magic == 0xfadfadba and record_count > 0:
                        record_size = len(fixed_data) // record_count
                        print(f"  {entity}:")
                        print(f"    Records: {record_count}")
                        print(f"    Record size: {record_size} bytes")
                        print(f"    Total data: {len(fixed_data)} bytes")
            except:
                pass

        # 5. Check for specific version features
        print("\n5. VERSION-SPECIFIC FEATURES")
        print("-" * 40)

        # Check for Agile features (Project 2019+)
        try:
            board_data = ole.openstream([main_storage, 'TBkndBoardColumn', 'FixedMeta']).read()
            if len(board_data) >= 12:
                record_count = read_uint32(board_data, 8)
                if record_count > 0:
                    print(f"  Agile Board Columns: {record_count} (Project 2019+ feature)")
        except:
            print("  Agile Board Columns: Not present")

        try:
            sprint_data = ole.openstream([main_storage, 'TBkndSprint', 'FixedMeta']).read()
            if len(sprint_data) >= 12:
                record_count = read_uint32(sprint_data, 8)
                if record_count > 0:
                    print(f"  Sprints: {record_count} (Project 2019+ feature)")
        except:
            print("  Sprints: Not present")

        # Check for Labels (newer feature)
        try:
            label_data = ole.openstream([main_storage, 'TBkndLabel', 'FixedMeta']).read()
            print(f"  Labels stream: Present (newer format)")
        except:
            print("  Labels stream: Not present")

        # 6. Summary
        print("\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)
        if detected_version:
            print(f"  Detected Version: {detected_version[0]}")
            print(f"  MS Project Version: {detected_version[1]}")

        # Get task record size for format detection
        try:
            fixed_meta = ole.openstream([main_storage, 'TBkndTask', 'FixedMeta']).read()
            fixed_data = ole.openstream([main_storage, 'TBkndTask', 'FixedData']).read()
            record_count = read_uint32(fixed_meta, 8)
            if record_count > 0:
                record_size = len(fixed_data) // record_count
                print(f"  Task Record Size: {record_size} bytes")

                # Known record sizes (varies by file, possibly based on enabled features)
                known_sizes = {
                    172: "Compact format (minimal fields)",
                    193: "Medium format (some UDFs)",
                    202: "Standard format (full fields)",
                }
                if record_size in known_sizes:
                    print(f"    -> {known_sizes[record_size]}")
                else:
                    print(f"    -> Unknown format (record size may indicate different field layout)")
        except:
            pass


def main():
    if len(sys.argv) < 2:
        print("Usage: detect_version.py <mpp_file> [mpp_file2] ...")
        print("\nDetects MPP file version and format characteristics.")
        sys.exit(1)

    for path in sys.argv[1:]:
        analyze_version(Path(path))
        print("\n")


if __name__ == '__main__':
    main()
