from glob import glob
from setuptools import setup, Extension
from pybind11.setup_helpers import Pybind11Extension, build_ext
import pybind11
import os
import shutil
import subprocess

LIBJPEG_VERSION = '9c'
LIBJPEG_URL = f'http://www.ijg.org/files/jpegsrc.v{LIBJPEG_VERSION}.tar.gz'
LIBJPEG_DIR = 'deps/libjpeg'
CONFIG_H_IN = os.path.join(os.path.dirname(__file__), '../emscripten/WebARKitLib/include/AR/config.h.in')
CONFIG_H = os.path.join(os.path.dirname(__file__), '../emscripten/WebARKitLib/include/AR/config.h')

def download_and_extract(url, dest):
    subprocess.run(['curl', '-L', url, '-o', 'libjpeg.tar.gz'], check=True)
    subprocess.run(['tar', 'xzf', 'libjpeg.tar.gz'], check=True)
    shutil.move(f'jpeg-{LIBJPEG_VERSION}', dest)
    os.remove('libjpeg.tar.gz')

def build_libjpeg():
    build_dir = os.path.join(LIBJPEG_DIR, 'build')
    os.makedirs(build_dir, exist_ok=True)
    subprocess.run(['./configure', '--prefix=' + build_dir], cwd=LIBJPEG_DIR, check=True)
    subprocess.run(['make'], cwd=LIBJPEG_DIR, check=True)
    subprocess.run(['make', 'install'], cwd=LIBJPEG_DIR, check=True)

def generate_config_h():
    with open(CONFIG_H_IN, 'r') as file:
        config_h_content = file.read()
    
    config_h_content = config_h_content.replace('#undef  ARVIDEO_INPUT_DEFAULT_DUMMY', '#define  ARVIDEO_INPUT_DEFAULT_DUMMY')
    
    with open(CONFIG_H, 'w') as file:
        file.write(config_h_content)

# Check if the libjpeg directory exists, if not, download and extract it
if not os.path.exists(LIBJPEG_DIR):
    download_and_extract(LIBJPEG_URL, LIBJPEG_DIR)

# Build libjpeg
build_libjpeg()

# Generate config.h from config.h.in
generate_config_h()

# Sort the list of files
sorted_ar_files = sorted(glob('../emscripten/WebARKitLib/lib/SRC/AR/*.c'))
sorted_ar2_files = sorted(glob('../emscripten/WebARKitLib/lib/SRC/AR2/*.c'))
sorted_arutil_files = sorted(glob('../emscripten/WebARKitLib/lib/SRC/ARUtil/*.c'))
sorted_arLabeling_files = sorted(glob('../emscripten/WebARKitLib/lib/SRC/AR/arLabelingSub/*.c'))
sorted_aricp_files = sorted(glob('../emscripten/WebARKitLib/lib/SRC/ARICP/*.c'))

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
        include_dirs=[
            pybind11.get_include(),
            os.path.join(LIBJPEG_DIR, 'build', 'include'),  # Include the built libjpeg headers
            '../emscripten',
            '../emscripten/WebARKitLib/include',
            '../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher'
        ],
        libraries=['jpeg', 'z', 'm'],
        library_dirs=[os.path.join(LIBJPEG_DIR, 'build', 'lib')],  # Link against the built libjpeg library
        define_macros=[('AR_DEFAULT_PIXEL_FORMAT', 'AR_PIXEL_FORMAT_RGBA')],  # Define the required macro
        language='c++'
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
