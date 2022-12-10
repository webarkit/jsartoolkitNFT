import { IARToolkitNFT } from "./abstractions/IARToolkitNFT";
declare global {
    var artoolkitNFT: IARToolkitNFT;
}
export default class ARToolkitNFT implements IARToolkitNFT {
    static get UNKNOWN_MARKER(): number;
    static get NFT_MARKER(): number;
    private instance;
    private markerNFTCount;
    private cameraCount;
    private version;
    setup: (width: number, height: number, cameraId: number) => number;
    teardown: () => void;
    setupAR2: (id: number) => void;
    setDebugMode: (id: number, mode: boolean) => number;
    getDebugMode: (id: number) => boolean;
    getProcessingImage: (id: number) => number;
    detectMarker: (id: number) => number;
    detectNFTMarker: (id: number) => number;
    getNFTMarker: (id: number, markerIndex: number) => number;
    getNFTData: (id: number, index: number) => object;
    setLogLevel: (mode: boolean) => number;
    getLogLevel: () => number;
    frameMalloc: {
        framepointer: number;
        framesize: number;
        videoLumaPointer: number;
        camera: number;
        transform: number;
    };
    HEAPU8: {
        buffer: Uint8Array;
    };
    NFTMarkerInfo: {
        error: number;
        found: number;
        id: number;
        pose: Float64Array;
    };
    setProjectionNearPlane: (id: number, value: number) => void;
    getProjectionNearPlane: (id: number) => number;
    setProjectionFarPlane: (id: number, value: number) => void;
    getProjectionFarPlane: (id: number) => number;
    setThresholdMode: (id: number, mode: number) => number;
    getThresholdMode: (id: number) => number;
    setThreshold: (id: number, threshold: number) => number;
    getThreshold: (id: number) => number;
    setImageProcMode: (id: number, mode: number) => number;
    getImageProcMode: (id: number) => number;
    constructor();
    init(): Promise<this>;
    private _decorate;
    private converter;
    loadCamera(urlOrData: Uint8Array | string): Promise<number>;
    addNFTMarkers(arId: number, urls: Array<string | Array<string>>, callback: (filename: number[]) => void, onError2: (errorNumber: number) => void): Array<number>;
    private _storeDataFile;
    private ajax;
}
