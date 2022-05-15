interface ImageObj extends HTMLCanvasElement {
    videoWidth: number;
    width: number;
    videoHeight: number;
    height: number;
    data: Uint8ClampedArray;
}
export default class ARControllerNFT {
    private id;
    private width;
    private height;
    private cameraParam;
    private cameraId;
    private cameraLoaded;
    private artoolkitNFT;
    private listeners;
    private nftMarkers;
    private transform_mat;
    private marker_transform_mat;
    private transformGL_RH;
    private videoWidth;
    private videoHeight;
    private videoSize;
    private framepointer;
    private framesize;
    private dataHeap;
    private videoLuma;
    private camera_mat;
    private videoLumaPointer;
    private nftMarkerFound;
    private nftMarkerFoundTime;
    private nftMarkerCount;
    private defaultMarkerWidth;
    private _bwpointer;
    constructor(width: number, height: number, cameraParam: string);
    static initWithDimensions(width: number, height: number, cameraParam: string): Promise<ARControllerNFT>;
    static initWithImage(image: ImageObj, cameraParam: string): Promise<ARControllerNFT>;
    process(image: ImageObj): void;
    detectNFTMarker(): void;
    trackNFTMarkerId(id: number, markerWidth?: number): any;
    detectMarker(image: any): number;
    getNFTMarker(markerIndex: number): {
        error: number;
        found: number;
        id: number;
        pose: Float64Array;
    };
    getNFTData(id: number, index: number): object;
    addEventListener(name: string, callback: object): void;
    removeEventListener(name: string, callback: object): void;
    dispatchEvent(event: {
        name: string;
        target: any;
        data?: object;
    }): void;
    debugSetup(): void;
    setOEF(frequency: number, mincutoff: number, beta: number, dcutoff: number): void;
    filterOEF(value: number, timestamp: number): void;
    transMatToGLMat(transMat: Float64Array, glMat: Float64Array, scale?: number): Float64Array;
    arglCameraViewRHf(glMatrix: Float64Array, glRhMatrix?: Float64Array, scale?: number): Float64Array;
    getTransformationMatrix(): Float64Array;
    getCameraMatrix(): Float64Array;
    setDebugMode(mode: boolean): number;
    getDebugMode(): boolean;
    getProcessingImage(): number;
    setLogLevel(mode: boolean): number;
    getLogLevel(): number;
    setProjectionNearPlane(value: number): void;
    getProjectionNearPlane(): number;
    setProjectionFarPlane(value: number): void;
    getProjectionFarPlane(): number;
    setThresholdMode(mode: number): number;
    getThresholdMode(): number;
    setThreshold(threshold: number): number;
    getThreshold(): number;
    loadNFTMarker(urlOrData: string, onSuccess: (ids: number) => void, onError: () => void): Promise<[{
        id: number;
    }]>;
    loadNFTMarkers(urlOrData: Array<string>, onSuccess: (ids: number) => void, onError: () => void): Promise<[{
        id: number;
    }]>;
    setImageProcMode(mode: number): number;
    getImageProcMode(): number;
    private converter;
    private _initialize;
    private _initNFT;
    private _copyImageToHeap;
}
export {};
