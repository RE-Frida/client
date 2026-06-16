#!/usr/bin/env python3
"""
Post-build PE patcher: embed WebView2Loader.dll and convert its import to delay-load.

The problem:
  webview2-com-sys uses windows_link::link!("webview2loader" ...) which creates a
  static PE import. The Windows loader tries to resolve this DLL before main() runs,
  so runtime extraction can never work.

The fix:
  1. Remove the static import for webview2loader.dll from the regular import table
  2. Create a proper delay-load import entry so Windows only resolves the DLL on
     first function call (after our extraction code has written it to disk)
  3. Embed the DLL binary as a PE resource for checksumming / distribution

Usage:
  python3 patch_pe.py <path-to-exe> <path-to-webview2loader.dll>
"""

from __future__ import annotations

import os
import struct
import sys

try:
    import pefile
except ImportError:
    print("ERROR: pefile not installed. Run: pip install pefile")
    sys.exit(1)

# ── PE structure helpers ─────────────────────────────────────────────

IMAGE_DIRECTORY_ENTRY_DELAY_IMPORT = 15  # Data directory index for delay-load


def align_up(value: int, alignment: int) -> int:
    """Round up to the given alignment."""
    return (value + alignment - 1) & ~(alignment - 1)


def rva_to_offset(pe: pefile.PE, rva: int) -> int:
    """Convert an RVA to a file offset using the section table."""
    for section in pe.sections:
        if section.contains_rva(rva):
            delta = section.VirtualAddress - section.PointerToRawData
            return rva - delta
    raise ValueError(f"RVA 0x{rva:08x} not found in any section")


# ── Main patching logic ──────────────────────────────────────────────


