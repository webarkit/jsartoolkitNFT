import { INFTMarkerInfo, ARLogLevel } from "./CommonInterfaces";
export interface IARToolkitNFT {
    getCameraLens(): any;
    recalculateCameraLens(): void;
    passVideoData(videoFrame: Uint8ClampedArray, videoLuma: Uint8Array, lumaInternal: boolean): void;
    setup(width: number, height: number, cameraId: number): number;
    setupAR2(): void;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    setDebugMode(mode: boolean): number;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    getDebugMode(): boolean;
    setFiltering(enableFiltering: boolean): void;
    setContinuousDetection(enabled: boolean): void;
    setDetectionInterval(ms: number): void;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    getProcessingImage(): number;
    setLogLevel(level: ARLogLevel | number): void;
    getLogLevel(): number;
    NFTMarkerInfo: INFTMarkerInfo;
    loadCamera(cameraParam: string): Promise<number>;
    setProjectionNearPlane(value: number): void;
    getProjectionNearPlane(): number;
    setProjectionFarPlane(value: number): void;
    getProjectionFarPlane(): number;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    setThresholdMode(mode: number): number;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    getThresholdMode(): number;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    setThreshold(threshold: number): number;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    getThreshold(): number;
    addNFTMarkers(urls: Array<string>, callback: (ids: number[]) => void, onError2: (errorNumber: number) => void): Array<number>;
    detectNFTMarker(): number;
    getNFTMarker(markerIndex: number): INFTMarkerInfo;
    getNFTData(index: number): object;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    setImageProcMode(mode: number): number;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    getImageProcMode(): number;
    FS: any;
    malloc: any;
    free: any;
    HEAPU8: any;
    videoFramePtr?: number;
    videoLumaPtr?: number;
    StringList: any;
    nftMarkers: any;
}
