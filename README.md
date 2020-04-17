[![Built with Grunt](https://cdn.gruntjs.com/builtwith.svg)](https://gruntjs.com/)
<img src="https://flat.badgen.net/dependabot/thepracticaldev/dev.to?icon=dependabot" alt="Dependabot Badge" />
[![Build Status](https://travis-ci.com/kalwalt/jsartoolkitNFT.svg?branch=master)](https://travis-ci.com/kalwalt/jsartoolkitNFT)
[![Build Status](https://app.bitrise.io/app/27069fc90c01edd4/status.svg?token=NEccMUM1Jh8TFezKwDexAw)](https://app.bitrise.io/app/27069fc90c01edd4)

# JSARToolKitNFT

Emscripten port of [ARToolKit](https://github.com/artoolkitx/artoolkit5) to JavaScript.
Modified and lighter version of [JSARToolKit5](https://github.com/artoolkitx/jsartoolkit5).

Try the example !! [kalwalt.github.io/jsartoolkitNFT/examples/arNFT_example.html](https://kalwalt.github.io/jsartoolkitNFT/examples/arNFT_example.html)

## Markers Types

JSARToolKitNFT support only this types of markers:

- NFT (natural feature tracking) markers

--------------------------------------------------------------------------------

**NOTE:**

When writing JavaScript and making changes be aware that the emscripten uglifier does not support the ES6 syntax.

--------------------------------------------------------------------------------

## Project Structure

- `build/` (compiled debug and minified versions of JSARToolKitNFT)
- `doc/` (documentation, coming...)
- `emscripten/` (source code for ARToolKit)
- `examples/` (demos and examples using JSARToolKitNFT)
- `js/` (compiled versions of ARToolKit.js with Three.js helper api)
- `tools/` (build scripts for building JSARToolKitNFT)

## WebAssembly

JSARToolKitNFT supports WebAssembly. The libary builds two WebAssembly artifacts during the build process. These are `build/artoolkitNFT_wasm.js` and `build/artoolkitNFT_wasm.wasm`. To use those, include the artoolkit_wasm.js into your html page and define `var artoolkitNFT_wasm_url = '<<PATH TO>>/artoolkitNFT_wasm.wasm';` before loading the artoolkit_wasm.js file, like this:

```javascript
<script type='text/javascript'>
      var artoolkitNFT_wasm_url = '../build/artoolkitNFT_wasm.wasm';
</script>
<script src="../build/artoolkitNFT_wasm.js"></script>
```

As loading the WebAssembly artifact is done asynchronously, there is a callback that is called when everything is ready.

```javascript
window.addEventListener('artoolkitNFT-loaded', () => {
    //do artoolkit stuff here
});
```

See examples/simple_image_wasm.html for details.

## Clone the repository

1. Clone this repository
2. Clone ARToolKit5 project to get the latest source files. From within JSARToolKitNFT directory do `git submodule update --init`. If you already cloned ARToolKit5 to a different directory you can:

  - create a link in the `jsartoolkitNFT/emscripten/` directory that points to ARToolKit5 (`jsartoolkitNFT/emscripten/artoolkit5`) (Linux and macOS only)
  - or, set the `ARTOOLKIT5_ROOT` environment variable to point to your ARToolKit5 clone
  - or, change the `tools/makem.js` file to point to your artoolkit5 clone (line 20)

## Build the project

### Recommended: Build using Docker

1. Install Docker (if you havn't already): [get Docker](https://www.docker.com/)
2. Clone artoolkit5 repository on your machine: `git submodule update --init`
3. `npm install`
4. From inside jsartoolkitNFT directory run `docker run -dit --name emscripten -v $(pwd):/src trzeci/emscripten-slim:latest bash` to download and start the container, in preparation for the build
5. `docker exec emscripten npm run build-local` to build JS version of artoolkit5
6. `docker exec emscripten npm run build-local-no-libar` to build JS version of artoolkit5 without rebuilding libar.bc
7. `docker stop emscripten` to stop the container after the build, if needed
8. `docker rm emscripten` to remove the container
9. `docker rmi trzeci/emscripten-slim:latest` to remove the Docker image, if you don't need it anymore
10. The build artifacts will appear in `/build`. There's a build with debug symbols in `artoolkitNFT.debug.js` file and the optimized build with bundled JS API in `artoolkitNFT.min.js`; also, a WebAssembly build artoolkitNFT_wasm.js and artoolkitNFT_wasm.wasm

### ⚠️ Not recommended ⚠️ : Build local with manual emscripten setup

To prevent issues with Emscripten setup and to not have to maintain several build environments (macOS, Windows, Linux) we only maintain the **Build using Docker**. Following are the instructions of the last know build on Linux which we verified are working. **Use at own risk.** **Not working on macOS!**

1. Install build tools

  1. Install node.js (<https://nodejs.org/en/>)
  2. Install python2 (<https://www.python.org/downloads/>)
  3. Install emscripten (<https://emscripten.org/docs/getting_started/downloads.html#download-and-install>) We used emscripten version **1.39.5-fastcomp** ~~1.38.44-fastcomp~~

JSARToolKitNFT aim is to create a Javascript version of artoolkit5\. First, you need the artoolkit5 repository on your machine:

2. Clone ARToolKit5 project to get the latest source files. From within jsartoolkit5 directory do `git submodule update --init`. If you already cloned ARToolKit5 to a different directory you can:

  - create a link in the `jsartoolkitNFT/emscripten/` directory that points to ARToolKit5 (`jsartoolkitNFT/emscripten/artoolkit5`)
  - or, set the `ARTOOLKIT5_ROOT` environment variable to point to your ARToolKit5 clone
  - or, change the `tools/makem.js` file to point to your artoolkit5 clone (line 20)

3. Building

  1. Make sure `EMSCRIPTEN` env variable is set (e.g. `EMSCRIPTEN=/usr/lib/emsdk_portable/emscripten/master/ node tools/makem.js`
  2. Run `npm install`
  3. Run `npm run build-local`

During development, you can run `npm run watch`, it will rebuild the library everytime you change `./js/` directory. You can also run the script with the option `npm run build-local-no-libar` if you have already build libar.bc and you don't want to rebuild.

4. The built ASM.js files are in `/build`. There's a build with debug symbols in `artoolkitNFT.debug.js` and the optimized build with bundled JS API in `artoolkitNFT.min.js`.
