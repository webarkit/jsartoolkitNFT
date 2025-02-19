const ARControllerNFT = require('../../node-src/ARControllerNFT.js')
const sharp = require('sharp')

async function init() {
    let arControllerNFT = await new ARControllerNFT(1920, 1021, 'camera_para.dat');
    arControllerNFT._initialize()
        .then(ar => {
            //console.log(ar);
            sharp("pinball-test2.png")
                //.resize(1920, 1021, 'fill')
                .raw()
                .toBuffer()

                .then(data => {
                    //console.log("data from sharp Buffer: ", data.buffer)
                    const imageData = new Uint8Array(data.buffer);
                    //console.log(imageData)
                    //console.log(ar)
                    ar.on('getNFTMarker', function(e){
                        console.log("NFT marker detected: ", e);
                    })
                    const cameraMatrix = ar.getCameraMatrix();
                    // we get an error because process need some video data...
                    ar.loadNFTMarker('DataNFT/pinball', function (id) {
                        console.log('marker id is: ', id);
                        ar.trackNFTMarkerId(id);
                        let marker = ar.getNFTData(ar.id, 0);
                        console.log("nftMarker data: ", marker);
                        console.log("cameraMatrix: ", cameraMatrix);
                    })
                    if (ar && ar.process) {
                        ar.process(imageData);
                      }
                    //console.log(artoolkitNFT);
                })
        })
}

init()
