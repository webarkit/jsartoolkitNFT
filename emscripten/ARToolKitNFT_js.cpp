#include "ARToolKitNFT_js.h"

// Declared by the native logger the core logs with, WebARKit/include/WebARKitLog.h. That
// header cannot be included here: it shares the include guard WEBARKIT_LOG_H with the
// Emscripten logger <WebARKit/WebARKitLog.h> this file uses (webarkit/WebARKitLib#84).
extern "C" int webarkitLogLevel;

ARToolKitNFT::ARToolKitNFT()
    : core(singleThreadPreset(), false), width(0), height(0),
      arhandle(nullptr), ar3DHandle(nullptr)
{
  webarkitLOGi("init ARToolKitNFT constructor...");
}

ARToolKitNFT::ARToolKitNFT(bool withFiltering)
    : core(singleThreadPreset(), withFiltering), width(0), height(0),
      arhandle(nullptr), ar3DHandle(nullptr)
{
  // Both lines, as when this constructor delegated to the default one.
  webarkitLOGi("init ARToolKitNFT constructor...");
  webarkitLOGi("ARToolKitNFT constructor withFiltering option.");
}

ARToolKitNFT::~ARToolKitNFT() {
  teardown();
}

/*********
 * Frames *
 *********/

int ARToolKitNFT::passVideoData(uintptr_t videoFramePtr,
                                uintptr_t videoLumaPtr, bool internalLuma) {
  uint8_t* vf = reinterpret_cast<uint8_t*>(videoFramePtr);
  uint8_t* vl = reinterpret_cast<uint8_t*>(videoLumaPtr);

  if (internalLuma) {
    auto vli = webarkit::webarkitVideoLumaInit(this->width, this->height, true);
    if (!vli) {
      webarkitLOGe("Failed to initialize WebARKitLumaInfo.");
      return -1;
    }

    auto out = webarkit::webarkitVideoLuma(vli, vf);
    if (!out) {
      webarkitLOGe("Failed to process video luma.");
      webarkit::webarkitVideoLumaFinal(&vli);
      return -1;
    }
    webarkitLOGd("Copy videoLuma with simd !");
    // The core copies the frame and the luma computed from it.
    this->core.setVideoFrame(vf, out);
    webarkit::webarkitVideoLumaFinal(&vli);
    return 0;
  }

  webarkitLOGd("Inside videoLuma no simd !");
  this->core.setVideoFrame(vf, vl);
  return 0;
}

/*************************
 * Detection and tracking *
 *************************/

int ARToolKitNFT::detectNFTMarker() {
  return this->core.detectNFTMarker();
}

emscripten::val ARToolKitNFT::getNFTMarkerInfo(int markerIndex) {
  const NFTMarkerState *state = this->core.markerState(markerIndex);
  if (state == nullptr) {
    return emscripten::val(MARKER_INDEX_OUT_OF_BOUNDS);
  }

  // Tracking itself happens once per frame in detectNFTMarker(); this only
  // reports the result, so calling it more than once per frame is harmless.
  auto NFTMarkerInfo = emscripten::val::object();
  NFTMarkerInfo.set("id", markerIndex);

  if (state->tracking) {
    auto pose = emscripten::val::array();
    int idx = 0;
    for (auto x = 0; x < 3; x++) {
      for (auto y = 0; y < 4; y++) {
        pose.set(idx++, state->pose[x][y]);
      }
    }
    NFTMarkerInfo.set("error", state->err);
    NFTMarkerInfo.set("found", 1);
    NFTMarkerInfo.set("pose", pose);
  } else {
    NFTMarkerInfo.set("error", -1);
    NFTMarkerInfo.set("found", 0);
    NFTMarkerInfo.set("pose", emscripten::val(emscripten::typed_memory_view(12, zeros.data())));
  }

  return NFTMarkerInfo;
}

void ARToolKitNFT::setFiltering(bool enableFiltering) {
  this->core.setFiltering(enableFiltering);
}

void ARToolKitNFT::setContinuousDetection(bool enabled) {
  this->core.setContinuousDetection(enabled);
}

