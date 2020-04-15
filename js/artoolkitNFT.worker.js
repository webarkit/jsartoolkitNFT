self.onmessage = function(e) {
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

function load(msg) {

  importScripts(msg.artoolkitUrl);

self.addEventListener('artoolkitNFT-loaded', function() {

    var param = new ARCameraParamNFT(msg.camera_para);

    param.onload = function () {
        ar = new ARControllerNFT(msg.pw, msg.ph, param);
        var cameraMatrix = ar.getCameraMatrix();

        ar.addEventListener('getNFTMarker', function (ev) {
            markerResult = {
              type: "found",
              matrixGL_RH: JSON.stringify(ev.data.matrixGL_RH),
              width: JSON.stringify(ev.data.marker.width),
              height: JSON.stringify(ev.data.marker.height),
              dpi: JSON.stringify(ev.data.marker.dpi),
              proj: JSON.stringify(cameraMatrix)
            }
        });

        ar.loadNFTMarker(msg.marker, function (nftMarker) {
            ar.trackNFTMarkerId(nftMarker.id, 2);
            console.log("loadNFTMarker -> ", nftMarker.id);
            postMessage({
              type: "markerData",
              markerData: JSON.stringify(nftMarker)
            })
            postMessage({type: "endLoading", end: true})
        });

        postMessage({type: "loaded", proj: JSON.stringify(cameraMatrix)});
    };
  });

}

function process() {

    markerResult = null;

    if (ar) {
        ar.process(next);
    }

    if (markerResult) {
        postMessage(markerResult);
    } else {
        postMessage({type: "not found"});
    }

    next = null;
}
