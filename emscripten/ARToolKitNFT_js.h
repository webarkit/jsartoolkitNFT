#include <stdio.h>
#include <AR/ar.h>
#include <emscripten.h>
#include <emscripten/val.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <AR/config.h>
#include <AR2/tracking.h>
#include <AR/arFilterTransMat.h>
#include <AR/paramGL.h>
#include <KPM/kpm.h>
#include <WebARKit/WebARKitLog.h>
#include "trackingMod.h"

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

class ARToolKitNFT
{
public:
    ARToolKitNFT()
    {
        webarkitLOGi("init ARToolKitNFT constructor...");
    };
    //~ARToolKitNFT(); 
    int passVideoData(emscripten::val videoFrame, emscripten::val videoLuma);
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
    std::vector<int> addNFTMarkers(std::vector<std::string> &datasetPathnames);
    int detectMarker();

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

private:
    KpmHandle *createKpmHandle(ARParamLT *cparamLT);
    void deleteHandle();
   

    int id;

    ARParam param;
    ARParamLT *paramLT = NULL;

    ARUint8 *videoFrame = NULL;
    int videoFrameSize;
    ARUint8 *videoLuma = NULL;

    int width = 0;
    int height = 0;

    ARHandle *arhandle = NULL;
    AR3DHandle *ar3DHandle;

    KpmHandle *kpmHandle;
    AR2HandleT *ar2Handle;

#if WITH_FILTERING
    ARFilterTransMatInfo *ftmi;
    ARdouble filterCutoffFrequency = 60.0;
    ARdouble filterSampleRate = 120.0;
#endif

    int detectedPage = -2; // -2 Tracking not inited, -1 tracking inited OK, >= 0 tracking online on page.

    int surfaceSetCount = 0; // Running NFT marker id
    AR2SurfaceSetT *surfaceSet[PAGES_MAX];
    std::unordered_map<int, AR2SurfaceSetT *> surfaceSets;
    // nftMarker struct inside arController
    nftMarker nft;
    std::vector<nftMarker> nftMarkers;

    ARdouble nearPlane = 0.0001;
    ARdouble farPlane = 1000.0;

    int patt_id = 0; // Running pattern marker id

    ARdouble cameraLens[16];
    AR_PIXEL_FORMAT pixFormat = AR_PIXEL_FORMAT_RGBA;
};