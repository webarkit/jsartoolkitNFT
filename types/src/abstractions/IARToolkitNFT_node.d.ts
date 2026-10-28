import { IARToolkitNFT } from "./IARToolkitNFT";
/**
 * The Node build wraps the same class-based binding as the browser builds, so
 * it has the same interface. Only loading differs: camera and marker paths are
 * read from the working directory through NODEFS instead of fetched over HTTP.
 */
export interface IARToolkitNFT_node extends Omit<IARToolkitNFT, "addNFTMarkers"> {
    loadCamera(cameraParam: Uint8Array | string): Promise<number>;
    /**
     * Synchronous, unlike the browser builds' Promise (#685, D9): Node reads the
     * files in place, so it already returns the real ids, and a Promise would
     * only break its direct callers.
     */
    addNFTMarkers(urls: Array<string>, callback?: (ids: number[]) => void, onError2?: (errorNumber: number) => void): Array<number>;
    /**
     * The throwing core of addNFTMarkers; throws NFTLoadError.
     * @internal
     */
    tryAddNFTMarkers(urls: Array<string>): Array<number>;
}
