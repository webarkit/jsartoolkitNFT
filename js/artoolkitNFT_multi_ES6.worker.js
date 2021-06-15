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

function load (msg) {
  console.debug('Loading marker at: ', msg.marker)

  var onLoad = function (arController) {
    ar = arController
    var cameraMatrix = ar.getCameraMatrix()

    ar.addEventListener('getNFTMarker', function (ev) {
      markerResult = { type: 'found', matrixGL_RH: JSON.stringify(ev.data.matrixGL_RH)}
    })

    ar.loadNFTMarkers(msg.marker).then(function (id) {
        console.log(id);
      ar.trackNFTMarkerId(id)
      console.log('loadNFTMarker -> ', id)
      postMessage({ type: 'endLoading', end: true })
    }).catch(function (err) {
      console.log('Error in loading marker on Worker', err)
    }).then( function() {
      //let nftData = ar.getNFTData()
      //console.log("nftMarker data: ", nftData)
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