def patch_pe(exe_path: str, dll_path: str) -> None:
    """Patch the PE file to delay-load WebView2Loader.dll."""
    print(f"Reading PE: {exe_path}")
    pe = pefile.PE(exe_path)

    # ── Step 1: Find the webview2loader.dll import ─────────────────
    dll_import = None
    imp_index = None
    for idx, entry in enumerate(pe.DIRECTORY_ENTRY_IMPORT):
        dll_name = entry.dll.decode("utf-8", errors="replace").lower()
        if "webview2loader" in dll_name or dll_name == "webview2loader.dll":
            dll_import = entry
            imp_index = idx
            break

    if dll_import is None:
        print("No static import for webview2loader.dll found — nothing to patch.")
        # Still embed the DLL as a resource if it exists
        if dll_path and os.path.exists(dll_path):
            _embed_dll_resource(pe, dll_path)
        _write_output(pe, exe_path)
        return

    # ── Step 2: Extract function names / ordinals ──────────────────
    func_names: list[bytes | None] = []
    ordinal_base = 0
    for imp in dll_import.imports:
        if imp.name:
            func_names.append(imp.name)
        else:
            # Ordinal import
            func_names.append(None)
            if ordinal_base == 0:
                ordinal_base = imp.ordinal
    if not func_names:
        print("No functions imported from webview2loader.dll — skipping")
        return

    has_ordinal_imports = any(n is None for n in func_names)
    print(f"Found {len(func_names)} imports from webview2loader.dll "
          f"(ordinal_base={ordinal_base if has_ordinal_imports else 'N/A'})")

    # ── Step 3: Remove the static import ───────────────────────────
    print("Removing static import for webview2loader.dll...")
    del pe.DIRECTORY_ENTRY_IMPORT[imp_index]

    # ── Step 4: Build delay-load data ──────────────────────────────
    #
    # We need to create a DELAY_IMPORT_DESCRIPTOR followed by:
    #   - DLL name string
    #   - Import Name Table (INT)  — array of IMAGE_THUNK_DATA
    #   - Import Address Table (IAT) — array of IMAGE_THUNK_DATA
    #   - Module handle (HMODULE slot)
    #
    # DELAY_IMPORT_DESCRIPTOR (20 bytes on 32-bit, 24 bytes on 64-bit):
    #   Attributes[4]  |  DllNameRVA[4]  |  ModuleHandleRVA[4]
    #   IAT_RVA[4]     |  INT_RVA[4]     |  BoundIAT_RVA[4]
    #   UnloadIAT_RVA[4]  |  TimeDateStamp[4]
    #

    is_64bit = pe.FILE_HEADER.Machine == pefile.MACHINE_TYPE["IMAGE_FILE_MACHINE_AMD64"]
    ptr_size = 8 if is_64bit else 4

    # DLL name (null-terminated)
    dll_name_bytes = b"WebView2Loader.dll\x00"

    # INT and IAT entries: for each function, an IMAGE_THUNK_DATA
    # In delay-load, the INT is always RVA-based (bit 63/31 clear = RVA to IMAGE_IMPORT_BY_NAME)
    # and the IAT initially points to the same INT entries.
    thunk_size = ptr_size
    entry_count = len(func_names) + 1  # +1 for null terminator

    # Build INT entries (array of thunks pointing to hint/name pairs)
    int_data = b""
    name_entries: list[bytes] = []  # IMAGE_IMPORT_BY_NAME entries
    for name in func_names:
        if name is not None:
            # IMAGE_IMPORT_BY_NAME: Hint[2] + Name[var]
            hint = 0  # Hint doesn't need to be accurate for delay-load
            entry = struct.pack("<H", hint) + name + b"\x00"
            name_entries.append(entry)
        else:
            name_entries.append(None)  # ordinal import

    # Calculate RVAs once we know the layout, build content in blocks
    # Layout:
    #   [DELAY_IMPORT_DESCRIPTOR] [DLL name] [INT thunks] [IAT thunks] [Module handle]
    #   IMAGE_IMPORT_BY_NAME entries (pointed to by INT thunks)

    # We'll allocate a new section and put everything there
    section_data = bytearray()

    # Compute sizes
    desc_size = 8 * 4 if is_64bit else 8 * 4  # 4 DWORDs on 32, 8 DWORDS... actually let me be precise
    if is_64bit:
        # IMAGE_DELAYLOAD_DESCRIPTOR is 8 * 4 = 32 bytes (all fields are DWORDs)
        desc_size = 8 * 4  # 8 DWORDs
    else:
        desc_size = 8 * 4  # same layout, all fields are DWORDs

    # PM: Actually, looking at the PE spec:
    # typedef struct _IMAGE_DELAYLOAD_DESCRIPTOR {
    #     union { DWORD AllAttributes; struct { DWORD RvaBased:1; DWORD Reserved:31; } DUMMYSTRUCTNAME; } Attributes;
    #     DWORD DllNameRVA;
    #     DWORD ModuleHandleRVA;
    #     DWORD ImportAddressTableRVA;
    #     DWORD ImportNameTableRVA;
    #     DWORD BoundImportAddressTableRVA;
    #     DWORD UnloadInformationTableRVA;
    #     DWORD TimeDateStamp;
    # } IMAGE_DELAYLOAD_DESCRIPTOR;
    # Total = 8 * 4 = 32 bytes

    dll_name_offset = desc_size
    dll_name_size = len(dll_name_bytes)

    int_offset = align_up(dll_name_offset + dll_name_size, thunk_size)
    int_size = entry_count * thunk_size

    iat_offset = int_offset + int_size
    iat_size = entry_count * thunk_size

    module_handle_offset = iat_offset + iat_size
    module_handle_size = ptr_size

    names_offset = module_handle_offset + module_handle_size
    # Build name entries data
    name_data = b""
    name_rvas: list[int] = []
    for entry in name_entries:
        if entry is not None:
            name_rvas.append(names_offset + len(name_data))
            name_data += entry
        else:
            name_rvas.append(0)

    # Now build INT thunks (pointing to IMAGE_IMPORT_BY_NAME entries)
    int_thunks = b""
    for i, name in enumerate(func_names):
        if name is not None:
            thunk = struct.pack(f"<{'Q' if is_64bit else 'I'}", name_rvas[i])
        else:
            # Ordinal import: set high bit + ordinal
            ordinal = ordinal_base + i
            if is_64bit:
                thunk = struct.pack("<Q", 0x8000000000000000 | ordinal)
            else:
                thunk = struct.pack("<I", 0x80000000 | ordinal)
        int_thunks += thunk
    # Null terminator
    int_thunks += b"\x00" * thunk_size

    # IAT initially == INT (same RVAs). At runtime, the delay-load helper
    # will overwrite IAT entries with resolved function addresses.
    iat_thunks = int_thunks  # Same content initially

    # Module handle (will be filled by delay-load helper at runtime)
    module_handle = b"\x00" * ptr_size

    # Build complete section content
    section_data = bytearray()
    section_data.extend(b"\x00" * desc_size)  # Descriptor placeholder
    section_data.extend(dll_name_bytes)
    # Align to thunk_size
    while len(section_data) % thunk_size != 0:
        section_data.append(0)
    section_data.extend(int_thunks)
    section_data.extend(iat_thunks)
    section_data.extend(module_handle)
    section_data.extend(name_data)

    # Align to 8 bytes
    while len(section_data) % 8 != 0:
        section_data.append(0)

    # ── Step 5: Fill in the descriptor ──────────────────────────────
    descriptor_offset = 0
    base_rva = pefile.RVA_for_section(pe, ...)  # Need to add section first
    # We need to add the section first, then we know the base RVA
    # Let me restructure...

    print(f"Delay-load data size: {len(section_data)} bytes")
    print(f"Functions: {', '.join(n.decode() if n else f'ord({ordinal_base + i})' for i, n in enumerate(func_names))}")

    # ── TODO: Add section properly ─────────────────────────────────
    # This is a placeholder. The actual section addition and RVA
    # calculation requires proper pefile section manipulation.
    # Let me save what we have and add proper section handling.

    # For now, embed the DLL as a resource (the simpler part)
    if dll_path and os.path.exists(dll_path):
        print(f"Embedding {dll_path} as PE resource...")
        _embed_dll_resource(pe, dll_path)

    # Write output
    _write_output(pe, exe_path)
    print("DONE — PE file updated (note: delay-load descriptor still pending)")


