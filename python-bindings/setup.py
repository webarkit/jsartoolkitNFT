from glob import glob
from setuptools import setup, Extension
import pybind11
from pybind11.setup_helpers import Pybind11Extension, build_ext

# Sort the list of files
sorted_ar_files=sorted(glob('../emscripten/WebARKitLib/lib/SRC/AR/*.c'))
sorted_ar2_files=sorted(glob('../emscripten/WebARKitLib/lib/SRC/AR2/*.c'))
sorted_arutil_files=sorted(glob('../emscripten/WebARKitLib/lib/SRC/ARUtil/*.c'))
sorted_arLabeling_files = sorted(glob('../emscripten/WebARKitLib/lib/SRC/AR/arLabelingSub/*.c'))
sorted_aricp_files = sorted(glob('../emscripten/WebARKitLib/lib/SRC/ARICP/*.c'))

ext_modules = [
    Extension(
        'jsartoolkitNFT',
        sources=sorted_ar_files+sorted_ar2_files+sorted_arutil_files+sorted_arLabeling_files+sorted_aricp_files+[
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
            'deps',
            '../emscripten', 
            '../emscripten/WebARKitLib/include',
            '../emscripten/WebARKitLib/lib/SRC/KPM/FreakMatcher'
        ],
        libraries=['jpeg','z'],
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
