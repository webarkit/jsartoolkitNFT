;(function(){ 
 'use strict';

var ARnft = function (width, height, config) {
  this.width = width;
  this.height = height;
  this.root = new THREE.Object3D();
  this.root.matrixAutoUpdate = false;
  this.config = config;
};

ARnft.prototype.init = function (markerUrl, stats) {

  var cameraParam = this.cameraPara;
  var root = this.root
  var config = this.config;
  var data = jsonParser(config);

  data.then( function (configData) {
  // console.log(configData);
    createLoading(configData);
    createStats(stats);
    var containerObj = createContainer();
    var container = containerObj['container'];
    var canvas = containerObj['canvas'];
    var video = containerObj['video'];

    if (stats) {
      var statsMain = new Stats();
      statsMain.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
      document.getElementById("stats1").appendChild(statsMain.dom);

      var statsWorker = new Stats();
      statsWorker.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
      document.getElementById("stats2").appendChild(statsWorker.dom);
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      var hint = {
        audio: false,
        video: true
      };

     if (window.innerWidth < 800) {
    hint = {
      audio: false,
      video: {
          width: { ideal: this.width },
          height: { ideal: this.height },
          facingMode:
              { exact:
                  "environment"
              }
          },
    };
  };

     navigator.mediaDevices.getUserMedia(hint).then(function(stream) {
        video.srcObject = stream;
        video.addEventListener("loadedmetadata", function() {
        video.play();

        start(
          container,
          markerUrl,
          video,
          video.videoWidth,
          video.videoHeight,
          canvas,
          function() {
            if(stats){
            statsMain.update();
          }
          },
          function() {
            if(stats){
            statsWorker.update();
          }
          },
          root,
          configData
        );
      });
    }).catch(function(err) {

      console.log(err.name + ": " + err.message);

   });
  };
})

};

ARnft.prototype.add = function (obj) {
var root = this.root;
root.add(obj);
};

ARnft.prototype.loadModel = function (url, x, y, z, scale) {
var root = this.root;
var model;

/* Load Model */
var threeGLTFLoader = new THREE.GLTFLoader();

var objPositions;

threeGLTFLoader.load(url, function (gltf) {
        model = gltf.scene;
        model.scale.set(scale, scale, scale);
        model.rotation.x = Math.PI/2;

        model.position.x = x;
        model.position.y = y;
        model.position.z = z;

        root.matrixAutoUpdate = false;
        root.add(model);
     }
  );
};

function isMobile () {
  return /Android|mobile|iPad|iPhone/i.test(navigator.userAgent);
}

var interpolationFactor = 24;

var trackedMatrix = {
  // for interpolation
  delta: [
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
  ],
  interpolated: [
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
  ]
}

var setMatrix = function (matrix, value) {
  var array = [];
  for (var key in value) {
      array[key] = value[key];
  }
  if (typeof matrix.elements.set === "function") {
      matrix.elements.set(array);
  } else {
      matrix.elements = [].slice.call(array);
  }
};

function start (container, markerUrl, video, input_width, input_height, canvas_draw, render_update, track_update, root, configData) {
  var vw, vh;
  var sw, sh;
  var pscale, sscale;
  var w, h;
  var pw, ph;
  var ox, oy;
  var worker;

  var canvas_process = document.createElement("canvas");
  var context_process = canvas_process.getContext("2d");

  var renderer = new THREE.WebGLRenderer({
      canvas: canvas_draw,
      alpha: configData.renderer.alpha,
      antialias: configData.renderer.antialias,
      precision: configData.renderer.precision
  });
  renderer.setPixelRatio(window.devicePixelRatio);

  var scene = new THREE.Scene();

  var camera = new THREE.Camera();
  camera.matrixAutoUpdate = false;

  scene.add(camera);

  var light = new THREE.AmbientLight(0xffffff);
  scene.add(light);

  scene.add(root);


  var load = function() {
      vw = input_width;
      vh = input_height;

      pscale = 320 / Math.max(vw, (vh / 3) * 4);
      sscale = isMobile() ? window.outerWidth / input_width : 1;

      sw = vw * sscale;
      sh = vh * sscale;

      w = vw * pscale;
      h = vh * pscale;
      pw = Math.max(w, (h / 3) * 4);
      ph = Math.max(h, (w / 4) * 3);
      ox = (pw - w) / 2;
      oy = (ph - h) / 2;
      canvas_process.style.clientWidth = pw + "px";
      canvas_process.style.clientHeight = ph + "px";
      canvas_process.width = pw;
      canvas_process.height = ph;

      renderer.setSize(sw, sh);

      worker = new Worker(configData.workerUrl);

      worker.postMessage({
          type: "load",
          pw: pw,
          ph: ph,
          camera_para: configData.cameraPara,
          marker: markerUrl,
          artoolkitUrl: configData.artoolkitUrl
      });

      worker.onmessage = function(ev) {
          var msg = ev.data;
          switch (msg.type) {
              case "loaded": {
                  var proj = JSON.parse(msg.proj);
                  var ratioW = pw / w;
                  var ratioH = ph / h;
                  proj[0] *= ratioW;
                  proj[4] *= ratioW;
                  proj[8] *= ratioW;
                  proj[12] *= ratioW;
                  proj[1] *= ratioH;
                  proj[5] *= ratioH;
                  proj[9] *= ratioH;
                  proj[13] *= ratioH;
                  setMatrix(camera.projectionMatrix, proj);
                  break;
              }

              case "endLoading": {
                  if (msg.end == true) {
                      // removing loader page if present
                      var loader = document.getElementById('loading');
                      if (loader) {
                          loader.querySelector('.loading-text').innerText = 'Start the tracking!';
                          setTimeout(function(){
                              loader.parentElement.removeChild(loader);
                          }, 2000);
                      }
                  }
                  break;
              }

              case "found": {
                  found(msg);
                  break;
              }
              case "not found": {
                  found(null);
                  break;
              }
          }
          track_update();
          process();
      };
  };

  var world;

  var found = function(msg) {
      if (!msg) {
          world = null;
      } else {
          world = JSON.parse(msg.matrixGL_RH);
      }
  };

  var lasttime = Date.now();
  var time = 0;

  function process() {
      context_process.fillStyle = "black";
      context_process.fillRect(0, 0, pw, ph);
      context_process.drawImage(video, 0, 0, vw, vh, ox, oy, w, h);

      var imageData = context_process.getImageData(0, 0, pw, ph);
      worker.postMessage({ type: "process", imagedata: imageData }, [
          imageData.data.buffer
      ]);
  }

  var tick = function() {
      draw();
      requestAnimationFrame(tick);
  };

  var draw = function() {
      render_update();
      var now = Date.now();
      var dt = now - lasttime;
      time += dt;
      lasttime = now;

      if (!world) {
          root.visible = false;
      } else {
          root.visible = true;

          // interpolate matrix
          for (var i = 0; i < 16; i++) {
              trackedMatrix.delta[i] = world[i] - trackedMatrix.interpolated[i];
              trackedMatrix.interpolated[i] =
                  trackedMatrix.interpolated[i] +
                  trackedMatrix.delta[i] / interpolationFactor;
          }
          // set matrix of 'root' by detected 'world' matrix
          setMatrix(root.matrix, trackedMatrix.interpolated);
      }

      renderer.render(scene, camera);
  };

  load();
  tick();
  process();
}

function createLoading(configData) {
  var loader = document.createElement('div');
  loader.id = "loading";
  var logo = document.createElement('img');
  logo.src = configData.loading.logo.src;
  logo.alt = configData.loading.logo.alt;
  var loadingMessage = document.createElement('span');
  loadingMessage.setAttribute('class', "loading-text");
  loadingMessage.innerText = configData.loading.loadingMessage;
  loader.appendChild(logo);
  loader.appendChild(loadingMessage);
  var marker = document.getElementById('marker');
  document.body.insertBefore(loader, document.body.firstChild);
}

function createContainer() {
var container = document.createElement('div');
container.id = "app";
var canvas = document.createElement('canvas');
canvas.id = "canvas";
var video = document.createElement('video');
video.id = "video";
video.setAttribute('autoplay', '');
video.setAttribute('muted', '');
video.setAttribute('playsinline', '');
container.appendChild(video);
container.appendChild(canvas);
var loading = document.getElementById('loading');
document.body.insertBefore(container, loading);
var obj = {container: container, canvas: canvas, video: video}
return obj;
}

function createStats(create) {
if(create) {
  var stats = document.createElement('div');
  stats.id = "stats";
  stats.className = "ui stats";
  var stats1 = document.createElement('div');
  stats1.id = "stats1";
  stats1.className = "stats-item";
  var stats1p = document.createElement('p');
  stats1p.className = "stats-item-title";
  stats1p.innerText = "Main";
  stats1.appendChild(stats1p);
  stats.appendChild(stats1);
  var stats2 = document.createElement('div');
  stats2.id = "stats2";
  stats2.className = "stats-item";
  var stats2p = document.createElement('p');
  stats2p.className = "stats-item-title";
  stats2p.innerText = "Worker";
  stats2.appendChild(stats2p);
  stats.appendChild(stats2);
  var loading = document.getElementById('loading');
  document.body.insertBefore(stats, loading);
}
}

async function jsonParser(requestURL, callback) {
  return await new Promise( function(resolve, reject) {
    let data;
    let request = new XMLHttpRequest();
    request.open('GET', requestURL);
    request.responseType = 'json';
    request.onload = function() {
      resolve(request.response);
    }
    request.onerror = function () {
      reject('error ' + request.status);
    }
    request.send(null);
  });
}

window.ARnft = ARnft;
window.THREE = THREE;
}());