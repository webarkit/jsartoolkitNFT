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
  var basePath = self.origin;
  console.log('base path:', basePath);
  var artoolkitUrl = basePath + '/' + msg.artoolkitUrl;

  importScripts(artoolkitUrl);

self.addEventListener('artoolkitNFT-loaded', function() {
    var cameraParamUrl = basePath + '/' + msg.camera_para;

    var param = new ARCameraParamNFT(cameraParamUrl);

    param.onload = function () {
        ar = new ARControllerNFT(msg.pw, msg.ph, param);
        var cameraMatrix = ar.getCameraMatrix();

        ar.addEventListener('getNFTMarker', function (ev) {
            markerResult = {type: "found", matrixGL_RH: JSON.stringify(ev.data.matrixGL_RH), proj: JSON.stringify(cameraMatrix)};
        });

        var nftMarkerUrl = basePath + '/' + msg.marker;

        ar.loadNFTMarker(nftMarkerUrl, function (markerId) {
            ar.trackNFTMarkerId(markerId, 2);
            console.log("loadNFTMarker -> ", markerId);
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
}; // end of workerRunner() function


var world;

var found = function (msg) {
  if (!msg) {
    world = null;
  } else {
    world = JSON.parse(msg.matrixGL_RH);
  }
};

var lasttime = Date.now();
var time = 0;

function process () {
  context_process.fillStyle = 'black';
  context_process.fillRect(0, 0, pw, ph);
  context_process.drawImage(video, 0, 0, vw, vh, ox, oy, w, h);

  var imageData = context_process.getImageData(0, 0, pw, ph);
  worker.postMessage({ type: 'process', imagedata: imageData }, [
    imageData.data.buffer
  ]);
}

var tick = function () {
  draw();
  requestAnimationFrame(tick);
};

var draw = function () {
  render_update();
  var now = Date.now();
  var dt = now - lasttime;
  time += dt;
  lasttime = now;

  if (!world) {
    root.visible = false;
  } else {
    root.visible = true;

    // interpolate matrix
    for (var i = 0; i < 16; i++) {
      trackedMatrix.delta[i] = world[i] - trackedMatrix.interpolated[i];
      trackedMatrix.interpolated[i] =
                trackedMatrix.interpolated[i] +
                trackedMatrix.delta[i] / interpolationFactor;
    }
    // set matrix of 'root' by detected 'world' matrix
    setMatrix(root.matrix, trackedMatrix.interpolated);
  }

  renderer.render(scene, camera);
};

load();
tick();
process();
}
