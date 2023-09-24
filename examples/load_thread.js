const WARM_UP_TOLERANCE = 5;
let tickCount = 0;
var markerResult = null;

// initialize the OneEuroFilter
let filterMinCF = 0.0001;
let filterBeta = 0.01;
const filter = new OneEuroFilter({ minCutOff: filterMinCF, beta: filterBeta });
function load_thread(msg) {
      console.debug("Loading marker at: ", msg.marker);
  
      var onLoad = function () {
        ar = new ARControllerNFT(msg.pw, msg.ph, param);
        var cameraMatrix = ar.getCameraMatrix();
  
        ar.addEventListener("getNFTMarker", function (ev) {
          tickCount += 1;
          if (tickCount > WARM_UP_TOLERANCE) {
            var mat = filter.filter(Date.now(), ev.data.matrixGL_RH);
            var markerFound = new CustomEvent("markerFound", {detail: {matrixGL_RH: mat}})
            window.dispatchEvent(markerFound)
        }
        });
  
        ar.addEventListener("lostNFTMarker", function (ev) {
          filter.reset();
        });
  
        ar.loadNFTMarker(msg.marker, function (id) {
          ar.trackNFTMarkerId(id);
          let marker = ar.getNFTData(ar.id, 0);
          console.log("nftMarker data: ", marker);
          var markerInfos = new CustomEvent("markerInfos", {detail: {marker: marker}})
          window.dispatchEvent(markerInfos);
          console.log("loadNFTMarker -> ", id);
          var endLoading = new CustomEvent("endLoading", {detail: {end: true}})
            window.dispatchEvent(endLoading)
        });

        var loaded = new CustomEvent("loaded", {detail: {proj: cameraMatrix}});
        window.dispatchEvent(loaded)
      };
  
      var onError = function (error) {
        console.error(error);
      };
  
      console.debug("Loading camera at:", msg.camera_para);
  
      // we cannot pass the entire ARControllerNFT, so we re-create one inside the Worker, starting from camera_param
      var param = new ARCameraParamNFT(msg.camera_para, onLoad, onError);
  }