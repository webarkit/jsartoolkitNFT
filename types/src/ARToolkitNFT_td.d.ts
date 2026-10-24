import { ARToolkitNFTBase } from "./ARToolkitNFTBase";
/**
 * Threaded build: serve `ARToolkitNFT_td.worker.js` next to the script that loads this
 * bundle (with a plain `<script>` tag, the folder of `ARToolkitNFT_td.js`; with
 * `importScripts()`, the calling worker's folder; in re-bundled apps, see the README
 * section "Threaded build: deploying"), with the COOP/COEP headers.
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
