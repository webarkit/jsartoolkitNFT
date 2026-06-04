![github releases](https://flat.badgen.net/github/release/webarkit/jsartoolkitNFT)
![github stars](https://flat.badgen.net/github/stars/webarkit/jsartoolkitNFT)
![github forks](https://flat.badgen.net/github/forks/webarkit/jsartoolkitNFT)
![npm package version](https://flat.badgen.net/npm/v/@webarkit/jsartoolkit-nft)
![Dependabot Badge](https://flat.badgen.net/github/dependabot/webarkit/jsartoolkit-nft)
[![Tested with Jasmine](https://img.shields.io/badge/tested_with-Jasmine-8A4182.svg)](https://jasmine.github.io/)
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

## WASM

has **WASM** embedded in a single file!

## ZFT

**JSARToolKitNFT** now supports loading NFT markers from `.zft` compressed files. This allows for faster loading times and reduced file sizes.


## ES6

❕From 0.8.0 version has **ES6** feature 🎉 😻

## Typescript

❕From 0.9.0 version has **Typescript** feature 💖 💣

## Pthread

From 1.6.0 version has **Pthread** experimental feature 🎉 🎉 🎉

❕❕❕ ATTENTION: this feature is experimental, and it is not well tested yet. It is not recommended to use it in production.
You need to set up a server with COOP and COEP headers to use this feature. Read this [Emscripten article](https://emscripten.org/docs/porting/pthreads.html#pthreads-support)

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
- in **Node.js**, it resolves to the Node build (`dist/ARToolkitNFT_node.js`, CommonJS).

```javascript
// browser / bundler -> UMD build
import { ARToolkitNFT, ARControllerNFT } from '@webarkit/jsartoolkit-nft'

// Node.js -> Node build
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

The raw `dist/*` deep-imports (e.g. `@webarkit/jsartoolkit-nft/dist/ARToolkitNFT_simd.js`) still work, and `<script>` / `importScripts` URLs are not affected by the `exports` map. In Node the build is CommonJS, so use `require()` or a default `import` (named `import { ... }` will come with a future ESM build).

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

❕❕❕ ATTENTION: the Python bindings are experimental and the package is published only to **TestPyPI** for now. The API may change without notice and the bindings are not yet recommended for production use.

**JSARToolKitNFT** also provides Python bindings via [pybind11](https://github.com/pybind/pybind11), wrapping the same WebARKitLib C/C++ core used by the JavaScript build. They expose a high-level `ARControllerNFT` class and a lower-level `artoolkitnft_core` extension module so that NFT marker detection can be driven from Python.

Install from **TestPyPI**:

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

The Python bindings are built and tested on **Linux**, **macOS** and **Windows** via the [Build and Test Python Bindings](https://github.com/webarkit/jsartoolkitNFT/actions/workflows/build-python.yml) workflow.

For full build-from-source instructions, local development tips and the TestPyPI publishing workflow, see [`python-bindings/README.md`](python-bindings/README.md).

## Node.js 🟢 (experimental)

❕❕❕ ATTENTION: Node.js support is experimental and under active development. The API may change without notice and it is not yet recommended for production use.

**JSARToolKitNFT** ships a dedicated Node.js build (`dist/ARToolkitNFT_node.js`), compiled from the same TypeScript sources and WebARKitLib C/C++ core as the browser build. It lets you run NFT marker detection server-side on static image data, without a browser, camera or `<canvas>`.

When you install the package, Node automatically resolves to this build (see the [`exports`](#using-the-library-) map):

```javascript
// CommonJS — resolves to the Node build in Node.js
const { ARControllerNFT } = require('@webarkit/jsartoolkit-nft');
// or the explicit subpath
const { ARControllerNFT } = require('@webarkit/jsartoolkit-nft/node');
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

- Loading NFT marker datasets (`.fset`, `.fset3`, `.iset`)
- KPM-based marker detection and AR2 tracking with pose matrix output
- Event listener for `getNFTMarker`
- Decoding image input via [sharp](https://github.com/lovell/sharp) or the [canvas](https://github.com/Automattic/node-canvas) package (`process()` expects **RGBA** pixel data)

### Not yet implemented

- Native ESM consumption (`import { ARControllerNFT } from ...`): the Node build is CommonJS for now, so use `require()` or a default `import`
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
- `tests/` (tests - WIP)
- `tools/` (build scripts for building JSARToolKitNFT with Emscripten)
- `types/` (type definitions of ARToolKitNFT)

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

Go to the [wiki](https://github.com/kalwalt/jsartoolkitNFT/wiki#build-instructions) for more information. Note that you only need to build the library if you make changes to the C++ core or TypeScript source code. There are three ways to build the project:


### 1. Natively on Host (Windows, macOS, Linux)
To build natively, you must have the following tools installed and available in your environment's PATH:
* **Node.js** (v18+)
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

