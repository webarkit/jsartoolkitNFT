const ARControllerNFT = require ('../../node-src/ARControllerNFT.js')

async function init(){
    let arControllerNFT = await new ARControllerNFT(640, 480,'camera_para.dat');
    arControllerNFT._initialize()
    // to check if the ARControllerNFT is loaded...
    arControllerNFT.addEventListener('load', function(){
        console.log('loaded');
        // we get an error because process need some video data...
        arControllerNFT.loadNFTMarker('/DataNFT/pinball', function(data){ console.log(data)})
        //arControllerNFT.process()
    })
}

init()