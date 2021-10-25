![github releases](https://flat.badgen.net/github/release/webarkit/jsartoolkitNFT)
![github stars](https://flat.badgen.net/github/stars/webarkit/jsartoolkitNFT)
![github forks](https://flat.badgen.net/github/forks/webarkit/jsartoolkitNFT)
![npm package version](https://flat.badgen.net/npm/v/@kalwalt/jsartoolkit-nft)
![Dependabot Badge](https://flat.badgen.net/dependabot/thepracticaldev/dev.to?icon=dependabot)





# JSARToolKitNFT

Emscripten port of [WebARKitLib](https://github.com/webarkit/WebARKitLib) to JavaScript.
Modified and lighter version of [JSARToolKit5](https://github.com/artoolkitx/jsartoolkit5).

Try the example !! [kalwalt.github.io/jsartoolkitNFT/examples/arNFT_example.html](https://kalwalt.github.io/jsartoolkitNFT/examples/arNFT_example.html)

## Features
### Markers Types

**JSARToolKitNFT** support only this types of markers:

- NFT (natural feature tracking) markers ✅ 🎉 🎨

## WASM

has **WASM** embedded in a single file!

## ES6

❕From 0.8.0 version has **ES6** feature 🎉 😻

## Typescript

❕From 0.9.0 version has **Typescript** feature 💖 💣

## Using the library 💥
You can use raw.githack.com links:

**WASM** version of the library:

```html
<script src="https://raw.githack.com/kalwalt/jsartoolkitNFT/master/build/artoolkitNFT_wasm.js">
```

**WASM** version of the library as a Module:

```html
<script src="https://raw.githack.com/kalwalt/jsartoolkitNFT/master/build/artoolkitNFT_ES6_wasm.js">
```

**NO WASM** minified:

```html
<script src="https://raw.githack.com/kalwalt/jsartoolkitNFT/master/build/artoolkitNFT.min.js">
```

or (recommended) use the **UMD** library:

```html
<script src="https://raw.githack.com/kalwalt/jsartoolkitNFT/master/dist/ARToolkitNFT.js">
```

or you can install with npm and use as a module:

```nodejs
npm i @webarkit/jsartoolkit-nft
```
then:

```javascript
import { ARToolkitNFT, ARControllerNFT } from '@kalwalt/jsartoolkit-nft'
```
## Downloads

You can download the build libs in the [releases page](https://github.com/webarkit/jsartoolkitNFT/releases). Starting from version 0.8.0 it is possible to download `dist` or `build` zip packages.

or you can clone the repository with git, follow the instructions below:

## Clone the repository 🌀

1. Clone this repository
2. Clone WebARKitLib project to get the latest source files. From within JSARToolKitNFT directory do `git submodule update --init`. If you already cloned WebARKitLib to a different directory you can:

  - create a link in the `jsartoolkitNFT/emscripten/` directory that points to WebARKitLib (`jsartoolkitNFT/emscripten/WebARKitLib`) (Linux and macOS only)
  - or, set the `WEBARKITLIB_ROOT` environment variable to point to your WebARKitLib clone
  - or, change the `tools/makem.js` file to point to your WebARKitLib clone (line 32)

## Documentation

You can build the documentation of the library. You need node and npm installed and then run these commands in a console:

```nodejs
npm install
npm run docs
```
At this point you have build the docs in the `docs/` folder, you should run a server and then go to `docs/` folder.

## ARnft library

**JSARToolKitNFT** is used by [ARnft](https://github.com/webarkit/ARnft) a small libary that help developers to create **WebAR** apps.

## Project Structure 📂

- `build/` (compiled debug and minified versions of JSARToolKitNFT)
- `dist/` (compiled UMD lib with ES6 of JSARToolKitNFT)
- `emscripten/` (source code for ARToolKitNFT)
- `examples/` (demos and examples using JSARToolKitNFT)
- `js/` (api and workers of JSARToolKitNFT.js for the standard api)
- `src/` (source code of ARToolKitNFT with Typescript)
- `tests/` (tests - WIP)
- `tools/` (build scripts for building JSARToolKitNFT with Emscripten)
- `types/` (type definitions of ARToolKitNFT)

## WebAssembly 👋

**JSARToolKitNFT** supports WebAssembly. The library builds WebAssembly artifacts during the build process, **WASM** is embedded in a single file. This is `build/artoolkitNFT_wasm.js`. To use it, include the `artoolkit_wasm.js` into your html page like this:

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

Go to the [wiki](https://github.com/kalwalt/jsartoolkitNFT/wiki#build-instructions) for more infos. Note that you need to build the library only if you make changes to the source code.

### Notes
The jsartoolkitNFT npm package is served until version **0.9.4** from `@kalwalt/jsartoolkit-nft`. BY 0.9.5 version from `@webarkit/jsartoolkit-nft`.
