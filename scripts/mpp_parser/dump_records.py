#!/usr/bin/env python3
"""
Dump task records in hex with interpretation attempts.
"""

import olefile
import struct
import sys
from datetime import datetime, timedelta
from pathlib import Path


MPP_DATE_EPOCH = datetime(1983, 12, 31)
MPP_DATE_DIVISOR = 65536


def read_uint32(data, offset):
    if offset + 4 > len(data):
        return 0
    return struct.unpack_from('<I', data, offset)[0]


def read_int16(data, offset):
    if offset + 2 > len(data):
        return 0
    return struct.unpack_from('<h', data, offset)[0]


def decode_date(value):
    if value == 0 or value == 0xFFFFFFFF:
        return None
    days = value / MPP_DATE_DIVISOR
    return MPP_DATE_EPOCH + timedelta(days=days)


def hex_row(data, length=16):
    """Return hex representation."""
    return ' '.join(f'{b:02x}' for b in data[:length])


def main():
    if len(sys.argv) < 2:
        print("Usage: dump_records.py <mpp_file> [record_indices...]")
        sys.exit(1)

    mpp_path = Path(sys.argv[1])
    record_indices = [int(x) for x in sys.argv[2:]] if len(sys.argv) > 2 else None

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
        record_size = len(fixed_data) // record_count

        print(f"Records: {record_count}, Size: {record_size} bytes each")
        print("=" * 80)

        if record_indices is None:
            # Show first few non-null records
            record_indices = []
            for i in range(record_count):
                offset = i * record_size
                first_val = read_uint32(fixed_data, offset)
                if first_val not in (0, 0xFFFF0000) and len(record_indices) < 5:
                    record_indices.append(i)

        for rec_idx in record_indices:
            offset = rec_idx * record_size
            record = fixed_data[offset:offset + record_size]

            print(f"\n=== Record {rec_idx} (offset {offset}) ===")

            # Dump in rows of 16 bytes
            for row_off in range(0, record_size, 16):
                chunk = record[row_off:row_off + 16]
                hex_str = ' '.join(f'{b:02x}' for b in chunk)
                ascii_str = ''.join(chr(b) if 32 <= b < 127 else '.' for b in chunk)
                print(f"  {row_off:3d}: {hex_str:<48} {ascii_str}")

            # Interpret key fields
            print(f"\n  Interpretations:")

            # Try to find UID/ID at various offsets
            for off in [0, 4, 8, 48, 52]:
                val = read_uint32(record, off)
                if 0 < val < 1000:
                    print(f"    offset {off}: uint32={val} (possible ID/UID)")

            # Look for dates
            for off in range(0, record_size - 4, 4):
                val = read_uint32(record, off)
                dt = decode_date(val)
                if dt and 2024 < dt.year < 2030:
                    print(f"    offset {off}: date={dt.strftime('%Y-%m-%d %H:%M')}")

            # Look for duration in tenths of minutes
            for off in range(0, record_size - 4, 4):
                val = read_uint32(record, off)
                hours = val / 600
                if 1 <= hours <= 500 and val % 10 == 0:
                    print(f"    offset {off}: uint32={val} = {hours:.1f} hours (duration?)")


if __name__ == '__main__':
    main()
