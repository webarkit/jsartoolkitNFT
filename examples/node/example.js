const ARToolKitNFT = require('../../node-src/ARToolkitNFT.js')

async function init(){
    let ar = await new ARToolKitNFT().init();
    //console.log(ar);
    let id = await ar.loadCamera('../Data/camera_para.dat');
    ar.artoolkitNFT.setup(640, 480, id);
}

init()