# ARToolKitNFT for python

This is a python binding for WebARKitLib library. It is based on the WebARKitLib library and provides a python interface to the library.
Install from PyPI:

```bash
pip install artoolkitnft
```

### Supported platforms

| platform | wheels |
|---|---|
| Linux x86_64 | CPython 3.9-3.13 |
| macOS Apple silicon (arm64) | CPython 3.9-3.13 |
| Windows x86_64 | CPython 3.9-3.13 |
| **macOS Intel (x86_64)** | **none** -- see below |

There is deliberately **no source distribution**: the build compiles sources from outside
the package directory and needs the WebARKitLib git submodule, neither of which survives an
sdist. So on a platform without a wheel, `pip` reports `no matching distribution found`
rather than attempting a build that cannot succeed.

**Intel macOS is not supported.** GitHub retired its free Intel runner (`macos-13`) in
December 2025; the replacement is a paid runner, and GitHub removes x86_64 macOS entirely
in August 2027. Apple has already discontinued the architecture. If you need Intel macOS,
build from a repository checkout following *Local development* below, or open an issue --
cross-compiling universal2 wheels is possible if there is demand.

Rehearsal builds are published to TestPyPI by running the `Publish Python package`
workflow manually with the `testpypi` target. Note that **any** `python/*` tag publishes to
PyPI, including a pre-release version such as `0.0.14rc1` -- routing is chosen by how the
workflow is triggered, not by the version number. To install a rehearsal build:

```bash
pip install -i https://test.pypi.org/simple/ artoolkitnft
```

## Local development (build and install from source)

To build the bindings locally and test them without publishing to TestPyPI:

### Prerequisites

- Python 3.9+ with `pip`
- A C/C++ toolchain (MSVC Build Tools on Windows, `build-essential` on Linux)
- `cmake` available on `PATH` (used by `setup.py` to build the bundled zlib)
- The git submodules initialised:
  ```bash
  git submodule update --init
  ```
- On Windows: `vcpkg` with `libjpeg-turbo` and `pthreads` installed (see the
  `build-windows` job in `.github/workflows/build-python.yml` for the exact
  commands).
- On Linux: `sudo apt-get install -y libjpeg9`

### Build and install

From the `python-bindings/` directory:

```bash
pip install --upgrade pip setuptools wheel pybind11 numpy pillow pytest
python setup.py bdist_wheel
pip install --force-reinstall dist/artoolkitnft-*.whl
```

On Windows PowerShell the last step needs an explicit `Get-ChildItem` because
PowerShell does not expand globs the way bash does:

```powershell
pip install --force-reinstall (Get-ChildItem dist\artoolkitnft-*.whl | Select-Object -First 1).FullName
```

`--force-reinstall` is important — without it, `pip` sees the version has
not changed and skips reinstalling, so your C++ changes never land.

### Run the example

```bash
python example.py
```

### Notes

- Do **not** use `python -m build` here: it creates an isolated build
  environment that does not inherit `cmake` (or `vcpkg`) from your shell.
  Use the legacy `python setup.py bdist_wheel` instead, which keeps your
  current `PATH`.
- Working inside a virtualenv (`python -m venv .venv`) is recommended so
  you do not pollute the system / Anaconda site-packages.

## Publishing

Releases are built and published by the
[Publish Python package](../.github/workflows/publish-python.yml) workflow, through PyPI
trusted publishing (OIDC). There is no token, and nothing is uploaded by hand.

1. Bump the version in **both** `pyproject.toml` and `setup.py` — the workflow refuses to
   publish if the tag and the two files disagree.
2. Rehearse: run the workflow manually with the `testpypi` target and confirm the wheels build
   on all three platforms.
3. Release: tag `python/<version>` (for example `python/0.0.13`) and push it.

### Do not publish by hand

This section previously documented a manual `twine` upload. It has been removed because it
produced a broken artifact that is still on TestPyPI. The instruction was:

```bash
# DO NOT DO THIS
python setup.py sdist bdist_wheel --plat-name manylinux2014_x86_64
twine upload --repository-url https://test.pypi.org/legacy/ dist/*
```

`--plat-name` **forcibly stamps** a platform tag onto whatever was just built, without checking
it. Run on Windows, or with a stale build tree, it labels a Windows `.pyd` as Linux. That is
exactly what `artoolkitnft-0.0.12-cp311-cp311-manylinux2014_x86_64.whl` on TestPyPI contains:
`artoolkitnft_core.cp311-win_amd64.pyd`, which installs on Linux and then fails to load.

It also uploads `dist/*`, which includes an **sdist** — and a source build cannot work here,
because it needs sources from outside the package directory and the WebARKitLib submodule.

The workflow avoids all of this: it builds natively per platform, repairs wheels with
`auditwheel` / `delocate`, rejects any wheel whose contents disagree with its tag
(`.github/scripts/check_wheel.py`), installs and imports each one in a clean virtualenv, and
publishes nothing unless every wheel in the matrix succeeded.
