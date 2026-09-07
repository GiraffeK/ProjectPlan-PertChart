#!/usr/bin/env python3
"""
Identify all streams and potential entities in the MPP file
that haven't been fully decoded yet.
"""

import olefile
import struct
from pathlib import Path

def read_stream(ole, path):
    try:
        return ole.openstream(path).read()
    except:
        return b''

def read_uint32(data, offset):
    if offset + 4 > len(data):
        return 0
    return struct.unpack_from('<I', data, offset)[0]

def main():
    import sys
    if len(sys.argv) < 2:
        print("Usage: identify_remaining.py <mpp_file>")
        sys.exit(1)
    mpp_path = Path(sys.argv[1])

    with olefile.OleFileIO(str(mpp_path)) as ole:
        main_storage = None
        for entry in ole.listdir():
            stripped = entry[0].strip()
            if stripped.isdigit() and int(stripped) < 200:
                main_storage = entry[0]
                break

        print("=" * 60)
        print("MPP FILE ENTITY ANALYSIS")
        print("=" * 60)

        # Group streams by entity type
        entities = {}
        for entry in ole.listdir():
            if len(entry) >= 2 and entry[0] == main_storage:
                entity_name = entry[1] if len(entry) >= 2 else "root"
                if entity_name not in entities:
                    entities[entity_name] = []
                entities[entity_name].append(entry)

        # Analyze each entity
        for entity_name in sorted(entities.keys()):
            streams = entities[entity_name]
            print(f"\n{'='*60}")
            print(f"ENTITY: {entity_name}")
            print("=" * 60)

            total_size = 0
            for entry in streams:
                try:
                    data = ole.openstream(entry).read()
                    total_size += len(data)
                    stream_name = entry[-1]
                    print(f"  {stream_name}: {len(data)} bytes")
                except:
                    pass

            # Check FixedMeta for record count
            fixed_meta_path = [main_storage, entity_name, 'FixedMeta']
            fixed_meta = read_stream(ole, fixed_meta_path)
            if fixed_meta and len(fixed_meta) >= 12:
                magic = read_uint32(fixed_meta, 0)
                if magic == 0xfadfadba:
                    record_count = read_uint32(fixed_meta, 8)
                    print(f"  -> Record count: {record_count}")

            print(f"  -> Total size: {total_size} bytes")

        # Also check root-level streams
        print(f"\n{'='*60}")
        print("ROOT LEVEL STREAMS")
        print("=" * 60)
        for entry in ole.listdir():
            if len(entry) == 2 and entry[0] == main_storage:
                if entry[1] not in entities:
                    try:
                        data = ole.openstream(entry).read()
                        print(f"  {entry[1]}: {len(data)} bytes")
                    except:
                        pass

        # Check what's in the main Props stream (contains table list)
        props = read_stream(ole, [main_storage, 'Props'])
        if props:
            print(f"\n{'='*60}")
            print("TABLES DEFINED IN PROPS")
            print("=" * 60)
            # Look for UTF-16LE table names
            try:
                # Find the table list section
                # Format: UTF-16LE strings separated by commas
                text_start = props.find(b'T\x00B\x00k\x00n\x00d\x00')
                if text_start >= 0:
                    # Read until we hit non-text
                    text_end = text_start
                    while text_end < len(props) - 1:
                        if props[text_end] == 0 and props[text_end + 1] == 0:
                            # Check if it's end of string or double null
                            if text_end + 2 < len(props) and props[text_end + 2] == 0:
                                break
                        text_end += 2

                    table_text = props[text_start:text_end].decode('utf-16-le', errors='ignore')
                    tables = table_text.split(',')
                    for table in tables:
                        table = table.strip()
                        if table:
                            print(f"  {table}")
            except:
                pass

if __name__ == '__main__':
    main()
