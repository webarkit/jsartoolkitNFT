from glob import glob
from setuptools import setup, Extension
from pybind11.setup_helpers import Pybind11Extension, build_ext
import pybind11
import os
import shutil
import subprocess
import sys

LIBJPEG_VERSION = '9c'
LIBJPEG_URL = f'http://www.ijg.org/files/jpegsrc.v{LIBJPEG_VERSION}.tar.gz'
LIBJPEG_DIR = 'deps/libjpeg'
ZLIB_DIR = '../emscripten/zlib'
CONFIG_H_IN = os.path.join(os.path.dirname(__file__), '../emscripten/WebARKitLib/include/AR/config.h.in')
CONFIG_H = os.path.join(os.path.dirname(__file__), '../emscripten/WebARKitLib/include/AR/config.h')

def download_and_extract(url, dest):
    subprocess.run(['curl', '-L', url, '-o', 'libjpeg.tar.gz'], check=True)
    subprocess.run(['tar', 'xzf', 'libjpeg.tar.gz'], check=True)
    shutil.move(f'jpeg-{LIBJPEG_VERSION}', dest)
    os.remove('libjpeg.tar.gz')

def build_zlib():
    build_dir = os.path.join(ZLIB_DIR, 'build')
    install_dir = os.path.join(ZLIB_DIR, 'install')
    os.makedirs(build_dir, exist_ok=True)
    os.makedirs(install_dir, exist_ok=True)
    cmake_command = [
        'cmake',
        '-S', ZLIB_DIR,
        '-B', build_dir,
        '-DCMAKE_BUILD_TYPE=Release',
        f'-DCMAKE_INSTALL_PREFIX={install_dir}'
    ]
    build_command = ['cmake', '--build', build_dir, '--config', 'Release']
    install_command = ['cmake', '--install', build_dir]

    try:
        subprocess.run(cmake_command, check=True)
        subprocess.run(build_command, check=True)
        subprocess.run(install_command, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error building zlib: {e}")
        sys.exit(1)

def build_libjpeg():
    if sys.platform == 'win32':
        # Use MSYS2 to build libjpeg on Windows
        build_dir = os.path.abspath(os.path.join(LIBJPEG_DIR, 'build'))
        os.makedirs(build_dir, exist_ok=True)
        # Full path to MSYS2
        msys2_path = r'C:\msys64\usr\bin'  # Adjust this path if necessary
        os.environ['PATH'] = msys2_path + os.pathsep + os.environ['PATH']
        # Convert Windows path to Unix-style path using MSYS2
        try:
            build_dir_unix = subprocess.check_output(['bash', '-c', f'cygpath -u {build_dir}']).strip().decode('utf-8')
            print(f"Converted build directory: {build_dir_unix}")
        except subprocess.CalledProcessError as e:
            print(f"Error converting path: {e}")
            sys.exit(1)
        # Change the installation directory to a location with write permissions
        install_dir = os.path.join(build_dir, 'install')
        os.makedirs(install_dir, exist_ok=True)
        install_dir_unix = subprocess.check_output(['bash', '-c', f'cygpath -u {install_dir}']).strip().decode('utf-8')
        subprocess.run(['bash', '-c', f'./configure --prefix={install_dir_unix}'], cwd=LIBJPEG_DIR, check=True)
        subprocess.run(['bash', '-c', 'make'], cwd=LIBJPEG_DIR, check=True)
        subprocess.run(['bash', '-c', 'make install'], cwd=LIBJPEG_DIR, check=True)
    else:
        build_dir = os.path.abspath(os.path.join(LIBJPEG_DIR, 'build'))
        os.makedirs(build_dir, exist_ok=True)
        subprocess.run(['./configure', '--prefix=' + build_dir], cwd=LIBJPEG_DIR, check=True)
        subprocess.run(['make'], cwd=LIBJPEG_DIR, check=True)
        subprocess.run(['make', 'install'], cwd=LIBJPEG_DIR, check=True)

def generate_config_h():
    with open(CONFIG_H_IN, 'r') as file:
        config_h_content = file.read()

    config_h_content = config_h_content.replace('#undef  ARVIDEO_INPUT_DEFAULT_DUMMY',
                                                '#define  ARVIDEO_INPUT_DEFAULT_DUMMY')

    with open(CONFIG_H, 'w') as file:
        file.write(config_h_content)

# Build zlib
build_zlib()

# Check if the libjpeg directory exists, if not, download and extract it
if not os.path.exists(LIBJPEG_DIR):
    download_and_extract(LIBJPEG_URL, LIBJPEG_DIR)

# Build libjpeg
if sys.platform.startswith('linux'):
    build_libjpeg()

# Generate config.h from config.h.in
generate_config_h()

# Windows-specific step to install pthread static library using vcpkg
if sys.platform == 'win32':
    print("Running Windows-specific setup step to install pthread static library")
    vcpkg_path = os.path.join(os.getcwd(), 'vcpkg')
    if not os.path.exists(vcpkg_path):
        subprocess.run(['git', 'clone', 'https://github.com/microsoft/vcpkg.git'], check=True)
        subprocess.run([os.path.join(vcpkg_path, 'bootstrap-vcpkg.bat')], check=True)
    # Install necessary tools using choco
    subprocess.run(['choco', 'install', 'cmake', 'ninja', 'visualstudio2019buildtools', 'visualstudio2019-workload-vctools', '-y'], check=True)
    subprocess.run([os.path.join(vcpkg_path, 'vcpkg'), 'install', 'pthreads:x64-windows-static'], check=True)
    os.environ['VCPKG_ROOT'] = vcpkg_path

# Sort the list of files
sorted_ar_files = sorted(glob('../emscripten/WebARKitLib/lib/SRC/AR/*.c'))
sorted_ar2_files = sorted(glob('../emscripten/WebARKitLib/lib/SRC/AR2/*.c'))
sorted_arutil_files = sorted(glob('../emscripten/WebARKitLib/lib/SRC/ARUtil/*.c'))
sorted_arLabeling_files = sorted(glob('../emscripten/WebARKitLib/lib/SRC/AR/arLabelingSub/*.c'))
sorted_aricp_files = sorted(glob('../emscripten/WebARKitLib/lib/SRC/ARICP/*.c'))

include_dirs = [
    pybind11.get_include(),
    '../emscripten',
    '../emscripten/WebARKitLib/include',
    '../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher'
]

library_dirs = []
libraries = []
extra_compile_args = []

if sys.platform == 'win32':
    include_dirs.extend([
        'deps/include',
        'deps/libjpeg',
        '../emscripten/zlib',
        '../emscripten/zlib/build',
        'vcpkg/packages/pthreads_x64-windows-static/include',
        os.path.join(os.getenv('VCPKG_ROOT', 'vcpkg'), 'installed', 'x64-windows', 'include')
    ])
    library_dirs.extend([
        'deps/libs',
        '../emscripten/zlib/build/Release',
        'vcpkg/packages/pthreads_x64-windows-static/lib',
        os.path.join(os.getenv('VCPKG_ROOT', 'vcpkg'), 'installed', 'x64-windows', 'lib')
    ])
    libraries.extend(['zlib', 'libjpeg', 'Advapi32', 'Shell32', 'pthreadVC3', 'pthreadVC2static'])
    extra_compile_args.extend(['/std:c++17', '/Dcpu_set_t=struct{unsigned long __bits[1024 / (8 * sizeof(unsigned long))];}'])  # Set the C++ standard to C++17 and define cpu_set_t
else:
    include_dirs.append(os.path.join(LIBJPEG_DIR, 'build', 'include'))
    library_dirs.append(os.path.join(LIBJPEG_DIR, 'build', 'lib'))
    libraries.extend(['z', 'm','jpeg'])

ext_modules = [
    Pybind11Extension(
        'jsartoolkitNFT',
        sources=sorted_ar_files + sorted_ar2_files + sorted_arutil_files + sorted_arLabeling_files + sorted_aricp_files + [
            'ARToolKitNFT_py.cpp',
            '../emscripten/trackingMod.c',
            '../emscripten/trackingMod2d.c',
            '../emscripten/WebARKitLib/lib/SRC/KPM/kpmFopen.c',
            '../emscripten/WebARKitLib/lib/SRC/KPM/kpmHandle.cpp',
            '../emscripten/WebARKitLib/lib/SRC/KPM/kpmMatching.cpp',
            '../emscripten/WebARKitLib/lib/SRC/KPM/kpmRefDataSet.cpp',
            '../emscripten/WebARKitLib/lib/SRC/KPM/kpmResult.cpp',
            '../emscripten/WebARKitLib/lib/SRC/KPM/kpmUtil.cpp',
            "../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/detectors/DoG_scale_invariant_detector.cpp",
            "../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/detectors/gaussian_scale_space_pyramid.cpp",
            "../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/detectors/gradients.cpp",
            "../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/detectors/orientation_assignment.cpp",
            "../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/detectors/pyramid.cpp",
            "../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/facade/visual_database_facade.cpp",
            "../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/matchers/hough_similarity_voting.cpp",
            "../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/matchers/freak.cpp",
            "../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/framework/date_time.cpp",
            "../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/framework/image.cpp",
            "../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/framework/logger.cpp",
            "../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher/framework/timers.cpp",
        ],
        include_dirs=include_dirs,
        libraries=libraries,
        library_dirs=library_dirs,
        language='c++',
        extra_compile_args=extra_compile_args
    ),
]

setup(
    name='jsartoolkitNFT',
    author='@kalwalt',
    description='This is a Python binding project for jsartoolkitNFT, which integrates WebARKitLib with Python using pybind11. It allows for augmented reality applications to be developed in Python by providing bindings to the underlying C/C++ WebARKitLib library.',
    ext_modules=ext_modules,
    cmdclass={'build_ext': build_ext},
    zip_safe=False,
    python_requires=">=3.7",
)