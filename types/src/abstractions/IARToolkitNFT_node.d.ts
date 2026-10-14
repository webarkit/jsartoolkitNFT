import { IARToolkitNFT } from "./IARToolkitNFT";
/**
 * The Node build wraps the same class-based binding as the browser builds, so
 * it has the same interface. Only loading differs: camera and marker paths are
 * read from the working directory through NODEFS instead of fetched over HTTP.
 */
export interface IARToolkitNFT_node extends IARToolkitNFT {
    loadCamera(cameraParam: Uint8Array | string): Promise<number>;
}
