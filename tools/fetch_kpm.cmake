# CMake script to fetch KPM-extended library
# Usage: cmake -P tools/fetch_kpm.cmake

cmake_minimum_required(VERSION 3.10)

# Path to the KPM-extended repository from environment variable
if(NOT DEFINED ENV{KPM_EXTENDED_ROOT})
    message(FATAL_ERROR "The KPM_EXTENDED_ROOT environment variable is not set. "
                        "Please set it to the root directory of your KPM-extended repository.")
endif()
set(KPM_SRC_DIR "$ENV{KPM_EXTENDED_ROOT}")
message(STATUS "Using KPM-extended from: ${KPM_SRC_DIR}")

# Destination build directory (relative to this script: ../build)
get_filename_component(TOOLS_DIR "${CMAKE_SCRIPT_MODE_FILE}" DIRECTORY)
set(BUILD_DIR "${TOOLS_DIR}/../build")

if(NOT EXISTS "${BUILD_DIR}")
    file(MAKE_DIRECTORY "${BUILD_DIR}")
endif()

message(STATUS "Fetching KPM-extended library...")
message(STATUS "Source: ${KPM_SRC_DIR}/dist/libkpm_extended.a")
message(STATUS "Destination: ${BUILD_DIR}/libkpm_extended.a")

if(EXISTS "${KPM_SRC_DIR}/dist/libkpm_extended.a")
    file(COPY "${KPM_SRC_DIR}/dist/libkpm_extended.a" DESTINATION "${BUILD_DIR}")
    message(STATUS "Success: Library copied.")
else()
    message(FATAL_ERROR "Error: libkpm_extended.a not found in ${KPM_SRC_DIR}/dist/. Please build KPM-extended first.")
endif()
