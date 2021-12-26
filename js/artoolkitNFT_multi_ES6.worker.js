importScripts('../dist/ARToolkitNFT.js')

self.onmessage = function (e) {
  var msg = e.data
  switch (msg.type) {
    case 'load': {
      load(msg)
      return
    }
    case 'process': {
      next = msg.imagedata
      process()
    }
  }
}

var next = null
var ar = null
var markerResult = null
var marker1, marker2, marker3

function load (msg) {
  console.debug('Loading marker at: ', msg.marker)

  var onLoad = function (arController) {
    ar = arController
    console.log(arController);
    var cameraMatrix = ar.getCameraMatrix()

    ar.addEventListener('getNFTMarker', function (ev) {
      markerResult = { type: 'found', index: JSON.stringify(ev.data.index), matrixGL_RH: JSON.stringify(ev.data.matrixGL_RH)}
    })

    ar.loadNFTMarkers(msg.marker, function (ids) {
      for(var i = 0; i < ids.length; i++){
        ar.trackNFTMarkerId(i);
      }

    marker1 = ar.getNFTData(ar.id, 0);
    marker2 = ar.getNFTData(ar.id, 1);
    marker3 = ar.getNFTData(ar.id, 2);
    postMessage({type: 'markerInfos', marker1: marker1, marker2: marker2, marker3: marker3})

    postMessage({ type: 'endLoading', end: true })
    }).catch(function (err) {
      console.log('Error in loading marker on Worker', err)
    })

    postMessage({ type: 'loaded', proj: JSON.stringify(cameraMatrix) })
  }

  var onError = function (error) {
    console.error(error)
  }

  console.debug('Loading camera at:', msg.camera_para)

  // we cannot pass the entire ARControllerNFT, so we re-create one inside the Worker, starting from camera_param
  ARToolkitNFT.ARControllerNFT.initWithDimensions(msg.pw, msg.ph, msg.camera_para).then(onLoad).catch(onError)
}

function process () {
  markerResult = null

  if (ar && ar.process) {
    ar.process(next)
  }

  if (markerResult) {
    postMessage(markerResult)
  } else {
    postMessage({ type: 'not found' })
  }

  next = null
}
