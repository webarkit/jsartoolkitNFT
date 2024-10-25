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
  importScripts("../build/artoolkitNFT_wasm.js");
} else {
  importScripts("../build/artoolkitNFT_wasm.simd.js");
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
      return;
    }
  }
};

let ar = null;
let markerResult = null;
let marker;

const WARM_UP_TOLERANCE = 5;
let tickCount = 0;

// initialize the OneEuroFilter
let filterMinCF = 0.0001;
let filterBeta = 0.01;
const filter = new OneEuroFilter({ minCutOff: filterMinCF, beta: filterBeta });

function load(msg) {
  self.addEventListener("artoolkitNFT-loaded", function () {
    console.debug("Loading marker at: ", msg.marker);

    const onLoad = function () {
      ar = new ARControllerNFT(msg.pw, msg.ph, param);
      const cameraMatrix = ar.getCameraMatrix();

      ar.addEventListener("getNFTMarker", function (ev) {
        tickCount += 1;
        if (tickCount > WARM_UP_TOLERANCE) {
          const mat = filter.filter(Date.now(), ev.data.matrixGL_RH);
          markerResult = {
            type: "found",
            matrixGL_RH: JSON.stringify(mat),
          };
        }
      });

      ar.addEventListener("lostNFTMarker", function (ev) {
        filter.reset();
      });

      ar.loadNFTMarker(msg.marker, function (id) {
        ar.trackNFTMarkerId(id);
        let marker = ar.getNFTData(ar.id, 0);
        console.log("nftMarker data: ", marker);
        postMessage({ type: "markerInfos", marker: marker });
        console.log("loadNFTMarker -> ", id);
        postMessage({ type: "endLoading", end: true }),
          function (err) {
            console.error("Error in loading marker on Worker", err);
          };
      });

      postMessage({ type: "loaded", proj: JSON.stringify(cameraMatrix) });
    };

    const onError = function (error) {
      console.error(error);
    };

    console.debug("Loading camera at:", msg.camera_para);

    // we cannot pass the entire ARControllerNFT, so we re-create one inside the Worker, starting from camera_param
    const param = new ARCameraParamNFT(msg.camera_para, onLoad, onError);
  });
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
