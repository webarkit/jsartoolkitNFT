const ARControllerNFT = require('../../node-src/ARControllerNFT.js')
const sharp = require('sharp')

async function init() {
    let arControllerNFT = await new ARControllerNFT(869, 587, 'camera_para.dat');
    arControllerNFT._initialize()
        .then(ar => {
            //console.log(ar);
            sharp("pinball-test.jpg")
                .toBuffer()
                .then(data => {
                    var imageData = new Uint8Array(data);
                    ar.on('getNFTMarker', function(e){
                        console.log(e.data);
                    })
                    // we get an error because process need some video data...
                    ar.loadNFTMarker('DataNFT/pinball', function (id) {
                        console.log('marker id is: ', id);
                        ar.trackNFTMarkerId(id);
                    })
                    if (ar && ar.process) {
                        ar.process(imageData);
                      }
                    //ar.process(imageData);
                    //console.log(artoolkitNFT);
                })
        })
}

init()
