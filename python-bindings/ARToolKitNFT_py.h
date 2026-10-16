#include <stdio.h>
#include <AR/ar.h>
#include <pybind11/pybind11.h>
#include <pybind11/numpy.h>
#include <pybind11/stl.h>
#include <pybind11/stl_bind.h>
#include <string>
#include <vector>
#include <WebARKitLog.h>
#include <WebARKitTrackers/WebARKitNFT/ARToolKitNFTCore.h>

namespace py = pybind11;
using namespace pybind11::literals;

static int MARKER_INDEX_OUT_OF_BOUNDS = -3;

/**
 * The Python binding: an adapter over ARToolKitNFTCore with the single-thread preset,
 * as the single-thread JS binding is (emscripten/ARToolKitNFT_js.h). The core does the
 * NFT work: camera, markers, frame buffers, per-marker state, KPM detection and AR2
 * tracking. The adapter converts between numpy arrays and Python dicts and the core's
 * types, and keeps the ARHandle part (arhandle, ar3DHandle and their threshold, debug
 * and image processing methods), which NFT does not use.
 */
class ARToolKitNFT
{
public:
    explicit ARToolKitNFT(bool withFiltering = false);
    ~ARToolKitNFT();
    // c_style: pybind11 hands over a C-contiguous buffer, copying a strided view
    // (a crop, a flip) first; the core copies the frame as width*height bytes.
    using Frame = py::array_t<uint8_t, py::array::c_style | py::array::forcecast>;
    int passVideoData(Frame videoFrame, Frame videoLuma);
    py::dict getNFTMarkerInfo(int markerIndex);

    int detectNFTMarker();
    int setupAR2();
    nftMarker getNFTData(int index);

    void setLogLevel(int level);
    int getLogLevel();

    int teardown();
    int loadCamera(std::string cparam_name);
    py::array_t<double> getCameraLens();
    std::vector<int> addNFTMarkers(std::vector<std::string> &datasetPathnames);

    // setters and getters
    void setProjectionNearPlane(const ARdouble projectionNearPlane);
    ARdouble getProjectionNearPlane();
    void setProjectionFarPlane(const ARdouble projectionFarPlane);
    ARdouble getProjectionFarPlane();
    void setThreshold(int threshold);
    int getThreshold();
    void setThresholdMode(int mode);
    int getThresholdMode();
    int setDebugMode(int enable);
    int getProcessingImage();
    int getDebugMode();
    void setImageProcMode(int mode);
    int getImageProcMode();
    int setup(int width, int height, int cameraID);
    void setFiltering(bool enableFiltering);
    void setContinuousDetection(bool enabled);
    void setDetectionInterval(double ms);

private:
    // arhandle keeps a pointer to the core's paramLT, so it is deleted before the
    // core frees paramLT (setup(), teardown()) and created again from the new one.
    void deleteARHandles();
    // @return 0, or -1 when either handle cannot be created
    int createARHandles();

    ARToolKitNFTCore core;

    // The frame size given to setup(), for the size checks in passVideoData().
    int width;
    int height;

    ARHandle *arhandle;
    AR3DHandle *ar3DHandle;
    AR_PIXEL_FORMAT pixFormat = AR_PIXEL_FORMAT_RGBA;
};
