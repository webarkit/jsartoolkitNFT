#include <AR/ar.h>
#include <emscripten.h>
#include <emscripten/val.h>
#include <array>
#include <string>
#include <vector>
#include <WebARKit/WebARKitLog.h>
#include <WebARKitVideoLuma.h>
#include <WebARKitTrackers/WebARKitNFT/ARToolKitNFTCore.h>

static int MARKER_INDEX_OUT_OF_BOUNDS = -3;

// Static array of zeros for initializing poses when markers aren't found
static const std::array<int, 12> zeros = {0};

/**
 * The single-thread Embind binding: an adapter over ARToolKitNFTCore with the
 * single-thread preset. The core does the NFT work; the adapter keeps what is JS
 * (emscripten::val results, heap pointers, the internal SIMD luma) and the
 * ARHandle part (arhandle, ar3DHandle and their threshold, debug and image
 * processing methods), which NFT does not use.
 */
class ARToolKitNFT
{
public:
    ARToolKitNFT();
    ARToolKitNFT(bool withFiltering);
    ~ARToolKitNFT();
    int passVideoData(uintptr_t videoFrame, uintptr_t videoLuma, bool internalLuma);
    emscripten::val getNFTMarkerInfo(int markerIndex);
    int detectNFTMarker();
    int setupAR2();
    nftMarker getNFTData(int index);

    void setLogLevel(int level);
    int getLogLevel();

    int teardown();
    int loadCamera(std::string cparam_name);
    emscripten::val getCameraLens();
    int decompressZFT(std::string datasetPathname, std::string tempPathname);
    std::vector<int> addNFTMarkers(std::vector<std::string> &datasetPathnames);

    // setters and getters
    void setProjectionNearPlane(const ARdouble projectionNearPlane);
    ARdouble getProjectionNearPlane();
    void setProjectionFarPlane(const ARdouble projectionFarPlane);
    ARdouble getProjectionFarPlane();
    void recalculateCameraLens();
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

    // The frame size given to setup(), for the internal luma conversion.
    int width;
    int height;

    ARHandle *arhandle;
    AR3DHandle *ar3DHandle;
    AR_PIXEL_FORMAT pixFormat = AR_PIXEL_FORMAT_RGBA;
};
