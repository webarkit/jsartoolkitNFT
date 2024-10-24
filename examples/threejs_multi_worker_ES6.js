import * as THREE from 'three';

function isMobile () {
    return /Android|mobile|iPad|iPhone/i.test(navigator.userAgent);
  }

const setMatrix = function (matrix, value) {
  const array = [];
  for (const key in value) {
    array[key] = value[key];
  }
  if (typeof matrix.elements.set === "function") {
    matrix.elements.set(array);
  } else {
    matrix.elements = [].slice.call(array);
  }
};

export default function start(markerUrls, video, input_width, input_height, render_update, track_update) {
  let vw, vh;
  let sw, sh;
  let pscale, sscale;
  let w, h;
  let pw, ph;
  let ox, oy;
  let worker;
  const camera_para = './../examples/Data/camera_para.dat';

  const canvas_process = document.createElement('canvas');
  const context_process = canvas_process.getContext('2d', {willReadFrequently: true});
  const targetCanvas = document.querySelector("#canvas");

  const renderer = new THREE.WebGLRenderer({canvas: targetCanvas, alpha: true, antialias: true});
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();

  const camera = new THREE.Camera();
  camera.matrixAutoUpdate = false;
  
  scene.add(camera);

  const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshNormalMaterial()
  );

  const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.5),
      new THREE.MeshNormalMaterial()
  );

  const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1, 32),
      new THREE.MeshNormalMaterial()
  );

  const root = new THREE.Object3D();
  scene.add(root);

  let marker1, marker2, marker3;

  sphere.material.flatShading;
    sphere.scale.set(200, 200, 200);

    cube.material.flatShading;
    cube.scale.set(200, 200, 200);

    cone.material.flatShading;
    cone.rotation.x = 90;
    cone.scale.set(200, 200, 200);
  
    root.matrixAutoUpdate = false;
    root.add(sphere);
    root.add(cube);
    root.add(cone);

  const load = function () {
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

    worker = new Worker('../js/artoolkitNFT_multi_ES6.worker.js')

    worker.postMessage({type: "load", pw: pw, ph: ph, camera_para: camera_para, marker: markerUrls});

    worker.onmessage = function (ev) {
      const msg = ev.data;
      switch (msg.type) {
        case "loaded": {
          const proj = JSON.parse(msg.proj);
          const ratioW = pw / w;
          const ratioH = ph / h;
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
          if (msg.end === true) {
            // removing loader page if present
            const loader = document.getElementById('loading');
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
        case 'markerInfos': {
          marker1 = msg.marker1;
          sphere.position.y = ((marker1.height / marker1.dpi) * 2.54 * 10) / 2.0;
          sphere.position.x = ((marker1.width / marker1.dpi) * 2.54 * 10) / 2.0;
          marker2 = msg.marker2;
          cube.position.y = ((marker2.height / marker2.dpi) * 2.54 * 10) / 2.0;
          cube.position.x = ((marker2.width / marker2.dpi) * 2.54 * 10) / 2.0;
          marker3 = msg.marker3;
          cone.position.y = ((marker3.height / marker3.dpi) * 2.54 * 10) / 2.0;
          cone.position.x = ((marker3.width / marker3.dpi) * 2.54 * 10) / 2.0;
        }
      }
      track_update();
      process();
    };
  };

  let world, index;

  const found = function (msg) {
    if (!msg) {
      world = null;
    } else {
      world = JSON.parse(msg.matrixGL_RH);
      index = JSON.parse(msg.index);
    }
  };

  let lasttime = Date.now();
  let time = 0;

  const draw = function () {
    render_update();
    const now = Date.now();
    const dt = now - lasttime;
    time += dt;
    lasttime = now;

    if (!world) {
      sphere.visible = false;
      cube.visible = false;
      cone.visible = false;
    } else {
      if (index === 0) {
        sphere.visible = true;
        cube.visible = false;
        cone.visible = false;
      } else if (index === 1) {
        sphere.visible = false;
        cube.visible = true;
        cone.visible = false;
      } else if (index === 2) {
        sphere.visible = false;
        cube.visible = false;
        cone.visible = true;
      }
      // set matrix of 'root' by detected 'world' matrix
      setMatrix(root.matrix, world);
    }
    renderer.render(scene, camera);
  };

  const process = function () {
    context_process.fillStyle = 'black';
    context_process.fillRect(0, 0, pw, ph);
    context_process.drawImage(video, 0, 0, vw, vh, ox, oy, w, h);

    var imageData = context_process.getImageData(0, 0, pw, ph);
    worker.postMessage({ type: 'process', imagedata: imageData }, [imageData.data.buffer]);
  };

  const tick = function () {
    draw();
    requestAnimationFrame(tick);
  };

  load();
    tick();
    process();
  }
  