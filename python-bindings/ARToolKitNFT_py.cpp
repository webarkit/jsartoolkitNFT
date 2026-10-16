#include "ARToolKitNFT_py.h"

#include <algorithm>
#include <cstdint>

// The core is built with the single-thread preset: the sync KPM detector and the
// ar2*Mod tracking functions, as in the single-thread JS binding. 0.0.14 had no
// worker thread, so the threaded detector is not used here.
//
// The AR2 tracking settings come from the core's singleThreadPreset(), as in the
// single-thread JS binding: tracking threshold 5.0, similarity threshold 0.5.
// Up to 0.0.14 this binding used 2.0 and 0.3. They were set in 34d3bf9 ("trying
// to debug the issue") while chasing "marker never detected" (#431). The real
// cause was a controller size that did not match the image (fixed in 4504963),
// and the thresholds could not have helped: they act on AR2 tracking, which only
// starts after KPM has found the marker. 5.0 and 0.5 are the values this binding
// had before that commit.
ARToolKitNFT::ARToolKitNFT(bool withFiltering)
    : core(singleThreadPreset(), withFiltering), width(0), height(0),
      arhandle(nullptr), ar3DHandle(nullptr)
{
  ARLOGi("init ARToolKitNFT constructor...\n");
}

ARToolKitNFT::~ARToolKitNFT() {
  teardown();
}

/*********
 * Frames *
 *********/

int ARToolKitNFT::passVideoData(py::array_t<uint8_t> videoFrame, py::array_t<uint8_t> videoLuma) {
    auto frame_info = videoFrame.request();
    auto luma_info = videoLuma.request();

    const int64_t expected_frame_size = (int64_t)this->width * this->height * 4;
    const int64_t expected_luma_size  = (int64_t)this->width * this->height;
    if ((int64_t)frame_info.size != expected_frame_size) {
        ARLOGe("passVideoData: videoFrame size %lld != expected %lld (width=%d * height=%d * 4)\n",
               (long long)frame_info.size, (long long)expected_frame_size, this->width, this->height);
        return -1;
    }
    if ((int64_t)luma_info.size != expected_luma_size) {
        ARLOGe("passVideoData: videoLuma size %lld != expected %lld (width=%d * height=%d)\n",
               (long long)luma_info.size, (long long)expected_luma_size, this->width, this->height);
        return -1;
    }

    // The core copies both buffers.
    this->core.setVideoFrame(static_cast<const ARUint8 *>(frame_info.ptr),
                             static_cast<const ARUint8 *>(luma_info.ptr));
    return 0;
}

/*************************
 * Detection and tracking *
 *************************/

int ARToolKitNFT::detectNFTMarker() {
  return this->core.detectNFTMarker();
}

py::dict ARToolKitNFT::getNFTMarkerInfo(int markerIndex) {
  const NFTMarkerState *state = this->core.markerState(markerIndex);
  if (state == nullptr) {
    return py::dict("error"_a=MARKER_INDEX_OUT_OF_BOUNDS);
  }

  // Tracking itself happens once per frame in detectNFTMarker(); this only
  // reports the result, so calling it more than once per frame is harmless.
  // (Up to 0.0.14 this method ran the AR2 tracking, so each call tracked again.)
  py::dict NFTMarkerInfo;
  py::list pose;
  NFTMarkerInfo["id"] = markerIndex;

  if (state->tracking) {
    for (auto x = 0; x < 3; x++) {
      for (auto y = 0; y < 4; y++) {
        pose.append(state->pose[x][y]);
      }
    }
    NFTMarkerInfo["error"] = state->err;
    NFTMarkerInfo["found"] = 1;
  } else {
    for (auto i = 0; i < 12; i++) {
      pose.append(0.0);
    }
    NFTMarkerInfo["error"] = -1;
    NFTMarkerInfo["found"] = 0;
  }
  NFTMarkerInfo["pose"] = pose;

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
  // The core's setup() applies the camera, which frees and recreates paramLT.
  deleteARHandles();
  const int id = this->core.setup(width, height, cameraID);
  // -1 is a frame size the core rejects (not positive, or too large): nothing
  // changed in the core, so the earlier size stays the one passVideoData() checks
  // frames against. Up to 0.0.14 such a size was accepted.
  if (id >= 0) {
    this->width = width;
    this->height = height;
  }
  // No paramLT when the camera could not be applied: no ARHandle either. A
  // rejected size or an unknown camera id leaves the earlier paramLT in place,
  // and the handles are created again from it.
  if (this->core.cameraParamLT() != nullptr) {
    createARHandles();
  }

  return id;
}

