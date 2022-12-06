export interface INFTMarkerInfo {
    error: number;
    found: number;
    id: number;
    pose: Float64Array;
}
export interface IARToolkitNFT {
    setup: {
        (width: number, height: number, cameraId: number): number;
    };
    setupAR2: {
        (id: number): void;
    };
    setDebugMode: (id: number, mode: boolean) => number;
    getDebugMode: (id: number) => boolean;
    getProcessingImage: (id: number) => number;
    setLogLevel: (mode: boolean) => number;
    getLogLevel: () => number;
    frameMalloc: {
        framepointer: number;
        framesize: number;
        videoLumaPointer: number;
        camera: number;
        transform: number;
    };
    instance: {
        frameMalloc: {
            framepointer: number;
            framesize: number;
            videoLumaPointer: number;
            camera: number;
            transform: number;
        };
        NFTMarkerInfo: INFTMarkerInfo;
        HEAPU8: {
            buffer: Uint8Array;
        };
    };
    NFTMarkerInfo: INFTMarkerInfo;
    loadCamera: (cameraParam: string) => Promise<number>;
    setProjectionNearPlane: {
        (id: number, value: number): void;
    };
    getProjectionNearPlane: (id: number) => number;
    setProjectionFarPlane: (id: number, value: number) => void;
    getProjectionFarPlane: (id: number) => number;
    setThresholdMode: (id: number, mode: number) => number;
    getThresholdMode: (id: number) => number;
    setThreshold: (id: number, threshold: number) => number;
    getThreshold: (id: number) => number;
    addNFTMarkers: (arId: number, urls: Array<string>, callback: (ids: number[]) => void, onError2: (errorNumber: number) => void) => Array<number>;
    detectMarker: (id: number) => number;
    detectNFTMarker: (arId: number) => void;
    getNFTMarker: (id: number, markerIndex: number) => number;
    getNFTData: (id: number, index: number) => object;
    setImageProcMode: (id: number, mode: number) => number;
    getImageProcMode: (id: number) => number;
}
