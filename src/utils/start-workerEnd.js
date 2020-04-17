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

function load (msg) {
  var basePath = self.origin;
  var artoolkitUrl, cameraParamUrl, nftMarkerUrl;
  console.debug('Base path:', basePath);
  // test if the msg.param (the incoming url) is an http or https path
  var regexA = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#()?&//=]*)/igm
  var reA = regexA.test(msg.artoolkitUrl);
  if (reA == true) {
    if (msg.addPath) {
      artoolkitUrl = basePath + '/' + msg.addPath + '/' + msg.artoolkitUrl;
    } else {
      artoolkitUrl = msg.artoolkitUrl;
    }

  } else if(reA == false) {
    if (msg.addPath) {
      console.debug('addPath exist: ', msg.addPath);
      artoolkitUrl = basePath + '/' + msg.addPath + '/' + msg.artoolkitUrl;
    } else {
      artoolkitUrl = basePath + '/' + msg.artoolkitUrl;
    }
  }
  console.debug('Importing WASM lib from: ', artoolkitUrl);

  importScripts(artoolkitUrl);

  self.addEventListener('artoolkitNFT-loaded', function () {

    var onLoad = function () {

      ar = new ARControllerNFT(msg.pw, msg.ph, param);
      var cameraMatrix = ar.getCameraMatrix();

      ar.addEventListener('getNFTMarker', function (ev) {
            markerResult = {type: "found", matrixGL_RH: JSON.stringify(ev.data.matrixGL_RH), proj: JSON.stringify(cameraMatrix)};
        });
      // after the ARController is set up, we load the NFT Marker
      var regexM = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#()?&//=]*)/igm
      var reM = regexM.test(msg.marker);
      if (reM == true) {
        if (msg.addPath) {
          nftMarkerUrl = basePath + '/' + msg.addPath + '/' + msg.marker;
        } else {
          nftMarkerUrl = msg.marker;
        }
      } else if (reM == false) {
        if (msg.addPath) {
          nftMarkerUrl = basePath + '/' + msg.addPath + '/' + msg.marker;
        } else {
          nftMarkerUrl = basePath + '/' + msg.marker;
        }
      }
      console.debug('Loading NFT marker at: ', nftMarkerUrl);
      ar.loadNFTMarker(nftMarkerUrl, function (markerId) {
        ar.trackNFTMarkerId(markerId);
        console.log("loadNFTMarker -> ", markerId);
        postMessage({ type: "endLoading", end: true }),
          function (err) {
            console.error('Error in loading marker on Worker', err);
        };
      });

      postMessage({ type: 'loaded', proj: JSON.stringify(cameraMatrix) });
    };

    var onError = function (error) {
      console.error(error);
    };
    var regexC = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#()?&//=]*)/igm
    var reC = regexC.test(msg.camera_para);
    if (reC == true) {
      if (msg.addPath) {
        cameraParamUrl = basePath + '/' + msg.addPath + '/' + msg.camera_para;
      } else {
        cameraParamUrl = msg.camera_para;
      }
    } else if (reC == false) {
      if (msg.addPath) {
        cameraParamUrl = basePath + '/' + msg.addPath + '/' + msg.camera_para;
      } else {
        cameraParamUrl = basePath + '/' + msg.camera_para;
      }
    }
    console.debug('Loading camera at:', cameraParamUrl);
    // we cannot pass the entire ARControllerNFT, so we re-create one inside the Worker, starting from camera_param
    var param = new ARCameraParamNFT(cameraParamUrl, onLoad, onError);
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
