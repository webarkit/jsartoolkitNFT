import { ARToolkitNFTModule } from "../abstractions/CommonInterfaces";
/**
 * @param moduleOptions passed to the Emscripten factory as its Module object, e.g.
 * `mainScriptUrlOrBlob` for the threaded build's tracker worker host (#720 D16).
 */
export declare function initARToolkitNFT(moduleOptions?: Record<string, unknown>): Promise<ARToolkitNFTModule>;
