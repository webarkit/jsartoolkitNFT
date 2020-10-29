var ar = null
function start (markerUrl, video, inputWidth, inputHeight) {
  var onLoad = function (arController) {
    ar = arController

    ar.addEventListener('getNFTMarker', function (ev) {
      console.log(ev)
    })

    ar.loadNFTMarker(markerUrl).then(function (nft) {
      ar.trackNFTMarkerId(nft.id)
      console.log('loadNFTMarker -> ', nft.id)
      console.log('nftMarker struct: ', nft)
    }).catch(function (err) {
      console.log('Error in loading marker on Worker', err)
    })

    if (ar && ar.process) {
      console.log(ar);
      let imageDataCanvas = document.createElement('canvas');
      let contextProcess = imageDataCanvas.getContext('2d');
      contextProcess.fillStyle = 'black';
      contextProcess.fillRect(0, 0, 640, 480);
      contextProcess.drawImage(video, 0, 0, 0, 0, 640, 480, 640, 480);
      var imageData = contextProcess.getImageData(0, 0, 640, 480);
      ar.process(imageData.data)
    }
  }

  var onError = function (error) {
    console.error(error)
  }

  var cameraPara = './../examples/Data/camera_para.dat'

  ARToolkitNFT.ARControllerNFT.initWithDimensions(inputWidth, inputHeight, cameraPara).then(onLoad).catch(onError)
}
