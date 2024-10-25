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

importScripts("../examples/js/third_party/jsfeatNext/jsfeatNext.js");

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
      process(msg);
    }
  }
};

let ar = null;
let markerResult = null;
let marker;
// jsfeatNext settings
let radius;
let sigma;
const jsfeat = jsfeatNext.jsfeatNext;
const imgproc = new jsfeat.imgproc();
let img_u8, width, height;

const WARM_UP_TOLERANCE = 5;
let tickCount = 0;

// initialize the OneEuroFilter
const oef = true;
let filterMinCF = 0.0001;
let filterBeta = 0.01;
const filter = new OneEuroFilter({ minCutOff: filterMinCF, beta: filterBeta });

function oefFilter(matrixGL_RH) {
  tickCount += 1;
  let mat;
  if (tickCount > WARM_UP_TOLERANCE) {
    mat = filter.filter(Date.now(), matrixGL_RH);
  } else {
    mat = matrixGL_RH;
  }
  return mat;
}

function load(msg) {
  console.debug("Loading marker at: ", msg.marker);
  width = msg.pw;
  height = msg.ph;
  radius = msg.radius;
  sigma = msg.sigma;
  img_u8 = new jsfeat.matrix_t(width, height, jsfeat.U8_t | jsfeat.C1_t);

  const onLoad = function (arController) {
    ar = arController;
    const cameraMatrix = ar.getCameraMatrix();

    ar.addEventListener("getNFTMarker", function (ev) {
      let mat;
      if (oef === true) {
        mat = oefFilter(ev.data.matrixGL_RH);
      } else {
        mat = ev.data.matrixGL_RH;
      }
      markerResult = {
        type: "found",
        matrixGL_RH: JSON.stringify(mat),
      };
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
  ARControllerNFT.initWithDimensions(width, height, msg.camera_para)
    .then(onLoad)
    .catch(onError);
}

function process() {
  markerResult = null;

  if (ar && ar.process) {
    imgproc.grayscale(next.data, width, height, img_u8);
    const r = radius | 0;
    const kernel_size = (r + 1) << 1;
    imgproc.gaussian_blur(img_u8, img_u8, kernel_size, sigma);
    ar.setGrayData(img_u8.data);
    ar.process(next);
  }

  if (markerResult) {
    postMessage(markerResult);
  } else {
    postMessage({ type: "not found" });
  }

  next = null;
}
