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

  var obj = new THREE.Object3D();
  obj.matrixAutoUpdate = false;

  scene.add(root);

  var load = function () {
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
      type: 'load',
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
              setTimeout(function () {
                loader.parentElement.removeChild(loader);
              }, 2000);
            }
          }
          break;
        }

        case 'found': {
          found(msg);
          break;
        }
        case 'not found': {
          found(null);
          break;
        }
      }
      track_update();
      process();
    };
  };

  var world;

  var found = function (msg) {
    if (!msg) {
      world = null;
    } else {
      world = JSON.parse(msg.matrixGL_RH);
      obj.position.y = (msg.height / msg.dpi * 2.54 * 10)/2.0;
      obj.position.x = (msg.width / msg.dpi * 2.54 * 10)/2.0;
    }
  };

  var lasttime = Date.now();
  var time = 0;

  function process () {
    context_process.fillStyle = 'black';
    context_process.fillRect(0, 0, pw, ph);
    context_process.drawImage(video, 0, 0, vw, vh, ox, oy, w, h);

    var imageData = context_process.getImageData(0, 0, pw, ph);
    worker.postMessage({ type: 'process', imagedata: imageData }, [
      imageData.data.buffer
    ]);
  }

  var tick = function () {
    draw();
    requestAnimationFrame(tick);
  };

  var draw = function () {
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

  return obj;
}
