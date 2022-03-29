const fs = require("fs");

let data = fs.readFileSync('../Data/camera_para.dat', {encoding: 'binary'},function(err){
    console.log(error);
})
console.log('data is: ', data);

fs.readFile('../Data/camera_para.dat', {encoding: 'binary'}, function (err, data) {
console.log(data);
})