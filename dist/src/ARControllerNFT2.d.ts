interface ImageObj {
    videoWidth: null;
    width: null;
    videoHeight: null;
    height: null;
    data: null;
}
export default class ARControllerNFT {
    private options;
    private id;
    private width;
    private height;
    private image;
    private orientation;
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
    private canvas;
    private ctx;
    private nftMarkerFound;
    private nftMarkerFoundTime;
    private nftMarkerCount;
    private defaultMarkerWidth;
    private _bwpointer;
    constructor(width: number, height: number, cameraParam: string, options: object);
    static initWithDimensions(width: number, height: number, cameraParam: string, options: object): Promise<ARControllerNFT>;
    static initNFTWithImage(image: ImageObj, cameraParam: string, options: object): Promise<ARControllerNFT>;
    process(image: any): void;
    detectNFTMarker(): void;
    trackNFTMarkerId(id: number, markerWidth?: number): any;
    detectMarker(image: any): number;
    getNFTMarker(markerIndex: number): {
        found: boolean;
        pose: object;
    };
    getCameraMatrix(): object;
    setProjectionNearPlane(value: number): void;
    getProjectionNearPlane(): number;
    setProjectionFarPlane(value: number): void;
    getProjectionFarPlane(): number;
    addEventListener(name: string, callback: object): void;
    dispatchEvent(event: {
        name: string;
        target: any;
        data?: object;
    }): void;
    transMatToGLMat(transMat: Float64Array, glMat: Float64Array, scale?: number): Float64Array;
    arglCameraViewRHf(glMatrix: Float64Array, glRhMatrix?: Float64Array, scale?: number): Float64Array;
    loadNFTMarker(urlOrData: any): Promise<{
        id: number;
    }>;
    _initialize(): Promise<this>;
    _initNFT(): void;
    _copyImageToHeap(sourceImage: ImageObj): boolean;
}
export {};
