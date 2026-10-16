#!/usr/bin/env python3
"""The one-off equivalence run of the Python binding (#693), inside ubuntu:24.04.

From the repository root, after the two host steps below, in Git Bash:

    MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)":/src ubuntu:24.04 bash -c \\
      "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \\
       python3-venv python3-dev build-essential cmake curl libjpeg9 faketime unzip >/dev/null \\
       && python3 /src/tools/compare-python/run_in_container.py"

(On Linux or macOS, use "$(pwd)" and drop MSYS_NO_PATHCONV.) The host steps first:

    node tools/compare-python/export-node.js dist/ARToolkitNFT_node.js tools/compare-python/frames
    mkdir -p tools/compare-python/ref && git archive python/0.0.14 python-bindings | tar -x -C tools/compare-python/ref

What it does:
1. Builds the reference: python-bindings at tag python/0.0.14, with only its AR2 thresholds
   changed to the core's (2.0 -> 5.0, 0.3 -> 0.50; #693, D10). The tag pins the same
   WebARKitLib (c3ede5d), so the reference differs from the candidate only by the port.
2. Builds the candidate: this checkout's python-bindings.
3. Downloads the 0.0.14 wheel from PyPI, unchanged.
4. Records each with play.py under libfaketime with a frozen wall clock: ar2SelectTemplate
   reseeds rand() with time(NULL), so only a frozen clock makes two runs comparable. The
   monotonic clock is left alone (the core's detection interval reads it).
5. Compares, with compare.py:
   - reference vs candidate, single marker, exact: the port must not change tracking;
   - candidate vs candidate with filtering inverted, exact: the self-test, which must report
     a difference, or the comparison could not see one;
   - candidate vs the PyPI wheel, single marker, found sets: informational, how the published
     0.0.14 behaves;
   - the Node build (export-node.js) vs the candidate, two markers, found sets: the same core
     on another compiler must find the same markers on every frame.
6. Prints the sha256 of the three extension modules.

Exit 0 only when the reference/candidate comparison is identical and the self-test reports
a difference. Outputs go to tools/compare-python/out/.
"""
import glob
import os
import shutil
import subprocess
import sys
import zipfile

SRC = "/src"
TOOLS = os.path.join(SRC, "tools", "compare-python")
FRAMES = os.path.join(TOOLS, "frames")
OUT = os.path.join(TOOLS, "out")
WORK = "/work"
VENV = "/venv"
PY = os.path.join(VENV, "bin", "python")
LIBFAKETIME = "/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1"
FROZEN = "2026-01-01 00:00:00"

# The two lines of python/0.0.14's setupAR2() that the reference changes (D10).
THRESHOLDS = (
    ("ar2SetTrackingThresh(this->ar2Handle, 2.0);", "ar2SetTrackingThresh(this->ar2Handle, 5.0);"),
    ("ar2SetSimThresh(this->ar2Handle, 0.3);", "ar2SetSimThresh(this->ar2Handle, 0.50);"),
)


def run(cmd, quiet=False, **kwargs):
    """Runs a command; on failure, prints the tail of its stderr before raising."""
    print("+", " ".join(cmd), flush=True)
    result = subprocess.run(cmd, stdout=subprocess.DEVNULL if quiet else None,
                            stderr=subprocess.PIPE, text=True, **kwargs)
    if result.returncode != 0:
        print(result.stderr[-4000:], file=sys.stderr)
        raise subprocess.CalledProcessError(result.returncode, cmd)
    return result


def copy_bindings(src, dest):
    """Copies a python-bindings directory without build outputs into its own tree.

    setup.py reaches its sources as ../emscripten/WebARKitLib and builds zlib in
    ../emscripten/zlib/build. WebARKitLib is shared through a symlink (its generated
    config.h is the same for both sides); zlib is copied, because a CMake build
    directory remembers the path it was configured from and refuses another.
    """
    def ignore(directory, names):
        skip = {"build", "dist", "install", "__pycache__", ".pytest_cache", ".git"}
        if os.path.basename(directory) == "deps":
            skip.add("libjpeg")
        return [n for n in names if n in skip or n.endswith((".so", ".egg-info"))]
    root = os.path.dirname(dest)
    os.makedirs(os.path.join(root, "emscripten"), exist_ok=True)
    shutil.copytree(src, dest, ignore=ignore)
    os.symlink(os.path.join(SRC, "emscripten", "WebARKitLib"),
               os.path.join(root, "emscripten", "WebARKitLib"))
    shutil.copytree(os.path.join(SRC, "emscripten", "zlib"),
                    os.path.join(root, "emscripten", "zlib"), ignore=ignore)


