#include "ARToolKitNFT_js.h"

ARToolKitNFT::ARToolKitNFT()
    : id(0), paramLT(nullptr), videoFrame(nullptr), videoFrameSize(0),
      videoLuma(nullptr), width(0), height(0),
      detectedPage(-2),   // -2 Tracking not inited, -1 tracking inited OK, >= 0
                          // tracking online on page.
      surfaceSetCount(0), // Running NFT marker id
      arhandle(nullptr), ar3DHandle(nullptr), 
      kpmHandle(nullptr, [](KpmHandle*){/* empty deleter */}), // Fix: proper nullptr with deleter
      ar2Handle(nullptr),
#if WITH_FILTERING
      ftmi(nullptr), filterCutoffFrequency(60.0), filterSampleRate(120.0),
#endif
      nearPlane(0.0001), farPlane(1000.0),
      patt_id(0) // Running pattern marker id
{
  webarkitLOGi("init ARToolKitNFT constructor...");
}

ARToolKitNFT::~ARToolKitNFT() {
  teardown();
}

void matrixLerp(ARdouble src[3][4], ARdouble dst[3][4],
                float interpolationFactor) {
  for (auto i = 0; i < 3; i++) {
    for (auto j = 0; j < 4; j++) {
      dst[i][j] = dst[i][j] + (src[i][j] - dst[i][j]) * interpolationFactor;
    }
  }
}

int ARToolKitNFT::passVideoData(emscripten::val videoFrame,
                                emscripten::val videoLuma, bool internalLuma) {
  auto vf = emscripten::convertJSArrayToNumberVector<uint8_t>(videoFrame);
  auto vl = emscripten::convertJSArrayToNumberVector<uint8_t>(videoLuma);

  if (internalLuma) {
    auto vli = webarkit::webarkitVideoLumaInit(this->width, this->height, true);
    if (!vli) {
      webarkitLOGe("Failed to initialize WebARKitLumaInfo.");
      return -1;
    }

    auto out = webarkit::webarkitVideoLuma(vli, vf.data());
    if (!out) {
      webarkitLOGe("Failed to process video luma.");
      webarkit::webarkitVideoLumaFinal(&vli);
      return -1;
    }
    if (this->videoLuma) {
      webarkitLOGd("Copy videoLuma with simd !");
      std::copy(out, out + this->width * this->height, this->videoLuma.get());
      webarkit::webarkitVideoLumaFinal(&vli);
    }
  }

  // Copy data instead of just assigning pointers
  if (this->videoFrame) {
    std::copy(vf.begin(), vf.end(), this->videoFrame.get());
  }

  if (this->videoLuma) {
    if (!internalLuma) {
      webarkitLOGd("Inside videoLuma no simd !");
      std::copy(vl.begin(), vl.end(), this->videoLuma.get());
    }
  }
  return 0;
}

