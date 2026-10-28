import { IImageObj, ARLogLevel, NFTEventListener, NFTEvent, NFTRuntimeSettings, NFTRuntimeSettingsPatch, ARInitOptions } from "./CommonInterfaces";
export declare abstract class AbstractARControllerNFT {
    static initWithDimensions: (width: number, height: number, cameraParam: string, options?: ARInitOptions) => Promise<AbstractARControllerNFT>;
    static initWithImage: (image: IImageObj, cameraParam: string, options?: ARInitOptions) => Promise<AbstractARControllerNFT>;
    process: (image: IImageObj) => void;
    detectNFTMarker: (videoLuma: any) => void;
    trackNFTMarkerId: (id: number, markerWidth?: number) => object;
    getNFTMarker: (markerIndex: number) => object;
    getNFTData: (id: number, index: number) => object;
    addEventListener: (name: string, callback: NFTEventListener) => void;
    removeEventListener: (name: string, callback: NFTEventListener) => void;
    dispatchEvent: (event: NFTEvent) => void;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    debugSetup: () => void;
    transMatToGLMat: (transMat: Float64Array, glMat: Float64Array, scale?: number) => Float64Array;
    arglCameraViewRHf: (glMatrix: Float64Array, glRhMatrix?: Float64Array, scale?: number) => Float64Array;
    getTransformationMatrix: () => Float64Array;
    getCameraMatrix: () => Float64Array;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    setDebugMode: (mode: boolean) => number;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    getDebugMode: () => boolean;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    getProcessingImage: () => number;
    setLogLevel: (level: ARLogLevel | number) => void;
    getLogLevel: () => number;
    setProjectionNearPlane: (value: number) => void;
    getProjectionNearPlane: () => number;
    setProjectionFarPlane: (value: number) => void;
    getProjectionFarPlane: () => number;
    recalculateCameraLens: () => void;
    configure: (patch: NFTRuntimeSettingsPatch) => void;
    getRuntimeSettings: () => NFTRuntimeSettings;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    setThresholdMode: (mode: number) => number;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    getThresholdMode: () => number;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    setThreshold: (threshold: number) => number;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    getThreshold: () => number;
    loadNFTMarker: (url: string, onSuccess?: (id: number) => void, onError?: (code: number) => void) => Promise<number[]>;
    loadNFTMarkers: (urls: Array<string>, onSuccess?: (ids: number[]) => void, onError?: (code: number) => void) => Promise<number[]>;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    setImageProcMode: (mode: number) => number;
    /** @deprecated Has no effect on NFT tracking; will be removed in the next major version (#659). */
    getImageProcMode: () => number;
}
