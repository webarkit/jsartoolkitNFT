"""Tests for check_wheel.py, on synthetic wheels.

The Mach-O headers are built by hand, so the macOS checks run on any OS.

Run with: python -m pytest .github/scripts/test_check_wheel.py
"""

import os
import struct
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_wheel  # noqa: E402

X86_64 = 0x01000007
ARM64 = 0x0100000C


def thin(cputype):
    """A thin 64-bit Mach-O header (little-endian, as on x86_64 and arm64)."""
    return struct.pack("<II", 0xFEEDFACF, cputype) + b"\0" * 24


def fat(*cputypes):
    """A fat (universal) Mach-O header listing `cputypes`."""
    header = struct.pack(">II", 0xCAFEBABE, len(cputypes))
    for cputype in cputypes:
        header += struct.pack(">iiIII", cputype, 0, 0, 0, 0)
    return header


class CheckWheelTest(unittest.TestCase):
    def check(self, name, members):
        """Runs check_wheel.main on a wheel named `name`; returns its exit code."""
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, name)
            with zipfile.ZipFile(path, "w") as zf:
                for member, data in members.items():
                    zf.writestr(member, data)
            try:
                check_wheel.main(path)
            except SystemExit as e:
                return e.code
            return 0

    def test_universal_tag_with_an_arm64_only_bundled_library_is_rejected(self):
        # The 0.0.13 wheels: a universal extension, an arm64-only libjpeg (#653).
        name = "artoolkitnft-0.0.13-cp310-cp310-macosx_10_14_x86_64.macosx_15_0_arm64.whl"
        code = self.check(name, {
            "artoolkitnft_core.cpython-310-darwin.so": fat(X86_64, ARM64),
            "artoolkitnft/.dylibs/libjpeg.9.dylib": thin(ARM64),
        })
        self.assertEqual(code, 1)

    def test_arm64_tag_with_arm64_binaries_passes(self):
        name = "artoolkitnft-0.0.14-cp310-cp310-macosx_15_0_arm64.whl"
        code = self.check(name, {
            "artoolkitnft_core.cpython-310-darwin.so": thin(ARM64),
            "artoolkitnft/.dylibs/libjpeg.9.dylib": thin(ARM64),
        })
        self.assertEqual(code, 0)

    def test_universal2_tag_with_universal_binaries_passes(self):
        name = "artoolkitnft-0.0.14-cp310-cp310-macosx_10_14_universal2.whl"
        code = self.check(name, {
            "artoolkitnft_core.cpython-310-darwin.so": fat(X86_64, ARM64),
            "artoolkitnft/.dylibs/libjpeg.9.dylib": fat(ARM64, X86_64),
        })
        self.assertEqual(code, 0)

    def test_arm64_tag_with_an_x86_64_extension_is_rejected(self):
        name = "artoolkitnft-0.0.14-cp310-cp310-macosx_15_0_arm64.whl"
        code = self.check(name, {"artoolkitnft_core.cpython-310-darwin.so": thin(X86_64)})
        self.assertEqual(code, 1)

    def test_macos_tag_with_a_non_macho_binary_is_rejected(self):
        name = "artoolkitnft-0.0.14-cp310-cp310-macosx_15_0_arm64.whl"
        code = self.check(name, {"artoolkitnft_core.cpython-310-darwin.so": b"\x7fELF" + b"\0" * 28})
        self.assertEqual(code, 1)

    def test_linux_tag_with_a_windows_extension_is_still_rejected(self):
        # The 0.0.12 failure mode, which the existing checks catch.
        name = "artoolkitnft-0.0.12-cp311-cp311-manylinux2014_x86_64.whl"
        code = self.check(name, {"artoolkitnft_core.cp311-win_amd64.pyd": b"MZ"})
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
