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

Usage: check_wheel.py <wheel>
"""

import sys
import zipfile

EXT_SUFFIXES = (".pyd", ".so", ".dylib")


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

    print("  ok")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: check_wheel.py <wheel>")
    main(sys.argv[1])
