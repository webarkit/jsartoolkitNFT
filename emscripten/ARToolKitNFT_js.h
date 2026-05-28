#include <stdio.h>
#include <AR/ar.h>
#include <emscripten.h>
#include <emscripten/val.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <memory>
#include <AR/config.h>
#include <AR2/tracking.h>
#include <AR/arFilterTransMat.h>
#include <AR/paramGL.h>
#include <KPM/kpm.h>
#include <WebARKit/WebARKitLog.h>
#include <WebARKitVideoLuma.h>
#include "trackingMod.h"
#include "markerDecompress.h"

const int PAGES_MAX = 20; // Maximum number of pages expected. You can change this down (to save memory) or up (to accomodate more pages.)

struct nftMarker
{
    int id_NFT;
    int width_NFT;
    int height_NFT;
    int dpi_NFT;
};

static int gARControllerID = 0;
static int gCameraID = 0;

static int MARKER_INDEX_OUT_OF_BOUNDS = -3;

std::unordered_map<int, ARParam> cameraParams;

// Static array of zeros for initializing poses when markers aren't found
static const std::array<int, 12> zeros = {0};

class ARToolKitNFT
{
public:
    ARToolKitNFT();
    ARToolKitNFT(bool withFiltering);
    ~ARToolKitNFT(); 
    int passVideoData(emscripten::val videoFrame, emscripten::val videoLuma, bool internalLuma);
    emscripten::val getNFTMarkerInfo(int markerIndex);
    int detectNFTMarker();
    int getKpmImageWidth(KpmHandle *kpmHandle);
    int getKpmImageHeight(KpmHandle *kpmHandle);
    int setupAR2();
    nftMarker getNFTData(int index);

    void setLogLevel(int level);
    int getLogLevel();

    int teardown();
    int loadCamera(std::string cparam_name);
    int setCamera(int id, int cameraID);
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

private:
    bool withFiltering; // New property

    // Filtering-related variables
    ARFilterTransMatInfo *ftmi;
    double filterCutoffFrequency;
    double filterSampleRate;

    std::unique_ptr<KpmHandle, void(*)(KpmHandle*)> createKpmHandle(ARParamLT *cparamLT);
    void deleteHandle();

    int id;

    ARParam param;
    ARParamLT *paramLT;

    std::unique_ptr<ARUint8[]> videoFrame;  // Changed from std::shared_ptr
    int videoFrameSize;
    std::unique_ptr<ARUint8[]> videoLuma;   // Changed from std::shared_ptr

    int width;
    int height;

    ARHandle *arhandle;
    AR3DHandle *ar3DHandle;

    std::unique_ptr<KpmHandle, void(*)(KpmHandle*)> kpmHandle;  // Changed from std::shared_ptr
    AR2HandleT *ar2Handle;

    int detectedPage;

    int surfaceSetCount;
    AR2SurfaceSetT *surfaceSet[PAGES_MAX];
    std::unordered_map<int, AR2SurfaceSetT *> surfaceSets;
    // nftMarker struct inside arController
    nftMarker nft;
    std::vector<nftMarker> nftMarkers;

    ARdouble nearPlane;
    ARdouble farPlane;

    int patt_id;

    ARdouble cameraLens[16];
    AR_PIXEL_FORMAT pixFormat = AR_PIXEL_FORMAT_RGBA;
};