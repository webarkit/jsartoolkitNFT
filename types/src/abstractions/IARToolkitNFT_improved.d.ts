import { INFTMarkerInfo } from "./CommonInterfaces";
export interface IARToolkitNFT {
    getCameraLens: () => any;
    passVideoData: (videoFrame: Uint8ClampedArray, videoLuma: Uint8Array) => void;
    setup: {
        (width: number, height: number, cameraId: number): number;
    };
    setupAR2: {
        (): void;
    };
    setDebugMode: (mode: boolean) => number;
    getDebugMode: () => boolean;
    getProcessingImage: () => number;
    setLogLevel: (mode: boolean) => number;
    getLogLevel: () => number;
    NFTMarkerInfo: INFTMarkerInfo;
    loadCamera: (cameraParam: string) => Promise<number>;
    setProjectionNearPlane: {
        (value: number): void;
    };
    getProjectionNearPlane: () => number;
    setProjectionFarPlane: (value: number) => void;
    getProjectionFarPlane: () => number;
    setThresholdMode: (mode: number) => number;
    getThresholdMode: () => number;
    setThreshold: (threshold: number) => number;
    getThreshold: () => number;
    addNFTMarkers: (urls: Array<string>, callback: (ids: number[]) => void, onError2: (errorNumber: number) => void) => Array<number>;
    detectMarker: () => number;
    detectNFTMarker: () => number;
    getNFTMarker: (markerIndex: number) => INFTMarkerInfo;
    getNFTData: (index: number) => object;
    setImageProcMode: (mode: number) => number;
    getImageProcMode: () => number;
    FS: any;
    StringList: any;
}
