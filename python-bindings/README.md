# ARToolKitNFT for python

This is a python binding for WebARKitLib library. It is based on the WebARKitLib library and provides a python interface to the library.

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
   wheel unpack dist/artoolkitnft-0.0.10-cp38-cp38-manylinux2014_x86_64.whl
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
wheel unpack dist/artoolkitnft-0.0.10-cp38-cp38-manylinux2014_x86_64.whl
twine upload --repository-url https://test.pypi.org/legacy/ dist/*
```

Make sure you replace `dist/artoolkitnft-0.0.10-cp38-cp38-manylinux2014_x86_64.whl` with the actual path to your wheel file if it's different.
```
