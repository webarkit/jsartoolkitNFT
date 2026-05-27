# ARToolKitNFT for python

This is a python binding for WebARKitLib library. It is based on the WebARKitLib library and provides a python interface to the library.
For now you can install the package only with testPyPi: pip install -i https://test.pypi.org/simple/ artoolkitnft

## Local development (build and install from source)

To build the bindings locally and test them without publishing to TestPyPI:

### Prerequisites

- Python 3.8+ with `pip`
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

## Publishing the Package to TestPyPI (Linux)

To publish the package to TestPyPI on a Linux system, follow these steps:

1. **Install the required tools**:
   Ensure you have `setuptools`, `wheel`, and `twine` installed. You can install them using pip:
   ```bash
   pip install --upgrade setuptools wheel twine
   ```

2. **Build the wheel**:
   Navigate to the directory containing your `setup.py` file and run the following command to build the wheel:
   ```bash
   python setup.py sdist bdist_wheel --plat-name manylinux2014_x86_64
   ```

3. **Check the wheel file**:
   Verify that the wheel file has the correct platform tag. You can use the `wheel` tool to inspect the wheel file:
   ```bash
   pip install wheel
   wheel unpack dist/artoolkitnft-0.0.11-cp38-cp38-manylinux2014_x86_64.whl
   ```

4. **Upload the wheel to TestPyPI**:
   Use `twine` to upload the wheel to TestPyPI. You will need your TestPyPI credentials for this step.
   ```bash
   twine upload --repository-url https://test.pypi.org/legacy/ dist/*
   ```

Here is a summary of the commands you need to run:

```bash
pip install --upgrade setuptools wheel twine
python setup.py sdist bdist_wheel --plat-name manylinux2014_x86_64
pip install wheel
wheel unpack dist/artoolkitnft-0.0.11-cp38-cp38-manylinux2014_x86_64.whl
twine upload --repository-url https://test.pypi.org/legacy/ dist/*
```

Make sure you replace `dist/artoolkitnft-0.0.11-cp38-cp38-manylinux2014_x86_64.whl` with the actual path to your wheel file if it's different.
```
