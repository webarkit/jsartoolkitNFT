const WARM_UP_TOLERANCE = 5;
let tickCount = 0;
const markerResult = null;
let ar;

// initialize the OneEuroFilter
let filterMinCF = 0.0001;
let filterBeta = 0.01;
const filter = new OneEuroFilter({ minCutOff: filterMinCF, beta: filterBeta });
function load_thread(msg) {
      console.debug("Loading marker at: ", msg.marker);

    const onLoad = function (arController) {
        ar = arController;
        const cameraMatrix = ar.getCameraMatrix();

        ar.addEventListener("getNFTMarker", function (ev) {
            tickCount += 1;
            if (tickCount > WARM_UP_TOLERANCE) {
                const mat = filter.filter(Date.now(), ev.data.matrixGL_RH);
                const markerFound = new CustomEvent("markerFound", {detail: {matrixGL_RH: mat}});
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
            const markerInfos = new CustomEvent("markerInfos", {detail: {marker: marker}});
            window.dispatchEvent(markerInfos);
            console.log("loadNFTMarker -> ", id);
            const endLoading = new CustomEvent("endLoading", {detail: {end: true}});
            window.dispatchEvent(endLoading)
        });

        if (ar && ar.process) {
            window.addEventListener('imageDataEvent', function (ev) {
                const iData = ev.detail.imageData;
                ar.process(iData);
            })
        }

        const loaded = new CustomEvent("loaded", {detail: {proj: cameraMatrix}});
        window.dispatchEvent(loaded)
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