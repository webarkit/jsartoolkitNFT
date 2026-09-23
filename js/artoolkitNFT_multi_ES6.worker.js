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
importScripts("./OneEuroFilter.js");

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
// Poses reported by the current process() call: one entry per tracked marker.
let foundMarkers = [];

const WARM_UP_TOLERANCE = 5;

// initialize the OneEuroFilter
let filterMinCF = 0.0001;
let filterBeta = 0.01;
const OneEuroFilterCtor =
  typeof OneEuroFilter === "function"
    ? OneEuroFilter
    : OneEuroFilter && typeof OneEuroFilter.OneEuroFilter === "function"
      ? OneEuroFilter.OneEuroFilter
      : null;

if (!OneEuroFilterCtor) {
  throw new Error("OneEuroFilter constructor not found in worker context");
}

const createFilter = function () {
  return OneEuroFilterCtor.length >= 2
    ? new OneEuroFilterCtor(filterMinCF, filterBeta)
    : new OneEuroFilterCtor({ minCutOff: filterMinCF, beta: filterBeta });
};

// Every marker gets its own filter and its own warm-up count: a single filter
// fed with several markers' poses would blend them together.
const filters = new Map();
const tickCounts = new Map();
const filterFor = function (index) {
  if (!filters.has(index)) {
    filters.set(index, createFilter());
  }
  return filters.get(index);
};

function load(msg) {
  console.debug("Loading marker at: ", msg.marker);

  const onLoad = function (arController) {
    ar = arController;
    const cameraMatrix = ar.getCameraMatrix();

    ar.addEventListener("getNFTMarker", function (ev) {
      const index = ev.data.index;
      const ticks = (tickCounts.get(index) || 0) + 1;
      tickCounts.set(index, ticks);
      if (ticks > WARM_UP_TOLERANCE) {
        foundMarkers.push({
          index: index,
          matrixGL_RH: filterFor(index).filter(Date.now(), ev.data.matrixGL_RH),
        });
      }
    });

    ar.addEventListener("lostNFTMarker", function (ev) {
      const index = ev.data.index;
      if (filters.has(index)) {
        filters.get(index).reset();
      }
      tickCounts.delete(index);
    });

    ar.loadNFTMarkers(msg.marker, function (ids) {
      for (let i = 0; i < ids.length; i++) {
        ar.trackNFTMarkerId(ids[i]);
      }

      // getNFTData takes only the marker index; the controller id is implied.
      const markers = ids.map(function (id) {
        return ar.getNFTData(id);
      });
      console.log("NFT marker data: ", markers);

      postMessage({ type: "markerInfos", markers: markers });
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
  ARControllerNFT.initWithDimensions(msg.pw, msg.ph, msg.camera_para, true)
    .then(onLoad)
    .catch(onError);
}

function process() {
  foundMarkers = [];

  if (ar && ar.process) {
    ar.process(next);
  }

  if (foundMarkers.length > 0) {
    postMessage({ type: "found", markers: foundMarkers });
  } else {
    postMessage({ type: "not found" });
  }

  next = null;
}