void ARToolKitNFT::setDetectionInterval(double ms) {
  this->core.setDetectionInterval(ms);
}

/******************
 * Camera and setup *
 ******************/

int ARToolKitNFT::loadCamera(std::string cparam_name) {
  return ARToolKitNFTCore::loadCamera(cparam_name);
}

int ARToolKitNFT::setup(int width, int height, int cameraID) {
  this->width = width;
  this->height = height;

  // The core's setup() applies the camera, which frees and recreates paramLT.
  deleteARHandles();
  const int id = this->core.setup(width, height, cameraID);
  // No paramLT when the camera could not be applied: no ARHandle either, as before.
  // An unknown camera id leaves the earlier paramLT in place, and the handles are
  // created again from it.
  if (this->core.cameraParamLT() != nullptr) {
    createARHandles();
  }

  return id;
}

int ARToolKitNFT::setupAR2() {
  return this->core.setupAR2();
}

emscripten::val ARToolKitNFT::getCameraLens() {
  emscripten::val lens = emscripten::val::array();
  const ARdouble *cameraLens = this->core.cameraLens();
  for (int idx = 0; idx < 16; idx++) {
    lens.set(idx, cameraLens[idx]);
  }
  return lens;
}

void ARToolKitNFT::recalculateCameraLens() {
  this->core.recalculateCameraLens();
}

void ARToolKitNFT::setProjectionNearPlane(const ARdouble projectionNearPlane) {
  this->core.setProjectionNearPlane(projectionNearPlane);
}

ARdouble ARToolKitNFT::getProjectionNearPlane() { return this->core.getProjectionNearPlane(); }

void ARToolKitNFT::setProjectionFarPlane(const ARdouble projectionFarPlane) {
  this->core.setProjectionFarPlane(projectionFarPlane);
}

ARdouble ARToolKitNFT::getProjectionFarPlane() { return this->core.getProjectionFarPlane(); }

/*****************
 * Marker loading *
 *****************/

int ARToolKitNFT::decompressZFT(std::string datasetPathname, std::string tempPathname) {
  return this->core.decompressZFT(datasetPathname, tempPathname);
}

std::vector<int>
ARToolKitNFT::addNFTMarkers(std::vector<std::string> &datasetPathnames) {
  return this->core.addNFTMarkers(datasetPathnames);
}

nftMarker ARToolKitNFT::getNFTData(int index) {
  return this->core.getNFTData(index);
}

/***********
 * Teardown *
 ***********/

int ARToolKitNFT::teardown() {
  // arhandle points to the core's paramLT, which the core's teardown() frees.
  deleteARHandles();
  return this->core.teardown();
}

/***************
 * Set Log Level
 ****************/
void ARToolKitNFT::setLogLevel(int level) {
  // Guard as ARToolKit5's arwSetLogLevel does: a negative level would make
  // arLog's `logLevel < arLogLevel` test pass for every message, turning an
  // apparent "off" into maximum verbosity. The core logs with the native
  // WebARKit logger, which has the same levels, so one call sets both.
  if (level >= 0) {
    arLogLevel = level;
    webarkitLogLevel = level;
  }
}

int ARToolKitNFT::getLogLevel() { return arLogLevel; }

/**********************************************************************
 * ARHandle: not used by NFT, kept until #659 decides on its methods. *
 **********************************************************************/

void ARToolKitNFT::deleteARHandles() {
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
}

int ARToolKitNFT::createARHandles() {
  // setup camera
  if ((this->arhandle = arCreateHandle(this->core.cameraParamLT())) == nullptr) {
    webarkitLOGe("setCamera(): Error: arCreateHandle.");
    return -1;
  }
  // AR_DEFAULT_PIXEL_FORMAT
  arSetPixelFormat(this->arhandle, this->pixFormat);

  this->ar3DHandle = ar3DCreateHandle(&(this->core.cameraParam()));
  if (this->ar3DHandle == nullptr) {
    webarkitLOGe("setCamera(): Error creating 3D handle");
    return -1;
  }
  return 0;
}

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

#include "ARToolKitNFT_js_bindings.cpp"
