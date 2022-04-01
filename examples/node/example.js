const ARToolKitNFT = require('../../node-src/ARToolkitNFT.js')

async function init(){
    let ar = await new ARToolKitNFT().init();
    const id = await ar.loadCamera('camera_para.dat');
    ar.artoolkitNFT.setup(640, 480, id);
}

init()