emscripten::val ARToolKitNFT::getNFTMarkerInfo(int markerIndex) {
  auto NFTMarkerInfo = emscripten::val::object();
  auto pose = emscripten::val::array();

  if (this->surfaceSetCount <= markerIndex) {
    return emscripten::val(MARKER_INDEX_OUT_OF_BOUNDS);
  }

  float trans[3][4];

#if WITH_FILTERING
  ARdouble transF[3][4];
  ARdouble transFLerp[3][4];
  memset(transFLerp, 0, 3 * 4 * sizeof(ARdouble));
#endif

  float err = -1;
  if (this->detectedPage == markerIndex) {

    int trackResult =
        ar2TrackingMod(this->ar2Handle, this->surfaceSet[this->detectedPage],
                       this->videoFrame.get(), trans, &err);

#if WITH_FILTERING
    std::copy(&trans[0][0], &trans[0][0] + 3 * 4, &transF[0][0]);

    bool reset;
    if (trackResult < 0) {
      reset = 1;
    } else {
      reset = 0;
    }

    if (arFilterTransMat(this->ftmi, transF, reset) < 0) {
      webarkitLOGe("arFilterTransMat error with marker %d.", markerIndex);
    }

    matrixLerp(transF, transFLerp, 0.95);
#endif

    if (trackResult < 0) {
      webarkitLOGi("Tracking lost. %d", trackResult);
      this->detectedPage = -2;
    } else {
      ARLOGi("Tracked page %d (max %d).\n",
             this->surfaceSet[this->detectedPage], this->surfaceSetCount - 1);
    }
  }

  if (this->detectedPage == markerIndex) {
    NFTMarkerInfo.set("id", markerIndex);
    NFTMarkerInfo.set("error", err);
    NFTMarkerInfo.set("found", 1);
#if WITH_FILTERING
    for (auto x = 0; x < 3; x++) {
      for (auto y = 0; y < 4; y++) {
        pose.call<void>("push", transFLerp[x][y]);
      }
    }
#else
    for (auto x = 0; x < 3; x++) {
      for (auto y = 0; y < 4; y++) {
        pose.call<void>("push", trans[x][y]);
      }
    }
#endif
    NFTMarkerInfo.set("pose", pose);
  } else {
    NFTMarkerInfo.set("id", markerIndex);
    NFTMarkerInfo.set("error", -1);
    NFTMarkerInfo.set("found", 0);
    NFTMarkerInfo.set("pose", emscripten::val(emscripten::typed_memory_view(12, zeros.data())));
  }

  return NFTMarkerInfo;
}

int ARToolKitNFT::detectNFTMarker() {

  KpmResult* kpmResult = nullptr;
  int kpmResultNum = -1;

  if (this->detectedPage == -2) {
    kpmMatching(this->kpmHandle.get(), this->videoLuma.get());
    kpmGetResult(this->kpmHandle.get(), &kpmResult, &kpmResultNum);

#if WITH_FILTERING
    this->ftmi = arFilterTransMatInit(this->filterSampleRate,
                                      this->filterCutoffFrequency);
#endif

    for (auto i = 0; i < kpmResultNum; i++) {
      if (kpmResult[i].camPoseF == 0) {

        float trans[3][4];
        this->detectedPage = kpmResult[i].pageNo;
        std::copy(&kpmResult[i].camPose[0][0], &kpmResult[i].camPose[0][0] + 3 * 4, &trans[0][0]);
        ar2SetInitTrans(this->surfaceSet[this->detectedPage], trans);
      }
    }
  }
  return kpmResultNum;
}

std::unique_ptr<KpmHandle, void(*)(KpmHandle*)> ARToolKitNFT::createKpmHandle(ARParamLT *cparamLT) {
  KpmHandle* handle = kpmCreateHandle(cparamLT);
  if (!handle) {
    webarkitLOGe("Error: kpmCreateHandle returned NULL.");
    // Return empty unique_ptr with proper deleter type
    return std::unique_ptr<KpmHandle, void(*)(KpmHandle*)>(nullptr, [](KpmHandle* p) {
      if (p) kpmDeleteHandle(&p);
    });
  }
  return std::unique_ptr<KpmHandle, void(*)(KpmHandle*)>(handle, [](KpmHandle* p) { 
    if (p) kpmDeleteHandle(&p); 
  });
}

int ARToolKitNFT::getKpmImageWidth(KpmHandle *kpmHandle) {
  return kpmHandleGetXSize(kpmHandle);
}

int ARToolKitNFT::getKpmImageHeight(KpmHandle *kpmHandle) {
  return kpmHandleGetYSize(kpmHandle);
}

int ARToolKitNFT::setupAR2() {
  AR2HandleT* tempHandle = ar2CreateHandleMod(this->paramLT, this->pixFormat);
  if (tempHandle == nullptr) {
    webarkitLOGe("Error: ar2CreateHandle.");
    return -1;  // Return error code if handle creation failed
  }
  
  // Store the handle
  this->ar2Handle = tempHandle;
  
  // Settings for devices with single-core CPUs.
  ar2SetTrackingThresh(this->ar2Handle, 5.0);
  ar2SetSimThresh(this->ar2Handle, 0.50);
  ar2SetSearchFeatureNum(this->ar2Handle, 16);
  ar2SetSearchSize(this->ar2Handle, 6);
  ar2SetTemplateSize1(this->ar2Handle, 6);
  ar2SetTemplateSize2(this->ar2Handle, 6);

  // Create KPM handle
  this->kpmHandle = createKpmHandle(this->paramLT);
  if (!this->kpmHandle) {
    webarkitLOGe("Error creating KPM handle");
    return -1;
  }

  return 0;  // Success
}

