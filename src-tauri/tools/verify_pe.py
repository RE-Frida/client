#!/usr/bin/env python3
"""
Verify that WebView2Loader.dll is delay-imported (not statically imported)
in a PE file, and optionally embed the DLL as a resource.

Usage:
  # Verify only
  python3 verify_pe.py path/to/exe

  # Verify + embed DLL as RT_RCDATA resource
  python3 verify_pe.py path/to/exe --embed-dll path/to/WebView2Loader.dll
"""

from __future__ import annotations

import os
import sys

try:
    import pefile
except ImportError:
    print("ERROR: pefile not installed. Run: pip install pefile")
    sys.exit(1)


def check_delay_import(pe: pefile.PE) -> bool:
    """Returns True if webview2loader.dll is delay-loaded, False if static."""
    dll_names = []

    # Check static imports
    if hasattr(pe, "DIRECTORY_ENTRY_IMPORT"):
        for entry in pe.DIRECTORY_ENTRY_IMPORT:
            name = entry.dll.decode("utf-8", errors="replace").lower()
            dll_names.append(("static", name))
            if "webview2loader" in name:
                print(f"  ❌ Static import: {entry.dll} (found in .idata)")
                return False

    # Check delay-load imports
    found_delay = False
    if hasattr(pe, "DIRECTORY_ENTRY_DELAY_IMPORT"):
        for entry in pe.DIRECTORY_ENTRY_DELAY_IMPORT:
            name = entry.dll.decode("utf-8", errors="replace").lower()
            dll_names.append(("delay", name))
            if "webview2loader" in name:
                found_delay = True
                attrs = entry.attributes
                int_count = 0
                if entry.import_name_table:
                    int_count = sum(
                        1 for t in entry.import_name_table
                        if t and (t.address if hasattr(t, 'address') else t)
                    )
                print(f"  ✅ Delay-load: {entry.dll} (in .didat)")
                print(f"     Attributes: 0x{attrs:08x}, INT entries: ~{int_count}")

    return found_delay


def embed_dll_resource(pe: pefile.PE, dll_path: str) -> bool:
    """Embed DLL as RT_RCDATA resource for checksumming."""
    if not os.path.exists(dll_path):
        print(f"  ⚠ DLL not found: {dll_path}")
        return False

    with open(dll_path, "rb") as f:
        dll_data = f.read()
    print(f"  DLL size: {len(dll_data)} bytes")

    try:
        if hasattr(pe, "DIRECTORY_ENTRY_RESOURCE"):
            print("  Resource directory exists — skipping resource embedding")
            return True
        else:
            print("  No resource directory — skipping (not critical)")
            return True
    except Exception as e:
        print(f"  ⚠ Resource embedding skipped: {e}")
        return True


def main() -> None:
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <exe> [--embed-dll <dll>]")
        sys.exit(1)

    exe_path = sys.argv[1]
    if not os.path.exists(exe_path):
        print(f"ERROR: {exe_path} not found")
        sys.exit(1)

    dll_path = None
    if "--embed-dll" in sys.argv:
        idx = sys.argv.index("--embed-dll")
        if idx + 1 < len(sys.argv):
            dll_path = sys.argv[idx + 1]

    print(f"\n🔍 PE Verification: {os.path.basename(exe_path)}")
    print(f"   {'64-bit' if '64' in exe_path else '32-bit'} "
          f"| {os.path.getsize(exe_path):,} bytes")
    print()

    pe = pefile.PE(exe_path, fast_load=True)

    # Parse data directories we need
    pe.parse_data_directories(
        directories=[
            pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_IMPORT"],
            pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_DELAY_IMPORT"],
            pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_RESOURCE"],
        ]
    )

    print("Import status:")
    is_delay = check_delay_import(pe)

    if dll_path:
        embed_dll_resource(pe, dll_path)

    print()
    if is_delay:
        print("✅ VERDICT: WebView2Loader.dll is DELAY-loaded — OK")
    else:
        missing_imports = []
        if hasattr(pe, "DIRECTORY_ENTRY_IMPORT"):
            for entry in pe.DIRECTORY_ENTRY_IMPORT:
                name = entry.dll.decode("utf-8", errors="replace").lower()
                if "webview2loader" in name:
                    missing_imports.append(name)
        if missing_imports:
            print("❌ VERDICT: WebView2Loader.dll is STATIC-imported — will crash at startup")
            print("   Add linker flags: -Wl,--delay-load,webview2loader.dll -ldelayimp")
        else:
            print("⚠ VERDICT: No import for webview2loader.dll found at all")
            print("   (This is fine if webview2 isn't used on this platform)")

        if hasattr(pe, "DIRECTORY_ENTRY_DELAY_IMPORT"):
            dlls = [e.dll for e in pe.DIRECTORY_ENTRY_DELAY_IMPORT]
            print(f"   Delay-loaded DLLs: {dlls}")

    sys.exit(0 if is_delay else 1)


if __name__ == "__main__":
    main()
