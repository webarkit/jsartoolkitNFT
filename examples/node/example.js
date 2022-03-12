const ar = require('../../dist/ARToolkitNFT.js');
const process = require('process')

console.log('This is a test importing ARToolkitNFT.js with Nodejs')
var basePath = process.cwd()
ar.ARControllerNFT.initWithDimensions(640, 480, basePath +'/examples/Data/camera_para.dat')