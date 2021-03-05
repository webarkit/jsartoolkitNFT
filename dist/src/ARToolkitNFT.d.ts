declare global {
    namespace NodeJS {
        interface Global {
            artoolkitNFT: any;
        }
    }
    interface Window {
        artoolkitNFT: any;
    }
}
interface baseARTNFT {
    setup: {
        (width: number, height: number, cameraId: number): number;
    };
}
export default class ARToolkitNFT implements baseARTNFT {
    static get UNKNOWN_MARKER(): number;
    static get NFT_MARKER(): number;
    private instance;
    private markerNFTCount;
    private cameraCount;
    private version;
    setup: (width: number, height: number, cameraId: number) => number;
    constructor();
    init(): Promise<this>;
    private _decorate;
    loadCamera(urlOrData: any): Promise<number>;
    addNFTMarker(arId: number, url: string): Promise<any>;
    private _storeDataFile;
}
export {};
