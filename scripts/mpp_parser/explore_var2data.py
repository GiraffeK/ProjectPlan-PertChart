#!/usr/bin/env python3
"""
Directly explore Var2Data to find task names.
"""

import olefile
import struct
import sys
from pathlib import Path


def read_uint32(data, offset):
    if offset + 4 > len(data):
        return 0
    return struct.unpack_from('<I', data, offset)[0]


def main():
    if len(sys.argv) < 2:
        print("Usage: explore_var2data.py <mpp_file>")
        sys.exit(1)

    mpp_path = Path(sys.argv[1])

    with olefile.OleFileIO(str(mpp_path)) as ole:
        main_storage = None
        for entry in ole.listdir():
            stripped = entry[0].strip()
            if stripped.isdigit() and int(stripped) < 200:
                main_storage = entry[0]
                break

        var2_data = ole.openstream([main_storage, 'TBkndTask', 'Var2Data']).read()
        var_meta = ole.openstream([main_storage, 'TBkndTask', 'VarMeta']).read()

        print(f"Var2Data size: {len(var2_data)}")
        print(f"VarMeta size: {len(var_meta)}")

        # From raw analysis, the VarMeta entry structure seems to have:
        # bytes 4-7: offset into Var2Data
        # Let's read strings at those offsets

        print("\n=== Strings at VarMeta-indicated offsets ===")
        item_count = read_uint32(var_meta, 8)
        print(f"Item count: {item_count}")

        # Parse first 30 VarMeta entries
        seen_offsets = set()
        for i in range(min(50, item_count)):
            base = 24 + i * 12
            if base + 12 > len(var_meta):
                break

            # The offset into Var2Data appears to be at bytes 4-7
            data_offset = read_uint32(var_meta, base + 4)

            if data_offset in seen_offsets:
                continue
            seen_offsets.add(data_offset)

            if data_offset < len(var2_data) - 4:
                # Read length prefix
                length = read_uint32(var2_data, data_offset)
                if 4 <= length <= 200 and length % 2 == 0:
                    str_start = data_offset + 4
                    str_end = str_start + length
                    if str_end <= len(var2_data):
                        try:
                            text = var2_data[str_start:str_end].decode('utf-16-le', errors='ignore')
                            text = text.rstrip('\x00')
                            if text:
                                print(f"  @{data_offset}: {text}")
                        except:
                            pass

        # Also scan Var2Data directly for strings
        print("\n=== Direct scan of Var2Data for strings ===")
        offset = 0
        found = 0
        while offset < len(var2_data) - 4 and found < 30:
            length = read_uint32(var2_data, offset)
            if 8 <= length <= 200 and length % 2 == 0:
                str_start = offset + 4
                str_end = str_start + length
                if str_end <= len(var2_data):
                    try:
                        text = var2_data[str_start:str_end].decode('utf-16-le', errors='ignore')
                        text = text.rstrip('\x00').strip()
                        if text and len(text) >= 3 and text[0].isalpha():
                            print(f"  @{offset}: len={length} '{text}'")
                            found += 1
                            offset = str_end
                            continue
                    except:
                        pass
            offset += 1


if __name__ == '__main__':
    main()
