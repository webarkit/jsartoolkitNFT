const jsartoolkitNFT = require('../../dist/ARToolkitNFT_node.js')
const sharp = require('sharp')

async function init() {
    const arControllerNFT = await new jsartoolkitNFT.ARControllerNFT(2000, 1500, '/camera_para.dat');
    const ar = await arControllerNFT._initialize();

    // process() expects RGBA pixel data, so add the alpha channel.
    const data = await sharp("pinball-demo.jpg").ensureAlpha().raw().toBuffer();
    const imageData = new Uint8Array(data.buffer);

    ar.on('getNFTMarker', function (e) {
        console.log("NFT marker detected: ", e.data.marker);
    });

    const cameraMatrix = ar.getCameraMatrix();
    ar.loadNFTMarker('DataNFT/pinball', function (id) {
        console.log('marker id is: ', id);
        ar.trackNFTMarkerId(id);
        const marker = ar.getNFTData(ar.id, 0);
        console.log("nftMarker data: ", marker);
        console.log("cameraMatrix: ", cameraMatrix);
        // process() must run after the marker is loaded; NFT tracking
        // needs several iterations before it locks on.
        for (let i = 0; i < 10; i++) {
            ar.process(imageData);
        }
    });
}

init()