int ARToolKitNFT::setupAR2() {
  return this->core.setupAR2();
}

py::array_t<double> ARToolKitNFT::getCameraLens() {
  py::array_t<double> lens({16});
  auto lens_ptr = lens.mutable_data();
  const ARdouble *cameraLens = this->core.cameraLens();
  for (int i = 0; i < 16; i++) {
    lens_ptr[i] = cameraLens[i];
  }
  return lens;
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

// The ids continue across calls, and every loaded marker stays detectable: up to
// 0.0.14 a second call numbered its markers from 0 again and replaced the first
// ones. A load that would pass PAGES_MAX markers in total returns an empty list
// and changes nothing; 0.0.14 called exit(-1) there, and a library must not
// terminate the interpreter that hosts it.
std::vector<int>
ARToolKitNFT::addNFTMarkers(std::vector<std::string> &datasetPathnames) {
  return this->core.addNFTMarkers(datasetPathnames);
}

nftMarker ARToolKitNFT::getNFTData(int index) {
  // An index out of range throws std::out_of_range, which Python sees as IndexError.
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

/*******************************************************
 * ARHandle: not used by NFT, kept for the existing API. *
 *******************************************************/

void ARToolKitNFT::deleteARHandles() {
  if (this->arhandle != nullptr) {
    // NFT never attaches a pattern, so arPattDetach() fails here; its result is
    // ignored, as up to 0.0.14, instead of logging an error on every teardown.
    arPattDetach(this->arhandle);
    arDeleteHandle(this->arhandle);
    this->arhandle = nullptr;
  }
  if (this->ar3DHandle != nullptr) {
    ar3DDeleteHandle(&(this->ar3DHandle));
    this->ar3DHandle = nullptr;
  }
}

int ARToolKitNFT::createARHandles() {
  if ((this->arhandle = arCreateHandle(this->core.cameraParamLT())) == nullptr) {
    ARLOGe("setCamera(): Error: arCreateHandle.\n");
    return -1;
  }
  // AR_DEFAULT_PIXEL_FORMAT
  arSetPixelFormat(this->arhandle, this->pixFormat);

  this->ar3DHandle = ar3DCreateHandle(&(this->core.cameraParam()));
  if (this->ar3DHandle == nullptr) {
    ARLOGe("setCamera(): Error creating 3D handle\n");
    return -1;
  }
  return 0;
}

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

// No method releases the GIL (no py::gil_scoped_release): the core is not
// thread-safe, and ARControllerNFT calls loadCamera and addNFTMarkers from
// executor threads (run_in_executor). Holding the GIL serialises those calls.
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
      .def(py::init<bool>(), py::arg("withFiltering") = false)
      .def("passVideoData", &ARToolKitNFT::passVideoData)
      .def("detectNFTMarker", &ARToolKitNFT::detectNFTMarker)
      .def("getNFTMarker", &ARToolKitNFT::getNFTMarkerInfo)
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
      .def("setup", &ARToolKitNFT::setup)
      .def("setFiltering", &ARToolKitNFT::setFiltering, py::arg("enableFiltering"))
      .def("setContinuousDetection", &ARToolKitNFT::setContinuousDetection, py::arg("enabled"))
      .def("setDetectionInterval", &ARToolKitNFT::setDetectionInterval, py::arg("ms"));

    // Define the NFT_MARKER constant
    m.attr("NFT_MARKER") = py::int_(0); // Replace 1 with the actual value of NFT_MARKER
}