nftMarker ARToolKitNFT::getNFTData(int index) {
  // get marker(s) nft data.
  return this->nftMarkers.at(index);
}

/***********
 * Teardown *
 ***********/

void ARToolKitNFT::deleteHandle() {
  if (this->arhandle != nullptr) {
    if (arPattDetach(this->arhandle) != 0) {
      webarkitLOGe("Error detaching pattern from arhandle.");
    }
    arDeleteHandle(this->arhandle);
    this->arhandle = nullptr;
  }
  if (this->ar3DHandle != nullptr) {
    ar3DDeleteHandle(&(this->ar3DHandle));
    this->ar3DHandle = nullptr;
  }
  if (this->paramLT != nullptr) {
    arParamLTFree(&(this->paramLT));
    this->paramLT = nullptr;
  }
}

int ARToolKitNFT::teardown() {

  // Reset unique pointers instead of freeing memory
  this->videoFrame.reset();
  this->videoLuma.reset();
  this->videoFrameSize = 0;

  deleteHandle();

  return 0;
}

int ARToolKitNFT::setCamera(int id, int cameraID) {

  if (cameraParams.find(cameraID) == cameraParams.end()) {
    return -1;
  }

  this->param = cameraParams[cameraID];

  if (this->param.xsize != this->width || this->param.ysize != this->height) {
    ARLOGw("*** Camera Parameter resized from %d, %d. ***\n", this->param.xsize,
           this->param.ysize);
    arParamChangeSize(&(this->param), this->width, this->height,
                      &(this->param));
  }

  ARLOGi("*** Camera Parameter ***\n");
  arParamDisp(&(this->param));

  deleteHandle();
  if (this->paramLT != nullptr) {
    deleteHandle();
  }

  this->paramLT = arParamLTCreate(&(this->param), AR_PARAM_LT_DEFAULT_OFFSET);
  if (!this->paramLT) {
    webarkitLOGe("setCamera(): Error: arParamLTCreate for cameraID %d.", cameraID);
    return -1;
  }

  ARLOGi("setCamera(): arParamLTCreated\n..%d, %d\n", (this->paramLT->param).xsize, (this->paramLT->param).ysize);

  // setup camera
  if ((this->arhandle = arCreateHandle(this->paramLT)) == nullptr) {
    webarkitLOGe("setCamera(): Error: arCreateHandle.");
    return -1;
  }
// AR_DEFAULT_PIXEL_FORMAT
  int set = arSetPixelFormat(this->arhandle, this->pixFormat);

  this->ar3DHandle = ar3DCreateHandle(&(this->param));
  if (this->ar3DHandle == nullptr) {
    webarkitLOGe("setCamera(): Error creating 3D handle");
    return -1;
  }

  arglCameraFrustumRH(&((this->paramLT)->param), this->nearPlane,
                      this->farPlane, this->cameraLens);

  return 0;
}

int ARToolKitNFT::loadCamera(std::string cparam_name) {
  ARParam param;
  if (arParamLoad(cparam_name.c_str(), 1, &param) < 0) {
    webarkitLOGe("loadCamera(): Error loading parameter file %s for camera.",
                 cparam_name.c_str());
    return -1;
  }
  int cameraID = gCameraID++;
  cameraParams[cameraID] = param;

  return cameraID;
}

emscripten::val ARToolKitNFT::getCameraLens() {
  emscripten::val lens = emscripten::val::array();
  for (const auto& value : this->cameraLens) {
    lens.call<void>("push", value);
  }
  return lens;
}

