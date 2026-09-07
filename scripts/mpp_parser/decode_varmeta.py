#!/usr/bin/env python3
"""
Decode VarMeta structure to understand field-to-record mappings.
"""

import olefile
import struct
import sys
from pathlib import Path


def read_uint32(data, offset):
    if offset + 4 > len(data):
        return 0
    return struct.unpack_from('<I', data, offset)[0]


def read_string_at(var2_data, offset):
    """Read length-prefixed UTF-16LE string at offset."""
    if offset >= len(var2_data) - 4:
        return None

    length = read_uint32(var2_data, offset)
    if length == 0 or length > 500 or length % 2 != 0:
        return None

    str_start = offset + 4
    str_end = str_start + length
    if str_end > len(var2_data):
        return None

    try:
        text = var2_data[str_start:str_end].decode('utf-16-le', errors='ignore')
        return text.rstrip('\x00')
    except:
        return None


def analyze_varmeta(ole, main_storage, entity_name):
    """Analyze VarMeta structure for an entity."""
    try:
        var_meta = ole.openstream([main_storage, entity_name, 'VarMeta']).read()
        var2_data = ole.openstream([main_storage, entity_name, 'Var2Data']).read()
    except:
        print(f"  Could not read {entity_name} VarMeta")
        return

    print(f"\n{'='*60}")
    print(f"VARMETA ANALYSIS: {entity_name}")
    print(f"{'='*60}")
    print(f"VarMeta size: {len(var_meta)} bytes")
    print(f"Var2Data size: {len(var2_data)} bytes")

    if len(var_meta) < 24:
        print("  VarMeta too small")
        return

    # Parse header
    magic = read_uint32(var_meta, 0)
    unknown1 = read_uint32(var_meta, 4)
    item_count = read_uint32(var_meta, 8)
    unknown2 = read_uint32(var_meta, 12)
    unknown3 = read_uint32(var_meta, 16)
    unknown4 = read_uint32(var_meta, 20)

    print(f"\nHeader:")
    print(f"  Magic: 0x{magic:08x} (expected 0xfadfadba)")
    print(f"  Unknown1: {unknown1}")
    print(f"  Item count: {item_count}")
    print(f"  Unknown2-4: {unknown2}, {unknown3}, {unknown4}")

    if magic != 0xfadfadba:
        print("  Invalid magic!")
        return

    # Parse entries (12 bytes each after 24-byte header)
    # Let's try different interpretations
    print(f"\nRaw bytes of first entries:")
    for i in range(min(10, item_count)):
        offset = 24 + i * 12
        if offset + 12 <= len(var_meta):
            raw = var_meta[offset:offset+12]
            # Try different interpretations
            a = read_uint32(var_meta, offset)      # Bytes 0-3
            b = read_uint32(var_meta, offset + 4)  # Bytes 4-7
            c = read_uint32(var_meta, offset + 8)  # Bytes 8-11

            # Try reading as different sizes
            a16_lo = struct.unpack_from('<H', var_meta, offset)[0]
            a16_hi = struct.unpack_from('<H', var_meta, offset + 2)[0]
            b16_lo = struct.unpack_from('<H', var_meta, offset + 4)[0]
            b16_hi = struct.unpack_from('<H', var_meta, offset + 6)[0]

            print(f"  {i:2d}: [{raw.hex()}]  u32: {a:10d} {b:10d} {c:10d}  u16: {a16_lo:5d} {a16_hi:5d} {b16_lo:5d} {b16_hi:5d}")

    print(f"\n\nTrying: field_type=bytes[0-1], record_idx=bytes[4-7], offset=bytes[2-3]")
    print(f"{'Idx':>4} {'FieldType':>10} {'RecordIdx':>10} {'DataOffset':>12} String")
    print("-" * 80)

    entries_by_record = {}

    for i in range(item_count):
        base = 24 + i * 12
        if base + 12 > len(var_meta):
            break

        # Try interpretation: low 16 bits = field type, next 16 bits = offset into var2data
        field_type = struct.unpack_from('<H', var_meta, base)[0]
        data_offset = struct.unpack_from('<H', var_meta, base + 2)[0]
        record_idx = read_uint32(var_meta, base + 4)
        flags = read_uint32(var_meta, base + 8)

        # Read string at data_offset
        string_val = read_string_at(var2_data, data_offset)
        string_display = string_val[:40] if string_val else "(none)"

        # Show first 50 entries regardless
        if i < 50:
            print(f"{i:4d} 0x{field_type:04x}     {record_idx:10d} {data_offset:12d}    {string_display}")

            if record_id not in entries_by_record:
                entries_by_record[record_id] = []
            entries_by_record[record_id].append({
                'field_type': field_type,
                'offset': data_offset,
                'string': string_val
            })

        offset += 12

    # Group by record_id to see pattern
    print(f"\n\nGrouped by Record ID:")
    for record_id in sorted(entries_by_record.keys())[:15]:
        entries = entries_by_record[record_id]
        print(f"\n  Record {record_id}:")
        for e in entries:
            if e['string'] and len(e['string']) >= 2:
                print(f"    Field 0x{e['field_type']:04x}: {e['string'][:50]}")


def main():
    if len(sys.argv) < 2:
        print("Usage: decode_varmeta.py <mpp_file>")
        sys.exit(1)

    mpp_path = Path(sys.argv[1])

    with olefile.OleFileIO(str(mpp_path)) as ole:
        # Find main storage
        main_storage = None
        for entry in ole.listdir():
            stripped = entry[0].strip()
            if stripped.isdigit() and int(stripped) < 200:
                main_storage = entry[0]
                break

        if not main_storage:
            print("Could not find main storage")
            return

        print(f"Main storage: '{main_storage}'")

        # Analyze each entity's VarMeta
        for entity in ['TBkndTask', 'TBkndRsc', 'TBkndAssn']:
            analyze_varmeta(ole, main_storage, entity)


if __name__ == '__main__':
    main()
