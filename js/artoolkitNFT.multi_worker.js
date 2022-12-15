var browser = (function () {
  var test = function (regexp) {
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

self.onmessage = function (e) {
  var msg = e.data;
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

var next = null;
var ar = null;
var markerResult = null;
var marker1, marker2, marker3;

const WARM_UP_TOLERANCE = 5;
let tickCount = 0;

// initialize the OneEuroFilter
let filterMinCF = 0.001;
let filterBeta = 1000;
const filter = new OneEuroFilter({minCutOff: filterMinCF, beta: filterBeta});

function load(msg) {
  self.addEventListener("artoolkitNFT-loaded", function () {
    console.debug("Loading marker at: ", msg.marker);

    var onLoad = function () {
      ar = new ARControllerNFT(msg.pw, msg.ph, param);
      var cameraMatrix = ar.getCameraMatrix();

      ar.addEventListener("getNFTMarker", function (ev) {
        filter.reset();
        tickCount += 1;
        if (tickCount > WARM_UP_TOLERANCE) {
          var mat = filter.filter(Date.now(), ev.data.matrixGL_RH);
          markerResult = {
            type: "found",
            index: JSON.stringify(ev.data.index),
            matrixGL_RH: JSON.stringify(mat),
          };
        }
      });

      ar.addEventListener("lostNFTMarker", function(ev) {
        filter.reset();
      });

      ar.loadNFTMarkers(msg.marker, function (ids) {
        for (var i = 0; i < ids.length; i++) {
          ar.trackNFTMarkerId(i);
        }
        marker1 = ar.getNFTData(ar.id, 0);
        marker2 = ar.getNFTData(ar.id, 1);
        marker3 = ar.getNFTData(ar.id, 2);
        postMessage({
          type: "markerInfos",
          marker1: marker1,
          marker2: marker2,
          marker3: marker3,
        });
        console.log("loadNFTMarker -> ", ids);
        postMessage({ type: "endLoading", end: true }),
          function (err) {
            console.error("Error in loading marker on Worker", err);
          };
      });

      postMessage({ type: "loaded", proj: JSON.stringify(cameraMatrix) });
    };

    var onError = function (error) {
      console.error(error);
    };

    console.debug("Loading camera at:", msg.camera_para);

    // we cannot pass the entire ARControllerNFT, so we re-create one inside the Worker, starting from camera_param
    var param = new ARCameraParamNFT(msg.camera_para, onLoad, onError);
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
