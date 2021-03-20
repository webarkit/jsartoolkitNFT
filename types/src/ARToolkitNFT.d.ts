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
export default class ARToolkitNFT {
    static get UNKNOWN_MARKER(): number;
    static get NFT_MARKER(): number;
    instance: any;
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
    setLogLevel: (mode: boolean) => number;
    getLogLevel: () => number;
    frameMalloc: {
        framepointer: number;
        framesize: number;
        videoLumaPointer: number;
        camera: number;
        transform: number;
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
    loadCamera(urlOrData: any): Promise<number>;
    addNFTMarker(arId: number, url: string): Promise<{
        id: number;
    }>;
    private _storeDataFile;
}
