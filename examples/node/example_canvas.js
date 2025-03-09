const jsartoolkitNFT = require ('../../dist/ARToolkitNFT_node.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

// Polyfill for requestAnimationFrame in Node.js
global.requestAnimationFrame = function(callback) {
    return setImmediate(callback);
};

global.cancelAnimationFrame = function(id) {
    clearImmediate(id);
};

async function init() {
    console.log(__dirname + '/camera_para.dat');

    let arControllerNFT = new jsartoolkitNFT.ARControllerNFT(1920, 1021, '/camera_para.dat');
    let ar = await arControllerNFT._initialize();
    loadImage('pinball-test2.png').then((image) => {

        console.log('image: ', image.width, image.height);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, image.width, image.height);
        const imgData = ctx.getImageData(0, 0, image.width, image.height);
        console.log('imgData: ', imgData);
        ar.on('getNFTMarker', function(e){
            console.log("NFT marker detected: ", e);
        });
        const cameraMatrix = ar.getCameraMatrix();
        ar.loadNFTMarker('DataNFT/pinball', function (id) {
            console.log('marker id is: ', id);
            ar.trackNFTMarkerId(id);
            let marker = ar.getNFTData(id, 0);
            console.log("cameraMatrix: ", cameraMatrix);
        });

        function processFrame() {
            if (ar && typeof ar.process === 'function') {
                ar.process(imgData.data);
            }
            requestAnimationFrame(processFrame);
        }

        processFrame();

        // Save the canvas to a PNG file
        const out = fs.createWriteStream(__dirname + '/output.png');
        const stream = canvas.createPNGStream();
        stream.pipe(out);
        out.on('finish', () => console.log('The PNG file was created.'));
    });
}

init();