def build(bindings_dir):
    """Builds artoolkitnft_core in place; returns the directory that holds it.

    setup.py maps packages to src/ (package_dir), so --inplace puts the module there.
    """
    run([PY, "setup.py", "-q", "build_ext", "--inplace"], quiet=True, cwd=bindings_dir)
    built = [so for so in glob.glob(os.path.join(bindings_dir, "**", "artoolkitnft_core*.so"),
                                    recursive=True)
             if os.sep + "build" + os.sep not in so]
    if len(built) != 1:
        sys.exit(f"expected one artoolkitnft_core module in {bindings_dir}, found {built}")
    return os.path.dirname(built[0])


def play(core_dir, mode, out_name, *extra):
    env = dict(os.environ, LD_PRELOAD=LIBFAKETIME, FAKETIME=FROZEN,
               FAKETIME_DONT_FAKE_MONOTONIC="1")
    out = os.path.join(OUT, out_name)
    # The library logs every frame to stdout.
    run([PY, "-I", os.path.join(TOOLS, "play.py"), "--core-dir", core_dir, "--frames", FRAMES,
         "--mode", mode, "--out", out, *extra], quiet=True, env=env)
    return out


def compare(old, new, mode, label):
    print(f"\n=== {label}", flush=True)
    return subprocess.run([PY, "-I", os.path.join(TOOLS, "compare.py"), old, new,
                           "--mode", mode]).returncode


def main():
    for name in ("both.rgba", "pinballOnly.rgba", "blank.rgba", "node-records.json"):
        if not os.path.exists(os.path.join(FRAMES, name)):
            sys.exit(f"missing {FRAMES}/{name}: run export-node.js first (see the docstring)")
    ref_src = os.path.join(TOOLS, "ref", "python-bindings")
    if not os.path.isdir(ref_src):
        sys.exit(f"missing {ref_src}: extract python/0.0.14 first (see the docstring)")
    os.makedirs(OUT, exist_ok=True)

    run(["python3", "-m", "venv", VENV])
    run([os.path.join(VENV, "bin", "pip"), "install", "-q", "numpy", "setuptools", "wheel", "pybind11"])

    # 1. The reference.
    ref = os.path.join(WORK, "ref", "python-bindings")
    copy_bindings(ref_src, ref)
    cpp = os.path.join(ref, "ARToolKitNFT_py.cpp")
    with open(cpp, encoding="utf-8") as f:
        source = f.read()
    for old, new in THRESHOLDS:
        if source.count(old) != 1:
            sys.exit(f"the reference does not contain exactly one {old!r}")
        source = source.replace(old, new)
    with open(cpp, "w", encoding="utf-8") as f:
        f.write(source)
    ref_core = build(ref)

    # 2. The candidate.
    new = os.path.join(WORK, "new", "python-bindings")
    copy_bindings(os.path.join(SRC, "python-bindings"), new)
    new_core = build(new)

    # 3. The published 0.0.14 wheel.
    pypi = os.path.join(WORK, "pypi")
    run([os.path.join(VENV, "bin", "pip"), "download", "-q", "artoolkitnft==0.0.14", "--no-deps",
         "--only-binary", ":all:", "-d", pypi])
    pypi_site = os.path.join(pypi, "site")
    for wheel in glob.glob(os.path.join(pypi, "*.whl")):
        with zipfile.ZipFile(wheel) as z:
            z.extractall(pypi_site)

    # 4. The records.
    ref_single = play(ref_core, "single", "ref-single.json")
    new_single = play(new_core, "single", "new-single.json")
    inverted = play(new_core, "single", "new-single-inverted.json", "--invert-filtering")
    pypi_single = play(pypi_site, "single", "pypi-single.json")
    new_multi = play(new_core, "multi", "new-multi.json")

    # 5. The comparisons.
    port = compare(ref_single, new_single, "exact",
                   "python/0.0.14 with the core's AR2 thresholds vs this binding (exact)")
    self_test = compare(new_single, inverted, "exact",
                        "self-test: this binding vs itself with filtering inverted (must differ)")
    compare(new_single, pypi_single, "found",
            "informational: this binding vs the published 0.0.14 wheel (found sets)")
    compare(os.path.join(FRAMES, "node-records.json"), new_multi, "found",
            "the Node build vs this binding, two markers (found sets)")

    # 6. What was compared.
    print()
    for label, directory in (("reference", ref_core), ("candidate", new_core), ("pypi 0.0.14", pypi_site)):
        for so in glob.glob(os.path.join(directory, "artoolkitnft_core*.so")):
            digest = subprocess.run(["sha256sum", so], capture_output=True, text=True).stdout.split()[0]
            print(f"{label}: {os.path.basename(so)} sha256 {digest}")

    ok = port == 0 and self_test == 1
    print(f"\nverdict: {'PASS' if ok else 'FAIL'} (port exit {port}, self-test exit {self_test})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
