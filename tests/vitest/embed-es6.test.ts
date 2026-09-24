// @ts-ignore - Emscripten output has no useful types
import ARToolkitNFTEmbed from "../../build/artoolkitNFT_embed_ES6_wasm.js";
import { controllerDetectionSuite } from "./legacy";

// The embed build is an ES6 module whose factory resolves to a module carrying
// the legacy controller API (js/artoolkitNFT_ES6.api.js): the same suite as the
// global builds, loaded by import instead of a script tag.
controllerDetectionSuite("artoolkitNFT_embed_ES6_wasm.js", () =>
  ARToolkitNFTEmbed(),
);
