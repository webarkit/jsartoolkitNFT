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

    // create a Worker to handle loading of NFT marker and tracking of it
    var workerBlob = new Blob(
      [workerRunner.toString().replace(/^function .+\{?|\}$/g, '')],
      { type: 'text/js-worker' }
    );
    var workerBlobUrl = URL.createObjectURL(workerBlob);

    worker = new Worker(workerBlobUrl);

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

  function workerRunner() {
  // continuing 'workerRunner' function at start-workerEnd.js file
  // see the Gruntfile.js to better understand the division of this function between two files
