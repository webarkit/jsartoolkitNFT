import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

export default function start(markerUrl, video, input_width, input_height, render_update, track_update) {
  let vw, vh;
  let sw, sh;
  let pscale, sscale;
  let w, h;
  let pw, ph;
  let ox, oy;
  let worker;
  const camera_para = './../examples/Data/camera_para.dat';

  const modelURL = './../examples/Data/models/brave_robot/brave_robot.glb';
  let model, marker;

  const canvas_process = document.createElement('canvas');
  const context_process = canvas_process.getContext('2d', {willReadFrequently: true});
  const targetCanvas = document.querySelector("#canvas");

  const renderer = new THREE.WebGLRenderer({canvas: targetCanvas, alpha: true, antialias: true, logarithmicDepthBuffer: true});
  renderer.setPixelRatio(window.devicePixelRatio);

  const threeGLTFLoader = new GLTFLoader();

  const scene = new THREE.Scene();

  let fov = 0.8 * 180 / Math.PI;
  let ratio = input_width / input_height;

  const cameraConfig= {
    fov: fov,
    aspect: ratio,
    near: 0.01,
    far: 1000
  }

  const camera = new THREE.PerspectiveCamera(cameraConfig);
  camera.matrixAutoUpdate = false;

  scene.add(camera);

  const light = new THREE.AmbientLight(0xffffff);
  scene.add(light);

  const root = new THREE.Object3D();
  scene.add(root);

  root.matrixAutoUpdate = false;

  threeGLTFLoader.load(modelURL, (gltf) => {
    model = gltf.scene;
        console.log(model)
    /*let scale = 180;
    model.scale.set(scale, scale, scale);
    model.rotation.x = Math.PI / 2;
    root.add(model);*/
  },
      ( error ) => {

        console.log( 'An error happened', error );

      });

  if(model ) {
    let scale = 180;
    model.scale.set(scale, scale, scale);
    model.rotation.x = Math.PI / 2;
    root.add(model);
  }


  /*const root = new THREE.Object3D();
  scene.add(root);*/

  //root.matrixAutoUpdate = false;

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

    worker = new Worker('../js/artoolkitNFT_ES6.worker.js')

    worker.postMessage({type: "load", pw: pw, ph: ph, camera_para: camera_para, marker: markerUrl});

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
          model.visible = true;
          break;
        }
        case 'not found': {
          found(null);
          model.visible = false;
          break;
        }
        case 'markerInfos': {
          marker = msg.marker;
          model.position.y = ((marker.height / marker.dpi) * 2.54 * 10) / 2.0;
          model.position.x = ((marker.width / marker.dpi) * 2.54 * 10) / 2.0;
        }
      }
      track_update();
      process();
    };
  };

  let world;

  const found = function (msg) {
    if (!msg) {
      world = null;
    } else {
      world = JSON.parse(msg.matrixGL_RH);
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
      root.matrix = null;
    } else {
      // set matrix of 'root' by detected 'world' matrix
      setMatrix(root.matrix, world);
    }
    renderer.render(scene, camera);
  };

  const process = function () {
    context_process.fillStyle = 'black';
    context_process.fillRect(0, 0, pw, ph);
    context_process.drawImage(video, 0, 0, vw, vh, ox, oy, w, h);

    const imageData = context_process.getImageData(0, 0, pw, ph);
    worker.postMessage({ type: 'process', imagedata: imageData }, [imageData.data.buffer]);
  }

  const tick = function () {
    draw();
    requestAnimationFrame(tick);
  };

  load();
  tick();
  process();
}
