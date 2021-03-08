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
    frameMalloc: {
        framepointer: number;
        framesize: number;
        videoLumaPointer: number;
        camera: number;
        transform: number;
    };
    NFTMarkerInfo: {
        found: boolean;
        pose: object;
    };
    setProjectionNearPlane: (id: number, value: number) => void;
    getProjectionNearPlane: (id: number) => number;
    setProjectionFarPlane: (id: number, value: number) => void;
    getProjectionFarPlane: (id: number) => number;
    detectMarker: (id: number) => void;
    detectNFTMarker: (id: number) => void;
    getNFTMarker: (id: number, markerIndex: number) => number;
    constructor();
    init(): Promise<this>;
    private _decorate;
    loadCamera(urlOrData: any): Promise<number>;
    addNFTMarker(arId: number, url: string): Promise<{
        id: number;
    }>;
    private _storeDataFile;
}
