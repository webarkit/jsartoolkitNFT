![github releases](https://flat.badgen.net/github/release/webarkit/jsartoolkitNFT)
![github stars](https://flat.badgen.net/github/stars/webarkit/jsartoolkitNFT)
![github forks](https://flat.badgen.net/github/forks/webarkit/jsartoolkitNFT)
![npm package version](https://flat.badgen.net/npm/v/@webarkit/jsartoolkit-nft)
![PyPI package version](https://flat.badgen.net/pypi/v/artoolkitnft)
![Dependabot Badge](https://flat.badgen.net/github/dependabot/webarkit/jsartoolkitNFT)
[![Tested with Vitest](https://img.shields.io/badge/tested_with-Vitest-6E9F18.svg?logo=vitest&logoColor=white)](https://vitest.dev/)
[![CI](https://github.com/webarkit/jsartoolkitNFT/actions/workflows/CI.yml/badge.svg)](https://github.com/webarkit/jsartoolkitNFT/actions/workflows/CI.yml)
[![Build jsartoolkitNFT CI](https://github.com/webarkit/jsartoolkitNFT/actions/workflows/main.yml/badge.svg)](https://github.com/webarkit/jsartoolkitNFT/actions/workflows/main.yml)




# JSARToolKitNFT

Emscripten port of [WebARKitLib](https://github.com/webarkit/WebARKitLib) to JavaScript.
Modified and lighter version of [JSARToolKit5](https://github.com/artoolkitx/jsartoolkit5).

Try the example !! [www.webarkit.org/examples/artoolkitnft_es6_example](https://www.webarkit.org/examples/artoolkitnft_es6_example)

## Features
### Markers Types

**JSARToolKitNFT** support only this type of marker:

- NFT (natural feature tracking) markers ✅ 🎉 🎨
- Multi NFT markers !!!

### Multi-marker tracking

Load several NFT markers with `loadNFTMarkers()` and every one in view is tracked at the same
time: `getNFTMarker` fires once per visible marker each frame, with that marker's `index` and its
own pose, and `lostNFTMarker` fires for each marker on its own when it leaves the view.

Detection — finding a marker that is not tracked yet — is far more expensive than tracking one
that is: a detection pass costs the full detection time on the frame where it runs. So it follows
a policy:

- while no marker is tracked, detection runs on every frame;
- while at least one marker is tracked and another loaded marker is not, it runs at most once per
  detection interval, counted from the end of the previous pass, so a marker entering the view is
  still picked up and every pass is followed by tracking-only frames, however long a pass takes;
- while every loaded marker is tracked, it does not run.

Two setters on `ARControllerNFT` tune this:

- `setContinuousDetection(enabled)` — default `true`. With `false`, no detection runs once any
  marker is tracked, until tracking is lost (the single-marker behaviour of 1.12.0 and earlier).
- `setDetectionInterval(ms)` — the interval above, in milliseconds. Default `300` in the default
  and SIMD builds. `0` detects on every frame; negative values count as `0`.

The threaded (Pthread) build detects on a worker thread, off the main thread, so its default
interval is `0`; both setters work there too, and an interval saves worker CPU. The Node.js build
runs the same native code as the default build, so it tracks several markers and honours both
setters, with the same `300` ms default interval.

Note for upgraders: `getTransformationMatrix()` now returns a fresh array for each frame a marker
is found, instead of updating one array in place. Read it each frame rather than keeping a
reference and expecting it to change.

### Runtime settings: `configure()`

`configure(patch)` changes several settings at once, on `ARControllerNFT` and `ARToolkitNFT`, in
every build. `getRuntimeSettings()` returns all of them, with the values in effect:

| Setting | Default | What it does |
| --- | --- | --- |
| `near`, `far` | `0.1`, `1000` | Projection planes. `getCameraMatrix()` follows them at once. |
| `continuousDetection` | `true` | As `setContinuousDetection()` above. |
| `detectionInterval` | `300` (`0` threaded) | As `setDetectionInterval()` above, in ms. |
| `filtering` | `true` | Pose filtering, as `setFiltering()`. |
| `logLevel` | `ARLogLevel.Info` (1) | As `setLogLevel()`. |
| `ar2` | see below | AR2 tracking: `trackingThresh` 5, `simThresh` 0.5, `searchFeatureNum` 16, `templateSize1` / `templateSize2` 6, `searchSize` 6 or 12, depending on the build and CPU count (the preset's choice). |

```javascript
ar.configure({ near: 1, far: 5000, ar2: { simThresh: 0.6 } });
ar.getRuntimeSettings().far; // 5000
```

The patch is merged into the current settings (`ar2` field by field), checked, and applied in one
step: if any value is wrong, nothing changes. An unknown key, a value of the wrong type or a
non-integer for an integer setting throws a `TypeError`; this includes the square-marker keys
`threshold`, `thresholdMode`, `imageProcMode` and `debugMode`, which do nothing on NFT. A value
out of range throws a `RangeError`. The individual setters keep working as before.

Behaviour changes in this release:

- `getCameraMatrix()` right after initialisation is built with the near plane `0.1`, the value
  `ARControllerNFT` always reported, instead of `0.0001`. `setProjectionNearPlane()` and
  `setProjectionFarPlane()` now rebuild the matrix at once, so `recalculateCameraLens()` is no
  longer needed.
- The threaded build now filters poses by default, like the other builds, and `setFiltering()`
  takes effect there (#692). Before, it was ignored.

### Log level at initialisation

`initWithDimensions()`, `initWithImage()` and `customInit()` take a last, optional
`{ logLevel }` argument. It is applied before the native core is created, so the start-up output
follows it:

```javascript
import { ARControllerNFT, ARLogLevel } from '@webarkit/jsartoolkit-nft'

const ar = await ARControllerNFT.initWithDimensions(640, 480, 'camera_para.dat', false, {
  logLevel: ARLogLevel.Error,
});
```

(In the Node build, which has no `internalLuma` argument, the options are the fourth argument.)

The version line is logged at `ARLogLevel.RelInfo`, so it still prints at `Error`. The camera
parameter table that the native camera loader prints is not gated yet; it is tracked in
[webarkit/WebARKitLib#113](https://github.com/webarkit/WebARKitLib/issues/113). The level belongs
to each controller, since each one runs in its own WASM module.

## WASM

has **WASM** embedded in a single file!

## ZFT

**JSARToolKitNFT** now supports loading NFT markers from `.zft` compressed files. This allows for faster loading times and reduced file sizes.

A URL that ends in `.zft` is downloaded directly, once. A URL without an extension (`path/to/marker`) is
checked for a `.zft` with one asynchronous request, and falls back to the `.iset`, `.fset` and `.fset3`
files when there is none. Any HTTP error status on that check means "no `.zft`", so storage services that
answer 403 for a missing object still work. A marker without a `.zft` logs one 404 in the console; pass
`probeZFT: false` to skip the check (see below).

## Loading NFT markers

`loadNFTMarker` and `loadNFTMarkers` return a Promise that resolves with the marker ids **once the files are
downloaded and registered**, so tracking can start right after the `await`:

```javascript
const [id] = await arController.loadNFTMarker('path/to/marker')
const ids = await arController.loadNFTMarkers(['path/to/a', 'path/to/b'])
```

A failure rejects with an `NFTLoadError`. Its `kind` is one of `http`, `network`, `missing`, `format`,
`rejected` or `argument`, and it carries the `url`, the HTTP `status` and the `cause` when there are any.
`NFTLoadError` is exported from every entry point. Test `err.name === 'NFTLoadError'` rather than `instanceof`, because each bundle carries its own copy of the class.

```javascript
try {
  await arController.loadNFTMarker('path/to/marker')
} catch (err) {
  if (err.name === 'NFTLoadError' && err.kind === 'http') {
    console.error('Not found:', err.url, err.status)
  }
}
```

The callbacks still work but are deprecated. A call that passes a callback never rejects for a load failure (a throw from your own callback still rejects): a failure goes to
`onError` once (or to `console.error` when there is no `onError`) and the Promise resolves `[]`.

```javascript
arController.loadNFTMarker('path/to/marker', (id) => { /* loaded */ }, (code) => { /* HTTP status, or -1 */ })
```

In the browser builds (default, `simd`, `td`) a fourth argument takes options. `signal` cancels the load, and
`AbortSignal.timeout()` gives a timeout; an aborted load rejects with the signal's reason. `probeZFT: false`
skips the `.zft` check for markers that have none.

```javascript
await arController.loadNFTMarker('path/to/marker', undefined, undefined, {
  signal: AbortSignal.timeout(10000),
  probeZFT: false,
})
```

`fetch` replaces `XMLHttpRequest` and `axios`, so a `file://` URL no longer loads. WebAR needs a secure
context anyway, and Cordova and Capacitor serve over a custom scheme. The Node build reads local files and has
no `signal` or `probeZFT`; its `loadNFTMarker(s)` return an already-settled Promise. The deprecated legacy
APIs in `build/` keep their callback-only signatures.


## ES6

❕From 0.8.0 version has **ES6** feature 🎉 😻

## Typescript

❕From 0.9.0 version has **Typescript** feature 💖 💣

## Pthread

From 1.6.0 version has **Pthread** experimental feature 🎉 🎉 🎉

❕❕❕ ATTENTION: this feature is experimental, and it is not well tested yet. It is not recommended to use it in production.
You need to set up a server with COOP and COEP headers to use this feature. Read this [Emscripten article](https://emscripten.org/docs/porting/pthreads.html#pthreads-support)

### Threaded build: deploying

The threaded build is two files, and the worker must be served **next to the script that loads the bundle**: with a plain `<script>` tag that is the bundle's own folder, with `importScripts()` it is the calling worker script's folder, and in re-bundled apps it is the folder of the last `<script src>` on the page (details below):

- `dist/ARToolkitNFT_td.js`: the bundle you load;
- `dist/ARToolkitNFT_td.worker.js`: the pthread worker (an ES module worker, fixed name), which the bundle loads from the folder above.

Serve them with the `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers.

With a `<script>` tag, keep the two files side by side and you are done. With `importScripts()` in a worker, the bundle URL is the URL of the worker script that calls `importScripts` (the same rule as webpack), so `ARToolkitNFT_td.worker.js` must sit in the folder of that calling worker script, not next to the bundle. If you **re-bundle** it with your own build (Vite, webpack, ...), the bundler copies `ARToolkitNFT_td.js` into your output but does not know about the worker, so copy it next to the output bundle yourself:

```javascript
// Vite: vite.config.js, with vite-plugin-static-copy
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default {
  plugins: [
    viteStaticCopy({
      targets: [{ src: 'node_modules/@webarkit/jsartoolkit-nft/dist/ARToolkitNFT_td.worker.js', dest: 'assets' }],  // = build.assetsDir
    }),
  ],
}
```

The worker is resolved next to the script that loads the bundle. For module or re-bundled apps that is the last `<script src>` on the page, which in a Vite production build is `/assets/index-*.js`, hence `dest: 'assets'`. (A `public/` placement works only with `build.assetsDir: ''`.) In `vite dev` the location differs (under `/src/`), so test the threaded build with `vite build && vite preview`.

```javascript
// webpack: webpack.config.js, with copy-webpack-plugin
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
  plugins: [
    new CopyPlugin({
      patterns: [{ from: 'node_modules/@webarkit/jsartoolkit-nft/dist/ARToolkitNFT_td.worker.js', to: '.' }],
    }),
  ],
}
```

The symptom of a missing worker is a 404 for `ARToolkitNFT_td.worker.js` in the network panel, and detection that never finishes.

## InternalLuma with simd
Enable internal luma calculation with simd instructions. This feature is experimental and it is not well tested yet. Set the internalLuma flag to true in the ARControllerNFT constructor, or in the `initWithDimensions / initWithImage` static methods.

## Using the library 💥
You can use raw.githack.com links:

**WASM** version of the library (deprecated it will be removed in a future release):

```html
<script src="https://raw.githack.com/webarkit/jsartoolkitNFT/master/build/artoolkitNFT_wasm.js">
```

**WASM** version of the library as a Module:

```html
<script src="https://raw.githack.com/webarkit/jsartoolkitNFT/master/build/artoolkitNFT_ES6_wasm.js">
```

**WASM** version of the library as a Module with new ES6 feature:

```html
<script src="https://raw.githack.com/webarkit/jsartoolkitNFT/master/build/artoolkitNFT_embed_ES6_wasm.js">
```

**NO WASM** minified (deprecated it will be removed in a future release):

```html
<script src="https://raw.githack.com/webarkit/jsartoolkitNFT/master/build/artoolkitNFT.min.js">
```

or (recommended) use the **UMD** library:

```html
<script src="https://raw.githack.com/webarkit/jsartoolkitNFT/master/dist/ARToolkitNFT.js">
```

or you can install with npm and use as a module:

```nodejs
npm i @webarkit/jsartoolkit-nft
```
then:

```javascript
import { ARToolkitNFT, ARControllerNFT } from '@webarkit/jsartoolkit-nft'
```

The package ships an [`exports`](https://nodejs.org/api/packages.html#package-entry-points) map, so the right build is picked automatically per environment:

- in a **browser / bundler**, `@webarkit/jsartoolkit-nft` resolves to the UMD build (`dist/ARToolkitNFT.js`);
- in **Node.js**, it resolves to the Node build: `dist/ARToolkitNFT_node.js` (CommonJS) for `require()`, and `dist/ARToolkitNFT_node.mjs` (a thin ES module wrapper over it) for `import`.

```javascript
// browser / bundler -> UMD build
import { ARToolkitNFT, ARControllerNFT } from '@webarkit/jsartoolkit-nft'

// Node.js, ES module -> Node build, named imports
import { ARToolkitNFT, ARControllerNFT } from '@webarkit/jsartoolkit-nft'

// Node.js, CommonJS -> Node build
const { ARToolkitNFT, ARControllerNFT } = require('@webarkit/jsartoolkit-nft')
```

You can also target a specific build through a named subpath:

| Import | Build |
| --- | --- |
| `@webarkit/jsartoolkit-nft` | UMD (browser) / Node (Node.js) |
| `@webarkit/jsartoolkit-nft/simd` | SIMD WASM build |
| `@webarkit/jsartoolkit-nft/td` | threaded (pthread) build |
| `@webarkit/jsartoolkit-nft/node` | Node build |

```javascript
import '@webarkit/jsartoolkit-nft/simd'
```

The raw `dist/*` deep-imports (e.g. `@webarkit/jsartoolkit-nft/dist/ARToolkitNFT_simd.js`) still work, and `<script>` / `importScripts` URLs are not affected by the `exports` map. In Node both `require()` and a named `import { ... }` work: the ES module entry re-exports the CommonJS bundle, so the two share one instance of every class.

**Note**: All the examples in the repository are running the code inside a Worker (don't use it in the main thread!). So i you need to import the library in a worker you need to use the `importScripts` function.

```javascript
// example of import in a worker with the wasm code lib
importScripts("../build/artoolkitNFT_wasm.js");
// or the dist lib
importScripts("../dist/ARToolkitNFT.js");
```

## Downloads

You can download the build libs in the [releases page](https://github.com/webarkit/jsartoolkitNFT/releases). Starting from version 0.8.0 it is possible to download `dist` or `build` zip packages and from 0.9.6 version only single libs (no zipped).

or you can clone the repository with git, follow the instructions below:

## Clone the repository 🌀

1. Clone this repository
2. Clone WebARKitLib project to get the latest source files. From within JSARToolKitNFT directory do `git submodule update --init`. If you already cloned WebARKitLib to a different directory you can:

  - create a link in the `jsartoolkitNFT/emscripten/` directory that points to WebARKitLib (`jsartoolkitNFT/emscripten/WebARKitLib`) (Linux and macOS only)
  - or, set the `WEBARKITLIB_ROOT` environment variable to point to your WebARKitLib clone
  - or, change the `tools/makem.js` file to point to your WebARKitLib clone (line 32-33)

## Documentation

You can build the documentation of the library. You need node and npm installed and then run these commands in a console:

```nodejs
npm install
npm run docs
```
At this point you have build the docs in the `docs/` folder, you should run a server and then go to `docs/` folder.

## Using with React

Try [react-three-arnft](https://github.com/j-era/react-three-arnft) a specific project that uses JsartoolkitNFT with React and Three.js.

## ARnft library

**JSARToolKitNFT** is used by [ARnft](https://github.com/webarkit/ARnft) a small library that helps developers to create **WebAR** apps.

## Python bindings 🐍 (experimental)

❕❕❕ ATTENTION: the Python bindings are experimental. The API may change without notice and they are not yet recommended for production use.

**JSARToolKitNFT** also provides Python bindings via [pybind11](https://github.com/pybind/pybind11), wrapping the same WebARKitLib C/C++ core used by the JavaScript build. They expose a high-level `ARControllerNFT` class and a lower-level `artoolkitnft_core` extension module so that NFT marker detection can be driven from Python.

Install from **PyPI**:

```bash
pip install artoolkitnft
```

### Supported platforms

| platform | wheels |
|---|---|
| Linux x86_64 | CPython 3.9-3.13 |
| macOS Apple silicon (arm64) | CPython 3.9-3.13 |
| Windows x86_64 | CPython 3.9-3.13 |
| macOS Intel (x86_64) | **none** |

Wheels only — there is deliberately **no source distribution**, because the build compiles
sources from outside the package directory and needs the WebARKitLib git submodule, neither
of which survives an sdist. On an unsupported platform `pip` reports
`no matching distribution found` rather than attempting a build that cannot succeed.
Intel macOS is absent because GitHub retired its free Intel runner and removes x86_64 macOS
entirely in August 2027; build from source if you need it.

**TestPyPI** carries rehearsal builds only, and should not be used to install the package:

```bash
pip install -i https://test.pypi.org/simple/ artoolkitnft
```

### What works

- Loading NFT marker datasets (`.fset`, `.fset3`, `.iset`)
- KPM-based marker detection
- AR2 tracking with pose matrix output
- Projection near/far plane setters
- Threshold and image-processing mode
- Optional pre-computed grayscale input via `setGrayData`
- Event listener for `getNFTMarker` / `lostNFTMarker`

### Not yet implemented

- Live camera capture example (the current example processes a single static image)
- `getKpmImageWidth` / `getKpmImageHeight` (temporarily excluded from the build)
- `configure()` / `getRuntimeSettings()` (see [Runtime settings](#runtime-settings-configure)).
  The plane setters already rebuild the camera matrix, as in JS.

The bindings are built and tested on **Linux**, **macOS** (Apple silicon) and **Windows** via the
[Build and Test Python Bindings](https://github.com/webarkit/jsartoolkitNFT/actions/workflows/build-python.yml)
workflow, and released by
[Publish Python package](https://github.com/webarkit/jsartoolkitNFT/actions/workflows/publish-python.yml),
which publishes to PyPI through trusted publishing (OIDC) on a `python/<version>` tag.

For full build-from-source instructions, local development tips and the publishing workflow, see [`python-bindings/README.md`](python-bindings/README.md).

## Node.js 🟢 (experimental)

❕❕❕ ATTENTION: Node.js support is experimental and under active development. The API may change without notice and it is not yet recommended for production use.

**JSARToolKitNFT** ships a dedicated Node.js build (`dist/ARToolkitNFT_node.js`), compiled from the same TypeScript sources and WebARKitLib C/C++ core as the browser build. It lets you run NFT marker detection server-side on static image data, without a browser, camera or `<canvas>`.

When you install the package, Node automatically resolves to this build (see the [`exports`](#using-the-library-) map):

```javascript
// ES module — named imports resolve to dist/ARToolkitNFT_node.mjs
import { ARControllerNFT } from '@webarkit/jsartoolkit-nft';
// CommonJS — resolves to the Node build in Node.js
const { ARControllerNFT } = require('@webarkit/jsartoolkit-nft');
// or the explicit subpath
const { ARControllerNFT } = require('@webarkit/jsartoolkit-nft/node');
```

`process()` takes raw **RGBA** pixel data, so decoding the image is up to you. No decoder is
bundled with the package — install the one the example you follow uses:

```bash
# for the sharp example below
npm install @webarkit/jsartoolkit-nft sharp

# or, for the canvas example
npm install @webarkit/jsartoolkit-nft canvas
```

A minimal example decoding an image with [sharp](https://github.com/lovell/sharp) and feeding the RGBA pixels to the controller:

```javascript
const { ARControllerNFT } = require('@webarkit/jsartoolkit-nft');
const sharp = require('sharp');

async function init() {
  const arControllerNFT = await new ARControllerNFT(2000, 1500, '/camera_para.dat');
  const ar = await arControllerNFT._initialize();

  // process() expects RGBA pixel data, so add the alpha channel.
  const data = await sharp('pinball-demo.jpg').ensureAlpha().raw().toBuffer();
  const imageData = new Uint8Array(data.buffer);

  ar.on('getNFTMarker', (e) => console.log('NFT marker detected: ', e));

  ar.loadNFTMarker('DataNFT/pinball', (id) => {
    ar.trackNFTMarkerId(id);
    // NFT tracking needs several iterations before it locks on.
    for (let i = 0; i < 10; i++) ar.process(imageData);
  });
}

init();
```

### What works

- Loading NFT marker datasets (`.fset`, `.fset3`, `.iset`). Camera and marker paths are read
  from disk relative to the working directory.
- KPM-based marker detection and AR2 tracking with pose matrix output
- [Multi-marker tracking](#multi-marker-tracking): load several markers with
  `loadNFTMarkers(['DataNFT/pinball', 'DataNFT/kuva'], onSuccess, onError)` and each one in view
  is tracked, with `setContinuousDetection()` / `setDetectionInterval()` as in the browser builds.
  Markers can also be added in later calls: ids continue from the markers already loaded, and a
  call that fails leaves them in place.
- Event listeners for `getNFTMarker` and `lostNFTMarker`
- Decoding image input via [sharp](https://github.com/lovell/sharp) or the [canvas](https://github.com/Automattic/node-canvas) package (`process()` expects **RGBA** pixel data). Neither is a dependency of this package — install whichever you prefer.

### Not yet implemented

- Live camera capture (the examples process a single static image)

Runnable examples live in [`examples/node`](examples/node): [`example_dist.js`](examples/node/example_dist.js) (sharp + the Node build) and [`example_canvas.js`](examples/node/example_canvas.js) (the [canvas](https://github.com/Automattic/node-canvas) package). Run one with:

```bash
cd examples/node && node example_dist.js
```

## Project Structure 📂

- `build/` (compiled debug and minified versions of JSARToolKitNFT)
- `dist/` (compiled UMD lib with ES6 of JSARToolKitNFT)
- `emscripten/` (C/C++ source code for ARToolKitNFT)
- `examples/` (demos and examples using JSARToolKitNFT)
- `js/` (api and workers of JSARToolKitNFT.js for the standard api)
- `python-bindings/` (experimental Python bindings — see section above)
- `src/` (source code of ARToolKitNFT with Typescript)
- `tests/` (the Vitest browser suite in `tests/vitest/` and the Node suite in `tests/node/` — see [Running the tests](#running-the-tests-))
- `tools/` (build scripts for building JSARToolKitNFT with Emscripten)
- `types/` (type definitions of ARToolKitNFT)

## Running the tests 🧪

Install dependencies, then fetch the browser the test suite drives:

```bash
npm ci
npx playwright install chromium
```

That second step is required. The browser suite runs in a real Chromium supplied by Playwright,
and without it you get a missing-executable error before any spec starts. It is the only browser
the tests need.

```bash
npm test              # everything: the browser suite, then the Node suite
npm run test:vitest   # the browser suite only
npm run test:node     # the Node suite only
npm run test:coverage # the browser suite, with an lcov report scoped to src/
```

`npm run test:vitest:watch` re-runs on change while you work. To run a single file, pass its
path:

```bash
npx vitest run tests/vitest/legacy-min.test.ts
```

What the suites cover:

- **The TypeScript API** (`tests/vitest/` over `src/`): `ARControllerNFT` as consumers import
  it. This covers marker loading, `process()`, two markers detected in a real photo and
  marker-lost events, on the default, SIMD and threaded builds.
- **Every browser build** (`legacy-*.test.ts`, `embed-es6.test.ts`, `module-surface.test.ts`):
  each committed artifact in `build/` loads, detects the pinball print in
  `examples/node/pinball-demo.jpg`, and exports what `src/` relies on (`HEAPU8`, `FS`,
  `_malloc`).
- **The published bundle** (`dist-bundle.test.ts`): `dist/ARToolkitNFT.js` loaded with a script
  tag, the way a `<script>` consumer gets it.
- **The Node build** (`tests/node/`), run with `node --test`.

Tests run against the **committed** `build/` and `dist/` artifacts. If you change anything under
`emscripten/` or `tools/makem.js`, rebuild before testing, or you will be testing stale
WebAssembly. See [AGENTS.md](AGENTS.md).

## WebAssembly 👋

**JSARToolKitNFT** supports WebAssembly. The library builds WebAssembly artifacts during the build process, **WASM** is embedded in a single file. This is `build/artoolkitNFT_wasm.js`. To use it, include the `artoolkitNFT_wasm.js` into your html page like this:

```html
<script src="../build/artoolkitNFT_wasm.js"></script>
```

As loading the WebAssembly artifact is done asynchronously, there is a callback that is called when everything is ready.

```javascript
window.addEventListener('artoolkitNFT-loaded', () => {
    //do artoolkit stuff here
});
```

See the examples folder for details.


## Build the project 🔨

Go to the [wiki](https://github.com/kalwalt/jsartoolkitNFT/wiki#build-instructions) for more information. Note that you only need to build the library if you make changes to the C++ core or TypeScript source code. The TypeScript bundles in `dist/` are built with [Vite](https://vite.dev) (`npm run build-ts`), which also runs `tsc` for the declarations in `types/`. There are three ways to build the project:


### 1. Natively on Host (Windows, macOS, Linux)
To build natively, you must have the following tools installed and available in your environment's PATH:
* **Node.js** (v22.18+ or v24.11+; [`.nvmrc`](.nvmrc) pins 24)
* **Emscripten SDK** (v4.0.17+)

Once set up, run:
```bash
npm install
npm run build
```

---

### 2. Using Dev Containers (Recommended)
If you use **Visual Studio Code**, you can build and develop inside a pre-configured Docker container using the **Dev Containers** extension:

1. Install the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension.
2. Open this repository in Visual Studio Code.
3. Click the green button in the bottom-left corner of the window (or press `Ctrl+Shift+P` / `Cmd+Shift+P` and search for `Dev Containers: Reopen in Container`).
4. VS Code will build the Docker container and configure your environment with EMSDK, CMake, Ninja, Node.js, and all native compilation dependencies.
5. In the container terminal, run:
   ```bash
   npm run build
   ```

---

### 3. Using Manual Docker Scripts
If you prefer running Docker manually from the command line, you can use the built-in npm scripts:

1. **Start the background Docker container**:
   ```bash
   npm run setup-docker
   ```
   This resolves host workspace paths automatically (cross-platform on Windows, macOS, and Linux) and starts a persistent Emscripten container.

2. **Build the library inside the container**:
   ```bash
   npm run build-docker
   ```
   *(Or run `npm run build-docker-no-libar` if you want to skip building `libar.o`)*

### Notes
The jsartoolkitNFT npm package is served until version **0.9.4** from `@kalwalt/jsartoolkit-nft`. By 0.9.5 version from `@webarkit/jsartoolkit-nft`.

