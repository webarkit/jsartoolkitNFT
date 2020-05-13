[![Built with Grunt](https://cdn.gruntjs.com/builtwith.svg)](https://gruntjs.com/)
<img src="https://flat.badgen.net/dependabot/thepracticaldev/dev.to?icon=dependabot" alt="Dependabot Badge" />
[![Build Status](https://travis-ci.com/kalwalt/jsartoolkitNFT.svg?branch=master)](https://travis-ci.com/kalwalt/jsartoolkitNFT)
[![Build Status](https://app.bitrise.io/app/27069fc90c01edd4/status.svg?token=NEccMUM1Jh8TFezKwDexAw)](https://app.bitrise.io/app/27069fc90c01edd4)

# JSARToolKitNFT

Emscripten port of [WebARKitLib](https://github.com/webarkit/WebARKitLib) to JavaScript.
Modified and lighter version of [JSARToolKit5](https://github.com/artoolkitx/jsartoolkit5).

Try the example !! [kalwalt.github.io/jsartoolkitNFT/examples/arNFT_example.html](https://kalwalt.github.io/jsartoolkitNFT/examples/arNFT_example.html)

## Markers Types

**JSARToolKitNFT** support only this types of markers:

- NFT (natural feature tracking) markers :white_check_mark: 🎉 🎨

has **WASM** embedded in a single file!

## Using the library 💥
You can use raw.githack.com links:

**WASM** version of the libary:

```html
<script src="https://raw.githack.com/kalwalt/jsartoolkitNFT/master/build/artoolkitNFT_wasm.js">
```

NO WASM minified:

```html
<script src="https://raw.githack.com/kalwalt/jsartoolkitNFT/master/build/artoolkitNFT.min.js">
```
or you can install with npm:

```nodejs
npm i @kalwalt/jsartoolkit-nft
```

or you can clone the repository with git, follow the instructions below:

## Clone the repository :cyclone:

1. Clone this repository
2. Clone ARToolKit5 project to get the latest source files. From within JSARToolKitNFT directory do `git submodule update --init`. If you already cloned ARToolKit5 to a different directory you can:

  - create a link in the `jsartoolkitNFT/emscripten/` directory that points to ARToolKit5 (`jsartoolkitNFT/emscripten/artoolkit5`) (Linux and macOS only)
  - or, set the `WEBARKITLIB_ROOT` environment variable to point to your ARToolKit5 clone
  - or, change the `tools/makem.js` file to point to your artoolkit5 clone (line 20)

## ARnft library

**JSARToolKitNFT** is used by [ARnft](https://github.com/kalwalt/ARnft) a small libary that help developers to create **WebAR** apps.

## Project Structure 📂

- `build/` (compiled debug and minified versions of JSARToolKitNFT)
- `doc/` (documentation, coming...)
- `emscripten/` (source code for ARToolKit)
- `examples/` (demos and examples using JSARToolKitNFT)
- `js/` (compiled versions of ARToolKit.js with Three.js helper api)
- `tools/` (build scripts for building JSARToolKitNFT)

## WebAssembly 👋

**JSARToolKitNFT** supports WebAssembly. The libary builds WebAssembly artifacts during the build process, **WASM** is embdded in a single file. This is `build/artoolkitNFT_wasm.js`. To use it, include the `artoolkit_wasm.js` into your html page like this:

```html
<script src="../build/artoolkitNFT_wasm.js"></script>
```

As loading the WebAssembly artifact is done asynchronously, there is a callback that is called when everything is ready.

```javascript
window.addEventListener('artoolkitNFT-loaded', () => {
    //do artoolkit stuff here
});
```

See the example for details.


## Build the project 🔨

Go to the [wiki](https://github.com/kalwalt/jsartoolkitNFT/wiki#build-instructions) for more infos