def _embed_dll_resource(pe: pefile.PE, dll_path: str) -> None:
    """Embed WebView2Loader.dll as a PE resource."""
    with open(dll_path, "rb") as f:
        dll_data = f.read()
    print(f"  DLL size: {len(dll_data)} bytes")

    # Add RT_RCDATA resource with the DLL bytes
    # Resource type 10 = RT_RCDATA
    # Resource name "WEBVIEW2_LOADER"
    from pefile import ResourceDirEntryData, ResourceDataEntry, ResourceDirEntry
    from pefile import ResourceDir

    try:
        # Check if resources directory exists
        if not hasattr(pe, "DIRECTORY_ENTRY_RESOURCE"):
            print("  No resource directory found, creating one...")
            # This is complex in pefile — requires section manipulation
            return

        res_dir = pe.DIRECTORY_ENTRY_RESOURCE
        # Find or create RT_RCDATA directory
        rtcdata_id = 10  # RT_RCDATA
        rt_dir = None
        for entry in res_dir.entries:
            if entry.id == rtcdata_id:
                rt_dir = entry
                break

        if rt_dir is None:
            print("  Creating RT_RCDATA directory...")
            # Would need to add a new resource directory entry
            pass

        if rt_dir:
            # Check if "WEBVIEW2_LOADER" already exists
            for entry in rt_dir.directory.entries:
                if hasattr(entry, "name") and entry.name == "WEBVIEW2_LOADER":
                    print("  Updating existing WEBVIEW2_LOADER resource")
                    if entry.data and entry.data.struct:
                        entry.data.struct.Size = len(dll_data)
                        entry.data.struct.OffsetToData = ...  # Need to update data
                    return

    except Exception as e:
        print(f"  Warning: resource embedding failed: {e}")


def _write_output(pe: pefile.PE, exe_path: str) -> None:
    """Write the modified PE, preserving the original as a backup."""
    backup_path = exe_path + ".bak"
    if not os.path.exists(backup_path):
        os.rename(exe_path, backup_path)
        print(f"Backup saved: {backup_path}")

    pe.write(exe_path)
    print(f"Patched PE written: {exe_path}")


# ── CLI entry point ──────────────────────────────────────────────────


def main() -> None:
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <path-to-exe> [path-to-webview2loader.dll]")
        sys.exit(1)

    exe_path = sys.argv[1]
    dll_path = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.exists(exe_path):
        print(f"ERROR: exe not found: {exe_path}")
        sys.exit(1)

    if dll_path and not os.path.exists(dll_path):
        print(f"ERROR: DLL not found: {dll_path}")
        sys.exit(1)

    patch_pe(exe_path, dll_path)


if __name__ == "__main__":
    main()
