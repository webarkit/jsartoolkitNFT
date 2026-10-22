// @ts-ignore - Emscripten output has no useful types
import ARToolkitNFTEmbed from "../../build/artoolkitNFT_embed_ES6_wasm.js";
import { controllerDetectionSuite, controllerLoadingSuite } from "./legacy";

// The embed build is an ES6 module whose factory resolves to a module carrying
// the legacy controller API (js/artoolkitNFT_ES6.api.js): the same suites as the
// global builds, loaded by import instead of a script tag. Both suites share one
// module instance, as the global builds share one page.
let embed: Promise<any> | undefined;
const loadEmbed = () => (embed ??= ARToolkitNFTEmbed());

controllerDetectionSuite("artoolkitNFT_embed_ES6_wasm.js", loadEmbed);
controllerLoadingSuite("artoolkitNFT_embed_ES6_wasm.js", loadEmbed, {
  es6: true,
});
