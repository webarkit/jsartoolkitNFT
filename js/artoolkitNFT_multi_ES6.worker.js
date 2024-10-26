const browser = (function () {
  const test = function (regexp) {
    return regexp.test(navigator.userAgent);
  };
  switch (true) {
    case test(/edg/i):
      return "Microsoft Edge";
    case test(/trident/i):
      return "Microsoft Internet Explorer";
    case test(/firefox|fxios/i):
      return "Mozilla Firefox";
    case test(/opr\//i):
      return "Opera";
    case test(/ucbrowser/i):
      return "UC Browser";
    case test(/samsungbrowser/i):
      return "Samsung Browser";
    case test(/chrome|chromium|crios/i):
      return "Google Chrome";
    case test(/safari/i):
      return "Apple Safari";
    default:
      return "Other";
  }
})();

if (browser == "Apple Safari") {
  importScripts("../dist/ARToolkitNFT.js");
} else {
  importScripts("../dist/ARToolkitNFT_simd.js");
}
// Import OneEuroFilter class into the worker.
importScripts("./one-euro-filter.js");

let next = null;
self.onmessage = function (e) {
  const msg = e.data;
  switch (msg.type) {
    case "load": {
      load(msg);
      return;
    }
    case "process": {
      next = msg.imagedata;
      process();
    }
  }
};

let ar = null;
let markerResult = null;
let marker1, marker2, marker3;

const WARM_UP_TOLERANCE = 5;
let tickCount = 0;

// initialize the OneEuroFilter
let filterMinCF = 0.0001;
let filterBeta = 0.01;
const filter = new OneEuroFilter({ minCutOff: filterMinCF, beta: filterBeta });

function load(msg) {
  console.debug("Loading marker at: ", msg.marker);

  const onLoad = function (arController) {
    ar = arController;
    const cameraMatrix = ar.getCameraMatrix();

    ar.addEventListener("getNFTMarker", function (ev) {
      tickCount += 1;
      if (tickCount > WARM_UP_TOLERANCE) {
        const mat = filter.filter(Date.now(), ev.data.matrixGL_RH);
        markerResult = {
          type: "found",
          index: JSON.stringify(ev.data.index),
          matrixGL_RH: JSON.stringify(mat),
        };
      }
    });

    ar.addEventListener("lostNFTMarker", function (ev) {
      filter.reset();
    });

    const nftMarkers = new ar.artoolkitNFT.nftMarkers();

    ar.loadNFTMarkers(msg.marker, function (ids) {
      for (let i = 0; i < ids.length; i++) {
        ar.trackNFTMarkerId(i);
        nftMarkers.push_back(ar.getNFTData(i, i));
      }

      marker1 = ar.getNFTData(ids[0], 0);
      marker2 = ar.getNFTData(ids[1], 1);
      marker3 = ar.getNFTData(ids[2], 2);

      nftMarkers.push_back(marker1);

      console.log("Array of nftData: ", [
        nftMarkers.get(0),
        nftMarkers.get(1),
        nftMarkers.get(2),
      ]);

      postMessage({
        type: "markerInfos",
        marker1: marker1,
        marker2: marker2,
        marker3: marker3,
      });
      console.log("loadNFTMarker -> ", ids);
      postMessage({ type: "endLoading", end: true });
    }).catch(function (err) {
      console.log("Error in loading marker on Worker", err);
    });

    postMessage({ type: "loaded", proj: JSON.stringify(cameraMatrix) });
  };

  const onError = function (error) {
    console.error(error);
  };

  console.debug("Loading camera at:", msg.camera_para);

  // we cannot pass the entire ARControllerNFT, so we re-create one inside the Worker, starting from camera_param
  ARControllerNFT.initWithDimensions(msg.pw, msg.ph, msg.camera_para)
    .then(onLoad)
    .catch(onError);
}

function process() {
  markerResult = null;

  if (ar && ar.process) {
    ar.process(next);
  }

  if (markerResult) {
    postMessage(markerResult);
  } else {
    postMessage({ type: "not found" });
  }

  next = null;
}