int ARToolKitNFT::decompressZFT(std::string datasetPathname, std::string tempPathname){
  int response = decompressMarkers(datasetPathname.c_str(), tempPathname.c_str());

  return 1;
}

/*****************
 * Marker loading *
 *****************/

std::vector<int>
ARToolKitNFT::addNFTMarkers(std::vector<std::string> &datasetPathnames) {
  
  KpmRefDataSet *refDataSet;
  refDataSet = NULL;

  if (datasetPathnames.size() >= PAGES_MAX) {
    webarkitLOGe("Error: exceeded maximum pages.");
    return {};
  }

  std::vector<int> markerIds = {};

  for (size_t i = 0; i < datasetPathnames.size(); i++) {
    webarkitLOGi("datasetPathnames size: %i", datasetPathnames.size());
    webarkitLOGi("add NFT marker-> '%s'", datasetPathnames[i].c_str());

    const char *datasetPathname = datasetPathnames[i].c_str();
    int pageNo = i;
    markerIds.push_back(i);

    // Load KPM data.
    KpmRefDataSet *refDataSet2;
    webarkitLOGi("Reading %s.fset3", datasetPathname);
    if (kpmLoadRefDataSet(datasetPathname, "fset3", &refDataSet2) < 0) {
      webarkitLOGe("Error reading KPM data from %s.fset3", datasetPathname);
      return {};
    }
    webarkitLOGi("Assigned page no. %d.", pageNo);
    if (kpmChangePageNoOfRefDataSet(refDataSet2, KpmChangePageNoAllPages,
                                    pageNo) < 0) {
      webarkitLOGe("Error: kpmChangePageNoOfRefDataSet");
      return {};
    }
    if (kpmMergeRefDataSet(&refDataSet, &refDataSet2) < 0) {
      webarkitLOGe("Error: kpmMergeRefDataSet");
      return {};
    }
    webarkitLOGi("Done.");

    // Load AR2 data.
    webarkitLOGi("Reading %s.fset", datasetPathname);

    if ((this->surfaceSet[i] = ar2ReadSurfaceSet(datasetPathname, "fset", nullptr)) == nullptr) {
      webarkitLOGe("Error reading data from %s.fset", datasetPathname);
      // Cleanup previously allocated resources
      for (size_t j = 0; j < i; j++) {
        ar2FreeSurfaceSet(&this->surfaceSet[j]);
      }
      return {};
    }

    auto surfaceSetCount = this->surfaceSetCount;
    auto numIset = this->surfaceSet[i]->surface[0].imageSet->num;
    this->nft.width_NFT =
        this->surfaceSet[i]->surface[0].imageSet->scale[0]->xsize;
    this->nft.height_NFT =
        this->surfaceSet[i]->surface[0].imageSet->scale[0]->ysize;
    this->nft.dpi_NFT = this->surfaceSet[i]->surface[0].imageSet->scale[0]->dpi;

    webarkitLOGi("NFT num. of ImageSet: %i", numIset);
    webarkitLOGi("NFT marker width: %i", this->nft.width_NFT);
    webarkitLOGi("NFT marker height: %i", this->nft.height_NFT);
    webarkitLOGi("NFT marker dpi: %i", this->nft.dpi_NFT);

    this->nft.id_NFT = i;
    this->nft.width_NFT = this->nft.width_NFT;
    this->nft.height_NFT = this->nft.height_NFT;
    this->nft.dpi_NFT = this->nft.dpi_NFT;
    this->nftMarkers.push_back(this->nft);

    webarkitLOGi("Done.");
    surfaceSetCount++;
  }

  if (kpmSetRefDataSet(this->kpmHandle.get(), refDataSet) < 0) {
    webarkitLOGe("Error: kpmSetRefDataSet");
    return {};
  }
  kpmDeleteRefDataSet(&refDataSet);

  webarkitLOGi("Loading of NFT data complete.");

  this->surfaceSetCount += markerIds.size();

  return markerIds;
}

/**********************
 * Setters and getters *
 **********************/

