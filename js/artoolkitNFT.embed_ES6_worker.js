import ARToolkitNFT from "../build/artoolkitNFT_embed_ES6_wasm.js";
// Import OneEuroFilter class into the worker.
import { OneEuroFilter } from "./one-euro-filter-ES6.js";

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

let next = null;
let ar = null;
let markerResult = null;
//var marker;

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

async function load(msg) {
  const arTK = await ARToolkitNFT();
  //self.addEventListener("artoolkitNFT-loaded", function () {
  console.debug("Loading marker at: ", msg.marker);

  const onLoad = function () {
    ar = new arTK.ARControllerNFT(msg.pw, msg.ph, param, true);
    const cameraMatrix = ar.getCameraMatrix();

    ar.addEventListener("getNFTMarker", function (ev) {
      let mat;
      if (oef == true) {
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
      let marker = ar.getNFTData(id, 0);
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
  const param = new arTK.ARCameraParamNFT(msg.camera_para, onLoad, onError);
  //});//event listener
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
