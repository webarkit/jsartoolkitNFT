var ar;
function isMobile() {
  return /Android|mobile|iPad|iPhone/i.test(navigator.userAgent);
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

function start( markerUrl, video, input_width, input_height, canvas_draw, render_update) {
  var vw, vh;
  var sw, sh;
  var pscale, sscale;
  var w, h;
  var pw, ph;
  var ox, oy;
  var camera_para = './../examples/Data/camera_para.dat';
  var camera_matrix;

  var canvas_process = document.createElement('canvas');
  var context_process = canvas_process.getContext('2d', { willReadFrequently: true });

  var renderer = new THREE.WebGLRenderer({ canvas: canvas_draw, alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  var scene = new THREE.Scene();

  var camera = new THREE.Camera();
  camera.matrixAutoUpdate = false;

  scene.add(camera);

  var sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshNormalMaterial()
  );

  var root = new THREE.Object3D();
  scene.add(root);

  var marker;

  var markerInfos = function () {
    window.addEventListener("markerInfos", function (ev) {
      marker = ev.detail.marker;
    })
  }

  var getCameraMatrix = function () {
    window.addEventListener("loaded", function (ev) {
      camera_matrix = ev.detail.proj;
    })
  }

  sphere.material.flatShading;
  sphere.scale.set(200, 200, 200);

  root.matrixAutoUpdate = false;
  root.add(sphere);

  var load = function () {
    vw = input_width;
    vh = input_height;

    pscale = 320 / Math.max(vw, vh / 3 * 4);
    sscale = isMobile() ? window.outerWidth / input_width : 1;

    sw = vw * sscale;
    sh = vh * sscale;

    w = vw * pscale;
    h = vh * pscale;
    pw = Math.max(w, h / 3 * 4);
    ph = Math.max(h, w / 4 * 3);
    ox = (pw - w) / 2;
    oy = (ph - h) / 2;
    canvas_process.style.clientWidth = pw + "px";
    canvas_process.style.clientHeight = ph + "px";
    canvas_process.width = pw;
    canvas_process.height = ph;

    renderer.setSize(sw, sh);

    var msg = {
      pw: pw,
      ph: ph,
      camera_para: camera_para,
      marker: markerUrl
    }

    load_thread(msg);
    markerInfos();
    getCameraMatrix();
  };

  var world;

  var found = function () {
    window.addEventListener("markerFound", function (ev) {
      world = ev.detail.matrixGL_RH
    })
  };

  var lasttime = Date.now();
  var time = 0;

  var setCameraMatrix = function () {
    var proj = camera_matrix;
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
  }

  var draw = function () {
    render_update();
    var now = Date.now();
    var dt = now - lasttime;
    time += dt;
    lasttime = now;
    found();
    if (camera_matrix) {
      setCameraMatrix();
    }

    if (!world) {
      sphere.visible = false;
    } else {
      sphere.visible = true;
      console.log(world);
      sphere.position.y = ((marker.height / marker.dpi) * 2.54 * 10) / 2.0;
      sphere.position.x = ((marker.width / marker.dpi) * 2.54 * 10) / 2.0;
      // set matrix of 'root' by detected 'world' matrix
      setMatrix(root.matrix, world);
    }
    window.addEventListener("endLoading", function (ev) {
      if (ev.detail.end == true) {
        // removing loader page if present
        var loader = document.getElementById('loading');
        if (loader) {
          loader.querySelector('.loading-text').innerText = 'Start the tracking!';
          setTimeout(function () {
            if(loader) {
              loader.querySelector('.loading-text').innerText = '';
              loader.querySelector('img').src = '';
            }
          }, 2000);
        } else {
          console.log("No loader found");}
      }
    })
    renderer.render(scene, camera);
  };

  var process = function () {
    context_process.fillStyle = 'black';
    context_process.fillRect(0, 0, pw, ph);
    context_process.drawImage(video, 0, 0, vw, vh, ox, oy, w, h);

    var imageData = context_process.getImageData(0, 0, pw, ph);

    if (ar && ar.process) {
      ar.process(imageData);
    }

    requestAnimationFrame(process);
  }
  var tick = function () {
    draw();
    requestAnimationFrame(tick);
  };

  load();
  tick();
  process();
}