/***************
 * Set Log Level
 ****************/
void ARToolKitNFT::setLogLevel(int level) { arLogLevel = level; }

int ARToolKitNFT::getLogLevel() { return arLogLevel; }

void ARToolKitNFT::setProjectionNearPlane(const ARdouble projectionNearPlane) {
  this->nearPlane = projectionNearPlane;
}

ARdouble ARToolKitNFT::getProjectionNearPlane() { return this->nearPlane; }

void ARToolKitNFT::setProjectionFarPlane(const ARdouble projectionFarPlane) {
  this->farPlane = projectionFarPlane;
}

ARdouble ARToolKitNFT::getProjectionFarPlane() { return this->farPlane; }

void ARToolKitNFT::setThreshold(int threshold) {
  if (threshold < 0 || threshold > 255)
    return;
  if (arSetLabelingThresh(this->arhandle, threshold) == 0) {
    webarkitLOGi("Threshold set to %d", threshold);
  };
  // default 100
  // arSetLabelingThreshMode
  // AR_LABELING_THRESH_MODE_MANUAL, AR_LABELING_THRESH_MODE_AUTO_MEDIAN,
  // AR_LABELING_THRESH_MODE_AUTO_OTSU, AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE
}

int ARToolKitNFT::getThreshold() {
  int threshold;
  if (arGetLabelingThresh(this->arhandle, &threshold) == 0) {
    return threshold;
  };

  return -1;
}

void ARToolKitNFT::setThresholdMode(int mode) {
  AR_LABELING_THRESH_MODE thresholdMode = (AR_LABELING_THRESH_MODE)mode;

  if (arSetLabelingThreshMode(this->arhandle, thresholdMode) == 0) {
    webarkitLOGi("Threshold mode set to %d", (int)thresholdMode);
  }
}

int ARToolKitNFT::getThresholdMode() {
  AR_LABELING_THRESH_MODE thresholdMode;

  if (arGetLabelingThreshMode(this->arhandle, &thresholdMode) == 0) {
    return thresholdMode;
  }

  return -1;
}

int ARToolKitNFT::setDebugMode(int enable) {
    arSetDebugMode(this->arhandle, enable ? AR_DEBUG_ENABLE : AR_DEBUG_DISABLE);
  webarkitLOGi("Debug mode set to %s", enable ? "on." : "off.");

  return enable;
}

int ARToolKitNFT::getProcessingImage() {

  if (this->arhandle != nullptr) {
    return reinterpret_cast<int>(this->arhandle->labelInfo.bwImage);
  } else {
    webarkitLOGe("Error: arhandle is null.");
    return -1;
  }
}

int ARToolKitNFT::getDebugMode() {
  int enable;
  
  arGetDebugMode(this->arhandle, &enable);
  return enable;
}

void ARToolKitNFT::setImageProcMode(int mode) {

  int imageProcMode = mode;
  if (arSetImageProcMode(this->arhandle, mode) == 0) {
    webarkitLOGi("Image proc. mode set to %d.", imageProcMode);
  }
}

int ARToolKitNFT::getImageProcMode() {
  int imageProcMode;
  if (arGetImageProcMode(this->arhandle, &imageProcMode) == 0) {
    return imageProcMode;
  }

  return -1;
}

int ARToolKitNFT::setup(int width, int height, int cameraID) {
  int id = gARControllerID++;
  this->id = id;

  this->width = width;
  this->height = height;

  this->videoFrameSize = width * height * 4 * sizeof(ARUint8);
  // Use unique_ptr to manage video frame memory, ensuring exclusive ownership and automatic deallocation
  this->videoFrame = std::unique_ptr<ARUint8[]>(new ARUint8[this->videoFrameSize]);
  this->videoLuma = std::unique_ptr<ARUint8[]>(new ARUint8[this->width * this->height]);

  setCamera(id, cameraID);

  webarkitLOGi("Allocated videoFrameSize %d", this->videoFrameSize);

  return this->id;
}

#include "ARToolKitNFT_js_bindings.cpp"