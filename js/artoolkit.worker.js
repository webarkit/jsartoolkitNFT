importScripts('../build/artoolkit.min.js');

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

    var param = new ARCameraParam(msg.camera_para);

    param.onload = function () {
        ar = new ARController(msg.pw, msg.ph, param);
        var cameraMatrix = ar.getCameraMatrix();

        ar.addEventListener('getNFTMarker', function (ev) {
            markerResult = {type: "found", matrixGL_RH: JSON.stringify(ev.data.matrixGL_RH), proj: JSON.stringify(cameraMatrix)};
        });

        ar.loadNFTMarker(msg.marker, function (markerId) {
            ar.trackNFTMarkerId(markerId, 2);
            console.log("loadNFTMarker -> ", markerId);
            postMessage({type: "endLoading", end: true})
        });

        postMessage({type: "loaded", proj: JSON.stringify(cameraMatrix)});
    };
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
