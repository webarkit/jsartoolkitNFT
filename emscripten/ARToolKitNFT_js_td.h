#include "trackingSub.h"
#include <stdio.h>
#include <AR/ar.h>
#include <emscripten.h>
#include <emscripten/val.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <memory> // Added for std::unique_ptr
#include <limits>
#include <AR/config.h>
#include <AR2/tracking.h>
#include <AR/arFilterTransMat.h>
#include <AR/paramGL.h>
#include <KPM/kpm.h>
#include <WebARKit/WebARKitLog.h>
#include <WebARKitVideoLuma.h>
#include "markerDecompress.h"
#include "NFTMarkerState.h"
#include <array>

const int PAGES_MAX = 20; // Maximum number of pages expected. You can change this down (to save memory) or up (to accomodate more pages.)
static_assert(PAGES_MAX == TRACKING_INIT_MAX_RESULTS,
              "the detection worker must be able to report every page");

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

// Add a zeros array for pose initialization
static std::array<float, 12> zeros = {}; // Zero-initialized array

std::unordered_map<int, ARParam> cameraParams;

class ARToolKitNFT
{
public:
    ARToolKitNFT();
    ARToolKitNFT(bool withFiltering);
    ~ARToolKitNFT(); 
    int passVideoData(uintptr_t videoFrame, uintptr_t videoLuma, bool internalLuma);
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
    void setContinuousDetection(bool enabled);
    void setDetectionInterval(double ms);

private:
    bool withFiltering; // New property

    // Filtering-related variables
    double filterCutoffFrequency;
    double filterSampleRate;

    std::unique_ptr<KpmHandle, void(*)(KpmHandle*)> createKpmHandle(ARParamLT *cparamLT);
    THREAD_HANDLE_T *trackingInit(KpmHandle *kpmHandle);
    void deleteHandle();

    int id;

    ARParam param;
    ARParamLT *paramLT;

    // Update to use std::unique_ptr for memory management
    std::unique_ptr<ARUint8[]> videoFrame;
    int videoFrameSize;
    std::unique_ptr<ARUint8[]> videoLuma;

    int width;
    int height;

    ARHandle *arhandle;
    AR3DHandle *ar3DHandle;

    // Use unique_ptr with custom deleter for KpmHandle
    std::unique_ptr<KpmHandle, void(*)(KpmHandle*)> kpmHandle;
    AR2HandleT *ar2Handle;

    THREAD_HANDLE_T *threadHandle;

    // One state per loadable page; index = page number = marker id.
    std::array<NFTMarkerState, PAGES_MAX> markerStates;

    // True between trackingInitStart() and collecting its results.
    bool kpmSearchRunning;

    // Detection policy, applied to starting a worker search (collecting a
    // finished one is never throttled). A search starts on any frame while no
    // marker is tracked. While some are tracked and some are not, one starts at
    // most once every detectionIntervalMs, counted from when the previous search
    // finished, and none if continuousDetection is off. The search already runs off the main thread, so the default
    // interval is 0: start whenever the worker is free.
    bool continuousDetection = true;
    double detectionIntervalMs = 0.0;
    // When the last search finished; -infinity so the first search is never throttled.
    double lastKpmEndMs = -std::numeric_limits<double>::infinity();

    bool allMarkersTracked() const;
    bool anyMarkerTracked() const;
    void trackMarkers();

    int surfaceSetCount;
    AR2SurfaceSetT *surfaceSet[PAGES_MAX];
    // KPM reference data of every marker loaded so far, across all
    // addNFTMarkers() calls. kpmSetRefDataSet() rebuilds the matcher from
    // scratch, so each call must hand it the whole set, not just the new batch.
    KpmRefDataSet *refDataSetAll = nullptr;
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