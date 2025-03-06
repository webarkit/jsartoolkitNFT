#include "ARToolKitNFT_py.h"
#include <KPM/kpm.h>

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
  ARLOGi("init ARToolKitNFT constructor...\n");
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

int ARToolKitNFT::passVideoData(py::array_t<uint8_t> videoFrame, py::array_t<uint8_t> videoLuma) {
  auto videoFramePtr = static_cast<uint8_t *>(videoFrame.request().ptr);
  auto videoLumaPtr = static_cast<uint8_t *>(videoLuma.request().ptr);

  std::copy(videoFramePtr, videoFramePtr + videoFrame.size(), this->videoFrame.get());
  std::copy(videoLumaPtr, videoLumaPtr + videoLuma.size(), this->videoLuma.get());

  return 0;
}

py::dict ARToolKitNFT::getNFTMarkerInfo(int markerIndex) {
  py::dict NFTMarkerInfo;
  py::list pose;

  if (this->surfaceSetCount <= markerIndex) {
    return py::dict("error"_a=MARKER_INDEX_OUT_OF_BOUNDS);
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

    bool reset = (trackResult < 0);

    if (arFilterTransMat(this->ftmi, transF, reset) < 0) {
      ARLOGe("arFilterTransMat error with marker %d.", markerIndex);
    }

    matrixLerp(transF, transFLerp, 0.95);
#endif

    if (trackResult < 0) {
      ARLOGi("Tracking lost. %d", trackResult);
      this->detectedPage = -2;
    } else {
      ARLOGi("Tracked page %d (max %d).\n",
             this->surfaceSet[this->detectedPage], this->surfaceSetCount - 1);
    }
  }

  if (this->detectedPage == markerIndex) {
    NFTMarkerInfo["id"] = markerIndex;
    NFTMarkerInfo["error"] = err;
    NFTMarkerInfo["found"] = 1;
#if WITH_FILTERING
    for (auto x = 0; x < 3; x++) {
      for (auto y = 0; y < 4; y++) {
        pose.append(transFLerp[x][y]);
      }
    }
#else
    for (auto x = 0; x < 3; x++) {
      for (auto y = 0; y < 4; y++) {
        pose.append(trans[x][y]);
      }
    }
#endif
    NFTMarkerInfo["pose"] = pose;
  } else {
    NFTMarkerInfo["id"] = markerIndex;
    NFTMarkerInfo["error"] = -1;
    NFTMarkerInfo["found"] = 0;
    for (auto x = 0; x < 3; x++) {
      for (auto y = 0; y < 4; y++) {
        pose.append(0.0f);
      }
    }
    NFTMarkerInfo["pose"] = pose;
  }

  return NFTMarkerInfo;
}

