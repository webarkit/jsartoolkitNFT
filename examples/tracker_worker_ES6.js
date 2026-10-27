// The tracker facade example (#720): createNFTTrackerWorker runs the tracker in a worker,
// and this file does the camera side and the three.js rendering on the page.
//
// `createNFTTrackerWorker` is a global here: the page loads ../dist/ARToolkitNFT.js with a
// <script> tag. The worker it starts is picked at run time (D4): td when the page is
// cross-origin isolated (python-server.py sets COOP/COEP), otherwise simd, otherwise default.
import * as THREE from "three";
// D20: the letterbox rule comes from @webarkit/camera-view, served from the repository root.
import {
  getProcessGeometry,
  toFrameGeometry,
} from "../node_modules/@webarkit/camera-view/dist/camera-view.mjs";

/** Logs the average processMs about once a second. */
function processMsLogger() {
  let sum = 0;
  let count = 0;
  let last = performance.now();
  return (ms) => {
    sum += ms;
    count++;
    const now = performance.now();
    if (now - last >= 1000) {
      console.log(
        `processMs: ${(sum / count).toFixed(1)} ms average over ${count} frames`,
      );
      sum = 0;
      count = 0;
      last = now;
    }
  };
}

/** The worker file the browser loaded, read from the resource timing entries. */
function loadedWorkerFile() {
  const entry = performance
    .getEntriesByType("resource")
    .find((e) => /NFTTracker(_simd|_td)?\.worker\.js$/.test(e.name));
  return entry ? entry.name.split("/").pop() : null;
}

export default async function start(markerUrl, video, render_update, track_update) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  // D17: the camera side letterboxes, not the tracker. The video is drawn into a 4:3
  // processing frame (at most 320 x 240), and `geometry` records where it went, so that
  // projectionFor() can undo it. `floor` = true: these are the values actually drawn,
  // as CameraView does.
  const geometry = toFrameGeometry(vw, vh, getProcessGeometry(vw, vh, false, true));
  const { frameWidth: pw, frameHeight: ph } = geometry;

  const canvas_process = document.createElement("canvas");
  canvas_process.width = pw;
  canvas_process.height = ph;
  const ctx = canvas_process.getContext("2d", { willReadFrequently: true });

  console.log(
    `crossOriginIsolated: ${globalThis.crossOriginIsolated === true}, video ${vw} x ${vh}, processing frame ${pw} x ${ph}`,
  );

  // The tracker's frame size is the processing frame's: process() throws a RangeError
  // for any other size (D17). Relative URLs resolve against this page.
  const tracker = await createNFTTrackerWorker(
    { width: pw, height: ph, cameraParam: "Data/camera_para.dat" },
    { workerBase: "../dist/" },
  );
  console.log("tracker worker:", loadedWorkerFile() ?? "(not in the resource timing)");

  // origin "center": the pose's origin is the middle of the image (D11), so the model
  // needs no offset of its own.
  const [load] = await tracker.addNFTTargets([markerUrl], { origin: "center" });
  if (load.status !== "loaded") {
    throw new Error(`${load.url}: ${load.reason}: ${load.message}`);
  }
  console.log("target loaded:", load.info);

  const loader = document.getElementById("loading");
  if (loader) {
    loader.querySelector(".loading-text").innerText = "Start the tracking!";
    setTimeout(() => loader.remove(), 2000);
  }

  const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector("#canvas"),
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  camera.matrixAutoUpdate = false;
  scene.add(camera);

  // The video is shown with `object-fit: cover` (css/nft-style.css), so the projection
  // fits the source video to the window the same way.
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.projectionMatrix.fromArray(
      tracker.projectionFor(
        { width: innerWidth, height: innerHeight, fit: "cover" },
        geometry,
      ),
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  };
  resize();
  window.addEventListener("resize", resize);

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshNormalMaterial(),
  );
  // In millimetres, as the pose.
  sphere.scale.set(200, 200, 200);
  const root = new THREE.Object3D();
  root.matrixAutoUpdate = false;
  root.visible = false;
  root.add(sphere);
  scene.add(root);

  const logProcessMs = processMsLogger();

  const handle = (result) => {
    // D13: a frame sent while the worker was busy is dropped, not queued.
    if (result.skipped) return;
    track_update();
    logProcessMs(result.processMs);
    // D8: `transitions` is debounced by lostTimeout, so the model does not flicker.
    for (const t of result.transitions) {
      console.log(`target ${t.id}: ${t.type}`);
      if (t.id === load.info.id) root.visible = t.type === "found";
    }
    // `targets` is this frame's raw tracking: within the grace window before `lost`,
    // pose is null and the model keeps its last pose.
    for (const target of result.targets) {
      if (target.id === load.info.id && target.pose) {
        root.matrix.fromArray(target.pose);
      }
    }
  };

  const tick = () => {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, pw, ph);
    ctx.drawImage(video, 0, 0, vw, vh, geometry.x, geometry.y, geometry.width, geometry.height);
    // The frame's buffer is transferred to the worker (D6): a new ImageData each call.
    tracker
      .process(ctx.getImageData(0, 0, pw, ph), performance.now())
      .then(handle, (e) => console.error(e));

    render_update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  window.addEventListener("pagehide", () => tracker.dispose());
}
