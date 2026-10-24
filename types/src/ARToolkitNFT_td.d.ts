import { ARToolkitNFTBase } from "./ARToolkitNFTBase";
/**
 * Threaded build: serve `ARToolkitNFT_td.worker.js` from the same folder as
 * `ARToolkitNFT_td.js` (the pthread worker is loaded next to the bundle), with the
 * COOP/COEP headers.
 */
export declare class ARToolkitNFT extends ARToolkitNFTBase {
    /**
     * The ARToolkitNFT constructor. It has no arguments.
     * These properties are initialized:
     * - instance
     * - markerNFTCount
     * - cameraCount
     * - version
     * A message is displayed in the browser console during the intitialization, for example:
     * "ARToolkitNFT 1.5.0"
     */
    constructor();
}