int ARToolKitNFT::detectNFTMarker() {

  KpmResult *kpmResult = nullptr;
  int kpmResultNum = -1;

  if (this->detectedPage == -2) {
    kpmMatching(this->kpmHandle.get(), this->videoLuma.get());
    kpmGetResult(this->kpmHandle.get(), &kpmResult, &kpmResultNum);

#if WITH_FILTERING
    this->ftmi = arFilterTransMatInit(this->filterSampleRate,
                                      this->filterCutoffFrequency);
#endif

    for (int i = 0; i < kpmResultNum; i++) {
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
    ARLOGe("Error: kpmCreateHandle returned NULL.");
    // Return empty unique_ptr with proper deleter type
    return std::unique_ptr<KpmHandle, void(*)(KpmHandle*)>(nullptr, [](KpmHandle* p) {
      if (p) kpmDeleteHandle(&p);
    });
  }
  return std::unique_ptr<KpmHandle, void(*)(KpmHandle*)>(handle, [](KpmHandle* p) { 
    if (p) kpmDeleteHandle(&p); 
  });
}

/*int ARToolKitNFT::getKpmImageWidth(KpmHandle *kpmHandle) {
  return kpmHandleGetXSize(kpmHandle);
}

int ARToolKitNFT::getKpmImageHeight(KpmHandle *kpmHandle) {
  return kpmHandleGetYSize(kpmHandle);
}*/

int ARToolKitNFT::setupAR2() {
  AR2HandleT* tempHandle = ar2CreateHandleMod(this->paramLT, this->pixFormat);
  if (tempHandle == nullptr) {
    ARLOGe("Error: ar2CreateHandle.");
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
    ARLOGe("Error creating KPM handle");
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
    arPattDetach(this->arhandle);
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

  // ARLOGi("*** Camera Parameter ***\n");
  // arParamDisp(&(this->param));

  deleteHandle();

  if ((this->paramLT = arParamLTCreate(&(this->param),
                                       AR_PARAM_LT_DEFAULT_OFFSET)) == nullptr) {
    ARLOGe("setCamera(): Error: arParamLTCreate.\n");
    return -1;
  }

  // ARLOGi("setCamera(): arParamLTCreated\n..%d, %d\n",
  // (this->paramLT->param).xsize, (this->paramLT->param).ysize);

  // setup camera
  if ((this->arhandle = arCreateHandle(this->paramLT)) == nullptr) {
    ARLOGe("setCamera(): Error: arCreateHandle.\n");
    return -1;
  }
  // AR_DEFAULT_PIXEL_FORMAT
  int set = arSetPixelFormat(this->arhandle, this->pixFormat);

  this->ar3DHandle = ar3DCreateHandle(&(this->param));
  if (this->ar3DHandle == nullptr) {
    ARLOGe("setCamera(): Error creating 3D handle\n");
    return -1;
  }

  arglCameraFrustumRH(&((this->paramLT)->param), this->nearPlane,
                      this->farPlane, this->cameraLens);

  return 0;
}

int ARToolKitNFT::loadCamera(std::string cparam_name) {
  ARParam param;
  if (arParamLoad(cparam_name.c_str(), 1, &param) < 0) {
    ARLOGe("loadCamera(): Error loading parameter file %s for camera.\n",
                 cparam_name.c_str());
    return -1;
  }
  int cameraID = gCameraID++;
  cameraParams[cameraID] = param;

  return cameraID;
}

py::array_t<double> ARToolKitNFT::getCameraLens() {
  py::array_t<double> lens({16});
  auto lens_ptr = lens.mutable_data();
  for (int i = 0; i < 16; i++) {
    lens_ptr[i] = this->cameraLens[i];
  }
  return lens;
}

/*int ARToolKitNFT::decompressZFT(std::string datasetPathname, std::string tempPathname){
  int response = decompressMarkers(datasetPathname.c_str(), tempPathname.c_str());

  return 1;
}*/

/*****************
 * Marker loading *
 *****************/

std::vector<int>
ARToolKitNFT::addNFTMarkers(std::vector<std::string> &datasetPathnames) {

  //auto kpmHandle = this->kpmHandle.get();

  KpmRefDataSet *refDataSet = nullptr;

  if (datasetPathnames.size() >= PAGES_MAX) {
    ARLOGe("Error exceed maximum pages.\n");
    exit(-1);
  }

  std::vector<int> markerIds = {};

  for (int i = 0; i < datasetPathnames.size(); i++) {
    ARLOGi("datasetPathnames size: %i\n", datasetPathnames.size());
    ARLOGi("add NFT marker-> '%s'\n", datasetPathnames[i].c_str());

    const char *datasetPathname = datasetPathnames[i].c_str();
    int pageNo = i;
    markerIds.push_back(i);

    // Load KPM data.
    KpmRefDataSet *refDataSet2;
    ARLOGi("Reading %s.fset3\n", datasetPathname);
    if (kpmLoadRefDataSet(datasetPathname, "fset3", &refDataSet2) < 0) {
      ARLOGe("Error reading KPM data from %s.fset3\n", datasetPathname);
      return {};
    }
    ARLOGi("Assigned page no. %d.\n", pageNo);
    if (kpmChangePageNoOfRefDataSet(refDataSet2, KpmChangePageNoAllPages,
                                    pageNo) < 0) {
      ARLOGe("Error: kpmChangePageNoOfRefDataSet\n");
      return {};
    }
    if (kpmMergeRefDataSet(&refDataSet, &refDataSet2) < 0) {
      ARLOGe("Error: kpmMergeRefDataSet\n");
      return {};
    }
    ARLOGi("Done.\n");

    // Load AR2 data.
    ARLOGi("Reading %s.fset\n", datasetPathname);

    if ((this->surfaceSet[i] =
      ar2ReadSurfaceSet(datasetPathname, "fset", nullptr)) == nullptr) {
      ARLOGe("Error reading data from %s.fset\n", datasetPathname);
      return {};
    }

    int surfaceSetCount = this->surfaceSetCount;
    int numIset = this->surfaceSet[i]->surface[0].imageSet->num;
    this->nft.width_NFT =
        this->surfaceSet[i]->surface[0].imageSet->scale[0]->xsize;
    this->nft.height_NFT =
        this->surfaceSet[i]->surface[0].imageSet->scale[0]->ysize;
    this->nft.dpi_NFT = this->surfaceSet[i]->surface[0].imageSet->scale[0]->dpi;

    ARLOGi("NFT num. of ImageSet: %i\n", numIset);
    ARLOGi("NFT marker width: %i\n", this->nft.width_NFT);
    ARLOGi("NFT marker height: %i\n", this->nft.height_NFT);
    ARLOGi("NFT marker dpi: %i\n", this->nft.dpi_NFT);

    this->nft.id_NFT = i;
    this->nft.width_NFT = this->nft.width_NFT;
    this->nft.height_NFT = this->nft.height_NFT;
    this->nft.dpi_NFT = this->nft.dpi_NFT;
    this->nftMarkers.push_back(this->nft);

    ARLOGi("Done.\n");
    surfaceSetCount++;
  }

  if (kpmSetRefDataSet(this->kpmHandle.get(), refDataSet) < 0) {
    ARLOGe("Error: kpmSetRefDataSet\n");
    return {};
  }
  kpmDeleteRefDataSet(&refDataSet);

  ARLOGi("Loading of NFT data complete.\n");

  this->surfaceSetCount += markerIds.size();

  return markerIds;
}

/**********************
 * Setters and getters *
 **********************/

/***************
 * Set Log Level
 ****************/
void ARToolKitNFT::setLogLevel(int level) { this->arLogLevel = level; }

int ARToolKitNFT::getLogLevel() { return this->arLogLevel; }

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
    ARLOGi("Threshold set to %d\n", threshold);
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
    ARLOGi("Threshold mode set to %d\n", (int)thresholdMode);
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
  ARLOGi("Debug mode set to %s\n", enable ? "on." : "off.");

  return enable;
}

int ARToolKitNFT::getProcessingImage() {

  return reinterpret_cast<std::uintptr_t>(this->arhandle->labelInfo.bwImage);
}

int ARToolKitNFT::getDebugMode() {
  int enable;

  arGetDebugMode(this->arhandle, &enable);
  return enable;
}

void ARToolKitNFT::setImageProcMode(int mode) {
  int imageProcMode = mode;
  if (arSetImageProcMode(this->arhandle, mode) == 0) {
    ARLOGi("Image proc. mode set to %d.\n", imageProcMode);
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
  this->videoFrame = std::make_unique<ARUint8[]>(this->videoFrameSize);
  this->videoLuma = std::make_unique<ARUint8[]>(this->videoFrameSize / 4);

  setCamera(id, cameraID);

  ARLOGi("Allocated videoFrameSize %d\n", this->videoFrameSize);

  return this->id;
}

PYBIND11_MODULE(artoolkitnft_core, m) {
  m.doc() = "ARToolKitNFT Python bindings";
  py::class_<nftMarker>(m, "nftMarker")
  .def(py::init<>())
  .def_readwrite("id_NFT", &nftMarker::id_NFT)
  .def_readwrite("width_NFT", &nftMarker::width_NFT)
  .def_readwrite("height_NFT", &nftMarker::height_NFT)
  .def_readwrite("dpi_NFT", &nftMarker::dpi_NFT)
  .def("__repr__",
    [](const nftMarker &n) {
        return "<nftMarker id_NFT=" + std::to_string(n.id_NFT) +
               ", width_NFT=" + std::to_string(n.width_NFT) +
               ", height_NFT=" + std::to_string(n.height_NFT) +
               ", dpi_NFT=" + std::to_string(n.dpi_NFT) + ">";
    });


  py::class_<ARToolKitNFT>(m, "ARToolKitNFT")
      .def(py::init<>())
      .def("passVideoData", &ARToolKitNFT::passVideoData)
      .def("detectNFTMarker", &ARToolKitNFT::detectNFTMarker)
      .def("getNFTMarker", &ARToolKitNFT::getNFTMarkerInfo)
      //.def("getKpmImageWidth", &ARToolKitNFT::getKpmImageWidth)
      //.def("getKpmImageHeight", &ARToolKitNFT::getKpmImageHeight)
      .def("setupAR2", &ARToolKitNFT::setupAR2)
      .def("getNFTData", &ARToolKitNFT::getNFTData)
      .def("setLogLevel", &ARToolKitNFT::setLogLevel)
      .def("getLogLevel", &ARToolKitNFT::getLogLevel)
      .def("teardown", &ARToolKitNFT::teardown)
      .def("loadCamera", &ARToolKitNFT::loadCamera)
      .def("getCameraLens", &ARToolKitNFT::getCameraLens)
      .def("addNFTMarkers", &ARToolKitNFT::addNFTMarkers)
      .def("setProjectionNearPlane", &ARToolKitNFT::setProjectionNearPlane)
      .def("getProjectionNearPlane", &ARToolKitNFT::getProjectionNearPlane)
      .def("setProjectionFarPlane", &ARToolKitNFT::setProjectionFarPlane)
      .def("getProjectionFarPlane", &ARToolKitNFT::getProjectionFarPlane)
      .def("setThreshold", &ARToolKitNFT::setThreshold)
      .def("getThreshold", &ARToolKitNFT::getThreshold)
      .def("setThresholdMode", &ARToolKitNFT::setThresholdMode)
      .def("getThresholdMode", &ARToolKitNFT::getThresholdMode)
      .def("setDebugMode", &ARToolKitNFT::setDebugMode)
      .def("getProcessingImage", &ARToolKitNFT::getProcessingImage)
      .def("getDebugMode", &ARToolKitNFT::getDebugMode)
      .def("setImageProcMode", &ARToolKitNFT::setImageProcMode)
      .def("getImageProcMode", &ARToolKitNFT::getImageProcMode)
      .def("setup", &ARToolKitNFT::setup);

    // Define the NFT_MARKER constant
    m.attr("NFT_MARKER") = py::int_(0); // Replace 1 with the actual value of NFT_MARKER
}
