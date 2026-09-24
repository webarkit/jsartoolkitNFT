import { IARToolkitNFT } from "./IARToolkitNFT";
export interface IARToolkitNFT_node extends IARToolkitNFT {
    loadCamera(cameraParam: Uint8Array | string): Promise<number>;
}
