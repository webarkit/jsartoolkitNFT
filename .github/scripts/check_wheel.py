"""Refuse a wheel whose contents disagree with its platform tag.

A mislabelled wheel is worse than a failed build: it uploads cleanly, and PyPI
never allows replacing a version, so the mistake is permanent.

This is not hypothetical. `artoolkitnft-0.0.12-cp311-cp311-manylinux2014_x86_64.whl`
on TestPyPI contains `artoolkitnft_core.cp311-win_amd64.pyd` -- a Windows
extension inside a wheel advertised as Linux. Installing it on Linux yields a
binary CPython cannot load, and nothing in the build caught it, because the
filename alone looks entirely reasonable.

So the check compares the tag against what is actually inside:

  * a `win*` wheel must carry a `.pyd` and no `.so`
  * every other platform must carry a `.so` and no `.pyd`
  * an unrepaired `linux_*` tag is rejected outright -- PyPI refuses those, and
    seeing it here is the signal that auditwheel did not run
  * in a `macosx_*` wheel, every binary must be Mach-O and contain every
    architecture the tag claims. The 0.0.13 macOS wheels were tagged for x86_64
    and arm64 with a universal extension but an arm64-only bundled libjpeg, so
    they installed on Intel Macs and then failed to import (#653).

Usage: check_wheel.py <wheel>
"""

import struct
import sys
import zipfile

EXT_SUFFIXES = (".pyd", ".so", ".dylib")

# Mach-O CPU types (mach/machine.h): CPU_ARCH_ABI64 | CPU_TYPE_X86 or CPU_TYPE_ARM.
MACHO_CPU_TYPES = {0x01000007: "x86_64", 0x0100000C: "arm64"}

# Platform tag architectures that stand for several.
MACOS_TAG_ARCHS = {"universal2": {"x86_64", "arm64"}, "intel": {"x86_64", "i386"}}


def macho_archs(data):
    """The architectures of a Mach-O image, or None if `data` is not one."""
    if len(data) < 8:
        return None
    magic = struct.unpack_from(">I", data)[0]
    if magic in (0xCAFEBABE, 0xCAFEBABF):  # fat; headers are big-endian
        count = struct.unpack_from(">I", data, 4)[0]
        entry = 20 if magic == 0xCAFEBABE else 32
        if count == 0 or len(data) < 8 + count * entry:
            return None
        return {
            MACHO_CPU_TYPES.get(struct.unpack_from(">I", data, 8 + i * entry)[0], "unknown")
            for i in range(count)
        }
    if struct.unpack_from("<I", data)[0] in (0xFEEDFACF, 0xFEEDFACE):  # thin, little-endian
        return {MACHO_CPU_TYPES.get(struct.unpack_from("<I", data, 4)[0], "unknown")}
    return None


def macos_tag_archs(name):
    """The architectures a wheel's `macosx_*` platform tags claim."""
    archs = set()
    for tag in name[: -len(".whl")].rsplit("-", 1)[-1].split("."):
        if tag.startswith("macosx_"):
            arch = tag.split("_", 3)[3]  # macosx_<major>_<minor>_<arch>
            archs |= MACOS_TAG_ARCHS.get(arch, {arch})
    return archs


def fail(message):
    print("::error::%s" % message)
    raise SystemExit(1)


def main(path):
    name = path.replace("\\", "/").rsplit("/", 1)[-1]
    print("checking %s" % name)

    if name.endswith(("-linux_x86_64.whl", "-linux_i686.whl", "-linux_aarch64.whl")):
        fail(
            "%s carries an unrepaired 'linux_*' platform tag, which PyPI rejects. "
            "auditwheel repair did not run, or did not replace the original." % name
        )

    with zipfile.ZipFile(path) as zf:
        members = zf.namelist()
        claimed = macos_tag_archs(name)
        macho = {m: macho_archs(zf.read(m)) for m in members if claimed and m.endswith(EXT_SUFFIXES)}

    binaries = [m for m in members if m.endswith(EXT_SUFFIXES)]
    print("  binaries: %s" % (binaries or "none"))
    if not binaries:
        fail("%s contains no compiled extension at all" % name)

    is_windows_tag = "-win" in name or name.endswith("win_amd64.whl")
    pyds = [m for m in binaries if m.endswith(".pyd")]
    sos = [m for m in binaries if m.endswith(".so")]

    if is_windows_tag:
        if not pyds:
            fail("%s is tagged for Windows but contains no .pyd" % name)
        if sos:
            fail("%s is tagged for Windows but contains ELF/Mach-O objects: %s" % (name, sos))
    else:
        if not sos:
            fail("%s is tagged for a Unix platform but contains no .so" % name)
        if pyds:
            fail(
                "%s is tagged '%s' but contains Windows extensions: %s. "
                "This is the 0.0.12 failure mode -- a Windows build relabelled as Unix."
                % (name, name.rsplit("-", 1)[-1][:-4], pyds)
            )

    if claimed:
        print("  tag architectures: %s" % ", ".join(sorted(claimed)))
        for member, archs in macho.items():
            if archs is None:
                fail("%s is tagged for macOS but %s is not a Mach-O binary" % (name, member))
            print("  %s: %s" % (member, ", ".join(sorted(archs))))
            missing = claimed - archs
            if missing:
                fail(
                    "%s claims %s, but %s lacks %s, so the wheel installs there and then "
                    "fails to load. This is the 0.0.13 failure mode (#653)."
                    % (name, ", ".join(sorted(claimed)), member, ", ".join(sorted(missing)))
                )

    print("  ok")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: check_wheel.py <wheel>")
    main(sys.argv[1])
