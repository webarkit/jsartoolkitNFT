const fs = require("fs");

let data = fs.readFileSync('../Data/camera_para.dat', {encoding: 'binary'},function(err){
    console.log(error);
})
console.log(data);